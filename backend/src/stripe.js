/**
 * Cliente de Stripe — instancia única para todo el backend.
 *
 * Este es el ÚNICO módulo que recibe la STRIPE_SECRET_KEY. Nada de lo que se
 * importa desde aquí debe viajar jamás al frontend.
 */
import Stripe from 'stripe';
import { config } from './config.js';

export const stripe = new Stripe(config.stripe.secretKey, {
  // Deliberadamente NO fijamos `apiVersion`: el SDK usa la versión con la que
  // fue compilado y publicado, que es la combinación que Stripe prueba.
  // Para fijarla en producción, consulta la version exacta en
  // https://dashboard.stripe.com/developers y pásala aquí como `apiVersion`.
  appInfo: {
    name: 'Stripe Subscription Coupon MVP',
    version: '1.0.0',
  },
  // Reintentos ante errores de red / 5xx. Stripe los hace idempotentes por
  // nosotros en las peticiones de escritura.
  maxNetworkRetries: 2,
});
