import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Pour GitHub Pages, HashRouter évite les 404.
// Pas besoin d’un base spécial si on utilise hash.
export default defineConfig({
  plugins: [react()],
})
