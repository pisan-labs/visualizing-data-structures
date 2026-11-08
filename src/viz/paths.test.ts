/**
 * Every page that draws a graph (vertex circles "vx-…" from src/layouts/graph.ts) keeps its
 * labels readable: no weight, edge letter, pointer or note box on top of another label or of a
 * vertex it does not belong to, on any step of a curated example, with no stage and on the two
 * typical stages. New graph pages get this check for free.
 */
import { describe, expect, it } from 'vitest';
import { validateExample } from '../engine/example';
import { Timeline } from '../engine/timeline';
import type { StageSize } from '../engine/types';
import type { Shape } from '../render/scene';
import { TYPICAL_STAGES } from '../render/stage';
import { vizPaths } from './all';
import { overlaps } from './_paths/overlap';

const STAGES: (StageSize | undefined)[] = [undefined, ...TYPICAL_STAGES];

/**
 * Curated examples known to draw labels on top of each other, by page and example id. The fix
 * is in where src/layouts/graph.ts places labels (or in the example's graph), so they wait for
 * that. The test fails when one of them comes clean, so the list only shrinks.
 */
const KNOWN: Record<string, string[]> = {
  // Six vertices joined by nearly every edge: weights at the middles of crossing edges collide.
  kruskal: ['dense'],
  // The same dense graph, and the weight of D-G under D's key badge.
  prim: ['dense', 'key-drops', 'lazy-queue', 'other-root'],
  // The page's starting graph drawn on a circle: chords pass through vertices, weights on them.
  'steiner-tree': ['hidden-hub'],
  // An edge letter (C, F, B) at the middle of a short edge lands on a vertex or a note box.
  'topo-dfs': ['last-goes-first', 'getting-dressed', 'keep-going'],
  // The weight of B-C sits on vertex E.
  tsp: ['exact-table'],
};

const vizId = (p: string) => p.split('/').at(-2)!;

const drawsGraph = (shapes: Shape[]) =>
  shapes.some((s) => s.kind === 'circle' && s.id.startsWith('vx-'));

/** Each curated example's timeline, for the pages whose examples end on a graph drawing. */
const pages = Object.entries(vizPaths).flatMap(([p, def]) => {
  const runs = def.examples.map((raw) => {
    const ex = validateExample(def, raw);
    return { id: ex.id!, t: new Timeline(def, ex.settings, ex.seed, ex.ops) };
  });
  const last = ({ t }: (typeof runs)[number]) => t.at(t.length - 1).step;
  const graph = runs.some((r) => drawsGraph(def.view(last(r), r.t.settings).shapes));
  return graph ? [[vizId(p), def, runs] as const] : [];
});

describe.each(pages)('%s labels', (id, def, runs) => {
  it('do not overlap in any curated example', () => {
    const known = new Set(KNOWN[id] ?? []);
    const found = new Map<string, string>();
    for (const { id: ex, t } of runs)
      for (let i = 0; i < t.length && !found.has(ex); i++)
        for (const stage of STAGES) {
          const shapes = def.view(t.at(i).step, t.settings, stage).shapes;
          const bad = drawsGraph(shapes) ? overlaps(shapes) : [];
          if (bad.length) {
            const where = stage ? `${stage.w}x${stage.h}` : 'no stage';
            found.set(ex, `${ex} step ${i} (${where}): ${bad.join(', ')}`);
            break;
          }
        }
    const fresh = [...found].filter(([ex]) => !known.has(ex)).map(([, why]) => why);
    expect(fresh, 'labels on top of each other').toEqual([]);
    const clean = [...known].filter((ex) => !found.has(ex));
    expect(clean, 'known overlaps that are gone: remove them from KNOWN').toEqual([]);
  });
});
