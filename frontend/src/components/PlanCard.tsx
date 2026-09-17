import type { Plan } from '../types';

interface Props {
  plan: Plan;
}

/** Cabecera con el plan y su precio normal, tal como viene de Stripe. */
export function PlanCard({ plan }: Props) {
  const interval = plan.intervalCount === 1 ? `/ ${plan.interval === 'month' ? 'mes' : plan.interval}` : `cada ${plan.intervalCount} ${plan.interval}`;

  return (
    <header className="plan">
      <p className="plan__eyebrow">Suscripción mensual</p>

      <h1 className="plan__name">{plan.productName}</h1>

      {plan.productDescription && <p className="plan__description">{plan.productDescription}</p>}

      <p className="plan__price">
        <span className="plan__amount">{plan.formattedAmount}</span>
        <span className="plan__interval">
          {interval} {plan.currency.toUpperCase()}
        </span>
      </p>
    </header>
  );
}
