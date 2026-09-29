import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  server: {
    // required so the MV3 dev server plays nicely with CRXJS's HMR websocket
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
