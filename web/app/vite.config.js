// web/app/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ⚠️ IMPORTANT (GitHub Pages):
// Si ton site est servi sous https://<user>.github.io/<repo>/
// alors `base` doit être "/<repo>/". Ici: "/hizaya-pwa/"
// Si tu déploies à la racine d'un domaine (ex: Netlify), mets simplement: base: "/"
export default defineConfig({
  plugins: [react()],
  base: '/hizaya-pwa/',

  // Options utiles (tu peux les laisser telles quelles ou ajuster)
  build: {
    outDir: 'dist',
    sourcemap: false, // passe à true si tu veux débugger en prod
    target: 'esnext',
  },
  server: {
    port: 5173,
    host: true,
    open: true,
  },
});
