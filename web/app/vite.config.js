import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Remplace par le nom exact de ton repo GitHub Pages
const REPO = "hizaya-pwa";

export default defineConfig({
  base: `/${REPO}/web/app/`, // <- si tu sers depuis /hizaya-pwa/web/app/
  plugins: [react()],
});
