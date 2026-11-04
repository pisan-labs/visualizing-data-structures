import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Absolute, because each visualization has its own page at /<id>/.
  base: '/',
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
});
