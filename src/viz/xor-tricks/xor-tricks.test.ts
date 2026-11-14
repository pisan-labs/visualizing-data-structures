import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { xorTricks as def } from '.';
import { listFor } from './lists';
import { unsuited, type Goal, type XSettings } from './model';

/** The reference: count every value by hand. */
function reference(a: number[], goal: Goal): number[] {
  if (goal === 'missing') {
    for (let k = 0; k <= a.length; k++) if (!a.includes(k)) return [k];
    return [];
  }
  const odd = [...new Set(a)].filter((v) => a.filter((u) => u === v).length % 2 === 1);
  return odd.sort((x, y) => x - y);
}

const goals = fc.constantFrom<Goal>('single', 'missing', 'two');
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function run(
  a: number[],
  settings: XSettings,
  more: [string, ...(string | number)[]][] = [['find']],
) {
  return new Timeline(def, settings, 1, [['load', a.join(' ')], ...more]);
}

describe('xor-tricks', () => {
  it('finds the reference answer both ways, with every XOR step adding up', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 3, max: 10 }),
        goals,
        approaches,
        fc.boolean(),
        (seed, n, goal, approach, big) => {
          const a = listFor(makeRng(seed), goal, n, { big, triple: seed % 3 === 0 });
          expect(unsuited(a, goal)).toBeNull();
          const t = run(a, { approach, goal });
          const steps = t.entries[1]!.steps;
          const last = steps.at(-1)!;
          expect(last.extra!.result).toEqual(reference(a, goal));
          for (const s of steps) {
            const e = s.extra!;
            // An XOR step's three rows add up: target ^ operand = result.
            const [r0, r1, r2] = e.rows;
            if (r2?.name === '=' && r0?.value !== null && r1?.value !== null)
              expect((r0!.value! ^ r1!.value!) >>> 0).toBe(r2.value);
            // Every value fits the bits drawn.
            for (const r of e.rows) if (r.value !== null) expect(r.value).toBeLessThan(1 << e.bits);
          }
          const tot = { naive: last.vars?.['naive total'], pattern: last.vars?.['pattern total'] };
          if (approach === 'pattern') expect(last.vars?.['bit ops']).toBe(tot.pattern);
          else expect(last.vars?.lookups).toBe(tot.naive);
          // The two singles: every value in a group that matches its splitting bit.
          if (goal === 'two' && approach === 'pattern') {
            const g = last.extra!.groups!;
            const low = Number(last.vars?.low);
            a.forEach((v, i) => expect(g[i]).toBe(v & low ? 1 : 0));
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('swaps both ways, and leaves a value swapped with itself alone', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 63 }), { minLength: 1, maxLength: 10 }),
        fc.nat(),
        fc.nat(),
        approaches,
        (a, x, y, approach) => {
          const i = x % a.length;
          const j = y % a.length;
          const t = run(a, { approach, goal: 'single' }, [['swap', i, j]]);
          const want = [...a];
          [want[i], want[j]] = [want[j]!, want[i]!];
          expect(t.endState().a).toEqual(want);
        },
      ),
    );
  });

  it('refuses a list that does not suit the goal', () => {
    const t = run([1, 2, 3], { approach: 'pattern', goal: 'single' });
    expect(t.entries[1]!.steps[0]!.say).toMatch(/every value in pairs but one/);
    const m = run([0, 1, 1], { approach: 'pattern', goal: 'missing' });
    expect(m.entries[1]!.steps[0]!.say).toMatch(/different values from 0 to 3/);
    const s = run([1, 2], { approach: 'pattern', goal: 'single' }, [['swap', 0, 5]]);
    expect(s.entries[1]!.steps[0]!.say).toMatch(/two indices from 0 to 1/);
  });

  it('starts each goal from a list that suits it', () => {
    for (const goal of ['single', 'missing', 'two'] as Goal[])
      expect(unsuited(def.init({ approach: 'pattern', goal }).a, goal)).toBeNull();
  });

  it('reads the input box', () => {
    const parse = def.controls.input!.parse;
    expect(parse('3')).toBe(3);
    expect(parse('4, 1 6')).toBe('4 1 6');
    expect(parse('64')).toBeInstanceOf(Error);
    expect(parse('-1')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
