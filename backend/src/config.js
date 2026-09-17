/**
 * Configuración central.
 *
 * Toda la configuración vive aquí y se valida AL ARRANCAR, no en medio de una
 * petición: es preferible que el servidor no levante a que falle a mitad de un
 * cobro por una variable ausente.
 *
 * Las variables se cargan con el flag nativo `node --env-file=.env`
 * (Node >= 20.6), por eso no hay dependencia de `dotenv`.
 */

/** Lee una variable obligatoria y aborta el arranque si falta. */
function required(name, { startsWith } = {}) {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${name}. ` +
        'Copia .env.example a backend/.env y complétala con tus datos de Stripe (modo test).'
    );
  }

  // Un aviso temprano y barato contra el error más caro posible: usar por
  // descuido una clave de producción (sk_live_) en un MVP de pruebas.
  if (startsWith && !value.startsWith(startsWith)) {
    throw new Error(
      `${name} deberia empezar con "${startsWith}" pero empieza con "${value.slice(0, 8)}...". ` +
        'Verifica que estas usando las claves de MODO TEST de Stripe.'
    );
  }

  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

export const config = {
  port: Number(optional('PORT', '3000')),

  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173').replace(/\/$/, ''),
  backendUrl: optional('BACKEND_URL', 'http://localhost:3000').replace(/\/$/, ''),

  stripe: {
    secretKey: required('STRIPE_SECRET_KEY', { startsWith: 'sk_test_' }),
    // El webhook secret solo es obligatorio cuando realmente vas a recibir
    // eventos. Si falta, el endpoint responde 503 en lugar de tumbar el server:
    // así puedes probar el flujo de checkout sin tener `stripe listen` abierto.
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', null),
    priceId: required('STRIPE_PRICE_ID', { startsWith: 'price_' }),
  },
};

/**
 * La clave publicable es pública por definición, pero la exponemos por un
 * endpoint explícito en lugar de inyectarla en el bundle: así el frontend no
 * necesita ningún build-time secret y queda un solo origen de verdad.
 */
export const publishableKey = optional('STRIPE_PUBLISHABLE_KEY', null);
