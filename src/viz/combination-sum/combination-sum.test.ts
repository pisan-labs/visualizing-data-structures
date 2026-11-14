import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { combinationSum as def } from '.';
import {
  candidates,
  MAX_NAIVE,
  MAX_TREE,
  naiveCalls,
  plan,
  type CSSettings,
  type Reuse,
} from './model';

/** The reference: every multiset (again) or sub-multiset (once), kept when it sums to t. */
function reference(values: number[], target: number, reuse: Reuse): string[] {
  const out = new Set<string>();
  const c = [...values].sort((a, b) => a - b);
  const go = (i: number, chosen: number[], sum: number) => {
    if (sum === target) out.add(chosen.join(','));
    if (sum >= target || i === c.length) return;
    // Take c[i] (and stay, when it can be used again), or move past it.
    go(reuse === 'again' ? i : i + 1, [...chosen, c[i]!], sum + c[i]!);
    go(i + 1, chosen, sum);
  };
  go(0, [], 0);
  return [...out].sort();
}

const key = (xs: number[][]) => xs.map((x) => x.join(',')).sort();

const input = fc.record({
  values: fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 2, maxLength: 6 }),
  target: fc.integer({ min: 1, max: 12 }),
  reuse: fc.constantFrom<Reuse>('again', 'once'),
  approach: fc.constantFrom('pattern' as const, 'naive' as const),
});

function run(values: number[], target: number, settings: CSSettings) {
  const t = new Timeline(def, settings, 1, [
    ['load', values.join(' ')],
    ['search', target],
  ]);
  return t.entries[1]!.steps;
}

describe('combination-sum', () => {
  it('lists exactly the reference combinations both ways, each once', () => {
    fc.assert(
      fc.property(input, ({ values, target, reuse, approach }) => {
        const c = candidates(values, reuse);
        const nodes = plan(c, target, reuse);
        const steps = run(values, target, { approach, reuse });
        const last = steps.at(-1)!;
        if (nodes.length > MAX_TREE) {
          expect(last.say).toMatch(/too many to draw/);
          return;
        }
        const e = last.extra!;
        const want = reference(values, target, reuse);
        const stopped = approach === 'naive' && naiveCalls(c, target, reuse) > MAX_NAIVE;
        if (!stopped) expect(key(e.found)).toEqual(want);
        // No combination twice, and each one sorted.
        expect(new Set(key(e.found)).size).toBe(e.found.length);
        for (const f of e.found) expect(f).toEqual([...f].sort((a, b) => a - b));
        if (approach === 'pattern') {
          // Sorted backtracking finds them in order.
          expect(e.found.map((f) => f.join(','))).toEqual(
            [...e.found.map((f) => f.join(','))].sort((a, b) => {
              const x = a.split(',').map(Number);
              const y = b.split(',').map(Number);
              for (let i = 0; i < Math.min(x.length, y.length); i++)
                if (x[i] !== y[i]) return x[i]! - y[i]!;
              return x.length - y.length;
            }),
          );
          expect(last.vars?.calls).toBe(
            nodes.filter((n) => n.kind !== 'pruned' && n.kind !== 'dup').length,
          );
        } else if (!stopped) expect(last.vars?.calls).toBe(naiveCalls(c, target, reuse));
        let before = 0;
        for (const step of steps) {
          const x = step.extra;
          if (!x) continue;
          // What is chosen plus what is left is always the target.
          if (approach === 'pattern')
            expect(Number(step.vars?.left) + x.chosen.reduce((a, b) => a + b, 0)).toBe(target);
          expect(x.found.length).toBeGreaterThanOrEqual(before);
          before = x.found.length;
          for (const id of x.stack ?? []) expect(x.status?.[id]).toBe('open');
        }
      }),
      { numRuns: 250 },
    );
  });

  it('prunes at the first candidate bigger than what is left, and skips repeats', () => {
    const nodes = plan(candidates([1, 2, 1, 3, 2], 'once'), 4, 'once');
    expect(nodes.filter((n) => n.kind === 'dup').length).toBe(4);
    for (const n of nodes.filter((x) => x.kind === 'pruned')) expect(n.left).toBeLessThan(0);
    // A pruned branch is the last child of its call: the loop stops there.
    for (const n of nodes.filter((x) => x.kind === 'pruned')) {
      const sib = nodes.filter((x) => x.parent === n.parent);
      expect(sib.at(-1)).toBe(n);
    }
  });

  it('refuses what it cannot use', () => {
    const t = new Timeline(def, { approach: 'pattern', reuse: 'again' }, 1, [
      ['search', 0],
      ['load', '1 2 10'],
      ['load', '1 2 3 4 5 6 7'],
      ['load', '1 2'],
      ['search', 30],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/from 1 to 30/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/out of range/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/at most 6/);
    expect(t.entries[4]!.steps[0]!.say).toMatch(/too many to draw/);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
