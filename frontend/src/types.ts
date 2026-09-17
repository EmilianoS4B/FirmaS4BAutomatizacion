/**
 * Tipos que describen EXACTAMENTE lo que responde el backend.
 *
 * Nota de seguridad: aquí no hay ningún campo de precio que el frontend pueda
 * elegir. Todos los importes llegan ya calculados desde el servidor, que los
 * obtuvo de Stripe. La interfaz solo los muestra.
 */

export interface Plan {
  productName: string;
  productDescription: string | null;
  currency: string;
  unitAmount: number;
  formattedAmount: string;
  interval: string;
  intervalCount: number;
  publishableKey: string | null;
}

export interface Discount {
  type: 'percent' | 'amount';
  percentOff: number | null;
  amountOff: number | null;
  label: string;
}

export interface Duration {
  type: 'once' | 'repeating' | 'forever';
  durationInMonths: number | null;
  label: string;
}

export interface Pricing {
  currency: string;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  originalFormatted: string;
  discountFormatted: string;
  finalFormatted: string;
  totalSavingsFormatted: string | null;
}

export interface ValidatedCoupon {
  valid: true;
  code: string;
  discount: Discount;
  duration: Duration;
  pricing: Pricing;
  requiresFirstTimeCustomer: boolean;
}

export interface SubscriptionDiscount {
  couponId: string;
  percentOff: number | null;
  amountOff: number | null;
  duration: string;
  durationInMonths: number | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface SubscriptionSummary {
  id: string;
  status: string;
  currency: string;
  normalAmount: number | null;
  normalFormatted: string | null;
  interval: string | null;
  discount: SubscriptionDiscount | null;
}

export interface CheckoutResult {
  status: string | null;
  paid: boolean;
  customerEmail: string | null;
  subscription: SubscriptionSummary | null;
}

/** Forma única de error que devuelve la API. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
