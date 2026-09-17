import type { CheckoutResult } from '../types';

interface Props {
  result: CheckoutResult;
  onReset: () => void;
}

/** Formatea una fecha ISO como "15 de marzo de 2027". */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;

  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Pantalla de confirmación tras completar el pago en Stripe Checkout. */
export function SuccessPanel({ result, onReset }: Props) {
  const subscription = result.subscription;
  const discount = subscription?.discount ?? null;
  const months = discount?.durationInMonths ?? null;
  const endsAt = formatDate(discount?.endsAt ?? null);

  return (
    <section className="success" aria-live="polite">
      <div className="success__badge" aria-hidden="true">
        ✓
      </div>

      <h2 className="success__title">Suscripción creada correctamente.</h2>

      {months != null ? (
        <>
          <p className="success__text">
            Tu descuento será aplicado durante los próximos {months} meses.
          </p>
          <p className="success__text">
            Después de ese periodo tu suscripción continuará con el precio normal
            {subscription?.normalFormatted ? ` de ${subscription.normalFormatted} / mes` : ''}.
          </p>
        </>
      ) : (
        <p className="success__text">Tu suscripción mensual quedó activa.</p>
      )}

      {subscription && (
        <dl className="success__details">
          <div>
            <dt>Suscripción</dt>
            <dd>
              <code>{subscription.id}</code>
            </dd>
          </div>

          <div>
            <dt>Estado</dt>
            <dd>{subscription.status}</dd>
          </div>

          {result.customerEmail && (
            <div>
              <dt>Correo</dt>
              <dd>{result.customerEmail}</dd>
            </div>
          )}

          {endsAt && (
            <div>
              <dt>El descuento termina</dt>
              {/* Esta fecha la fijó Stripe solo, al crear la suscripción.
                  Es la prueba de que nadie tendrá que intervenir en el mes 13. */}
              <dd>{endsAt}</dd>
            </div>
          )}
        </dl>
      )}

      <button type="button" className="button button--ghost" onClick={onReset}>
        Volver al inicio
      </button>
    </section>
  );
}
