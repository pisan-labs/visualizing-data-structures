import type { AnyVizDef } from '../engine/types';

/** Every visualization, loaded eagerly. For tests and the build's prerender step only. */
const modules = import.meta.glob<{ default: AnyVizDef }>('./*/index.ts', { eager: true });

export const vizPaths: Record<string, AnyVizDef> = Object.fromEntries(
  Object.entries(modules).map(([path, m]) => [path, m.default]),
);

export const vizzes: AnyVizDef[] = Object.values(vizPaths);
