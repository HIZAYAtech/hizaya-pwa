import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pour GitHub Pages (project pages)
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
export default defineConfig({
  plugins: [react()],
  base: repo ? `/${repo}/` : "/"
});
