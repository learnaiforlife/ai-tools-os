import { defineConfig } from 'vite';

// Download artifacts are hosted separately after signing and verification.
// Do not publish forgotten screenshots or installers from a public directory.
export default defineConfig({ publicDir: false });
