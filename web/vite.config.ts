import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Single version source shared with the companion build.
const version = readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim();

// During development the companion (headless or Windows) runs on port 8787; Vite proxies the WebSocket and downloads.
const companion = process.env.PGL_COMPANION ?? "http://127.0.0.1:8787";

// Writes the list of all built files so the service worker can store the complete app for offline use.
function offlineManifest() {
  return {
    name: "pgl-offline-manifest",
    generateBundle(_: unknown, bundle: Record<string, unknown>) {
      const files = Object.keys(bundle).filter((f) => f.startsWith("assets/"));
      (this as unknown as { emitFile: (f: object) => void }).emitFile({ type: "asset", fileName: "offline-files.json", source: JSON.stringify(files) });
    },
  };
}

const demo = process.env.VITE_DEMO === "1";
const hosted = process.env.VITE_HOSTED === "1";

export default defineConfig({
  plugins: [react(), offlineManifest()],
  // A new build id makes the browser install a fresh service worker, which stores the new app files.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)), __APP_VERSION__: JSON.stringify(version) },
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
    outDir: demo ? "dist-demo" : hosted ? "dist-hosted" : "dist",
    assetsDir: "assets",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      // The hosted demo is one script file (simpler to publish); the real app splits pages into chunks.
      output: demo ? { inlineDynamicImports: true, entryFileNames: "assets/app.js", assetFileNames: "assets/[name][extname]" } : { manualChunks: { react: ["react", "react-dom", "react-router-dom"] } },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as never);
