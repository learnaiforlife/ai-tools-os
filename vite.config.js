import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aiosBridge } from "./scripts/aios-bridge.mjs";

export default defineConfig({
  plugins: [react(), aiosBridge()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, open: false },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
