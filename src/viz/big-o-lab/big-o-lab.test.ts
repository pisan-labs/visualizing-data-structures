import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { bigOLab, parseN } from '.';
import {
  FNS,
  MAX_N,
  count,
  countText,
  ratioText,
  stepsVar,
  timeText,
  type Fn,
  type LabSettings,
} from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (s: Partial<LabSettings> = {}): LabSettings =>
  ({ ...bigOLab.defaults, ...s }) as LabSettings;

/** Reference counts: run the loops for real (small n only). */
function loops(f: Fn, n: number): number {
  const log = (m: number) => {
    let k = 0;
    while (m > 1) {
      m = Math.floor(m / 2);
      k++;
    }
    return k;
  };
  const rec = (m: number, branch: (m: number) => number): number =>
    m === 0 ? 1 : branch(m) * rec(m - 1, branch);
  switch (f) {
    case '1':
      return 1;
    case 'logn':
      return log(n);
    case 'n':
      return n;
    case 'nlogn': {
      let s = 0;
      for (let i = 0; i < n; i++) s += log(n);
      return s;
    }
    case 'n2': {
      let s = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s++;
      return s;
    }
    case '2n':
      return rec(n, () => 2);
    case 'fact':
      return rec(n, (m) => m);
  }
}

describe('big-o lab', () => {
  it('counts the steps of each loop exactly for small n', () => {
    for (const f of FNS)
      for (let n = 1; n <= 12; n++)
        expect(Number(count(f, n).exact), `${f}(${n})`).toBe(loops(f, n));
  });

  it('keeps huge counts finite and readable', () => {
    expect(countText(count('2n', 1000))).toMatch(/^1\.07 × 10\^301$/);
    expect(countText(count('fact', MAX_N))).toMatch(/^\d\.\d\d × 10\^\d+$/);
    expect(countText(count('n2', 1000))).toBe('1,000,000');
    expect(timeText(count('n2', 1_000_000), 1e9)).toBe('17 min');
    expect(timeText(count('logn', 1), 1e9)).toBe('no time');
  });

  it('reports the doubling ratios', () => {
    expect(ratioText('n', 8, 16)).toBe('×2');
    expect(ratioText('n2', 8, 16)).toBe('×4');
    expect(ratioText('1', 8, 16)).toBe('×1');
    expect(ratioText('2n', 8, 16)).toBe('×256');
    expect(ratioText('logn', 1, 2)).toBe('from 0');
    expect(ratioText('nlogn', 8, 16)).toBe('×2.67');
  });

  it('matches a reference for any sequence of operations', () => {
    const call = fc.oneof(
      fc.integer({ min: -5, max: MAX_N + 5 }).map((v) => ['setn', v] as OpCall),
      fc.integer({ min: 1, max: 64 }).map((v) => ['setn', v] as OpCall),
      fc.constantFrom<OpCall>(['double'], ['halve'], ['inc']),
      fc.constantFrom(...FNS).map((f) => [`show-${f}`] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom('linear' as const, 'log' as const),
        fc.array(call, { maxLength: 30 }),
        (scale, calls) => {
          const t = new Timeline(bigOLab, settings({ scale }), 1, calls);
          let n = 8;
          const shown = new Set<Fn>(['logn', 'n', 'nlogn', 'n2']);
          calls.forEach(([op, v], k) => {
            const before = n;
            if (op === 'setn' && Number.isInteger(v) && Number(v) >= 1 && Number(v) <= MAX_N)
              n = Number(v);
            if (op === 'double' && 2 * n <= MAX_N) n *= 2;
            if (op === 'halve' && n > 1) n = Math.floor(n / 2);
            if (op === 'inc' && n < MAX_N) n += 1;
            if (op.startsWith('show-')) {
              const f = op.slice(5) as Fn;
              if (shown.has(f)) shown.delete(f);
              else shown.add(f);
            }
            const end = t.entries[k]!.end;
            expect(end.n).toBe(n);
            expect(end.shown).toEqual(FNS.filter((f) => shown.has(f)));
            if (n !== before) expect(end.prev).toBe(before);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            expect(step.vars?.n).toBe(step.state.n);
            for (const f of step.state.shown) expect(step.vars?.[stepsVar(f)]).toBeTruthy();
            for (const s of bigOLab.view(step, t.settings).shapes) {
              if (s.kind === 'rect') {
                expect(Number.isFinite(s.h) && s.h >= 0).toBe(true);
                expect(s.y).toBeGreaterThanOrEqual(0);
              }
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('parses n', () => {
    expect(parseN('16')).toBe(16);
    expect(parseN('1,000,000')).toBe(1_000_000);
    expect(parseN('0')).toBeInstanceOf(Error);
    expect(parseN('n')).toBeInstanceOf(Error);
  });

  it('words its practice explanations and summary to fit the numbers', () => {
    const kind = (id: string) => bigOLab.practice!.find((k) => k.id === id)!;
    let ahead = 0;
    let behind = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const which = kind('which-bigger').make(makeRng(seed));
      const [, a, b] = /takes (.+?) steps? and .+? takes (.+?) steps?\./.exec(which.explain)!;
      const caveat = which.explain.includes('does not always win yet');
      // The caveat only belongs where the slower-growing curve is not behind.
      if (caveat) behind++;
      else ahead++;
      expect(a === b ? caveat : true).toBe(true);
      for (const id of ['doubling-factor', 'how-long', 'which-bigger']) {
        const { explain } = kind(id).make(makeRng(seed));
        expect(explain).not.toMatch(/\b1 steps\b/);
        expect(explain).not.toContain('about a fraction');
        expect(explain).not.toMatch(/\d{1,3}(,\d{3}){2,} seconds/);
      }
    }
    expect(ahead).toBeGreaterThan(0);
    expect(behind).toBeGreaterThan(0);
    expect(
      bigOLab.describe(
        new Timeline(bigOLab, bigOLab.defaults, 1, [['show-1']]).endState(),
        bigOLab.defaults,
      ),
    ).toContain('1: 1 step,');
  });
});

describe('drawn text size', () => {
  // The axis names drew at 8.7 px on a phone; at 13, with closer wrapped rows, at 9.1.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(bigOLab, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bigOLab, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
