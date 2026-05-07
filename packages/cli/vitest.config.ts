import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@researchcrafters/content-sdk': path.resolve(__dirname, '../content-sdk/src/index.ts'),
      '@researchcrafters/erp-schema': path.resolve(__dirname, '../erp-schema/src/schemas/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
