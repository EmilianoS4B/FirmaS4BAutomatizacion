/**
 * POST /api/webhooks/stripe — receptor de eventos de Stripe.
 *
 * ---------------------------------------------------------------------------
 * DOS REQUISITOS QUE NO SE PUEDEN SALTAR
 * ---------------------------------------------------------------------------
 * 1. CUERPO CRUDO (raw body). La firma se calcula sobre los bytes exactos que
 *    envió Stripe. Si `express.json()` parsea el cuerpo antes, la firma NUNCA
 *    coincide. Por eso esta ruta se monta ANTES del parser global en
 *    `server.js` y usa su propio `express.raw()`.
 *
 * 2. VERIFICAR LA FIRMA. Este endpoint es público: cualquiera puede enviarle
 *    un POST diciendo "el pago fue exitoso". `constructEvent` es lo único que
 *    distingue un evento real de Stripe de uno inventado.
 * ---------------------------------------------------------------------------
 *
 * Para el MVP los manejadores solo registran en consola: la estructura queda
 * lista para que conectes tu base de datos donde están los TODO.
 */
import express, { Router } from 'express';
import { stripe } from '../stripe.js';
import { config } from '../config.js';

export const webhookRouter = Router();

/* -------------------------------------------------------------------------
 * Manejadores por tipo de evento
 * ---------------------------------------------------------------------- */

/** Checkout completado: la suscripción acaba de crearse. */
function onCheckoutCompleted(session) {
  console.log(
    `[webhook] checkout completado — session=${session.id} ` +
      `suscripcion=${session.subscription ?? 'n/a'} cliente=${session.customer ?? 'n/a'}`
  );
  // TODO: marcar al usuario como activo en tu base de datos.
}

/** Suscripción creada o actualizada. */
function onSubscriptionChanged(subscription, eventType) {
  const discounts = Array.isArray(subscription.discounts) ? subscription.discounts : [];
  const discount = discounts.find((d) => typeof d === 'object') ?? null;

  // Cuando el descuento de 12 meses vence, Stripe emite
  // `customer.subscription.updated` con la lista de descuentos ya vacía.
  // Ese evento es la señal de que a partir de la próxima factura se cobra el
  // precio completo — sin que nosotros hagamos absolutamente nada.
  const discountInfo = discount?.coupon
    ? `cupon=${discount.coupon.id} termina=${
        discount.end ? new Date(discount.end * 1000).toISOString() : 'nunca'
      }`
    : 'sin descuento activo (precio normal)';

  console.log(
    `[webhook] ${eventType} — suscripcion=${subscription.id} ` +
      `estado=${subscription.status} ${discountInfo}`
  );
  // TODO: sincronizar el estado de la suscripción en tu base de datos.
}

/** Cobro mensual exitoso. */
function onInvoicePaid(invoice) {
  console.log(
    `[webhook] pago exitoso — factura=${invoice.id} ` +
      `total=${invoice.total} ${invoice.currency} ` +
      `(antes de descuento: ${invoice.subtotal})`
  );
  // TODO: registrar el cobro / enviar recibo.
}

/** Cobro mensual fallido. */
function onInvoicePaymentFailed(invoice) {
  console.warn(
    `[webhook] PAGO FALLIDO — factura=${invoice.id} ` +
      `suscripcion=${invoice.subscription ?? 'n/a'} intento=${invoice.attempt_count}`
  );
  // TODO: avisar a la persona usuaria para que actualice su método de pago.
}

/** Suscripción cancelada. */
function onSubscriptionDeleted(subscription) {
  console.log(
    `[webhook] suscripcion cancelada — ${subscription.id} ` +
      `(cancelada el ${
        subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : 'n/a'
      })`
  );
  // TODO: revocar el acceso al producto.
}

/** Despacha el evento ya verificado al manejador que corresponda. */
function handleEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      return onCheckoutCompleted(event.data.object);

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return onSubscriptionChanged(event.data.object, event.type);

    case 'customer.subscription.deleted':
      return onSubscriptionDeleted(event.data.object);

    // Stripe emite ambos para un cobro correcto según la versión de API;
    // se aceptan los dos para no depender de cuál esté activa en tu cuenta.
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return onInvoicePaid(event.data.object);

    case 'invoice.payment_failed':
      return onInvoicePaymentFailed(event.data.object);

    default:
      console.log(`[webhook] evento ignorado: ${event.type}`);
  }
}

/* -------------------------------------------------------------------------
 * La ruta
 * ---------------------------------------------------------------------- */

webhookRouter.post(
  '/stripe',
  // `express.raw` entrega un Buffer intacto — imprescindible para la firma.
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!config.stripe.webhookSecret) {
      console.error('[webhook] STRIPE_WEBHOOK_SECRET no está configurado — evento rechazado.');
      return res.status(503).json({
        error: {
          code: 'WEBHOOK_NOT_CONFIGURED',
          message: 'El endpoint de webhooks no está configurado en el servidor.',
        },
      });
    }

    const signature = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripe.webhookSecret);
    } catch (err) {
      // Firma inválida: o no viene de Stripe, o el secreto no coincide, o el
      // cuerpo fue alterado por un middleware. En los tres casos: 400.
      console.error('[webhook] firma inválida:', err.message);
      return res.status(400).json({
        error: { code: 'INVALID_SIGNATURE', message: 'Firma de webhook inválida.' },
      });
    }

    try {
      handleEvent(event);
    } catch (err) {
      // Un fallo en NUESTRA lógica no debe provocar que Stripe reintente en
      // bucle: se registra y se responde 200. (En producción, encola el evento
      // y reintenta por tu cuenta.)
      console.error(`[webhook] error procesando ${event.type}:`, err);
    }

    // Responder 2xx rápido. Si Stripe no recibe respuesta, reintenta el envío.
    res.json({ received: true });
  }
);
