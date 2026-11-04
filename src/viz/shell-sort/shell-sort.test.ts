import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { checkSort, counters, repeatsArb, valuesArb } from '../_sorting/check';
import { shellSort } from '.';
import { gapsFor, type ShellSettings } from './model';

const settings = (s: Partial<ShellSettings> = {}): ShellSettings =>
  ({ ...shellSort.defaults, ...s }) as ShellSettings;

const rules = fc.constantFrom('shell' as const, 'knuth' as const, 'ciura' as const);

const TRAP = [61, 11, 62, 12, 63, 13, 64, 14, 65, 15, 66, 16, 67, 17, 68, 18];

// Property tests run thousands of steps; give them room on a busy machine.
describe('shell sort', { timeout: 60_000 }, () => {
  it('sorts like the built-in sort and keeps every value, with every gap sequence', () => {
    fc.assert(
      fc.property(
        rules,
        fc.constantFrom('bars' as const, 'cells' as const),
        fc.oneof(valuesArb(), repeatsArb),
        (gaps, draw, values) => {
          checkSort(shellSort, settings({ gaps, draw }), values);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('leaves the array h-sorted after the pass for each gap h', () => {
    fc.assert(
      fc.property(rules, valuesArb(2), (gaps, values) => {
        const t = new Timeline(shellSort, settings({ gaps }), 1, [
          ['load', values.join(' ')],
          ['sort'],
        ]);
        const ends = t.entries[1]!.steps.filter((s) => s.say.startsWith('Done with h = '));
        expect(ends.map((s) => s.vars?.h)).toEqual(gapsFor(gaps, values.length));
        // Each pass leaves A h-sorted, and a later pass never undoes an earlier gap.
        const seen: number[] = [];
        for (const s of ends) {
          seen.push(s.vars!.h as number);
          const a = s.state.a.map((x) => x.value);
          for (const h of seen)
            for (let i = h; i < a.length; i++) expect(a[i - h]!).toBeLessThanOrEqual(a[i]!);
        }
      }),
      { numRuns: 80 },
    );
  });

  it('uses the textbook gap sequences', () => {
    expect(gapsFor('shell', 8)).toEqual([4, 2, 1]);
    expect(gapsFor('shell', 20)).toEqual([10, 5, 2, 1]);
    expect(gapsFor('knuth', 16)).toEqual([13, 4, 1]);
    expect(gapsFor('knuth', 8)).toEqual([4, 1]);
    // Integer division, as in Sedgewick and Wayne, so a gap never reaches n.
    expect(gapsFor('knuth', 13)).toEqual([4, 1]);
    expect(gapsFor('knuth', 4)).toEqual([1]);
    expect(gapsFor('ciura', 20)).toEqual([10, 4, 1]);
    expect(gapsFor('ciura', 3)).toEqual([1]);
    for (const rule of ['shell', 'knuth', 'ciura'] as const)
      for (let n = 2; n <= 20; n++) {
        expect(gapsFor(rule, n).at(-1)).toBe(1);
        expect(gapsFor(rule, n)[0], `${rule}, n = ${n}`).toBeLessThan(n);
      }
  });

  it("finds Shell's halving gaps useless on interleaved input, and Knuth's gaps less so", () => {
    const shell = new Timeline(shellSort, settings(), 1, [['load', TRAP.join(' ')], ['sort']]);
    const beforeLast = shell.entries[1]!.steps.find((s) => s.say.startsWith('Done with h = 2'))!;
    expect(beforeLast.vars?.shifts).toBe(0);
    expect(counters(checkSort(shellSort, settings(), TRAP))).toMatchObject({
      comparisons: 84,
      shifts: 36,
    });
    const knuth = counters(checkSort(shellSort, settings({ gaps: 'knuth' }), TRAP));
    expect(knuth).toMatchObject({ comparisons: 61, shifts: 34 });
  });

  it('matches the numbers in the examples', () => {
    expect(
      counters(checkSort(shellSort, settings(), [10, 20, 30, 40, 50, 60, 70, 80])),
    ).toMatchObject({
      comparisons: 17,
      shifts: 0,
    });
    const t = new Timeline(shellSort, settings({ draw: 'cells' }), 1, [
      ['load', '50 33 12 33 71 25'],
      ['sort'],
    ]);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('The two 33s ended up in the opposite order');
  });

  it('follows the setting in its pseudocode', () => {
    const text = (s: Partial<ShellSettings>) =>
      shellSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('h = floor(h / 2)');
    expect(text({ gaps: 'knuth' })).toContain('h = floor(h / 3)');
    expect(text({ gaps: 'ciura' })).toContain('for each h in gaps with h < n');
  });
});
