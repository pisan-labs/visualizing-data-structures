import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { parseGrid, parseGridInput, START_TEXT, type Grid } from '../_grid/grid';
import { gridBfs } from '.';
import type { BfsGridSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

const settings = (moves: '4' | '8' = '4'): BfsGridSettings => ({ moves });

/** A plain BFS written separately from the model: distances from S, -1 when unreachable. */
function reference(lines: string[], moves: '4' | '8'): number[] {
  const rows = lines.length;
  const cols = lines[0]!.length;
  const d = Array<number>(rows * cols).fill(-1);
  const s = lines.join('').indexOf('S');
  d[s] = 0;
  const q = [s];
  const steps: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if ((dr || dc) && (moves === '8' || dr === 0 || dc === 0)) steps.push([dr, dc]);
  while (q.length) {
    const u = q.shift()!;
    const r = Math.floor(u / cols);
    const c = u % cols;
    for (const [dr, dc] of steps) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || lines[nr]![nc] === '#') continue;
      const v = nr * cols + nc;
      if (d[v] === -1) {
        d[v] = d[u]! + 1;
        q.push(v);
      }
    }
  }
  return d;
}

/** Random grids with exactly one S and one T. */
const gridArb = fc
  .record({
    rows: fc.integer({ min: 1, max: 7 }),
    cols: fc.integer({ min: 2, max: 9 }),
    walls: fc.array(fc.boolean(), { minLength: 63, maxLength: 63 }),
    density: fc.integer({ min: 0, max: 3 }),
    s: fc.nat(),
    t: fc.nat(),
  })
  .map(({ rows, cols, walls, density, s, t }) => {
    const n = rows * cols;
    const cells: string[] = Array.from({ length: n }, (_, k) =>
      walls[k]! && k % 4 < density ? '#' : '.',
    );
    const si = s % n;
    let ti = t % n;
    if (ti === si) ti = (si + 1) % n;
    cells[si] = 'S';
    cells[ti] = 'T';
    return Array.from({ length: rows }, (_, r) => cells.slice(r * cols, (r + 1) * cols).join(''));
  });

describe('grid BFS', () => {
  it('reads grids and explains what is wrong with bad ones', () => {
    expect(parseGrid('S.# ..T')).toEqual({ lines: ['S.#', '..T'] });
    expect(parseGrid('s.#/..t')).toEqual({ lines: ['S.#', '..T'] });
    expect(parseGridInput('S.#, ..T')).toBe('S.# ..T');
    expect(parseGrid('S.# ..')).toMatch(/Row 2 has 2 cells/);
    expect(parseGrid('S.x ..T')).toMatch(/"x" in row 1/);
    expect(parseGrid('... ..T')).toMatch(/needs a start/);
    expect(parseGrid('S.T ..T')).toMatch(/2 T cells/);
    expect(parseGrid('')).toMatch(/Type a grid/);
    expect(typeof parseGrid(START_TEXT)).toBe('object');
  });

  it('finds the shortest path around the wall on the start grid', () => {
    const t = new Timeline(gridBfs, settings(), 1, [['run']]);
    const r = t.entries[0]!.steps.at(-1)!.extra!.run!;
    expect(r.end).toBe('found');
    expect(r.path.length - 1).toBe(12);
    const t8 = new Timeline(gridBfs, settings('8'), 1, [['run']]);
    expect(t8.entries[0]!.steps.at(-1)!.extra!.run!.path.length - 1).toBe(8);
  });

  it('matches a reference BFS on random grids, with sound bookkeeping at every step', () => {
    fc.assert(
      fc.property(gridArb, fc.constantFrom('4' as const, '8' as const), (lines, moves) => {
        const t = new Timeline(gridBfs, settings(moves), 1, [['load', lines.join(' ')], ['run']]);
        const g: Grid = t.endState().grid;
        expect(g.lines).toEqual(lines);
        const d = reference(lines, moves);
        const cols = lines[0]!.length;
        const target = lines.join('').indexOf('T');
        const steps = t.entries[1]!.steps;
        const r = steps.at(-1)!.extra!.run!;
        if (d[target]! < 0) {
          expect(r.end).toBe('none');
          expect(r.order.length).toBe(d.filter((x) => x >= 0).length);
        } else {
          expect(r.end).toBe('found');
          expect(r.path.length - 1).toBe(d[target]);
          expect(r.path[0]).toBe(lines.join('').indexOf('S'));
          expect(r.path.at(-1)).toBe(target);
          for (let i = 1; i < r.path.length; i++) {
            const a = r.path[i - 1]!;
            const b = r.path[i]!;
            const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
            const dc = Math.abs((a % cols) - (b % cols));
            expect(Math.max(dr, dc)).toBe(1);
            if (moves === '4') expect(dr + dc).toBe(1);
            expect(lines.join('')[b]).not.toBe('#');
          }
        }
        for (const st of steps) {
          const run = st.extra!.run!;
          // Every distance found is the true distance; the queue holds at most two rings,
          // in order.
          run.d.forEach((x, k) => {
            if (x >= 0) expect(x).toBe(d[k]);
          });
          const qd = run.queue.map((k) => run.d[k]!);
          for (let i = 1; i < qd.length; i++) expect(qd[i]! - qd[i - 1]!).toBeGreaterThanOrEqual(0);
          if (qd.length) expect(qd.at(-1)! - qd[0]!).toBeLessThanOrEqual(1);
          expect(new Set([...run.queue, ...run.order]).size).toBe(
            run.queue.length + run.order.length,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('grid BFS practice', () => {
  it('gets the answers right, and says the walls force a detour only when they do', () => {
    let detours = 0;
    let free = 0;
    for (let seed = 1; seed <= 80; seed++)
      for (const item of practiceSet(gridBfs, seed, 4)) {
        const q = item.question;
        const lines = parseGrid(String(q.setup[0]![1])) as Grid;
        const moves = q.settings!.moves as '4' | '8';
        const d = reference(lines.lines, moves);
        const t = lines.lines.join('').indexOf('T');
        if (item.kind.id === 'length') {
          expect(q.answer).toEqual({ kind: 'number', value: d[t] });
          const cols = lines.lines[0]!.length;
          const s = lines.lines.join('').indexOf('S');
          const dr = Math.abs(Math.floor(s / cols) - Math.floor(t / cols));
          const dc = Math.abs((s % cols) - (t % cols));
          const open = moves === '8' ? Math.max(dr, dc) : dr + dc;
          if (d[t]! > open) {
            detours++;
            expect(q.explain).toContain(`Without the walls it would take ${open}`);
          } else {
            free++;
            expect(q.explain).toContain('The walls cost nothing here');
          }
        }
        if (item.kind.id === 'reachable' && q.answer.kind === 'choice')
          expect(q.answer.correct).toBe(d[t]! >= 0 ? 0 : 1);
      }
    expect(detours).toBeGreaterThan(0);
    expect(free).toBeGreaterThan(0);
  });

  it('asks about grids where T cannot be reached too, not only ones where it can', () => {
    const kind = gridBfs.practice!.find((k) => k.id === 'reachable')!;
    const answers = Array.from({ length: 80 }, (_, i) => kind.make(makeRng(i + 1)).answer);
    const no = answers.filter((a) => a.kind === 'choice' && a.correct === 1).length;
    expect(no).toBeGreaterThan(20);
    expect(no).toBeLessThan(60);
  });
});

describe('drawn text size', () => {
  // S and T tags were 12 (10.7 px on a laptop, 8.8 on a phone); at 13, 11.6 and 9.6.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
