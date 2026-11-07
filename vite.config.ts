import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * Serves the catalog thumbnails in development, made fresh on every request from the same code
 * the build uses (scripts/prerender.mjs writes the files into dist): /previews.json holds every
 * page's still picture, /previews/<id>.json one page's frames.
 */
function previews(): Plugin {
  return {
    name: 'stepwise-previews',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const one = /^\/previews\/([a-z0-9-]+)\.json$/.exec(url);
        if (url !== '/previews.json' && !one) return next();
        Promise.all([
          server.ssrLoadModule('/src/viz/all.ts'),
          server.ssrLoadModule('/src/render/preview.ts'),
        ])
          .then(([{ vizzes }, { makePosters, makePreview }]) => {
            const def = one && vizzes.find((d: { id: string }) => d.id === one[1]);
            const body = one ? (def ? makePreview(def) : null) : makePosters(vizzes);
            if (!body) return next();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(body));
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
