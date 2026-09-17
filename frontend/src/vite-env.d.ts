/// <reference types="vite/client" />

/**
 * Variables de entorno disponibles en el frontend.
 *
 * Recordatorio: Vite solo expone al navegador las que empiezan por `VITE_`,
 * y su valor queda INCRUSTADO en el bundle. Por eso aquí nunca debe aparecer
 * ninguna clave secreta.
 */
interface ImportMetaEnv {
  /** URL base de la API. Si no se define, se usa /api (proxy de Vite). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
