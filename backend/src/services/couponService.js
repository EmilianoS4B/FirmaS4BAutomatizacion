/**
 * Cupones / Promotion Codes — validación contra Stripe.
 *
 * Regla de oro del MVP: NUNCA se confía en la validación del frontend.
 * Esta función es la única fuente de verdad y se ejecuta DOS veces:
 *
 *   1. Cuando la persona pulsa "Aplicar cupón"  (para mostrar el resumen)
 *   2. Cuando pulsa "Suscribirme"               (antes de crear el Checkout)
 *
 * El segundo paso no es redundante: entre ambos momentos el cupón pudo
 * expirar, agotarse o desactivarse, y quien manipule el navegador podría
 * saltarse el primero por completo.
 */
import { stripe } from '../stripe.js';
import { couponError } from '../lib/errors.js';
import {
  applyCouponToAmount,
  describeDiscount,
  describeDuration,
  formatAmount,
} from '../lib/pricing.js';

/** Stripe guarda los códigos en mayúsculas; normalizamos la entrada del usuario. */
function normalizeCode(rawCode) {
  if (typeof rawCode !== 'string') {
    throw couponError('El código promocional es obligatorio.', 'COUPON_REQUIRED');
  }

  const code = rawCode.trim();

  if (code === '') {
    throw couponError('El código promocional es obligatorio.', 'COUPON_REQUIRED');
  }

  // Límite defensivo: evita mandar cadenas enormes a la API de Stripe.
  if (code.length > 64) {
    throw couponError('El código promocional no es válido.', 'COUPON_NOT_FOUND');
  }

  return code.toUpperCase();
}

/**
 * Busca el Promotion Code en Stripe.
 *
 * Se filtra por `active: true` en la propia consulta para que un código
 * archivado ni siquiera vuelva del API.
 */
async function findPromotionCode(code) {
  const { data } = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
  return data[0] ?? null;
}

/**
 * Valida un código promocional contra un plan concreto y calcula el resumen.
 *
 * @param {string} rawCode Código tal cual lo escribió la persona usuaria.
 * @param {object} plan    Plan devuelto por `planService.getPlan()`.
 * @returns {Promise<object>} Resumen validado, listo para pantalla o checkout.
 * @throws {AppError} Si el código no existe o no puede aplicarse.
 */
export async function validateCoupon(rawCode, plan) {
  const code = normalizeCode(rawCode);
  const promotionCode = await findPromotionCode(code);

  // Mensaje deliberadamente idéntico para "no existe" y "está inactivo":
  // no ayudamos a enumerar qué códigos existen en la cuenta.
  if (!promotionCode) {
    throw couponError('El código promocional no existe o ya no está disponible.', 'COUPON_NOT_FOUND');
  }

  const coupon = promotionCode.coupon;

  if (!coupon) {
    throw couponError('El código promocional no tiene un cupón asociado.', 'COUPON_INVALID');
  }

  // `valid` es el veredicto agregado de Stripe (fecha de expiración del cupón,
  // redenciones agotadas, cupón borrado...). Es la comprobación más importante.
  if (coupon.valid === false) {
    throw couponError('Este cupón ya no es válido.', 'COUPON_EXPIRED');
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (promotionCode.expires_at != null && promotionCode.expires_at <= nowInSeconds) {
    throw couponError('Este código promocional ya expiró.', 'COUPON_EXPIRED');
  }

  if (
    promotionCode.max_redemptions != null &&
    promotionCode.times_redeemed >= promotionCode.max_redemptions
  ) {
    throw couponError('Este código promocional alcanzó su límite de usos.', 'COUPON_EXHAUSTED');
  }

  // Un cupón puede restringirse a ciertos productos. Si el nuestro no está en
  // la lista, Stripe aceptaría el código pero no descontaría nada: es mejor
  // rechazarlo aquí que mostrar un descuento que luego no se cobra.
  const applicableProducts = coupon.applies_to?.products;
  if (Array.isArray(applicableProducts) && applicableProducts.length > 0) {
    const productId = plan.productId ?? null;
    if (!productId || !applicableProducts.includes(productId)) {
      throw couponError('Este cupón no aplica al plan seleccionado.', 'COUPON_NOT_APPLICABLE');
    }
  }

  // Importe mínimo: Stripe solo lo comprueba al canjear, así que lo
  // anticipamos para no prometer un descuento que el checkout rechazará.
  const minimumAmount = promotionCode.restrictions?.minimum_amount;
  if (minimumAmount != null && plan.unitAmount < minimumAmount) {
    throw couponError(
      `Este código requiere un importe mínimo de ${formatAmount(
        minimumAmount,
        promotionCode.restrictions.minimum_amount_currency ?? plan.currency
      )}.`,
      'COUPON_MINIMUM_NOT_MET'
    );
  }

  const applied = applyCouponToAmount(plan.unitAmount, coupon, plan.currency);

  if (applied === null) {
    throw couponError(
      'Este cupón está configurado en otra moneda y no aplica a este plan.',
      'COUPON_CURRENCY_MISMATCH'
    );
  }

  const duration = describeDuration(coupon);
  const discount = describeDiscount(coupon, plan.currency);

  return {
    valid: true,
    code: promotionCode.code,
    // Estos dos ids NO se envían al frontend (ver routes/coupon.js): se usan
    // internamente para crear el Checkout Session con el descuento correcto.
    promotionCodeId: promotionCode.id,
    couponId: coupon.id,

    discount,
    duration,

    pricing: {
      currency: plan.currency,
      originalAmount: plan.unitAmount,
      discountAmount: applied.discountAmount,
      finalAmount: applied.finalAmount,
      originalFormatted: formatAmount(plan.unitAmount, plan.currency),
      discountFormatted: formatAmount(applied.discountAmount, plan.currency),
      finalFormatted: formatAmount(applied.finalAmount, plan.currency),
      // Ahorro acumulado durante toda la promoción (solo informativo).
      totalSavingsFormatted:
        duration.durationInMonths != null
          ? formatAmount(applied.discountAmount * duration.durationInMonths, plan.currency)
          : null,
    },

    // Restricción que NO podemos verificar sin conocer al cliente: se marca
    // para que el frontend pueda avisar, y Stripe la aplicará de todas formas
    // en el momento del canje.
    requiresFirstTimeCustomer: promotionCode.restrictions?.first_time_transaction === true,
  };
}
