import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/hizaya-pwa/', // mets le nom EXACT du repo entre les deux "/" s'il diffère
  build: { outDir: 'dist', target: 'esnext' },
  server: { host: true, port: 5173, open: true },
});
