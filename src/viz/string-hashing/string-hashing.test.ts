import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { stringHashing } from '.';
import { defaults, moduli, type HashSettings } from './model';

const run = (ops: OpCall[], settings: Partial<HashSettings> = {}) =>
  new Timeline(stringHashing, { ...defaults, ...settings } as HashSettings, 1, ops);
const lastVars = (t: ReturnType<typeof run>) => t.entries.at(-1)!.steps.at(-1)!.vars ?? {};

/** The hash by its definition: s[0]·b^(m−1) + … + s[m−1], with BigInt so nothing overflows. */
function ref(s: string, b: number, p: number): number {
  let h = 0n;
  for (const c of s) h = h * BigInt(b) + BigInt(c.charCodeAt(0) - 96);
  return Number(h % BigInt(p));
}

const nums = (v: unknown) => String(v).replace(/[()]/g, '').split(', ').map(Number);

const word = fc.string({ unit: fc.constantFrom(...'abcd'), minLength: 1, maxLength: 16 });
const settingsArb = fc.record({
  b: fc.integer({ min: 2, max: 999 }),
  p: fc.integer({ min: 2, max: 9999 }),
  hashes: fc.constantFrom('single' as const, 'double' as const),
  p2: fc.integer({ min: 2, max: 9999 }),
});

describe('string hashing', { timeout: 60_000 }, () => {
  it('builds every prefix hash and power, by the definition', () => {
    fc.assert(
      fc.property(word, settingsArb, (s, st) => {
        const end = run([['load', s], ['build']], st).endState();
        moduli({ ...defaults, ...st }).forEach((m, t) => {
          for (let k = 0; k <= s.length; k++) {
            expect(end.H[t]![k]).toBe(ref(s.slice(0, k), st.b, m));
            expect(end.P[t]![k]).toBe(Number(BigInt(st.b) ** BigInt(k) % BigInt(m)));
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  it('hashes any substring in O(1), the same as hashing it directly', () => {
    fc.assert(
      fc.property(word, settingsArb, fc.nat(), fc.nat(), (s, st, x, y) => {
        const l = x % s.length;
        const r = l + (y % (s.length - l));
        const t = run(
          [
            ['load', s],
            ['hash', l, r],
          ],
          st,
        );
        const want = moduli({ ...defaults, ...st }).map((m) => ref(s.slice(l, r + 1), st.b, m));
        expect(nums(lastVars(t).hash)).toEqual(want);
      }),
      { numRuns: 300 },
    );
  });

  it('compares substrings: different hashes mean different strings, equal ones are checked', () => {
    fc.assert(
      fc.property(word, settingsArb, fc.nat(), fc.nat(), fc.nat(), (s, st, a, c, d) => {
        const i = a % s.length;
        const j = c % s.length;
        const len = 1 + (d % (s.length - Math.max(i, j)));
        const t = run(
          [
            ['load', s],
            ['compare', i, j, len],
          ],
          st,
        );
        const x = s.slice(i, i + len);
        const y = s.slice(j, j + len);
        const ms = moduli({ ...defaults, ...st });
        const same = ms.every((m) => ref(x, st.b, m) === ref(y, st.b, m));
        const want = !same ? 'different' : x === y ? 'equal' : 'collision';
        expect(lastVars(t).result).toBe(want);
        if (x === y) expect(lastVars(t).result).toBe('equal');
      }),
      { numRuns: 300 },
    );
  });

  it('rolls every window to the hash of that window', () => {
    fc.assert(
      fc.property(word, settingsArb, fc.nat(), (s, st, kk) => {
        const k = 1 + (kk % s.length);
        const end = run(
          [
            ['load', s],
            ['windows', k],
          ],
          st,
        ).endState();
        moduli({ ...defaults, ...st }).forEach((m, t) => {
          for (let w = 0; w + k <= s.length; w++)
            expect(end.win!.h[t]![w]).toBe(ref(s.slice(w, w + k), st.b, m));
        });
      }),
      { numRuns: 300 },
    );
  });

  it('finds the collision of abra and brac mod 101, and double hashing tells them apart', () => {
    const one = run([
      ['load', 'abracadabra'],
      ['compare', 0, 1, 4],
    ]);
    expect(lastVars(one).result).toBe('collision');
    const two = run(
      [
        ['load', 'abracadabra'],
        ['compare', 0, 1, 4],
      ],
      { hashes: 'double' },
    );
    expect(lastVars(two).result).toBe('different');
  });

  it('explains input it cannot use', () => {
    const t = run([
      ['load', 'abc1'],
      ['load', 7],
      ['hash', 5, 2],
      ['compare', 0, 1, 99],
      ['windows', 0],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/other than letters/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/Type a word/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/The end must be from 5/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/The length must be from 1/);
    expect(t.entries[4]!.steps[0]!.say).toMatch(/The window length must be from 1/);
  });

  it('follows the hashes setting in its pseudocode', () => {
    const text = (hashes: HashSettings['hashes']) =>
      stringHashing
        .pseudocode({ ...defaults, hashes })
        .flatMap((b) => b.lines.map((l) => l.text))
        .join('\n');
    expect(text('double')).toContain('again mod p₂');
    expect(text('single')).not.toContain('p₂');
  });
});

describe('string hashing practice', () => {
  it('asks for hashes that match the definition', () => {
    for (let seed = 1; seed < 40; seed++)
      for (const { kind, question: q } of practiceSet(stringHashing, seed, 4)) {
        const s = String(q.setup[0]![1]);
        if (kind.id === 'substring') {
          const [, l, r] = q.watch![0]! as [string, number, number];
          expect(q.answer).toEqual({
            kind: 'number',
            value: ref(s.slice(l, r + 1), defaults.b, defaults.p),
          });
        }
        if (kind.id === 'prefix') {
          const k = Number(/What is H\[(\d+)\]/.exec(q.prompt)![1]);
          expect(q.answer).toEqual({
            kind: 'number',
            value: ref(s.slice(0, k), defaults.b, defaults.p),
          });
        }
      }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(stringHashing, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(stringHashing, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
