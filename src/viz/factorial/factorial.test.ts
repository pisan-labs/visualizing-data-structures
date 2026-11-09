import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { factorial } from '.';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { LOOP_CAP, type Base, type FactSettings, type Style } from './model';

const settings = (s: Partial<FactSettings> = {}): FactSettings =>
  ({ ...factorial.defaults, ...s }) as FactSettings;

type Outcome = { value: number } | { overflow: true } | { loop: true };

/** The plain recursion, with a stack that holds `limit` frames. */
function refPlain(n: number, base: Base, limit: number, depth = 1): number | 'overflow' {
  if (depth > limit) return 'overflow';
  if ((base === 'zero' && n === 0) || (base === 'one' && n <= 1)) return 1;
  const r = refPlain(n - 1, base, limit, depth + 1);
  return r === 'overflow' ? r : n * r;
}

function refTail(
  n: number,
  acc: number,
  base: Base,
  limit: number,
  depth = 1,
): number | 'overflow' {
  if (depth > limit) return 'overflow';
  if ((base === 'zero' && n === 0) || (base === 'one' && n <= 1)) return acc;
  return refTail(n - 1, n * acc, base, limit, depth + 1);
}

/** What a run should end with, its number of calls and its deepest stack (frames above main). */
function reference(n: number, s: FactSettings): { out: Outcome; calls: number; deepest: number } {
  const stop = (k: number) => (s.base === 'zero' ? k === 0 : s.base === 'one' ? k <= 1 : false);
  if (s.style === 'tco') {
    let k = n;
    let acc = 1;
    for (let calls = 1; calls <= LOOP_CAP; calls++) {
      if (stop(k)) return { out: { value: acc }, calls, deepest: 1 };
      acc *= k;
      k -= 1;
    }
    return { out: { loop: true }, calls: LOOP_CAP, deepest: 1 };
  }
  const r = s.style === 'plain' ? refPlain(n, s.base, s.limit) : refTail(n, 1, s.base, s.limit);
  if (r === 'overflow')
    return { out: { overflow: true }, calls: s.limit + 1, deepest: s.limit + 1 };
  let calls = 1;
  for (let k = n; !stop(k); k--) calls++;
  return { out: { value: r }, calls, deepest: calls };
}

const styles: Style[] = ['plain', 'tail', 'tco'];
const bases: Base[] = ['zero', 'one', 'none'];

describe('factorial', () => {
  it('computes n! and pops back to main', () => {
    const t = new Timeline(factorial, settings(), 1, [['factorial', 5]]);
    const end = t.entries[0]!.steps.at(-1)!;
    expect(end.vars?.result).toBe(120);
    expect(end.state.stack).toEqual([]);
    expect(end.state.run?.outcome).toBe('done');
    expect(end.say).toContain('5! = 120');
  });

  it('pushes one frame per call, down to the base case', () => {
    const t = new Timeline(factorial, settings(), 1, [['factorial', 3]]);
    const depths = t.entries[0]!.steps.map((s) => s.state.stack.length);
    expect(Math.max(...depths)).toBe(4);
    const one = new Timeline(factorial, settings({ base: 'one' }), 1, [['factorial', 3]]);
    expect(Math.max(...one.entries[0]!.steps.map((s) => s.state.stack.length))).toBe(3);
  });

  it('overflows without a base case, and for a negative n with n == 0', () => {
    for (const [s, n] of [
      [settings({ base: 'none', limit: 6 }), 3],
      [settings({ base: 'zero', limit: 6 }), -1],
      [settings({ base: 'zero', limit: 5 }), 7],
    ] as const) {
      const steps = new Timeline(factorial, s, 1, [['factorial', n]]).entries[0]!.steps;
      const hit = steps.find((x) => x.say.includes('Stack overflow!'))!;
      expect(hit.marks.some((m) => m.role === 'error')).toBe(true);
      expect(hit.state.stack.length).toBe(s.limit + 1);
      expect(steps.at(-1)!.state.run?.outcome).toBe('overflow');
      expect(steps.at(-1)!.say).toContain('RecursionError');
    }
  });

  it('returns 1 for a negative n with n <= 1, and says that means nothing', () => {
    const steps = new Timeline(factorial, settings({ base: 'one' }), 1, [['factorial', -3]])
      .entries[0]!.steps;
    expect(steps.at(-1)!.vars?.result).toBe(1);
    expect(steps.map((s) => s.say).join(' ')).toContain('not defined');
  });

  it('reuses one frame when tail calls are optimized, and stops a run with no end', () => {
    const t = new Timeline(factorial, settings({ style: 'tco' }), 1, [['factorial', 6]]);
    expect(Math.max(...t.entries[0]!.steps.map((s) => s.state.stack.length))).toBe(1);
    expect(t.entries[0]!.steps.at(-1)!.vars?.result).toBe(720);
    const loop = new Timeline(factorial, settings({ style: 'tco', base: 'none' }), 1, [
      ['factorial', 4],
    ]);
    expect(loop.endState().run?.outcome).toBe('loop');
    expect(loop.endState().made).toBe(LOOP_CAP);
  });

  it('refuses n outside the range and changes nothing', () => {
    const t = new Timeline(factorial, settings(), 1, [
      ['factorial', 4],
      ['factorial', 99],
    ]);
    expect(t.entries[1]!.steps).toHaveLength(1);
    expect(t.entries[1]!.end).toEqual(t.entries[0]!.end);
  });

  it('matches a reference recursion, with sound frames at every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...styles),
        fc.constantFrom(...bases),
        fc.integer({ min: 4, max: 12 }),
        fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 1, maxLength: 4 }),
        (style, base, limit, ns) => {
          const st = settings({ style, base, limit });
          const calls: OpCall[] = ns.map((n) => ['factorial', n]);
          const t = new Timeline(factorial, st, 1, calls);
          ns.forEach((n, k) => {
            const want = reference(n, st);
            const steps = t.entries[k]!.steps;
            const end = steps.at(-1)!;
            const run = end.state.run!;
            if ('value' in want.out) {
              expect(run.outcome).toBe('done');
              expect(end.vars?.result).toBe(want.out.value);
            } else {
              expect(run.outcome).toBe('overflow' in want.out ? 'overflow' : 'loop');
            }
            expect(end.state.made).toBe(want.calls);
            expect(Math.max(...steps.map((s) => s.state.stack.length))).toBe(want.deepest);
            for (const s of steps) {
              const st8 = s.state;
              // The stack holds the calls still running, each called by the frame below it.
              st8.stack.forEach((f, i) => {
                const c = st8.calls[f.call - 1]!;
                expect(f.call).toBeLessThanOrEqual(st8.made);
                if (style !== 'tco' && i > 0) expect(c.parent).toBe(st8.stack[i - 1]!.call);
                expect(st8.result[c.id] === undefined || st8.phase[c.id] === 'return').toBe(true);
              });
              if (style === 'tco') expect(st8.stack.length).toBeLessThanOrEqual(1);
              else expect(st8.stack.length).toBeLessThanOrEqual(limit + 1);
              expect(s.vars?.depth).toBe(st8.stack.length);
              // Every value returned so far is the reference value for that call.
              for (const [id, v] of Object.entries(st8.result)) {
                const c = st8.calls[Number(id) - 1]!;
                const r =
                  style === 'plain' ? refPlain(c.n, base, 99) : refTail(c.n, c.acc!, base, 99);
                expect(v).toBe(r);
              }
            }
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('writes driver input that the code tabs can run', () => {
    const { input, expected } = factorial.code!.script(
      [
        ['factorial', 5],
        ['factorial', -2],
        ['factorial', 0],
      ],
      settings({ base: 'none', limit: 4 }),
    );
    expect(input).toEqual(['factorial 5', 'factorial 0']);
    expect(expected).toEqual(['120', '1']);
    expect(factorial.code!.script([['factorial', 4]], settings({ style: 'tco' }))).toEqual({
      input: ['tail 4'],
      expected: ['24'],
    });
  });

  it('parses n', () => {
    const parse = factorial.controls.input!.parse;
    expect(parse('4')).toBe(4);
    expect(parse('-3')).toBe(-3);
    expect(parse('10')).toBeInstanceOf(Error);
    expect(parse('2.5')).toBeInstanceOf(Error);
    expect(parse('x')).toBeInstanceOf(Error);
    expect(parse(' ')).toBeInstanceOf(Error);
  });
});

describe('factorial practice', () => {
  const kinds = factorial.practice!;
  const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual(['returns', 'depth', 'first-return', 'overflow']);
  });

  it('gets every answer right, checked against the reference', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const st = settings(q.settings as Partial<FactSettings>);
        const n = Number(q.watch![0]![1]);
        const a = q.answer;
        if (k.id === 'returns') {
          expect(a).toEqual({ kind: 'number', value: fact(n) });
        } else if (k.id === 'depth') {
          expect(a).toEqual({ kind: 'number', value: reference(n, st).deepest });
        } else if (k.id === 'first-return') {
          if (a.kind !== 'choice') throw new Error('first-return is a choice');
          expect(a.options[a.correct]).toBe(`factorial(${st.base === 'one' ? 1 : 0})`);
        } else {
          if (a.kind !== 'choice') throw new Error('overflow is a choice');
          const r = reference(n, st).out;
          expect(a.options[a.correct]).toBe('overflow' in r ? 'Stack overflow' : 'It finishes');
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // The stack beside the tree drew at 7.8 px on a phone; the tree now has the stack's font, and
  // a phone gets a narrower stack (under the tree, or with each line on a second row).
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(factorial, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(factorial, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });

  it('puts the stack beside the call tree on a laptop and under it on a phone, as the page says', () => {
    const t = new Timeline(factorial, settings(), 1, [['factorial', 4]]);
    const step = t.at(t.length - 1).step;
    const mean = (stage: typeof LAPTOP_STAGE, prefix: string, key: 'x' | 'y') => {
      const vs = factorial
        .view(step, settings(), stage)
        .shapes.filter((s) => s.id.startsWith(prefix))
        .map((s) => (s as { x?: number; y?: number })[key])
        .filter((v): v is number => typeof v === 'number');
      return vs.reduce((a, b) => a + b, 0) / vs.length;
    };
    expect(mean(LAPTOP_STAGE, 'frame-', 'x')).toBeGreaterThan(
      mean(LAPTOP_STAGE, 'call-', 'x') + 50,
    );
    expect(mean(PHONE_STAGE, 'frame-', 'y')).toBeGreaterThan(mean(PHONE_STAGE, 'call-', 'y') + 100);
  });
});
