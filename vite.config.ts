import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Absolute, because each visualization has its own page at /<id>/.
  base: '/',
  build: { target: 'es2022' },
  // Property tests are CPU-bound; under a full parallel run they can exceed the 5 s default.
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000 },
});
