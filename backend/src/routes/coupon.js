/** POST /api/coupon/validate — valida un código promocional contra Stripe. */
import { Router } from 'express';
import { getPlan } from '../services/planService.js';
import { validateCoupon } from '../services/couponService.js';

export const couponRouter = Router();

couponRouter.post('/validate', async (req, res) => {
  const plan = await getPlan();
  const result = await validateCoupon(req.body?.code, plan);

  // Se omiten deliberadamente `promotionCodeId` y `couponId`.
  //
  // No son secretos, pero si el frontend los conociera tendería a
  // reenviárnoslos al crear el checkout, y entonces estaríamos confiando en un
  // identificador de descuento elegido por el cliente. Al devolver solo el
  // `code`, el backend está obligado a resolverlo de nuevo contra Stripe.
  const { promotionCodeId, couponId, ...safe } = result;

  res.json(safe);
});
