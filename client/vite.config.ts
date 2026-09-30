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
  build: {
    // Split stable vendor libs into their own hashed chunks: they download in
    // parallel with the app code and stay cached across deploys (their hashes
    // only change when dependencies change, not on every app edit).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-chess': ['chess.js', 'react-chessboard'],
        },
      },
    },
  },
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
