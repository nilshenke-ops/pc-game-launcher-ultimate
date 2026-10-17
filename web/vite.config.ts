import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development the companion (headless or Windows) runs on port 8787; Vite proxies the WebSocket and downloads.
const companion = process.env.PGL_COMPANION ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    fs: { allow: [".."] },
    proxy: {
      "/ws": { target: companion.replace(/^http/, "ws"), ws: true },
      "/download": companion,
      "/healthz": companion,
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"] } },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as never);
