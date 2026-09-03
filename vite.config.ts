import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the project from https://<user>.github.io/rise-of-ages/,
  // so built asset URLs need that prefix. Dev keeps serving from the root.
  base: command === 'build' ? '/rise-of-ages/' : '/',
  server: {
    // Honour an assigned PORT so the dev server can share a machine with others.
    port: Number(process.env.PORT) || 5173,
  },
}));
