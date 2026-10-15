import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Relative base so asset URLs work in BOTH deployment targets:
  //   * Electron production (file://…/dist/index.html)
  //   * GitHub Pages sub-path hosting (https://<user>.github.io/<repo>/)
  base: './',
  build: {
    outDir: 'dist',
    // The React app entry lives in app.html at the repository root. The
    // root index.html is the standalone static landing page served by
    // GitHub Pages and is intentionally NOT part of the Vite bundle.
    rollupOptions: {
      input: { index: fileURLToPath(new URL('./app.html', import.meta.url)) },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
