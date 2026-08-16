import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', globals: true },
  // Mismo alias que tsconfig ("@/*" → raíz del repo). `import.meta.dirname` en vez de
  // `__dirname`: este archivo es ESM y Vite ya avisa que dejará de soportarlo.
  resolve: { alias: { '@': import.meta.dirname } },
});
