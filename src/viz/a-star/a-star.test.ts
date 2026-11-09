import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import { bfsDistances, targetOf } from '../_grid/grid';
import { aStar } from '.';
import { before, type AStarSettings, type Heuristic } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

const settings = (s: Partial<AStarSettings> = {}): AStarSettings =>
  ({ ...aStar.defaults, ...s }) as AStarSettings;

/**
 * A* written separately from the model: an array as the open set, scanned for the least
 * (f, h, order), cells closed for good. Returns the path cost (or -1) and the cells expanded.
 */
function reference(lines: string[], st: AStarSettings): { cost: number; expanded: number } {
  const rows = lines.length;
  const cols = lines[0]!.length;
  const flat = lines.join('');
  const s = flat.indexOf('S');
  const t = flat.indexOf('T');
  const w = Number(st.weight);
  const h = (k: number) => {
    const dr = Math.abs(Math.floor(k / cols) - Math.floor(t / cols));
    const dc = Math.abs((k % cols) - (t % cols));
    const table: Record<Heuristic, number> = {
      manhattan: dr + dc,
      euclidean: Math.sqrt(dr * dr + dc * dc),
      chebyshev: Math.max(dr, dc),
      zero: 0,
    };
    return table[st.heuristic];
  };
  const dirs =
    st.moves === '8'
      ? [
          [-1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
          [1, 0],
          [1, -1],
          [0, -1],
          [-1, -1],
        ]
      : [
          [-1, 0],
          [0, 1],
          [1, 0],
          [0, -1],
        ];
  const g = new Map<number, number>([[s, 0]]);
  const closed = new Set<number>();
  let order = 0;
  let open = [{ k: s, f: w * h(s), h: h(s), order: order++ }];
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (before(open[i]!, open[best]!) < 0) best = i;
    const { k: u } = open[best]!;
    open.splice(best, 1);
    closed.add(u);
    if (u === t) return { cost: g.get(u)!, expanded: closed.size };
    for (const [dr, dc] of dirs) {
      const r = Math.floor(u / cols) + dr!;
      const c = (u % cols) + dc!;
      if (r < 0 || c < 0 || r >= rows || c >= cols || flat[r * cols + c] === '#') continue;
      const v = r * cols + c;
      if (closed.has(v)) continue;
      const cost = g.get(u)! + 1;
      if (!g.has(v) || cost < g.get(v)!) {
        g.set(v, cost);
        open = open.filter((e) => e.k !== v);
        open.push({ k: v, f: cost + w * h(v), h: h(v), order: order++ });
      }
    }
  }
  return { cost: -1, expanded: closed.size };
}

const gridArb = fc
  .record({
    rows: fc.integer({ min: 1, max: 7 }),
    cols: fc.integer({ min: 2, max: 9 }),
    walls: fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 63, maxLength: 63 }),
    s: fc.nat(),
    t: fc.nat(),
  })
  .map(({ rows, cols, walls, s, t }) => {
    const n = rows * cols;
    const cells: string[] = Array.from({ length: n }, (_, k) => (walls[k]! < 3 ? '#' : '.'));
    const si = s % n;
    let ti = t % n;
    if (ti === si) ti = (si + 1) % n;
    cells[si] = 'S';
    cells[ti] = 'T';
    return Array.from({ length: rows }, (_, r) => cells.slice(r * cols, (r + 1) * cols).join(''));
  });

const settingsArb = fc.record({
  heuristic: fc.constantFrom<Heuristic>('manhattan', 'euclidean', 'chebyshev', 'zero'),
  weight: fc.constantFrom('1' as const, '1.5' as const, '2' as const, '5' as const),
  moves: fc.constantFrom('4' as const, '8' as const),
});

describe('A*', () => {
  it('expands fewer cells with the Manhattan distance than with h = 0 on the start grid', () => {
    const count = (heuristic: Heuristic) => {
      const t = new Timeline(aStar, settings({ heuristic }), 1, [['run']]);
      return t.entries[0]!.steps.at(-1)!.extra!.run!;
    };
    const m = count('manhattan');
    const z = count('zero');
    expect(m.path.length).toBe(z.path.length);
    expect(m.closed.length).toBeLessThan(z.closed.length);
  });

  it('matches a reference A* on random grids, with sound bookkeeping at every step', () => {
    fc.assert(
      fc.property(gridArb, settingsArb, (lines, st) => {
        const t = new Timeline(aStar, st, 1, [['load', lines.join(' ')], ['run']]);
        const g = t.endState().grid;
        const steps = t.entries[1]!.steps;
        const r = steps.at(-1)!.extra!.run!;
        const ref = reference(lines, st);
        expect(r.closed.length).toBe(ref.expanded);
        expect(r.end === 'found' ? r.path.length - 1 : -1).toBe(ref.cost);
        // With a heuristic that never overestimates, the path is a shortest one.
        const shortest = bfsDistances(g, st.moves)[targetOf(g)]!;
        const admissible =
          st.weight === '1' &&
          (st.moves === '4' || st.heuristic === 'chebyshev' || st.heuristic === 'zero');
        if (admissible) expect(ref.cost).toBe(shortest);
        else if (shortest >= 0) expect(ref.cost).toBeGreaterThanOrEqual(shortest);
        for (const step of steps) {
          const run = step.extra!.run!;
          for (let i = 1; i < run.open.length; i++)
            expect(before(run.open[i - 1]!, run.open[i]!)).toBeLessThan(0);
          for (const e of run.open) {
            expect(run.closed).not.toContain(e.k);
            expect(e.f).toBeCloseTo(run.g[e.k]! + Number(st.weight) * run.h[e.k]!, 9);
          }
          expect(new Set(run.closed).size).toBe(run.closed.length);
        }
      }),
      { numRuns: 250 },
    );
  });
});

describe('A* wording and practice', () => {
  it('says h is 0, not "the zero"', () => {
    const st = settings({ heuristic: 'zero' });
    const t = new Timeline(aStar, st, 1, [['run']]);
    const says = [t.initial.say, ...t.entries[0]!.steps.map((x) => x.say)].join(' ');
    expect(says).not.toMatch(/the zero/);
    expect(t.initial.say).toContain('where h is 0.');
  });

  it('gets h and the cells expanded right, against the reference', () => {
    for (let seed = 1; seed <= 80; seed++)
      for (const item of practiceSet(aStar, seed, 4)) {
        const q = item.question;
        const lines = String(q.setup[0]![1]).split(' ');
        const st = { ...aStar.defaults, ...q.settings } as AStarSettings;
        if (item.kind.id === 'h') {
          const cols = lines[0]!.length;
          const flat = lines.join('');
          const t = flat.indexOf('T');
          const [, col, row] = /cell ([A-Z])(\d+)\?/.exec(q.prompt)!;
          const k = (Number(row) - 1) * cols + (col!.charCodeAt(0) - 65);
          const dr = Math.abs(Math.floor(k / cols) - Math.floor(t / cols));
          const dc = Math.abs((k % cols) - (t % cols));
          const h = st.heuristic === 'manhattan' ? dr + dc : Math.max(dr, dc);
          expect(q.answer).toEqual({ kind: 'number', value: h });
          expect(q.explain).toContain(`${dc} column`);
          expect(q.explain).toContain(`${dr} row`);
        }
        if (item.kind.id === 'fewer' && q.answer.kind === 'choice') {
          const m = reference(lines, { ...st, heuristic: 'manhattan' }).expanded;
          const z = reference(lines, { ...st, heuristic: 'zero' }).expanded;
          const right = m < z ? 0 : m > z ? 1 : 2;
          expect(q.answer.options[q.answer.correct]).toBe(q.answer.options[right]);
        }
      }
  });
});

describe('drawn text size', () => {
  // With the open set under the grid: 10.5 px on a laptop, 8.3 on a phone. Beside it on a laptop, and with smaller cells and shorter lines on a phone, 13.2 and 9.2.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
