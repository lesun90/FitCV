import { existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const clarifyDockerNetworkUrl = (): Plugin => ({
  name: 'fitcv-clarify-docker-network-url',
  configureServer(server) {
    const printUrls = server.printUrls.bind(server);
    server.printUrls = () => {
      printUrls();
      server.config.logger.info(
        '\n  The "Network" URL above is this container\'s internal address and is not reachable from other devices.\n' +
          '  From other machines on your network, use this host\'s LAN IP with the mapped port instead, e.g. http://<host-lan-ip>:' +
          server.config.server.port +
          '/\n'
      );
    };
  }
});

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), ...(existsSync('/.dockerenv') ? [clarifyDockerNetworkUrl()] : [])],
  server: {
    host: process.env.FITCV_HOST ?? '0.0.0.0',
    port: Number(process.env.FITCV_PORT ?? 1512),
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
