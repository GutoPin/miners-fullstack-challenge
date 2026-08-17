import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', globals: true },
  // same alias as tsconfig; import.meta.dirname because this file is esm
  resolve: { alias: { '@': import.meta.dirname } },
});
