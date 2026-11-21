import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function disableHmrWsClientPlugin() {
  return {
    name: 'disable-hmr-ws-client',
    enforce: 'post' as const,
    transform(code: string, id: string) {
      if (id.includes('vite/dist/client/client.mjs')) {
        return code
          .replace(
            /const createWebSocketModuleRunnerTransport = \(options\) => \{[\s\S]*?\n\};/,
            `const createWebSocketModuleRunnerTransport = () => ({ async connect() {}, async disconnect() {}, send() {}, invoke: async () => ({ result: undefined }) });`
          )
          .replace('console.debug("[vite] connecting...");', '');
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), disableHmrWsClientPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: false,
    },
    server: {
      hmr: false as const,
      ws: false as const,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
