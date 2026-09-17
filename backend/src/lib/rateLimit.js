/**
 * Limitador de peticiones mínimo, en memoria.
 *
 * Motivo concreto: el endpoint de validación de cupones permite adivinar
 * códigos a base de fuerza bruta ("PROMO10", "PROMO20", "PROMO30"...). Sin
 * ningún freno, cualquiera puede enumerar las promociones de la cuenta.
 *
 * Es deliberadamente simple: vive en memoria y se reinicia con el proceso.
 * Suficiente para un MVP de un solo nodo. Si algún día hay varias instancias,
 * sustitúyelo por Redis o por el limitador de tu proxy inverso.
 */
const buckets = new Map();

/**
 * @param {object} options
 * @param {number} options.windowMs Tamaño de la ventana en milisegundos.
 * @param {number} options.max      Peticiones permitidas por ventana e IP.
 */
export function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = req.ip ?? 'desconocida';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Demasiados intentos. Espera ${retryAfter} segundos.`,
        },
      });
    }

    next();
  };
}

// Limpieza periódica para que el Map no crezca sin límite.
// `unref()` evita que este temporizador mantenga vivo el proceso.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 60_000).unref();
