#!/usr/bin/env node
/**
 * Verifica que el escenario de los 12 meses esté REALMENTE bien configurado.
 *
 *   npm run verify                    # revisa cupón, promo code y precio
 *   npm run verify -- sub_1A2b3C...   # además, inspecciona una suscripción real
 *
 * Comprueba, contra Stripe:
 *   - El precio existe, es recurrente y mensual.
 *   - El Promotion Code existe y está activo.
 *   - El cupón es duration=repeating con duration_in_months=12.
 *   - Si le pasas una suscripción: que el Discount tenga fecha de fin y que
 *     esa fecha sea 12 meses posterior al inicio.
 */
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;

if (!secretKey || !priceId) {
  console.error('\nFaltan STRIPE_SECRET_KEY o STRIPE_PRICE_ID en backend/.env\n');
  process.exit(1);
}

const stripe = new Stripe(secretKey);
const PROMOTION_CODE = process.env.MVP_PROMOTION_CODE ?? 'PROMO30';
const EXPECTED_MONTHS = 12;

const money = (cents, currency = 'MXN') =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);

let failures = 0;

function check(passed, description, detail = '') {
  console.log(`  ${passed ? 'OK  ' : 'FALLA'}  ${description}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
}

async function verifyConfiguration() {
  console.log('\n  Verificando configuración en Stripe\n');

  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });

  check(price.active, 'El precio está activo');
  check(Boolean(price.recurring), 'El precio es recurrente');
  check(price.recurring?.interval === 'month', 'El intervalo es mensual', price.recurring?.interval);
  check(price.unit_amount != null, 'El precio tiene importe fijo', money(price.unit_amount ?? 0, price.currency));

  const { data } = await stripe.promotionCodes.list({ code: PROMOTION_CODE, active: true, limit: 1 });
  const promotionCode = data[0];

  check(Boolean(promotionCode), `El Promotion Code "${PROMOTION_CODE}" existe y está activo`);

  if (!promotionCode) return { price, coupon: null };

  const coupon = promotionCode.coupon;

  check(coupon.valid !== false, 'El cupón es válido');
  check(
    coupon.duration === 'repeating',
    "El cupón usa duration='repeating'",
    `actual: '${coupon.duration}'`
  );
  check(
    coupon.duration_in_months === EXPECTED_MONTHS,
    `El cupón dura exactamente ${EXPECTED_MONTHS} meses`,
    `actual: ${coupon.duration_in_months}`
  );

  return { price, coupon };
}

/** Proyección mes a mes: lo que Stripe cobrará sin que nadie intervenga. */
function printProjection(price, coupon) {
  if (!coupon) return;

  const normal = price.unit_amount;
  const discounted =
    coupon.percent_off != null
      ? normal - Math.round((normal * coupon.percent_off) / 100)
      : Math.max(0, normal - (coupon.amount_off ?? 0));

  const months = coupon.duration_in_months ?? 0;

  console.log('\n  Cobros que hará Stripe automáticamente\n');
  console.log('    Mes    Importe        Descuento');
  console.log('    ---    -----------    ---------');

  for (const month of [1, 2, 3, months - 1, months, months + 1, months + 2]) {
    if (month < 1) continue;
    const withDiscount = month <= months;
    const amount = withDiscount ? discounted : normal;
    const label = withDiscount ? `sí (${coupon.percent_off}%)` : 'no';
    const marker = month === months + 1 ? '  <- vuelve al precio normal, solo' : '';
    console.log(
      `    ${String(month).padStart(3)}    ${money(amount, price.currency).padEnd(11)}    ${label}${marker}`
    );
    if (month === 3 && months - 1 > 4) console.log('    ...');
  }

  console.log('\n    Ninguna línea de este proyecto cambia ese precio.');
  console.log('    No hay cron, ni job programado, ni tarea manual.\n');
}

/** Inspección opcional de una suscripción real ya creada. */
async function verifySubscription(subscriptionId) {
  console.log(`\n  Inspeccionando suscripción ${subscriptionId}\n`);

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['discounts'],
  });

  check(subscription.status === 'active' || subscription.status === 'trialing',
    'La suscripción está activa', subscription.status);

  const discounts = Array.isArray(subscription.discounts) ? subscription.discounts : [];
  const discount = discounts.find((d) => typeof d === 'object');

  if (!discount) {
    check(false, 'La suscripción tiene un descuento aplicado', 'no se encontró ninguno');
    return;
  }

  check(true, 'La suscripción tiene un descuento aplicado', discount.coupon?.id);
  check(
    discount.coupon?.duration === 'repeating',
    "El descuento es 'repeating'",
    discount.coupon?.duration
  );

  // La prueba definitiva: Stripe ya sabe cuándo dejará de aplicarlo.
  check(Boolean(discount.end), 'Stripe fijó la fecha de fin del descuento');

  if (discount.start && discount.end) {
    const start = new Date(discount.start * 1000);
    const end = new Date(discount.end * 1000);
    const months = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.44));

    console.log(`\n    Descuento activo desde  ${start.toISOString().slice(0, 10)}`);
    console.log(`    Stripe lo retira el     ${end.toISOString().slice(0, 10)}`);
    console.log(`    Duración                ~${months} meses\n`);

    check(months === EXPECTED_MONTHS, `La ventana del descuento son ${EXPECTED_MONTHS} meses`, `~${months}`);
  }
}

async function main() {
  const { price, coupon } = await verifyConfiguration();

  printProjection(price, coupon);

  const subscriptionId = process.argv[2];
  if (subscriptionId) await verifySubscription(subscriptionId);

  if (failures > 0) {
    console.error(`  ${failures} comprobación(es) fallaron.\n`);
    process.exit(1);
  }

  console.log('  Todas las comprobaciones pasaron.\n');
}

main().catch((err) => {
  console.error('\n  Error verificando:', err.message, '\n');
  process.exit(1);
});
