import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative paths: works the same on GitHub Pages (/repo/) and on a custom domain.
export default defineConfig({ base: "./", plugins: [react()], worker: { format: "es" }, build: { chunkSizeWarningLimit: 1500 } });
