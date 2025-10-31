import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: './' = assets relatifs → OK pour Pages sur sous-répertoire
export default defineConfig({
  base: "./",
  plugins: [react()],
});
