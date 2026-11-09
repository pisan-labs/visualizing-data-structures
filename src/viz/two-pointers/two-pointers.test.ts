import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { valuesArb } from '../_sorting/check';
import { load, valuesOf } from '../_sorting/kit';
import { twoPointers } from '.';
import { brute, defaults, type PairsGrid } from './model';

const run = (ops: OpCall[]) => new Timeline(twoPointers, defaults, 1, ops);
const sorted = (vs: number[]) => [...vs].sort((a, b) => a - b);
const lastVars = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.at(-1)!.vars ?? {};

/** Every pair that adds up to target, by brute force. */
function pairsThatSum(vs: number[], target: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++) if (vs[i]! + vs[j]! === target) out.push([i, j]);
  return out;
}

function bestWater(vs: number[]): number {
  let best = 0;
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++)
      best = Math.max(best, Math.min(vs[i]!, vs[j]!) * (j - i));
  return best;
}

/** No pair outside the still-possible triangle, and not checked, can be an answer. */
function checkGrid(vs: number[], target: number, g: PairsGrid) {
  const checked = new Set(g.checked.map(([i, j]) => `${i}-${j}`));
  for (const [i, j] of pairsThatSum(vs, target)) {
    const possible = g.lo <= i && j <= g.hi;
    if (!possible)
      expect(checked.has(`${i}-${j}`) || g.found !== undefined, `${i},${j}`).toBe(true);
  }
}

describe('two pointers', { timeout: 60_000 }, () => {
  it('finds a pair exactly when brute force does, and never rules out an answer', () => {
    fc.assert(
      fc.property(valuesArb(1), fc.integer({ min: 0, max: 198 }), (raw, target) => {
        const vs = sorted(raw);
        const t = run([load(vs), ['pairSum', target]]);
        const all = pairsThatSum(vs, target);
        const v = lastVars(t, 1);
        if (all.length === 0) expect(v.result).toBe('none');
        else {
          const [i, j] = String(v.result).split(', ').map(Number);
          expect(vs[i!]! + vs[j!]!).toBe(target);
          expect(i!).toBeLessThan(j!);
        }
        expect(Number(v['pairs checked'])).toBeLessThanOrEqual(Math.max(0, vs.length - 1));
        expect(v['brute force']).toBe(brute(vs.length));
        for (const s of t.entries[1]!.steps) {
          const g = s.extra?.pairs;
          if (g) checkGrid(vs, target, g);
          expect(valuesOf(s.state)).toEqual(vs);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('finds the most water that brute force finds, in n − 1 checks', () => {
    fc.assert(
      fc.property(valuesArb(1), (vs) => {
        const t = run([load(vs), ['water']]);
        const v = lastVars(t, 1);
        expect(v.result).toBe(bestWater(vs));
        expect(v['pairs checked']).toBe(Math.max(0, vs.length - 1));
      }),
      { numRuns: 300 },
    );
  });

  it('removes duplicates in place, keeping each value once in order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 20 }),
        (raw) => {
          const vs = sorted(raw);
          const t = run([load(vs), ['dedupe']]);
          const unique = [...new Set(vs)];
          expect(valuesOf(t.endState())).toEqual(unique);
          expect(lastVars(t, 1).result).toBe(unique.length);
          // Every step: the kept prefix A[0..slow] is strictly increasing, and live values are
          // never lost.
          for (const s of t.entries[1]!.steps) {
            const slow = s.vars?.slow;
            if (typeof slow !== 'number') continue;
            const kept = s.state.a.slice(0, slow + 1).map((x) => x.value);
            for (let k = 1; k < kept.length; k++) expect(kept[k]!).toBeGreaterThan(kept[k - 1]!);
            const live = new Set(s.state.a.filter((x) => !x.stale).map((x) => x.value));
            for (const u of unique) expect(live.has(u)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('reverses with ⌊n/2⌋ swaps, each value keeping its identity', () => {
    fc.assert(
      fc.property(valuesArb(1), (vs) => {
        const t = run([load(vs), ['reverse']]);
        const end = t.endState();
        expect(valuesOf(end)).toEqual([...vs].reverse());
        const before = t.entries[0]!.end.a.map((x) => x.uid);
        expect(end.a.map((x) => x.uid)).toEqual([...before].reverse());
        expect(lastVars(t, 1).swaps).toBe(Math.floor(vs.length / 2));
      }),
      { numRuns: 200 },
    );
  });

  it('refuses unsorted input for pair sum and duplicates, and Sort A fixes it', () => {
    const t = run([load([5, 1, 4]), ['pairSum', 9], ['dedupe'], ['sort'], ['pairSum', 9]]);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/not sorted.*press Sort A/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/not sorted.*press Sort A/);
    expect(lastVars(t, 4).result).toBe('1, 2');
  });

  it('explains a target it cannot use', () => {
    const t = run([
      ['pairSum', 500],
      ['pairSum', 'cat'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/from 0 to 198/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/one whole number/);
  });
});

describe('two pointers practice', () => {
  it('asks questions whose answers match brute force', () => {
    for (let seed = 1; seed < 40; seed++)
      for (const { kind, question: q } of practiceSet(twoPointers, seed, 4)) {
        const vs = String(q.setup[0]![1]).split(' ').map(Number);
        if (kind.id === 'water') expect(q.answer).toEqual({ kind: 'number', value: bestWater(vs) });
        if (kind.id === 'dedupe')
          expect(q.answer).toEqual({ kind: 'sequence', value: [...new Set(vs)].map(String) });
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(twoPointers, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(twoPointers, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
