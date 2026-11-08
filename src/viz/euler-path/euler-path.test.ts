import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { Graph } from '../_graph/graph';
import { formatGraph, parseGraph } from '../_graph/parse';
import { eulerPath } from '.';
import type { Arrows, EulerRun, EulerSettings } from './model';

const letters = 'ABCDEFG'.split('');
const graphArb = fc
  .record({
    n: fc.integer({ min: 1, max: 7 }),
    directed: fc.boolean(),
    pairs: fc.array(fc.tuple(fc.nat(6), fc.nat(6)), { maxLength: 14 }),
  })
  .map(({ n, directed, pairs }) => {
    const names = letters.slice(0, n);
    const seen = new Set<string>();
    const items: string[] = [...names];
    for (const [a, b] of pairs) {
      const u = names[a % n]!;
      const v = names[b % n]!;
      const key = directed ? `${u}>${v}` : [u, v].sort().join('-');
      if (u === v || seen.has(key)) continue;
      seen.add(key);
      items.push(key);
    }
    return parseGraph(items.join(', ')) as Graph;
  });

/** Brute force, written independently: is there a walk using every edge exactly once? */
function exists(g: Graph, directed: boolean): boolean {
  const E = g.edges;
  if (E.length === 0) return false;
  const used = new Array(E.length).fill(false);
  const go = (v: string, n: number): boolean => {
    if (n === E.length) return true;
    for (let i = 0; i < E.length; i++) {
      if (used[i]) continue;
      const e = E[i]!;
      const to = e.u === v ? e.v : !directed && e.v === v ? e.u : null;
      if (to === null) continue;
      used[i] = true;
      if (go(to, n + 1)) return true;
      used[i] = false;
    }
    return false;
  };
  return g.vertices.some((v) => go(v, 0));
}

function runOf(g: Graph, arrows: Arrows) {
  const t = new Timeline(eulerPath, { ...eulerPath.defaults, arrows } as EulerSettings, 1, [
    ['load', formatGraph(g)],
    ['run'],
  ]);
  const steps = t.entries.at(-1)!.steps;
  return { steps, r: steps.at(-1)!.extra!.run! as EulerRun };
}

describe('euler path', () => {
  it('finds an Euler path exactly when one exists, and it uses every edge once', () => {
    fc.assert(
      fc.property(graphArb, fc.constantFrom<Arrows>('follow', 'ignore'), (g, arrows) => {
        const directed = g.directed && arrows === 'follow';
        const { steps, r } = runOf(g, arrows);
        expect(r.kind !== 'none').toBe(exists(g, directed));
        if (r.kind === 'none') {
          if (g.edges.length) expect(r.why).toBeTruthy();
          return;
        }
        const path = r.circuit.map((c) => c.v);
        expect(path.length).toBe(g.edges.length + 1);
        expect(path[0]).toBe(r.start);
        if (r.kind === 'circuit') expect(path.at(-1)).toBe(path[0]);
        else expect(path.at(-1)).not.toBe(path[0]);
        // Every consecutive pair is a distinct edge.
        const left = g.edges.map((e) => ({ ...e }));
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1]!;
          const b = path[i]!;
          const k = left.findIndex(
            (e) => (e.u === a && e.v === b) || (!directed && e.u === b && e.v === a),
          );
          expect(k, `${a} to ${b}`).toBeGreaterThanOrEqual(0);
          left.splice(k, 1);
        }
        // Stack invariants: the stack is a walk along used edges, and nothing is lost.
        for (const st of steps) {
          const run = st.extra?.run;
          if (!run || run.phase !== 'walk') continue;
          expect(run.stack.length + run.circuit.length).toBe(run.order.length + 1);
          expect(run.stack.length + run.circuit.length).toBeLessThanOrEqual(run.room);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('refuses Königsberg and two pieces, saying why', () => {
    const k = parseGraph('A-B, A-e, B-e, A-C, A-f, C-f, A-D, B-D, C-D') as Graph;
    expect(runOf(k, 'follow').steps.at(-1)!.say).toContain(
      '4 vertices (A, B, C and D) have odd degree',
    );
    const two = parseGraph('A-B, B-C, A-C, D-E, E-F, D-F') as Graph;
    expect(runOf(two, 'follow').steps.at(-1)!.say).toContain('2 separate pieces');
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(eulerPath, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(eulerPath, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
