import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { floydCycle } from '.';
import { formatSpec, MAX_NODES, parseInput, parseSpec, rho, type FState } from './model';

type T = Timeline<FState, Record<string, never>, unknown>;
const run = (calls: OpCall[]) => new Timeline(floydCycle, {}, 1, calls) as unknown as T;

/** The reference: walk from head remembering where each node was first seen. */
function reference(s: FState): { mu: number; lambda: number } | null {
  const index = new Map(s.nodes.map((n, i) => [n.uid, i]));
  const seenAt = new Map<number, number>();
  let i: number | undefined = s.nodes.length ? 0 : undefined;
  let k = 0;
  while (i !== undefined) {
    if (seenAt.has(i)) return { mu: i, lambda: k - seenAt.get(i)! };
    seenAt.set(i, k++);
    const next = s.nodes[i]!.next;
    i = next === null ? undefined : index.get(next);
  }
  return null;
}

/** The list a state holds: node i points at i + 1, the last at loopAt, nothing else. */
function checkShape(s: FState) {
  const n = s.nodes.length;
  s.nodes.forEach((nd, i) => {
    const want =
      i + 1 < n ? s.nodes[i + 1]!.uid : s.loopAt === null ? null : s.nodes[s.loopAt]!.uid;
    expect(nd.next, `node ${i}`).toBe(want);
  });
  expect(reference(s)).toEqual(rho(s));
}

const spec = fc.integer({ min: 1, max: MAX_NODES }).chain((n) =>
  fc.record({
    values: fc.array(fc.integer({ min: 0, max: 99 }), { minLength: n, maxLength: n }),
    loopAt: fc.option(fc.integer({ min: 0, max: n - 1 }), { nil: null }),
  }),
);

describe('floyd cycle detection', () => {
  it('finds the same μ and λ as a visited-set reference, and walks the pointers correctly', () => {
    fc.assert(
      fc.property(spec, (sp) => {
        const t = run([['build', formatSpec(sp)], ['detect']]);
        const s = t.entries[0]!.end;
        checkShape(s);
        const want = reference(s);
        const steps = t.entries[1]!.steps;
        const last = steps.at(-1)!;
        expect(last.vars?.cycle).toBe(want !== null);
        if (want) {
          expect(last.vars?.['μ']).toBe(want.mu);
          expect(last.vars?.['λ']).toBe(want.lambda);
        }
        // Phase 1: after k steps, slow is k nodes along and fast 2k (or off the end).
        const along = (k: number): number | null => {
          let i: number | null = 0;
          for (let j = 0; j < k && i !== null; j++) {
            const nx: number | null = s.nodes[i]!.next;
            i = nx === null ? null : s.nodes.findIndex((m) => m.uid === nx);
          }
          return i;
        };
        for (const st of steps) {
          const v = st.vars ?? {};
          const x = st.extra as { slow?: number | null; fast?: number | null };
          expect(st.state).toBe(s);
          if (v.phase === 1 && x.slow !== undefined) {
            const k = Number(v.steps);
            // On the step where only slow has moved, fast is still where the last step left it.
            const fastSteps = st.lines.includes('detect.slow') ? 2 * (k - 1) : 2 * k;
            expect(x.slow).toBe(along(k));
            expect(x.fast).toBe(along(fastSteps));
          }
          if (v.phase === 2) expect(x.slow).toBe(along(Number(v['μ'])));
        }
        // The tortoise needs at most μ + λ steps to meet the hare; no cycle stops near n / 2.
        const meet = Math.max(...steps.map((st) => Number(st.vars?.steps ?? 0)));
        if (want) expect(meet).toBeLessThanOrEqual(want.mu + want.lambda);
        else expect(meet).toBeLessThanOrEqual(Math.ceil(s.nodes.length / 2));
      }),
      { numRuns: 400 },
    );
    // Generous: the whole suite runs in parallel and this test runs 400 sequences.
  }, 60_000);

  it('reads and checks the list text', () => {
    expect(parseSpec('1 2 3 4 5 6 @2')).toEqual({ values: [1, 2, 3, 4, 5, 6], loopAt: 2 });
    expect(parseSpec('a, b, c @ 0')).toEqual({ values: ['a', 'b', 'c'], loopAt: 0 });
    expect(parseSpec('7')).toEqual({ values: [7], loopAt: null });
    for (const bad of [
      '',
      '@2',
      '1 2 @2',
      '1 2 @x',
      '1 @0 2',
      '1 2 @1 @0',
      '1 2 3 4 5 6 7 8 9 10 11',
      'abcdef',
    ]) {
      expect(parseSpec(bad), bad).toBeInstanceOf(Error);
      expect(parseInput(bad), bad).toBeInstanceOf(Error);
    }
    expect(parseInput(' 1  2 3   @1 ')).toBe('1 2 3 @1');
  });

  it('leaves the list alone when the build text is bad', () => {
    const t = run([['build', '1 2 3 @1'], ['build', '1 2 @5'], ['detect']]);
    expect(t.entries[1]!.end).toBe(t.entries[0]!.end);
    expect(t.entries[1]!.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    expect(t.entries[2]!.steps.at(-1)!.vars).toMatchObject({ cycle: true, μ: 1, λ: 2 });
  });

  it('handles the empty list and a one-node cycle', () => {
    const t = run([['detect'], ['build', '7 @0'], ['detect']]);
    expect(t.entries[0]!.steps.at(-1)!.vars?.cycle).toBe(false);
    expect(t.entries[2]!.steps.at(-1)!.vars).toMatchObject({ cycle: true, μ: 0, λ: 1 });
  });
});
