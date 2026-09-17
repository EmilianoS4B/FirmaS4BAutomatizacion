/**
 * Cliente HTTP del backend.
 *
 * El frontend solo conoce esta API. Nunca habla directamente con Stripe, y no
 * tiene —ni necesita— ninguna clave secreta.
 */
import type { CheckoutResult, Plan, ValidatedCoupon, ApiErrorBody } from './types';

// En desarrollo, Vite redirige /api al backend (ver vite.config.ts).
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Error con el `code` estable que manda el backend, para poder reaccionar. */
export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    // fetch solo rechaza por fallos de red, no por códigos HTTP de error.
    throw new ApiError(
      'NETWORK',
      'No se pudo conectar con el servidor. ¿Está levantado el backend?'
    );
  }

  if (!response.ok) {
    // El backend siempre responde { error: { code, message } }, pero si algo
    // se cae antes (un proxy, por ejemplo) puede no ser JSON.
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;

    throw new ApiError(
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? 'Ocurrió un error inesperado. Intenta de nuevo.'
    );
  }

  return (await response.json()) as T;
}

/** Plan a mostrar. El precio viene de Stripe, resuelto en el servidor. */
export function fetchPlan(): Promise<Plan> {
  return request<Plan>('/plan');
}

/** Valida un código promocional. La validación real ocurre en el backend. */
export function validateCoupon(code: string): Promise<ValidatedCoupon> {
  return request<ValidatedCoupon>('/coupon/validate', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/**
 * Crea la sesión de Stripe Checkout.
 *
 * Solo se envía el código promocional. Ni precios ni importes: el backend los
 * resuelve y vuelve a validar el cupón antes de crear nada.
 */
export function createCheckoutSession(code: string | null): Promise<{ url: string }> {
  return request<{ url: string }>('/checkout/session', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/** Lee el resultado del checkout para la pantalla de confirmación. */
export function fetchCheckoutResult(sessionId: string): Promise<CheckoutResult> {
  return request<CheckoutResult>(`/checkout/session/${encodeURIComponent(sessionId)}`);
}
