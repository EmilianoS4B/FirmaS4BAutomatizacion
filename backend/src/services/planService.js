/**
 * Plan — lee el precio REAL desde Stripe.
 *
 * El precio nunca se escribe en el código ni se acepta desde el frontend:
 * se resuelve con el `price_id` de las variables de entorno. Si mañana cambias
 * el precio en el Dashboard, la app lo refleja sin tocar nada.
 */
import { stripe } from '../stripe.js';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { formatAmount } from '../lib/pricing.js';

/**
 * Recupera el precio configurado y su producto.
 * @returns {Promise<object>} Plan listo para enviar al frontend.
 */
export async function getPlan() {
  const price = await stripe.prices.retrieve(config.stripe.priceId, {
    expand: ['product'],
  });

  // Validamos la respuesta de Stripe en lugar de asumir que es correcta:
  // un price_id mal configurado debe fallar aquí con un mensaje claro, no
  // más adelante en mitad del checkout.
  if (!price.active) {
    throw new AppError(
      'PRICE_INACTIVE',
      'El precio configurado está inactivo en Stripe.',
      500
    );
  }

  if (!price.recurring) {
    throw new AppError(
      'PRICE_NOT_RECURRING',
      'El precio configurado no es recurrente. Este MVP requiere un precio de suscripción mensual.',
      500
    );
  }

  if (price.unit_amount == null) {
    throw new AppError(
      'PRICE_NOT_SUPPORTED',
      'El precio configurado no tiene un importe fijo (¿es escalonado?). Usa un precio simple para este MVP.',
      500
    );
  }

  const product = typeof price.product === 'object' ? price.product : null;

  return {
    priceId: price.id,
    // Necesario para validar cupones restringidos a productos concretos.
    productId: product?.id ?? (typeof price.product === 'string' ? price.product : null),
    productName: product?.name ?? 'Plan',
    productDescription: product?.description ?? null,
    currency: price.currency,
    unitAmount: price.unit_amount,
    formattedAmount: formatAmount(price.unit_amount, price.currency),
    interval: price.recurring.interval,
    intervalCount: price.recurring.interval_count,
  };
}
