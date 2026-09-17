/**
 * Servidor Express — la única capa que conoce la STRIPE_SECRET_KEY.
 *
 *   React  --HTTP-->  este backend  --secret key-->  Stripe API
 *
 * El navegador nunca ve la clave secreta ni decide precios.
 */
import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import { errorHandler } from './lib/errors.js';
import { rateLimit } from './lib/rateLimit.js';
import { planRouter } from './routes/plan.js';
import { couponRouter } from './routes/coupon.js';
import { checkoutRouter } from './routes/checkout.js';
import { webhookRouter } from './routes/webhook.js';

const app = express();

// Necesario para que `req.ip` sea correcto detrás de un proxy (ngrok, Cloudflare).
app.set('trust proxy', 1);

/* -------------------------------------------------------------------------
 * 1. Webhooks — ANTES del parser de JSON
 *
 * El orden importa y es la causa nº 1 de webhooks que fallan: la verificación
 * de firma necesita el cuerpo crudo. Si `express.json()` se registrara antes,
 * consumiría el stream y la firma jamás coincidiría.
 * ---------------------------------------------------------------------- */
app.use('/api/webhooks', webhookRouter);

/* -------------------------------------------------------------------------
 * 2. Middleware general (ya no afecta a los webhooks)
 * ---------------------------------------------------------------------- */

// CORS restringido al origen del frontend. Sin `origin: '*'`.
app.use(cors({ origin: config.frontendUrl, methods: ['GET', 'POST'] }));

// Límite de tamaño: no hay motivo para aceptar cuerpos grandes en esta API.
app.use(express.json({ limit: '10kb' }));

/* -------------------------------------------------------------------------
 * 3. Rutas de la aplicación
 * ---------------------------------------------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/plan', planRouter);

// Freno contra la enumeración de códigos promocionales por fuerza bruta.
app.use('/api/coupon', rateLimit({ windowMs: 60_000, max: 20 }), couponRouter);

app.use('/api/checkout', rateLimit({ windowMs: 60_000, max: 10 }), checkoutRouter);

// 404 en JSON, para que el frontend reciba siempre la misma forma de error.
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
});

// Manejador de errores: siempre el último.
// Express 5 reenvía aquí automáticamente los rechazos de funciones async.
app.use(errorHandler);

/* -------------------------------------------------------------------------
 * 4. Arranque
 * ---------------------------------------------------------------------- */
app.listen(config.port, () => {
  console.log('');
  console.log('  Backend listo');
  console.log(`  API            http://localhost:${config.port}/api`);
  console.log(`  Frontend       ${config.frontendUrl}`);
  console.log(`  Price ID       ${config.stripe.priceId}`);
  console.log(
    `  Webhooks       ${
      config.stripe.webhookSecret
        ? 'firma configurada'
        : 'SIN STRIPE_WEBHOOK_SECRET (el endpoint responderá 503)'
    }`
  );
  console.log('');
});
