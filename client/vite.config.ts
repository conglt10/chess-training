import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Stockfish review workers are plain `new Worker()` scripts served from
  // public/ (self-contained Emscripten bundles) — no bundling needed.
  worker: {
    format: 'es',
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    headers: {
      // Required for SharedArrayBuffer — not needed by lite-single, but good hygiene
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Do not let Vite pre-bundle or transform the stockfish static assets
  optimizeDeps: {
    exclude: ['stockfish'],
  },
});
