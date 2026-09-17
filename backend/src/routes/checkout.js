/**
 * POST /api/checkout/session      — crea la sesión de pago
 * GET  /api/checkout/session/:id  — lee el resultado para la confirmación
 */
import { Router } from 'express';
import { createCheckoutSession, getCheckoutResult } from '../services/checkoutService.js';

export const checkoutRouter = Router();

checkoutRouter.post('/session', async (req, res) => {
  // Lo único que se acepta del navegador es el código promocional (texto).
  // Ni precios, ni ids de descuento, ni importes: todo eso se resuelve aquí.
  const { url, sessionId } = await createCheckoutSession(req.body?.code ?? null);

  res.json({ url, sessionId });
});

checkoutRouter.get('/session/:sessionId', async (req, res) => {
  const result = await getCheckoutResult(req.params.sessionId);

  res.json(result);
});
