import type { AnyVizDef } from '../engine/types';

/**
 * The app's view of the visualizations: each one is loaded only when its page opens, so the
 * site stays small as the catalog grows. Pages are discovered from src/viz/<id>/index.ts (each
 * default-exports its VizDef; the folder name is the id). Adding one never touches this file.
 * Tests and the prerender step load everything at once from ./all.ts instead.
 */
const loaders = import.meta.glob<{ default: AnyVizDef }>('./*/index.ts');

const idOf = (path: string) => path.slice(2, -'/index.ts'.length);

export const liveIds: string[] = Object.keys(loaders).map(idOf);

export async function loadViz(id: string): Promise<AnyVizDef | undefined> {
  const load = loaders[`./${id}/index.ts`];
  return load ? (await load()).default : undefined;
}
