import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Browser requests stay same-origin; only Vite connects to the local API.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const apiBase = env.API_PROXY_TARGET || 'http://127.0.0.1:3001';

  return {
    plugins: [react()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      // Bind to all interfaces so phones/tablets on the same LAN can connect
      host: env.WEB_HOST || '0.0.0.0',
      // Forward /api/* and /uploads/* to the Fastify API
      // API_PROXY_TARGET is server-only; phones use this same website origin.
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
        },
        '/uploads': {
          target: apiBase,
          changeOrigin: true,
        },
      },
      // Keep book content isolated while permitting the local TTS runtime to fetch
      // its model once and run its WebAssembly workers in the browser.
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss: https://huggingface.co https://*.huggingface.co https://cdn.jsdelivr.net https://*.xethub.hf.co; frame-src 'self' blob:;",
      },
    },

    // Route-level dynamic imports determine chunks. Forcing ReaderPage into a
    // manual chunk can pull shared React dependencies into that chunk eagerly.
  };
});
