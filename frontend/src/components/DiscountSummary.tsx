import type { ValidatedCoupon } from '../types';

interface Props {
  coupon: ValidatedCoupon;
}

/**
 * Resumen de lo que se va a cobrar y hasta cuándo.
 *
 * Es la pantalla que responde a la pregunta del negocio: "¿cuánto pago ahora y
 * cuánto pagaré después?". Todos los importes vienen calculados del backend.
 */
export function DiscountSummary({ coupon }: Props) {
  const { duration, pricing, discount } = coupon;
  const months = duration.durationInMonths;

  return (
    <section className="summary" aria-label="Resumen de la suscripción">
      <div className="summary__row">
        <span className="summary__key">Precio</span>
        <span className="summary__value summary__value--struck">
          {pricing.originalFormatted} / mes
        </span>
      </div>

      <div className="summary__row">
        <span className="summary__key">Cupón</span>
        <span className="summary__value">{coupon.code}</span>
      </div>

      <div className="summary__row">
        <span className="summary__key">Descuento</span>
        <span className="summary__value summary__value--accent">
          {discount.label}
          <span className="summary__muted"> (−{pricing.discountFormatted} / mes)</span>
        </span>
      </div>

      <hr className="summary__divider" />

      {duration.type === 'repeating' && months != null ? (
        <>
          <div className="summary__row summary__row--highlight">
            <span className="summary__key">
              Precio durante los primeros {months === 1 ? 'mes' : `${months} meses`}
            </span>
            <span className="summary__value summary__value--big">
              {pricing.finalFormatted} / mes
            </span>
          </div>

          <div className="summary__row">
            <span className="summary__key">Después del mes {months}</span>
            <span className="summary__value">{pricing.originalFormatted} / mes</span>
          </div>

          {pricing.totalSavingsFormatted && (
            <p className="summary__note">
              Ahorras {pricing.totalSavingsFormatted} en total durante la promoción. Stripe
              aplica y retira el descuento automáticamente: no tienes que hacer nada.
            </p>
          )}
        </>
      ) : duration.type === 'forever' ? (
        <div className="summary__row summary__row--highlight">
          <span className="summary__key">Precio final (siempre)</span>
          <span className="summary__value summary__value--big">
            {pricing.finalFormatted} / mes
          </span>
        </div>
      ) : (
        <>
          <div className="summary__row summary__row--highlight">
            <span className="summary__key">Primer cobro</span>
            <span className="summary__value summary__value--big">{pricing.finalFormatted}</span>
          </div>

          <div className="summary__row">
            <span className="summary__key">Cobros siguientes</span>
            <span className="summary__value">{pricing.originalFormatted} / mes</span>
          </div>
        </>
      )}

      {coupon.requiresFirstTimeCustomer && (
        <p className="message message--info">
          Este código solo es válido para clientes nuevos. Stripe lo verificará al pagar.
        </p>
      )}
    </section>
  );
}
