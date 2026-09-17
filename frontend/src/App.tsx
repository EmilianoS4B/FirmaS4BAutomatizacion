import { useCallback, useEffect, useState } from 'react';

import { ApiError, createCheckoutSession, fetchCheckoutResult, fetchPlan, validateCoupon } from './api';
import type { CheckoutResult, Plan, ValidatedCoupon } from './types';
import { PlanCard } from './components/PlanCard';
import { CouponForm } from './components/CouponForm';
import { DiscountSummary } from './components/DiscountSummary';
import { SuccessPanel } from './components/SuccessPanel';

/** Lee los parámetros con los que Stripe nos devuelve al frontend. */
function readReturnParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get('session_id'),
    canceled: params.get('canceled') === '1',
  };
}

/** Limpia la query string sin recargar, para que un F5 no repita el estado. */
function clearUrl() {
  window.history.replaceState({}, '', window.location.pathname);
}

export default function App() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const [coupon, setCoupon] = useState<ValidatedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const [isRedirecting, setIsRedirecting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [canceled, setCanceled] = useState(false);

  // Al montar: o venimos de vuelta de Stripe, o cargamos el plan.
  useEffect(() => {
    const { sessionId, canceled: wasCanceled } = readReturnParams();

    if (wasCanceled) {
      setCanceled(true);
      clearUrl();
    }

    if (sessionId) {
      // Se consulta al backend en lugar de confiar en la URL: el session_id
      // viaja por la barra de direcciones y cualquiera podría inventarlo.
      fetchCheckoutResult(sessionId)
        .then((data) => setResult(data))
        .catch((err: unknown) => {
          setCheckoutError(
            err instanceof ApiError ? err.message : 'No se pudo confirmar la suscripción.'
          );
        })
        .finally(clearUrl);
      return;
    }

    fetchPlan()
      .then(setPlan)
      .catch((err: unknown) => {
        setPlanError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo cargar el plan. Revisa que el backend esté levantado.'
        );
      });
  }, []);

  const handleApplyCoupon = useCallback(async (code: string) => {
    setIsValidating(true);
    setCouponError(null);
    setCheckoutError(null);

    try {
      // La validación de verdad ocurre en el backend contra Stripe.
      setCoupon(await validateCoupon(code));
    } catch (err: unknown) {
      setCoupon(null);
      setCouponError(
        err instanceof ApiError ? err.message : 'No se pudo validar el código. Intenta de nuevo.'
      );
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleRemoveCoupon = useCallback(() => {
    setCoupon(null);
    setCouponError(null);
  }, []);

  const handleSubscribe = useCallback(async () => {
    setIsRedirecting(true);
    setCheckoutError(null);

    try {
      // Solo se envía el código. El backend resuelve el precio y revalida el
      // cupón antes de crear la sesión de pago.
      const { url } = await createCheckoutSession(coupon?.code ?? null);
      window.location.href = url;
    } catch (err: unknown) {
      setIsRedirecting(false);
      setCheckoutError(
        err instanceof ApiError ? err.message : 'No se pudo iniciar el pago. Intenta de nuevo.'
      );
    }
  }, [coupon]);

  const handleReset = useCallback(() => {
    setResult(null);
    setCoupon(null);
    setCouponError(null);
    setCheckoutError(null);
    setCanceled(false);
    fetchPlan().then(setPlan).catch(() => setPlanError('No se pudo cargar el plan.'));
  }, []);

  /* --------------------------------------------------------------------- */

  if (result) {
    return (
      <main className="app">
        <div className="card">
          <SuccessPanel result={result} onReset={handleReset} />
        </div>
      </main>
    );
  }

  if (planError) {
    return (
      <main className="app">
        <div className="card">
          <p className="message message--error" role="alert">
            {planError}
          </p>
        </div>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="app">
        <div className="card">
          <p className="loading">Cargando plan…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="card">
        <PlanCard plan={plan} />

        {canceled && (
          <p className="message message--info">
            Cancelaste el pago. Tu suscripción no se creó y no se te cobró nada.
          </p>
        )}

        <CouponForm
          onApply={handleApplyCoupon}
          onRemove={handleRemoveCoupon}
          appliedCode={coupon?.code ?? null}
          isValidating={isValidating}
          error={couponError}
        />

        {coupon && <DiscountSummary coupon={coupon} />}

        {checkoutError && (
          <p className="message message--error" role="alert">
            {checkoutError}
          </p>
        )}

        <button
          type="button"
          className="button button--primary button--block"
          onClick={handleSubscribe}
          disabled={isRedirecting}
        >
          {isRedirecting ? 'Redirigiendo a Stripe…' : 'Suscribirme'}
        </button>

        <p className="legal">
          El pago se procesa en Stripe Checkout. Los datos de tu tarjeta nunca pasan por
          nuestros servidores.
        </p>
      </div>
    </main>
  );
}
