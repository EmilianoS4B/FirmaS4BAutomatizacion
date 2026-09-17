#!/usr/bin/env node
/**
 * Crea en tu cuenta de Stripe (MODO TEST) todo lo que necesita el MVP:
 *
 *   1. Producto        "Plan Pro"
 *   2. Precio          $1,000.00 MXN / mes (recurrente)
 *   3. Cupón           30% de descuento, duration=repeating, duration_in_months=12
 *   4. Promotion Code  "PROMO30" apuntando a ese cupón
 *
 * Es IDEMPOTENTE: ejecútalo las veces que quieras, reutiliza lo que ya exista.
 *
 *   npm run setup:stripe
 *
 * Al terminar imprime el STRIPE_PRICE_ID que debes pegar en backend/.env
 */
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error('\nFalta STRIPE_SECRET_KEY. Copia .env.example a backend/.env y complétalo.\n');
  process.exit(1);
}

if (!secretKey.startsWith('sk_test_')) {
  console.error('\nEste script solo se ejecuta con una clave de MODO TEST (sk_test_...).');
  console.error('Crear cupones en producción por accidente no es algo que quieras.\n');
  process.exit(1);
}

const stripe = new Stripe(secretKey);

// --- Parámetros del MVP -----------------------------------------------------
const PRODUCT_KEY = 'plan-pro-mvp';        // marca en metadata para reencontrarlo
const PRODUCT_NAME = 'Plan Pro';
const PRICE_LOOKUP_KEY = 'plan_pro_mensual_mxn';
const PRICE_AMOUNT = 100_000;              // $1,000.00 MXN en centavos
const PRICE_CURRENCY = 'mxn';
const COUPON_ID = 'promo30-12meses';       // id fijo -> idempotencia trivial
const COUPON_PERCENT_OFF = 30;
const COUPON_DURATION_MONTHS = 12;
const PROMOTION_CODE = 'PROMO30';
// ---------------------------------------------------------------------------

const log = (step, message) => console.log(`  ${step}  ${message}`);

/** 1. Producto */
async function ensureProduct() {
  const { data } = await stripe.products.list({ active: true, limit: 100 });
  const existing = data.find((p) => p.metadata?.mvp_key === PRODUCT_KEY);

  if (existing) {
    log('=', `Producto ya existe: ${existing.name} (${existing.id})`);
    return existing;
  }

  const product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: 'Plan mensual de ejemplo para el MVP de suscripciones con cupón.',
    metadata: { mvp_key: PRODUCT_KEY },
  });

  log('+', `Producto creado: ${product.name} (${product.id})`);
  return product;
}

/** 2. Precio mensual recurrente */
async function ensurePrice(product) {
  const { data } = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], limit: 1 });

  if (data[0]) {
    log('=', `Precio ya existe: ${data[0].id}`);
    return data[0];
  }

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: PRICE_AMOUNT,
    currency: PRICE_CURRENCY,
    recurring: { interval: 'month' },
    lookup_key: PRICE_LOOKUP_KEY,
  });

  log('+', `Precio creado: $1,000.00 MXN/mes (${price.id})`);
  return price;
}

/**
 * 3. Cupón — AQUÍ vive la regla de los 12 meses.
 *
 * `duration: 'repeating'` + `duration_in_months: 12` es lo que hace que Stripe
 * aplique el descuento exactamente 12 facturas y lo retire solo. No hay que
 * crear 12 cupones ni programar nada.
 */
async function ensureCoupon() {
  try {
    const existing = await stripe.coupons.retrieve(COUPON_ID);

    if (
      existing.duration !== 'repeating' ||
      existing.duration_in_months !== COUPON_DURATION_MONTHS
    ) {
      console.error(
        `\n  El cupón "${COUPON_ID}" existe pero está mal configurado ` +
          `(duration=${existing.duration}, meses=${existing.duration_in_months}).`
      );
      console.error('  Los cupones son inmutables: bórralo en el Dashboard y vuelve a ejecutar.\n');
      process.exit(1);
    }

    log('=', `Cupón ya existe: ${existing.percent_off}% durante ${existing.duration_in_months} meses`);
    return existing;
  } catch (err) {
    if (err.code !== 'resource_missing') throw err;
  }

  const coupon = await stripe.coupons.create({
    id: COUPON_ID,
    name: `${COUPON_PERCENT_OFF}% durante ${COUPON_DURATION_MONTHS} meses`,
    percent_off: COUPON_PERCENT_OFF,
    duration: 'repeating',
    duration_in_months: COUPON_DURATION_MONTHS,
  });

  log('+', `Cupón creado: ${coupon.percent_off}% durante ${coupon.duration_in_months} meses (${coupon.id})`);
  return coupon;
}

/** 4. Promotion Code — el texto que teclea la persona usuaria */
async function ensurePromotionCode(coupon) {
  const { data } = await stripe.promotionCodes.list({ code: PROMOTION_CODE, limit: 1 });

  if (data[0]) {
    log('=', `Promotion Code ya existe: ${data[0].code} (${data[0].id})`);
    return data[0];
  }

  const promotionCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: PROMOTION_CODE,
  });

  log('+', `Promotion Code creado: ${promotionCode.code} (${promotionCode.id})`);
  return promotionCode;
}

async function main() {
  console.log('\n  Configurando Stripe (modo test)\n');

  const product = await ensureProduct();
  const price = await ensurePrice(product);
  const coupon = await ensureCoupon();
  await ensurePromotionCode(coupon);

  const discounted = Math.round(PRICE_AMOUNT * (1 - COUPON_PERCENT_OFF / 100));
  const money = (cents) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

  console.log('\n  ---------------------------------------------------------------');
  console.log('  Listo. Pega esto en backend/.env');
  console.log('  ---------------------------------------------------------------\n');
  console.log(`  STRIPE_PRICE_ID=${price.id}\n`);
  console.log('  ---------------------------------------------------------------');
  console.log('  Comportamiento configurado');
  console.log('  ---------------------------------------------------------------');
  console.log(`  Código promocional     ${PROMOTION_CODE}`);
  console.log(`  Meses 1 a ${COUPON_DURATION_MONTHS}          ${money(discounted)} / mes`);
  console.log(`  Mes ${COUPON_DURATION_MONTHS + 1} en adelante   ${money(PRICE_AMOUNT)} / mes  (automático)`);
  console.log('  ---------------------------------------------------------------\n');
}

main().catch((err) => {
  console.error('\n  Error configurando Stripe:', err.message, '\n');
  process.exit(1);
});
