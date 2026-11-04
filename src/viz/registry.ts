import type { AnyVizDef } from '../engine/types';

/**
 * Every visualization that is live on the site, discovered from src/viz/<id>/index.ts.
 * Each of those modules default-exports its VizDef, and the folder name must equal the id.
 * Adding a visualization never touches this file.
 */
const modules = import.meta.glob<{ default: AnyVizDef }>('./*/index.ts', { eager: true });

export const vizPaths: Record<string, AnyVizDef> = Object.fromEntries(
  Object.entries(modules).map(([path, m]) => [path, m.default]),
);

export const vizzes: AnyVizDef[] = Object.values(vizPaths);

export function getViz(id: string): AnyVizDef | undefined {
  return vizzes.find((v) => v.id === id);
}
