/** GET /api/plan — el plan que se muestra en pantalla, leído desde Stripe. */
import { Router } from 'express';
import { getPlan } from '../services/planService.js';
import { publishableKey } from '../config.js';

export const planRouter = Router();

planRouter.get('/', async (_req, res) => {
  const plan = await getPlan();

  res.json({
    productName: plan.productName,
    productDescription: plan.productDescription,
    currency: plan.currency,
    unitAmount: plan.unitAmount,
    formattedAmount: plan.formattedAmount,
    interval: plan.interval,
    intervalCount: plan.intervalCount,
    // La clave publicable es pública por diseño. La secreta jamás sale de aquí.
    publishableKey,
  });
});
