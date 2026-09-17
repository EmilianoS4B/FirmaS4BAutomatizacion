/**
 * Aritmética de precios y descuentos.
 *
 * Todos los importes de Stripe viajan en la "unidad mínima" de la moneda
 * (centavos para MXN: 100000 = $1,000.00 MXN). Aquí vive toda la conversión y
 * el formateo, para que ninguna ruta tenga que dividir entre 100 a mano.
 *
 * IMPORTANTE: estos números son SOLO para mostrar en pantalla. Quien cobra de
 * verdad es Stripe, a partir del price_id y del cupón. El frontend nunca envía
 * un precio y el backend nunca lo acepta.
 */

/** Monedas sin decimales: el importe ya está en unidades enteras. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/** Convierte unidades mínimas de Stripe a unidades mayores (70000 -> 700). */
export function toMajorUnits(minorAmount, currency) {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? minorAmount
    : minorAmount / 100;
}

/** Formatea un importe de Stripe como moneda legible: 70000 -> "$700.00". */
export function formatAmount(minorAmount, currency) {
  const normalized = currency.toLowerCase();
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(normalized) ? 0 : 2;

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(toMajorUnits(minorAmount, currency));
}

/**
 * Resuelve cuánto descuenta un cupón sobre un importe dado.
 *
 * Replica el comportamiento de Stripe: para porcentajes, se redondea el
 * DESCUENTO (no el total) a la unidad mínima más cercana. Para importes fijos
 * se respeta `currency_options` cuando el cupón es multi-moneda.
 *
 * @returns {{ discountAmount: number, finalAmount: number }}
 */
export function applyCouponToAmount(unitAmount, coupon, currency) {
  if (coupon.percent_off != null) {
    const discountAmount = Math.round((unitAmount * coupon.percent_off) / 100);
    return { discountAmount, finalAmount: Math.max(0, unitAmount - discountAmount) };
  }

  if (coupon.amount_off != null) {
    const normalized = currency.toLowerCase();

    // Un cupón de importe fijo solo aplica en su propia moneda, salvo que se
    // haya configurado explícitamente para varias con `currency_options`.
    let amountOff = null;
    if (coupon.currency && coupon.currency.toLowerCase() === normalized) {
      amountOff = coupon.amount_off;
    } else if (coupon.currency_options?.[normalized]?.amount_off != null) {
      amountOff = coupon.currency_options[normalized].amount_off;
    }

    if (amountOff == null) return null; // moneda incompatible: lo decide quien llama

    const discountAmount = Math.min(amountOff, unitAmount);
    return { discountAmount, finalAmount: unitAmount - discountAmount };
  }

  // Un cupón sin percent_off ni amount_off no debería existir en Stripe.
  return { discountAmount: 0, finalAmount: unitAmount };
}

/**
 * Describe en español cuánto dura un descuento.
 *
 * Esta es la pieza que responde a la pregunta del negocio: "¿hasta cuándo
 * pago menos?". `duration: 'repeating'` + `duration_in_months: 12` es
 * exactamente el caso que pide el MVP.
 */
export function describeDuration(coupon) {
  switch (coupon.duration) {
    case 'repeating': {
      const months = coupon.duration_in_months ?? 0;
      return {
        type: 'repeating',
        durationInMonths: months,
        label: months === 1 ? '1 mes' : `${months} meses`,
      };
    }
    case 'forever':
      return {
        type: 'forever',
        durationInMonths: null,
        label: 'Para siempre',
      };
    case 'once':
    default:
      return {
        type: 'once',
        durationInMonths: 1,
        label: 'Solo el primer cobro',
      };
  }
}

/** Etiqueta corta del descuento: "30%" o "$200.00". */
export function describeDiscount(coupon, currency) {
  if (coupon.percent_off != null) {
    // Stripe devuelve 30 o 30.0 — se muestra sin decimales inútiles.
    const percent = Number(coupon.percent_off);
    return {
      type: 'percent',
      percentOff: percent,
      amountOff: null,
      label: `${percent % 1 === 0 ? percent.toFixed(0) : percent}%`,
    };
  }

  const amountOff = coupon.amount_off ?? 0;
  return {
    type: 'amount',
    percentOff: null,
    amountOff,
    label: formatAmount(amountOff, coupon.currency ?? currency),
  };
}
