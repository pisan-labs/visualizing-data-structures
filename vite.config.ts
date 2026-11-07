import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * Serves the catalog thumbnails (/previews.json) in development, made fresh on every request
 * from the same code the build uses (scripts/prerender.mjs writes the file into dist).
 */
function previews(): Plugin {
  return {
    name: 'stepwise-previews',
    configureServer(server) {
      server.middlewares.use('/previews.json', (_req, res, next) => {
        Promise.all([
          server.ssrLoadModule('/src/viz/all.ts'),
          server.ssrLoadModule('/src/render/preview.ts'),
        ])
          .then(([{ vizzes }, { makePreviews }]) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(makePreviews(vizzes)));
          })
          .catch(next);
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), previews()],
  // Absolute, because each visualization has its own page at /<id>/.
  base: '/',
  build: { target: 'es2022' },
  // Property tests are CPU-bound; under a full parallel run they can exceed the 5 s default.
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000 },
});
