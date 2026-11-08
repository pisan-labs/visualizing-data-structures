import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { loopCounting, parseN } from '.';
import { MAX_N, ratioText, type LcSettings } from './model';
import { PATTERN, PATTERNS, isqrt, lg, type Found, type PatternId } from './patterns';
import { LAPTOP_STAGE, PHONE_STAGE, TYPICAL_STAGES } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const FOUNDS: Found[] = ['first', 'middle', 'missing'];
/** Patterns with one loop: each run of the body is a level 2 step. */
const ONE_LOOP: PatternId[] = ['single', 'halving', 'sqrt', 'search'];

/** The loops written out plainly, apart from the model, counting the innermost line. */
function reference(id: PatternId, n: number, found: Found): number {
  let count = 0;
  switch (id) {
    case 'single':
      for (let i = 1; i <= n; i++) count++;
      break;
    case 'nested':
      for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) count++;
      break;
    case 'triangle':
      for (let i = 1; i <= n; i++) for (let j = i; j <= n; j++) count++;
      break;
    case 'pairs':
      for (let i = 1; i <= n; i++) for (let j = 1; j < i; j++) count++;
      break;
    case 'sequence':
      for (let i = 1; i <= n; i++) count++;
      for (let j = 1; j <= n; j++) count++;
      break;
    case 'halving':
      for (let i = n; i > 1; i = Math.floor(i / 2)) count++;
      break;
    case 'sqrt':
      for (let i = 1; i * i <= n; i++) count++;
      break;
    case 'doubling':
      for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j *= 2) count++;
      break;
    case 'geometric':
      for (let i = 1; i <= n; i *= 2) for (let j = 1; j <= i; j++) count++;
      break;
    case 'search': {
      const a = Array.from({ length: n }, (_, k) => k + 1);
      const x = found === 'first' ? 1 : found === 'middle' ? a[Math.floor((n - 1) / 2)]! : -1;
      for (const item of a) {
        count++;
        if (item === x) break;
      }
      break;
    }
    case 'triple':
      for (let i = 1; i <= n; i++)
        for (let j = i; j <= n; j++) for (let k = j; k <= n; k++) count++;
      break;
  }
  return count;
}

const settings = (pattern: PatternId, found: Found = 'missing'): LcSettings => ({ pattern, found });

describe('loop counting', () => {
  it('counts what the closed form and a plain loop count, for every pattern and n', () => {
    for (const id of PATTERNS) {
      const p = PATTERN[id];
      for (const found of id === 'search' ? FOUNDS : (['missing'] as Found[])) {
        for (let n = 1; n <= p.maxN; n++) {
          const t = new Timeline(loopCounting, settings(id, found), 1, [['run', n]]);
          const end = t.endState().run!;
          const where = `${id} ${found} n = ${n}`;
          expect(end.count, where).toBe(p.exact(n, found));
          expect(end.count, where).toBe(reference(id, n, found));
          expect(end.lit.length, where).toBe(end.count);
          const last = t.entries[0]!.steps.at(-1)!;
          expect(last.vars?.count, where).toBe(end.count);
          expect(last.vars?.['Big-O'], where).toBe(`O(${p.order(found)})`);
          // The formula step says the run agrees with T(n).
          const formula = t.entries[0]!.steps.at(-2)!;
          expect(formula.say, where).toContain('the same as the run');
        }
      }
    }
  });

  it('keeps the invariants on every step of a run', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PATTERNS),
        fc.constantFrom(...FOUNDS),
        fc.integer({ min: 1, max: MAX_N }),
        (id, found, n) => {
          const p = PATTERN[id];
          fc.pre(n <= p.maxN);
          const frame = p.frame(n, found);
          const t = new Timeline(loopCounting, settings(id, found), 1, [['run', n]]);
          const seen = new Set<string>();
          let prev = 0;
          for (let i = 1; i < t.length; i++) {
            const { step } = t.at(i);
            const r = step.state.run!;
            // The count is the number of lit cells, it never goes down, and the code agrees.
            expect(r.count).toBe(r.lit.length);
            expect(r.count).toBeGreaterThanOrEqual(prev);
            if (step.vars?.count !== undefined) expect(step.vars.count).toBe(r.count);
            prev = r.count;
            // Every mark points at a shape the view draws, on a laptop and on a phone.
            for (const stage of [undefined, ...TYPICAL_STAGES]) {
              const ids = new Set(
                loopCounting.view(step, t.settings, stage).shapes.map((x) => x.id),
              );
              for (const m of step.marks)
                expect(ids.has(m.id), `${id} n = ${n}: ${m.id}`).toBe(true);
            }
            // Every lit cell is inside the frame, and lit only once.
            const [s, row, c] = r.lit.at(-1) ?? [0, 0, 0];
            expect(s).toBeLessThan(frame.slices);
            expect(row).toBeLessThan(frame.rows);
            expect(c).toBeLessThan(frame.cols);
            if (r.lit.length > seen.size) {
              const key = String(r.lit.at(-1));
              expect(seen.has(key), `${id} n = ${n}: ${key} lit twice`).toBe(false);
              seen.add(key);
            }
          }
          // A step lights at most one new cell. Each run of the body is fine detail when an
          // outer iteration sums it up at level 2, and level 2 when it stands alone.
          const run = t.entries[0]!.steps;
          for (let k = 1; k < run.length; k++) {
            const grew = run[k]!.state.run!.count - run[k - 1]!.state.run!.count;
            expect([0, 1]).toContain(grew);
            if (grew) expect(run[k]!.level).toBe(ONE_LOOP.includes(id) ? 2 : 3);
          }
          expect(run.filter((x) => x.level === 1)).toHaveLength(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('lights the shapes the textbook draws', () => {
    const lit = (id: PatternId, n: number) =>
      new Timeline(loopCounting, settings(id), 1, [['run', n]])
        .endState()
        .run!.lit.map(([, r, c]) => `${r + 1},${c + 1}`);
    // The triangle: j ≥ i. Pairs: j < i.
    expect(lit('triangle', 3)).toEqual(['1,1', '1,2', '1,3', '2,2', '2,3', '3,3']);
    expect(lit('pairs', 3)).toEqual(['2,1', '3,1', '3,2']);
    // Halving visits n, n/2, ... from the right; the inner doubling loop lights powers of 2.
    expect(lit('halving', 16)).toEqual(['1,16', '1,8', '1,4', '1,2']);
    expect(lit('doubling', 4).filter((k) => k.startsWith('1,'))).toEqual(['1,1', '1,2', '1,4']);
    // The doubling outer loop: rows of 1, 2, 4 and 8.
    expect(lit('geometric', 8).length).toBe(15);
  });

  it('stops the early-exit search where x is', () => {
    const run = (found: Found, n: number) =>
      new Timeline(loopCounting, settings('search', found), 1, [['run', n]]).endState().run!;
    expect(run('first', 9).count).toBe(1);
    expect(run('middle', 9).count).toBe(5);
    expect(run('middle', 9).found).toEqual([0, 0, 4]);
    expect(run('missing', 9).count).toBe(9);
    expect(run('missing', 9).found).toBeNull();
  });

  it('rejects n out of range, and n too large to draw for the triple loop', () => {
    const t = new Timeline(loopCounting, settings('triple'), 1, [
      ['run', 3],
      ['run', 9],
    ]);
    expect(t.entries[1]!.steps).toHaveLength(1);
    expect(t.entries[1]!.steps[0]!.say).toContain('n up to 6');
    expect(t.endState().run!.n).toBe(3);
    const bad = new Timeline(loopCounting, settings('nested'), 1, [
      ['run', 17],
      ['grow', 0],
    ]);
    expect(bad.endState()).toEqual(loopCounting.init(loopCounting.defaults));
  });

  it('grows: counts for n, 2n, 4n, 8n that match the closed form, and the right verdict', () => {
    for (const id of PATTERNS) {
      const p = PATTERN[id];
      const t = new Timeline(loopCounting, settings(id), 1, [['grow', 4]]);
      const g = t.endState().grow!;
      expect(g.sizes).toEqual([4, 8, 16, 32]);
      expect(g.counts).toEqual(g.sizes.map((m) => p.exact(m, 'missing')));
      expect(g.done).toBe(true);
      expect(t.entries[0]!.steps.at(-1)!.vars?.['Big-O']).toBe(`O(${p.order('missing')})`);
    }
    const tri = new Timeline(loopCounting, settings('triangle'), 1, [['grow', 4]]);
    expect(tri.endState().grow!.counts).toEqual([10, 36, 136, 528]);
    expect(tri.entries[0]!.steps.at(-1)!.say).toContain('grows about ×4');
  });

  it('formats ratios and helpers', () => {
    expect(ratioText(10, 36)).toBe('×3.6');
    expect(ratioText(36, 136)).toBe('×3.78');
    expect(ratioText(4, 8)).toBe('×2');
    expect(ratioText(0, 3)).toBe('up from 0');
    expect(ratioText(0, 0)).toBe('×1');
    expect([1, 2, 3, 4, 7, 8, 1000].map(lg)).toEqual([0, 1, 1, 2, 2, 3, 9]);
    expect([0, 1, 3, 4, 15, 16].map(isqrt)).toEqual([0, 1, 1, 2, 3, 4]);
    expect(parseN('8')).toBe(8);
    expect(parseN('17')).toBeInstanceOf(Error);
    expect(parseN('two')).toBeInstanceOf(Error);
  });

  it('shows the counted line on the stage card and nothing else when idle', () => {
    for (const id of PATTERNS) {
      const scene = loopCounting.view(
        new Timeline(loopCounting, settings(id), 1).initial,
        settings(id),
      );
      const hl = scene.shapes.filter((s) => s.id.startsWith('code-hl-'));
      expect(hl.length, id).toBe(PATTERN[id].counted.length);
      expect(scene.shapes.every((s) => s.id.startsWith('code-'))).toBe(true);
    }
  });
});

describe('drawn text size', () => {
  // The grid corner drew at 8.6 px on a phone; at 13, at 9.3.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(loopCounting, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(loopCounting, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
