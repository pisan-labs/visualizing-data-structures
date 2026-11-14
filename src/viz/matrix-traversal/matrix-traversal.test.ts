import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { matrixTraversal as def } from '.';
import { ringSwaps, transposeSwaps, valuesOf, type MatrixSettings } from './model';

const rowsText = (vs: number[][]) => vs.map((r) => r.join(' ')).join(' / ');

/** The reference spiral: peel the top row off, turn the rest a quarter turn counterclockwise. */
function referenceSpiral(vs: number[][]): number[] {
  const out: number[] = [];
  let m = vs.map((r) => [...r]);
  while (m.length && m[0]!.length) {
    out.push(...m.shift()!);
    if (!m.length) break;
    const cols = m[0]!.length;
    m = Array.from({ length: cols }, (_, c) => m.map((row) => row[cols - 1 - c]!));
  }
  return out;
}

/** The reference rotation, straight from the definition: new[j][n − 1 − i] = old[i][j]. */
function referenceRotate(vs: number[][]): number[][] {
  const n = vs.length;
  const out = vs.map((r) => r.map(() => 0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[j]![n - 1 - i] = vs[i]![j]!;
  return out;
}

const matrices = fc
  .record({ rows: fc.integer({ min: 1, max: 6 }), cols: fc.integer({ min: 1, max: 6 }) })
  .chain(({ rows, cols }) =>
    fc.array(fc.array(fc.integer({ min: 0, max: 99 }), { minLength: cols, maxLength: cols }), {
      minLength: rows,
      maxLength: rows,
    }),
  );
const squares = fc.integer({ min: 1, max: 6 }).chain((n) =>
  fc.array(fc.array(fc.integer({ min: 0, max: 99 }), { minLength: n, maxLength: n }), {
    minLength: n,
    maxLength: n,
  }),
);
const settingsArb = fc.record({
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
  rotate: fc.constantFrom('layers' as const, 'transpose' as const),
});

const steps = (vs: number[][], op: string, settings: MatrixSettings) =>
  new Timeline(def, settings, 1, [['load', rowsText(vs)], [op]]).entries[1]!.steps;

describe('matrix-traversal', () => {
  it('lists the spiral order of the reference both ways, with the work as stated', () => {
    fc.assert(
      fc.property(matrices, settingsArb, (vs, settings) => {
        const all = steps(vs, 'spiral', settings);
        const last = all.at(-1)!;
        const mn = vs.length * vs[0]!.length;
        expect(last.extra!.out).toEqual(referenceSpiral(vs));
        // Every cell once, each step's path a run of neighbours.
        const path = last.extra!.path!;
        expect(new Set(path.map(([r, c]) => `${r}-${c}`)).size).toBe(mn);
        path.slice(1).forEach(([r, c], k) => {
          const [pr, pc] = path[k]!;
          expect(Math.abs(r - pr) + Math.abs(c - pc)).toBe(1);
        });
        expect(last.vars?.reads).toBe(mn);
        const total =
          Number(last.vars?.reads) + Number(last.vars?.writes) + Number(last.vars?.checks);
        expect(total).toBe(
          last.vars?.[settings.approach === 'naive' ? 'naive total' : 'pattern total'],
        );
        expect(last.vars?.['naive total']).toBe(3 * mn - 1);
        for (const step of all) {
          const b = step.extra?.bounds;
          if (!b) continue;
          // Every cell outside the bounds is visited; none inside is.
          const seen = new Set(step.extra!.path!.map(([r, c]) => `${r}-${c}`));
          for (let r = 0; r < vs.length; r++)
            for (let c = 0; c < vs[0]!.length; c++) {
              const inside = b.top <= r && r <= b.bottom && b.left <= c && c <= b.right;
              const current = step.lines.some((l) =>
                ['top', 'right', 'bottom', 'left'].includes(l),
              );
              if (!current) expect(seen.has(`${r}-${c}`)).toBe(!inside);
            }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('rotates like the definition, every way, and moves values with their uids', () => {
    fc.assert(
      fc.property(squares, settingsArb, (vs, settings) => {
        const all = steps(vs, 'rotate', settings);
        const last = all.at(-1)!;
        const n = vs.length;
        expect(valuesOf(last.state)).toEqual(referenceRotate(vs));
        const reads = Number(last.vars?.reads);
        if (settings.approach === 'naive') expect(reads).toBe(n * n);
        else if (settings.rotate === 'layers') expect(reads).toBe(4 * ringSwaps(n));
        else expect(reads).toBe(2 * transposeSwaps(n));
        expect(last.vars?.writes).toBe(reads);
        expect(4 * ringSwaps(n)).toBe(n * n - (n % 2));
        for (const step of all) {
          const live = step.state.m.flat().filter((x) => !x.stale);
          const inB = (step.extra?.b ?? []).flat().filter((x) => x && !x.stale);
          const uids = [...live, ...inB].map((x) => x!.uid);
          expect(uids.length).toBe(n * n);
          expect(new Set(uids).size).toBe(n * n);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('refuses to rotate a matrix that is not square, and bad input', () => {
    const t = new Timeline(def, def.defaults, 1, [
      ['load', '3x5'],
      ['rotate'],
      ['load', '1 2 / 3'],
      ['load', '7x2'],
      ['load', '1 2 / 3 100'],
    ]);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/needs a square matrix, and this one is 3 × 5/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/same number of values/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/out of range/);
    expect(t.entries[4]!.steps[0]!.say).toMatch(/100 is out of range/);
    expect(valuesOf(t.endState()).length).toBe(3);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
