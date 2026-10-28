import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/** Marco común: fondo navy con halos, cabecera con el logo y panel de vidrio. */
export function Shell({ children }: Props) {
  return (
    <div className="page">
      <div className="page__glow page__glow--teal" aria-hidden="true" />
      <div className="page__glow page__glow--blue" aria-hidden="true" />

      <header className="brand">
        <img className="brand__logo" src="/s4b-logo.png" alt="" width="28" height="35" />
        <span className="brand__name">Silent4Business</span>
      </header>

      <main className="app">
        <div className="card">{children}</div>
      </main>
    </div>
  );
}
