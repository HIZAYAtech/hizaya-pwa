import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Remplace "hizaya-pwa" par le nom EXACT de ton repo
export default defineConfig({
  plugins: [react()],
  base: '/hizaya-pwa/',
})
