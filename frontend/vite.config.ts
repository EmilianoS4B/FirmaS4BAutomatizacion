import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Redirige /api al backend durante el desarrollo.
    //
    // Con esto el navegador solo habla con su propio origen: no hay
    // peticiones cruzadas, ni preflight CORS, ni una URL de backend
    // incrustada en el bundle.
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
