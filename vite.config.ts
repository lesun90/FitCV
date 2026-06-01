import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.FITCV_HOST ?? '127.0.0.1',
    port: Number(process.env.FITCV_PORT ?? 5173),
    watch: {
      usePolling: process.env.FITCV_USE_POLLING === 'true',
      interval: 250
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts'
  }
});
