/**
 * Checkout — creación de la sesión de pago y lectura del resultado.
 *
 * ---------------------------------------------------------------------------
 * EL PUNTO CLAVE DEL MVP
 * ---------------------------------------------------------------------------
 * El descuento de 12 meses NO se implementa aquí. Se implementa en la
 * CONFIGURACIÓN DEL CUPÓN:
 *
 *     duration = 'repeating'   +   duration_in_months = 12
 *
 * Nosotros solo adjuntamos el Promotion Code a la sesión mediante el parámetro
 * `discounts`. A partir de ahí Stripe crea un objeto Discount con `start` y
 * `end` (start + 12 meses), lo aplica automáticamente a cada factura mensual
 * dentro de esa ventana y lo retira solo al vencer.
 *
 * Consecuencia directa de los criterios de aceptación 8, 9 y 10:
 *   - Meses 1-12 -> $700 MXN  (Stripe aplica el descuento)
 *   - Mes 13+    -> $1,000 MXN (Stripe ya retiró el descuento)
 *   - No hay cron, ni job, ni lógica nuestra que cambie el precio. Ninguna.
 * ---------------------------------------------------------------------------
 */
import { stripe } from '../stripe.js';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { getPlan } from './planService.js';
import { validateCoupon } from './couponService.js';
import { formatAmount } from '../lib/pricing.js';

/**
 * Crea la Checkout Session de suscripción.
 *
 * @param {string|null} rawCode Código promocional opcional.
 * @returns {Promise<{ url: string, sessionId: string }>}
 */
export async function createCheckoutSession(rawCode) {
  // El precio SIEMPRE se resuelve en el servidor desde STRIPE_PRICE_ID.
  // Nada de lo que mande el navegador influye en cuánto se cobra.
  const plan = await getPlan();

  const hasCode = typeof rawCode === 'string' && rawCode.trim() !== '';

  // Segunda validación del cupón (la primera fue al mostrar el resumen).
  // Si el código dejó de ser válido en el intervalo, esto lanza y no se crea
  // ninguna sesión de pago.
  const validated = hasCode ? await validateCoupon(rawCode, plan) : null;

  const params = {
    mode: 'subscription',
    line_items: [{ price: plan.priceId, quantity: 1 }],

    // `{CHECKOUT_SESSION_ID}` es un marcador que Stripe sustituye al redirigir.
    success_url: `${config.frontendUrl}/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.frontendUrl}/?canceled=1`,

    // Trazabilidad: deja constancia de con qué código se creó la suscripción.
    subscription_data: {
      metadata: {
        promotion_code: validated?.code ?? '',
        source: 'stripe-coupon-mvp',
      },
    },
  };

  if (validated) {
    // Aquí se ata el descuento a la suscripción. Stripe administra la duración.
    // `discounts` es el parámetro vigente; el antiguo `coupon` de nivel
    // superior está deprecado.
    params.discounts = [{ promotion_code: validated.promotionCodeId }];
  } else {
    // Sin código previo, dejamos que Stripe muestre su propio campo de cupón.
    // `allow_promotion_codes` y `discounts` son MUTUAMENTE EXCLUYENTES:
    // enviar ambos hace que Stripe rechace la petición.
    params.allow_promotion_codes = true;
  }

  const session = await stripe.checkout.sessions.create(params);

  if (!session.url) {
    throw new AppError(
      'CHECKOUT_NO_URL',
      'Stripe no devolvió una URL de pago. Intenta de nuevo.',
      502
    );
  }

  return { url: session.url, sessionId: session.id };
}

/**
 * Lee el resultado de una sesión para la pantalla de confirmación.
 *
 * Se consulta a Stripe en vez de confiar en lo que traiga la URL: el
 * `session_id` viaja por la barra de direcciones y cualquiera puede inventarlo.
 */
export async function getCheckoutResult(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    throw new AppError('INVALID_SESSION_ID', 'Identificador de sesión no válido.', 400);
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'subscription.discounts'],
  });

  const paid = session.payment_status === 'paid' || session.status === 'complete';
  const subscription = typeof session.subscription === 'object' ? session.subscription : null;

  return {
    status: session.status,
    paid,
    customerEmail: session.customer_details?.email ?? null,
    subscription: subscription ? describeSubscription(subscription) : null,
  };
}

/**
 * Traduce una suscripción de Stripe a la información que interesa mostrar:
 * cuánto se paga ahora, hasta cuándo, y cuánto se pagará después.
 */
function describeSubscription(subscription) {
  const item = subscription.items?.data?.[0] ?? null;
  const price = item?.price ?? null;
  const currency = price?.currency ?? 'mxn';
  const unitAmount = price?.unit_amount ?? null;

  // `discounts` es un array: una suscripción admite varios descuentos.
  // El MVP solo aplica uno.
  const discounts = Array.isArray(subscription.discounts) ? subscription.discounts : [];
  const discount = discounts.find((d) => typeof d === 'object') ?? null;
  const coupon = discount?.coupon ?? null;

  let discountInfo = null;

  if (coupon) {
    discountInfo = {
      couponId: coupon.id,
      percentOff: coupon.percent_off ?? null,
      amountOff: coupon.amount_off ?? null,
      duration: coupon.duration,
      durationInMonths: coupon.duration_in_months ?? null,
      // `end` es la prueba de que Stripe administra la duración por sí solo:
      // es la fecha exacta en la que dejará de aplicar el descuento.
      // Para `duration: 'forever'` llega como null.
      startsAt: discount.start ? new Date(discount.start * 1000).toISOString() : null,
      endsAt: discount.end ? new Date(discount.end * 1000).toISOString() : null,
    };
  }

  return {
    id: subscription.id,
    status: subscription.status,
    currency,
    normalAmount: unitAmount,
    normalFormatted: unitAmount != null ? formatAmount(unitAmount, currency) : null,
    interval: price?.recurring?.interval ?? null,
    discount: discountInfo,
  };
}
