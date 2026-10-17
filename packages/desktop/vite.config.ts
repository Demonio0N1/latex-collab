import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev server port (see src-tauri/tauri.conf.json's devUrl).
export default defineConfig({
  // Para el build web servido por el servidor en /app (npm run web:build).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
