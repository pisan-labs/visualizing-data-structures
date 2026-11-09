import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { strassen, multiplyCall } from '.';
import {
  combined,
  parseMatrices,
  pseudocode,
  schemeOf,
  type Mat,
  type Method,
  type Names,
  type StSettings,
} from './model';

// ---------------------------------------------------------------------------------------------
// References written independently of the page: the schoolbook product, and the counts the
// recurrences give for a size that is a power of 2.

function school(a: Mat, b: Mat): Mat {
  const n = a.length;
  const c: Mat = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) c[i]![j]! += a[i]![k]! * b[k]![j]!;
  return c;
}

/** Multiplications and additions: T(n) = k T(n/2), A(n) = k A(n/2) + adds·(n/2)². */
function counts(n: number, k: number, adds: number): { mults: number; adds: number } {
  if (n === 1) return { mults: 1, adds: 0 };
  const half = counts(n / 2, k, adds);
  return { mults: k * half.mults, adds: k * half.adds + adds * (n / 2) ** 2 };
}

const matArb = (n: number) =>
  fc.array(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: n, maxLength: n }), {
    minLength: n,
    maxLength: n,
  });
const pairArb = fc.integer({ min: 1, max: 5 }).chain((n) => fc.tuple(matArb(n), matArb(n)));

describe('strassen', () => {
  it('multiplies correctly in every setting, with every call returning its own product', () => {
    fc.assert(
      fc.property(
        pairArb,
        fc.constantFrom<Method>('strassen', 'block'),
        fc.constantFrom<Names>('clrs', 'm'),
        ([A, B], method, names) => {
          const settings: StSettings = { method, names };
          const steps = new Timeline(strassen, settings, 1, [multiplyCall(A, B)]).entries[0]!.steps;
          const end = steps.at(-1)!.state;
          const n = A.length;
          const N = end.calls[0]!.n;
          expect(N).toBeGreaterThanOrEqual(n);
          expect(N & (N - 1)).toBe(0);
          const C = end.calls[0]!.C.slice(0, n).map((r) => r.slice(0, n));
          expect(C).toEqual(school(A, B));
          const scheme = schemeOf(settings);
          for (const c of end.calls) {
            expect(c.C).toEqual(school(c.A, c.B));
            // Combining the children's products the scheme's way gives the call's product.
            if (c.n > 1) expect(combined(c, end.calls, scheme)).toEqual(c.C);
          }
          const k = method === 'strassen' ? 7 : 8;
          const ref = counts(N, k, method === 'strassen' ? 18 : 4);
          expect(end.mults).toBe(ref.mults);
          expect(end.adds).toBe(ref.adds);
          // Counters never go down, and a call returns only after all of its children.
          let last = 0;
          for (const s of steps) {
            expect(s.state.mults).toBeGreaterThanOrEqual(last);
            last = s.state.mults;
            const back = new Set(s.state.returned);
            const early = s.state.returned.filter((id) =>
              s.state.calls[id - 1]!.children.some((kid) => !back.has(kid)),
            );
            expect(early, 'calls that returned before their children').toEqual([]);
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('makes 49 multiplications for 4 × 4 and 343 for 8 × 8, against 64 and 512', () => {
    for (const [n, want] of [
      [2, 7],
      [4, 49],
      [8, 343],
    ] as const) {
      const ones = Array.from({ length: n }, () => Array<number>(n).fill(1));
      const t = new Timeline(strassen, strassen.defaults, 1, [multiplyCall(ones, ones)]);
      expect(t.entries[0]!.end.mults).toBe(want);
      const b = new Timeline(strassen, { ...strassen.defaults, method: 'block' }, 1, [
        multiplyCall(ones, ones),
      ]);
      expect(b.entries[0]!.end.mults).toBe(n ** 3);
    }
  });

  it('reads matrices and refuses bad ones with a reason', () => {
    expect(parseMatrices('1 2; 3 4 * 5 6; 7 8')).toEqual({
      A: [
        [1, 2],
        [3, 4],
      ],
      B: [
        [5, 6],
        [7, 8],
      ],
    });
    expect(parseMatrices('6 × 7')).toEqual({ A: [[6]], B: [[7]] });
    expect(String(parseMatrices('1 2; 3 * 5 6; 7 8'))).toMatch(/square/);
    expect(String(parseMatrices('1 2; 3 4 * 5'))).toMatch(/same size/);
    expect(String(parseMatrices('10 * 2'))).toMatch(/Entries go from/);
    expect(String(parseMatrices('1 2; 3 4'))).toMatch(/two matrices/);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const method of ['strassen', 'block'] as const)
      for (const names of ['clrs', 'm'] as const)
        for (const block of pseudocode({ method, names }))
          for (const l of block.lines)
            expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(34);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(strassen, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(strassen, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
