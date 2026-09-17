/**
 * Errores de aplicación y el middleware que los traduce a HTTP.
 *
 * Objetivo: que el cliente reciba SIEMPRE la misma forma `{ error: { code,
 * message } }`, y que ningún detalle interno de Stripe (ids de objetos,
 * trazas, mensajes de la clave secreta) se filtre al navegador.
 */

export class AppError extends Error {
  /**
   * @param {string} code    Código estable que el frontend puede interpretar.
   * @param {string} message Mensaje legible para la persona usuaria (en español).
   * @param {number} status  Código HTTP.
   */
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

/** Atajo para el caso más frecuente del MVP: cupón que no se puede aplicar. */
export function couponError(message, code = 'COUPON_INVALID') {
  return new AppError(code, message, 400);
}

/**
 * Traduce un error de la librería de Stripe a algo que se puede mostrar.
 *
 * Los `StripeInvalidRequestError` suelen contener información de
 * configuración (ids, nombres de parámetros) que no aporta nada a quien usa la
 * app y sí ayuda a quien la ataca: se registran en el servidor y al cliente se
 * le devuelve un mensaje genérico.
 */
function describeStripeError(err) {
  switch (err.type) {
    case 'StripeCardError':
      return new AppError('CARD_ERROR', err.message, 402);
    case 'StripeRateLimitError':
      return new AppError(
        'RATE_LIMITED',
        'Demasiadas peticiones a Stripe. Intenta de nuevo en unos segundos.',
        429
      );
    case 'StripeConnectionError':
      return new AppError(
        'STRIPE_UNREACHABLE',
        'No se pudo conectar con Stripe. Revisa tu conexión e intenta de nuevo.',
        503
      );
    case 'StripeAuthenticationError':
      return new AppError(
        'STRIPE_AUTH',
        'Error de autenticación con Stripe. Revisa STRIPE_SECRET_KEY en el servidor.',
        500
      );
    default:
      return new AppError(
        'STRIPE_ERROR',
        'Stripe rechazó la operación. Revisa la configuración e intenta de nuevo.',
        502
      );
  }
}

/** Middleware de errores de Express. Debe registrarse al final de todo. */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    if (err.status >= 500) console.error('[error]', err.code, err.message);
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  // Errores propios del SDK de Stripe: se registran completos y se responden
  // recortados.
  if (err && typeof err.type === 'string' && err.type.startsWith('Stripe')) {
    console.error('[stripe-error]', err.type, err.message);
    const mapped = describeStripeError(err);
    return res
      .status(mapped.status)
      .json({ error: { code: mapped.code, message: mapped.message } });
  }

  console.error('[unhandled]', err);
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Error interno del servidor.' },
  });
}
