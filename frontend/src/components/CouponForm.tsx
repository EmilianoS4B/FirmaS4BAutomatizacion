import { useState, type FormEvent } from 'react';

interface Props {
  onApply: (code: string) => void;
  onRemove: () => void;
  appliedCode: string | null;
  isValidating: boolean;
  error: string | null;
}

/** Campo "Código promocional" + botón Aplicar. */
export function CouponForm({ onApply, onRemove, appliedCode, isValidating, error }: Props) {
  const [code, setCode] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed !== '') onApply(trimmed);
  }

  // Con un cupón ya aplicado mostramos el estado, no el formulario.
  if (appliedCode) {
    return (
      <div className="coupon coupon--applied">
        <div>
          <span className="coupon__label">Cupón aplicado</span>
          <strong className="coupon__code">{appliedCode}</strong>
        </div>

        <button
          type="button"
          className="button button--ghost"
          onClick={() => {
            setCode('');
            onRemove();
          }}
        >
          Quitar
        </button>
      </div>
    );
  }

  return (
    <form className="coupon" onSubmit={handleSubmit} noValidate>
      <label className="coupon__label" htmlFor="promo-code">
        Código promocional
      </label>

      <div className="coupon__row">
        <input
          id="promo-code"
          className={`input${error ? ' input--error' : ''}`}
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="PROMO30"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={isValidating}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'coupon-error' : undefined}
        />

        <button
          type="submit"
          className="button"
          disabled={isValidating || code.trim() === ''}
        >
          {isValidating ? 'Validando…' : 'Aplicar cupón'}
        </button>
      </div>

      {error && (
        <p className="message message--error" id="coupon-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
