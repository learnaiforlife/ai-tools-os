import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aiosBridge } from "./scripts/aios-bridge.mjs";

// AI Tools OS — Vite + React build.
// .jsx files use plain JSX with React imported per-module (matching the source prototype).
// aiosBridge adds /api/* endpoints so the browser app can mutate real Claude Code config.
export default defineConfig({
  plugins: [react(), aiosBridge()],
  server: { port: 5173, open: true },
});
