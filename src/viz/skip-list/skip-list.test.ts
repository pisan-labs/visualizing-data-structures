import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveSeed, makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { parseKeyInput, skipList } from '.';
import {
  capOf,
  keysOf,
  pointerCount,
  probOf,
  type SkipExtra,
  type SkipSettings,
  type SLState,
} from './model';
import { nodesVisited } from './practice';

// ---------------------------------------------------------------------------------------------
// Reference: the keys and their heights, with Pugh's search written out again. A new node's
// height comes from an independent copy of randomLevel, fed the same seeded random numbers the
// engine gives that operation.

function refLevel(seed: number, op: number, settings: SkipSettings) {
  const rng = makeRng(deriveSeed(seed, op));
  const cap = capOf(settings);
  let lvl = 1;
  let flips = '';
  while (lvl < cap) {
    const heads = rng.next() < probOf(settings);
    flips += heads ? 'H' : 'T';
    if (!heads) break;
    lvl++;
  }
  return { lvl, flips };
}

class Ref {
  heights = new Map<number, number>();

  get levels() {
    return Math.max(0, ...this.heights.values());
  }

  /** Keys on level i (0 is the bottom), in order. */
  row(i: number): number[] {
    return [...this.heights.entries()]
      .filter(([, h]) => h > i)
      .map(([k]) => k)
      .sort((a, b) => a - b);
  }

  /** Pugh's walk: the nodes moved to, and the key comparisons made. */
  walk(k: number): { moved: number[]; comparisons: number; found: boolean } {
    let x = -Infinity;
    const moved: number[] = [];
    let comparisons = 0;
    for (let i = this.levels - 1; i >= 0; i--) {
      for (;;) {
        const next = this.row(i).find((y) => y > x);
        if (next === undefined) break;
        comparisons++;
        if (next >= k) break;
        x = next;
        moved.push(x);
      }
    }
    return { moved, comparisons, found: this.heights.has(k) };
  }
}

// ---------------------------------------------------------------------------------------------
// Invariants every step must keep.

function levelRow(s: SLState, i: number): number[] {
  const out: number[] = [];
  for (let u = s.head[i] ?? null; u !== null; u = s.nodes[u]!.next[i] ?? null) {
    out.push(s.nodes[u]!.key);
    expect(out.length).toBeLessThanOrEqual(Object.keys(s.nodes).length);
  }
  return out;
}

function checkStep(
  s: SLState,
  extra: SkipExtra | undefined,
  cap: number,
  vars: Record<string, unknown>,
) {
  const bottom = levelRow(s, 0);
  expect(bottom.length, 'every node is on level 1').toBe(Object.keys(s.nodes).length);
  for (let i = 0; i < s.head.length; i++) {
    const row = levelRow(s, i);
    row.forEach(
      (k, j) => j > 0 && expect(k, `level ${i + 1} is sorted`).toBeGreaterThan(row[j - 1]!),
    );
    if (i > 0) {
      const below = new Set(levelRow(s, i - 1));
      for (const k of row)
        expect(below.has(k), `level ${i + 1} is a sublist of the one below`).toBe(true);
    }
    // While a new, taller node waits to be linked, the new top levels are still empty.
    if (i >= s.level) expect(row, `level ${i + 1} is not in use`).toEqual([]);
    else if (!extra?.fresh) expect(row.length, `level ${i + 1} is in use`).toBeGreaterThan(0);
  }
  const heights = Object.values(s.nodes).map((n) => n.next.length);
  for (const h of heights) {
    expect(h).toBeGreaterThanOrEqual(1);
    expect(h).toBeLessThanOrEqual(cap);
  }
  if (!extra?.fresh) expect(s.level).toBe(Math.max(0, ...heights));
  expect(s.head).toHaveLength(cap);
  expect(vars.N).toBe(bottom.length);
  expect(vars.levels).toBe(s.level);
  expect(vars.pointers).toBe(pointerCount(s));
}

const settingsArb = fc.record({
  p: fc.constantFrom('1/2' as const, '1/4' as const),
  maxLevel: fc.integer({ min: 2, max: 8 }),
  draw: fc.constantFrom('across' as const, 'down' as const),
});
const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 3, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 3, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);
const example = (id: string) => {
  const ex = skipList.examples.find((e) => e.id === id)!;
  return new Timeline(skipList, ex.settings as SkipSettings, ex.seed, ex.ops);
};
const heightsOf = (s: SLState) =>
  Object.fromEntries(Object.values(s.nodes).map((n) => [n.key, n.next.length]));

describe('skip list', () => {
  it('matches a reference skip list, coin flips and search paths included', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        fc.array(callArb, { maxLength: 80, size: 'large' }),
        (settings, seed, calls) => {
          const st = settings as SkipSettings;
          const tl = new Timeline(skipList, st, seed, calls);
          const ref = new Ref();
          const entries = tl.entries;
          calls.forEach(([op, raw], i) => {
            const k = Number(raw);
            const entry = entries[i]!;
            const last = entry.steps.at(-1)!;
            if (op === 'search' || op === 'insert' || op === 'delete') {
              const w = ref.walk(k);
              if (ref.levels > 0) {
                expect(nodesVisited(entry.steps), `${op} ${k} moves`).toEqual(w.moved);
                expect(last.vars?.comparisons, `${op} ${k} comparisons`).toBe(w.comparisons);
              }
              if (op === 'search') expect(last.vars?.found).toBe(w.found);
            }
            if (op === 'insert' && !ref.heights.has(k)) {
              const { lvl, flips } = refLevel(seed, i, st);
              ref.heights.set(k, lvl);
              expect(last.extra?.flips?.join(''), `flips for ${k}`).toBe(flips);
            }
            if (op === 'delete') ref.heights.delete(k);
            if (op === 'clear') ref.heights.clear();
            expect(heightsOf(entry.end), `after ${op} ${raw ?? ''}`).toEqual(
              Object.fromEntries(ref.heights),
            );
            expect(entry.end.level).toBe(ref.levels);
            for (const step of entry.steps)
              checkStep(step.state, step.extra, capOf(st), step.vars ?? {});
          });
        },
      ),
      { numRuns: 250 },
    );
    // 250 runs of up to 80 operations take about 15 s alone and over 40 s when several suites
    // share the machine, close to the 60 s default; it timed out once that way.
  }, 180_000);

  it('holds the same keys as a sorted set', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(callArb, { maxLength: 120, size: 'large' }),
        (st, calls) => {
          const tl = new Timeline(skipList, st as SkipSettings, 3, calls);
          const ref = new Set<number>();
          for (const [op, raw] of calls) {
            if (op === 'insert') ref.add(Number(raw));
            if (op === 'delete') ref.delete(Number(raw));
            if (op === 'clear') ref.clear();
          }
          expect(keysOf(tl.endState())).toEqual([...ref].sort((a, b) => a - b));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('shows every coin flip while a node grows', () => {
    const tl = example('build');
    for (const e of tl.entries) {
      const flips = e.steps.at(-1)!.extra?.flips ?? [];
      const says = e.steps.map((s) => s.say).join(' ');
      flips.forEach((f, i) =>
        expect(says).toContain(`Flip ${i + 1}: ${f === 'H' ? 'heads' : 'tails'}`),
      );
    }
  });

  it('does what each curated example says', () => {
    const tall = example('tall-tower');
    expect(
      tall.entries
        .at(-1)!
        .steps.map((s) => s.say)
        .join(' '),
    ).toContain('That is the maximum level, 4');
    const shrink = example('delete-tallest');
    expect(shrink.entries.at(-2)!.end.level).toBe(3);
    expect(shrink.endState().level).toBe(2);
    const flat = example('flat-list');
    expect(Object.values(flat.endState().nodes).every((n) => n.next.length === 1)).toBe(true);
    expect(flat.entries.at(-1)!.steps.at(-1)!.vars?.comparisons).toBe(9);
    const half = heightsOf(example('build').endState());
    const quarter = heightsOf(example('quarter').endState());
    for (const k of Object.keys(half)) expect(quarter[k]).toBeLessThanOrEqual(half[k]!);
    expect(pointerCount(example('quarter').endState())).toBeLessThan(
      pointerCount(example('build').endState()),
    );
    const search = example('search-path');
    expect(search.entries.at(-2)!.steps.at(-1)!.vars?.found).toBe(true);
    expect(search.entries.at(-1)!.steps.at(-1)!.vars?.found).toBe(false);
  });

  // The Big-O row said finding the first key takes one comparison; search always goes down to
  // level 1, so it takes one per level.
  it('compares once per level when it searches for the first key', () => {
    const tl = example('build');
    const t = new Timeline(skipList, tl.settings, 1, [
      ...tl.entries.map((e) => e.call),
      ['search', 10],
    ]);
    const levels = t.entries.at(-2)!.end.level;
    expect(levels).toBeGreaterThan(1);
    expect(t.entries.at(-1)!.steps.at(-1)!.vars?.comparisons).toBe(levels);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const p of ['1/2', '1/4'] as const)
      for (const block of skipList.pseudocode({ p, maxLevel: 5, draw: 'across' }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });

  it('parses keys', () => {
    expect(parseKeyInput('5')).toBe(5);
    expect(parseKeyInput('five')).toBeInstanceOf(Error);
  });
});

describe('skip list practice', () => {
  it('has answers that agree with the reference skip list', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of skipList.practice!) {
        const q = kind.make(makeRng(seed));
        const settings = { ...skipList.defaults, ...q.settings } as SkipSettings;
        // Rebuild the setup's heights with the reference's own randomLevel.
        const ref = new Ref();
        q.setup.forEach(([op, raw], i) => {
          const k = Number(raw);
          if (op === 'insert' && !ref.heights.has(k))
            ref.heights.set(k, refLevel(1, i, settings).lvl);
          if (op === 'delete') ref.heights.delete(k);
        });
        const [op, raw] = q.watch![0]!;
        const k = Number(raw);
        const a = q.answer;
        const where = `${kind.id} seed ${seed}`;
        if (kind.id === 'search-path') {
          expect(a.kind === 'sequence' && a.value, where).toEqual(ref.walk(k).moved.map(String));
        } else if (kind.id === 'comparisons') {
          expect(a.kind === 'number' && a.value, where).toBe(ref.walk(k).comparisons);
        } else if (kind.id === 'tower-height') {
          expect(op).toBe('insert');
          const { lvl, flips } = refLevel(1, q.setup.length, settings);
          expect(a.kind === 'number' && a.value, where).toBe(lvl);
          const said = flips.split('').map((f) => (f === 'H' ? 'heads' : 'tails'));
          expect(q.prompt, where).toContain(said.join(', '));
        } else if (kind.id === 'levels-after') {
          ref.heights.delete(k);
          expect(a.kind === 'number' && a.value, where).toBe(ref.levels);
        }
      }
    }
  });
});
