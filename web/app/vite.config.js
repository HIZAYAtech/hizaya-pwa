// web/app/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Chemins RELATIFS -> parfait pour GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: './',                 // <<< clé : plus de chemins absolus /
  build: {
    outDir: 'dist',
    assetsDir: 'assets',      // JS/CSS sous dist/assets
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    }
  }
})
