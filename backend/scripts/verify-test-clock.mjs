#!/usr/bin/env node
/**
 * PRUEBA DEFINITIVA del escenario de 12 meses, usando Test Clocks de Stripe.
 *
 *   npm run verify:testclock
 *
 * Simula 14 meses de facturación real en modo test y muestra lo que Stripe
 * cobra cada mes. Si la configuración es correcta verás:
 *
 *     Mes  1..12  ->   $700.00 MXN
 *     Mes 13, 14  -> $1,000.00 MXN
 *
 * Nada en este script cambia el precio: solo adelanta el reloj y pregunta a
 * Stripe qué facturó. Ese es justamente el punto — demuestra los criterios de
 * aceptación 8, 9 y 10 sin ninguna intervención manual.
 *
 * Tarda varios minutos (Stripe procesa cada avance del reloj de forma
 * asíncrona). Al terminar borra el test clock y todo lo que creó con él.
 */
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;

if (!secretKey || !priceId) {
  console.error('\nFaltan STRIPE_SECRET_KEY o STRIPE_PRICE_ID en backend/.env\n');
  process.exit(1);
}

if (!secretKey.startsWith('sk_test_')) {
  console.error('\nLos Test Clocks solo existen en modo test. Usa una clave sk_test_.\n');
  process.exit(1);
}

const stripe = new Stripe(secretKey, { maxNetworkRetries: 3 });

const PROMOTION_CODE = process.env.MVP_PROMOTION_CODE ?? 'PROMO30';
const MONTHS_TO_SIMULATE = 14;
const EXPECTED_DISCOUNT_MONTHS = 12;

const money = (cents, currency = 'mxn') =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera a que el test clock termine de procesar el avance. */
async function waitUntilReady(clockId, { timeoutMs = 180_000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);

    if (clock.status === 'ready') return clock;

    if (clock.status === 'internal_failure') {
      throw new Error('El test clock falló internamente en Stripe.');
    }

    await sleep(2000);
  }

  throw new Error('Tiempo de espera agotado esperando al test clock.');
}

/** Suma meses a una fecha, en segundos epoch. */
function addMonths(epochSeconds, months) {
  const date = new Date(epochSeconds * 1000);
  date.setUTCMonth(date.getUTCMonth() + months);
  return Math.floor(date.getTime() / 1000);
}

async function main() {
  console.log('\n  Simulando 14 meses de facturación con Test Clocks\n');
  console.log('  Esto tarda varios minutos. No lo interrumpas.\n');

  // El Promotion Code debe existir antes de empezar.
  const { data: promos } = await stripe.promotionCodes.list({
    code: PROMOTION_CODE,
    active: true,
    limit: 1,
  });

  if (!promos[0]) {
    console.error(`  No existe el Promotion Code "${PROMOTION_CODE}". Ejecuta antes: npm run setup:stripe\n`);
    process.exit(1);
  }

  const promotionCode = promos[0];
  const startTime = Math.floor(Date.now() / 1000);
  let clock;

  try {
    clock = await stripe.testHelpers.testClocks.create({
      frozen_time: startTime,
      name: 'Verificación descuento 12 meses',
    });
    console.log(`  Test clock creado: ${clock.id}`);

    // Cliente ligado al reloj simulado, con una tarjeta de prueba que siempre
    // aprueba (así los 14 cobros se completan sin intervención).
    const customer = await stripe.customers.create({
      test_clock: clock.id,
      name: 'Cliente de prueba (12 meses)',
      email: 'prueba+testclock@example.com',
    });

    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' },
    });

    await stripe.paymentMethods.attach(paymentMethod.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    // Aquí se ata el descuento — exactamente igual que en checkoutService.js.
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      discounts: [{ promotion_code: promotionCode.id }],
    });

    console.log(`  Suscripción creada: ${subscription.id}\n`);

    // Avanzamos el reloj un mes cada vez y vamos leyendo lo que Stripe factura.
    for (let month = 1; month <= MONTHS_TO_SIMULATE; month += 1) {
      process.stdout.write(`  Avanzando al mes ${month} de ${MONTHS_TO_SIMULATE}... `);

      await stripe.testHelpers.testClocks.advance(clock.id, {
        frozen_time: addMonths(startTime, month),
      });
      await waitUntilReady(clock.id);

      process.stdout.write('listo\n');
    }

    console.log('\n  Facturas emitidas por Stripe\n');
    console.log('    #    Importe cobrado    Descuento aplicado');
    console.log('    --   ---------------    ------------------');

    const { data: invoices } = await stripe.invoices.list({
      customer: customer.id,
      limit: 100,
    });

    // Stripe las devuelve de más reciente a más antigua.
    const ordered = invoices.slice().sort((a, b) => a.created - b.created);

    let discountedCount = 0;
    let fullPriceCount = 0;

    ordered.forEach((invoice, index) => {
      const hadDiscount = (invoice.total_discount_amounts ?? []).some((d) => d.amount > 0);
      if (hadDiscount) discountedCount += 1;
      else fullPriceCount += 1;

      const marker =
        index + 1 === EXPECTED_DISCOUNT_MONTHS + 1 ? '  <- vuelve al precio normal' : '';

      console.log(
        `    ${String(index + 1).padStart(2)}   ${money(invoice.total, invoice.currency).padEnd(15)}    ${
          hadDiscount ? 'sí' : 'no'
        }${marker}`
      );
    });

    console.log('\n  Resultado\n');
    console.log(`    Facturas con descuento    ${discountedCount}  (esperado: ${EXPECTED_DISCOUNT_MONTHS})`);
    console.log(`    Facturas a precio normal  ${fullPriceCount}`);

    const passed = discountedCount === EXPECTED_DISCOUNT_MONTHS && fullPriceCount > 0;

    console.log(
      `\n    ${passed ? 'CORRECTO' : 'INCORRECTO'}: el descuento se aplicó ${discountedCount} ` +
        `meses y después Stripe volvió al precio completo por sí solo.\n`
    );

    if (!passed) process.exitCode = 1;
  } finally {
    if (clock) {
      // Borrar el test clock elimina también el cliente y la suscripción
      // simulados, para no dejar basura en tu cuenta de pruebas.
      await stripe.testHelpers.testClocks.del(clock.id).catch(() => {});
      console.log(`  Test clock ${clock.id} eliminado.\n`);
    }
  }
}

main().catch((err) => {
  console.error('\n  Error en la simulación:', err.message, '\n');
  process.exit(1);
});
