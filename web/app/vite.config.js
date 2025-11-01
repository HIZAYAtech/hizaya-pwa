// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // charge .env.* (sans filtrer VITE_)
  return {
    plugins: [react()],
    base: env.VITE_BASE || '/',   // en dev: '/', en prod: ce que tu mets dans .env.production
    build: { assetsDir: 'assets' }
  }
})
