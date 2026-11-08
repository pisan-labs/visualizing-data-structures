import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { bigODefinition, parseInput } from '.';
import { exprOf, fmt, limitOf, parseConst, parseExpr, rat, type Rat } from './expr';
import {
  beyondRange,
  boundsOf,
  RANGES,
  smallestN0Past,
  type Bound,
  type DefSettings,
  type DefState,
  type Relation,
  type Side,
} from './model';
import { PAIRS } from './pairs';
import { samples, statuses } from './view';

// ----- A reference, written separately from expr.ts: each menu pair by hand, in bigints. -----

const lg = (n: bigint) => {
  let k = 0n;
  for (let m = n; m > 1n; m /= 2n) k++;
  return k;
};
const fact = (n: bigint) => {
  let v = 1n;
  for (let i = 2n; i <= n; i++) v *= i;
  return v;
};

/** f and g of each menu pair as numerator and denominator. */
const REF: Record<
  string,
  { f: (n: bigint) => [bigint, bigint]; g: (n: bigint) => [bigint, bigint] }
> = {
  poly: { f: (n) => [3n * n * n + 10n * n + 5n, 1n], g: (n) => [n * n, 1n] },
  'linear-quadratic': { f: (n) => [100n * n, 1n], g: (n) => [n * n, 1n] },
  'quadratic-linear': { f: (n) => [n * n, 1n], g: (n) => [n, 1n] },
  'nlogn-linear': { f: (n) => [n * lg(n), 1n], g: (n) => [n, 1n] },
  'exponential-polynomial': { f: (n) => [2n ** n, 1n], g: (n) => [n ** 10n, 1n] },
  'clrs-theta': { f: (n) => [n * n - 6n * n, 2n], g: (n) => [n * n, 1n] },
  'nlogn-plus-n': { f: (n) => [n * lg(n) + n, 1n], g: (n) => [n * lg(n), 1n] },
  'exponential-factorial': { f: (n) => [2n ** n, 1n], g: (n) => [fact(n), 1n] },
};

type C = { side: Side; c: Rat };

/** The definition at one n, straight from its words: 0 ≤ f ≤ c·g, or 0 ≤ c·g ≤ f. */
function refHolds(id: string, n: bigint, bounds: C[]): boolean {
  const [fn, fd] = REF[id]!.f(n);
  const [gn, gd] = REF[id]!.g(n);
  return bounds.every(({ side, c }) => {
    // f = fn/fd, c·g = c.n·gn/(c.d·gd); compare over the common denominator fd·c.d·gd > 0.
    const F = fn * c.d * gd;
    const CG = c.n * gn * fd;
    return side === 'upper' ? fn >= 0n && F <= CG : CG >= 0n && CG <= F;
  });
}

const refFailures = (id: string, bounds: C[], n0: number, N: number) => {
  const out: number[] = [];
  for (let n = n0; n <= N; n++) if (!refHolds(id, BigInt(n), bounds)) out.push(n);
  return out;
};

const pairOf = (id: string) => PAIRS.find((p) => p.id === id)!;
const compareCall = (id: string): OpCall => ['compare', `${pairOf(id).f} ; ${pairOf(id).g}`];
const settings = (s: Partial<DefSettings> = {}): DefSettings =>
  ({ ...bigODefinition.defaults, ...s }) as DefSettings;

/** Constants the page accepts: whole numbers, decimals and fractions up to 1000. */
const constArb = fc.oneof(
  fc.integer({ min: 1, max: 60 }).map(String),
  fc.integer({ min: 1, max: 1000 }).map(String),
  fc
    .tuple(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 30 }))
    .map(([a, b]) => `${a}/${b}`),
  fc
    .tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 1, max: 999 }))
    .map(([a, b]) => `${a}.${b}`),
);
const pairArb = fc.constantFrom(...PAIRS.map((p) => p.id));
const relArb = fc.constantFrom<Relation>('O', 'Omega', 'Theta');
const rangeArb = fc.constantFrom(...RANGES);

/** Two constants, smaller first: Θ's c₁ and c₂. */
function ordered(a: string, b: string): [string, string] {
  const r = (x: string) => (parseConst(x) as { r: Rat }).r;
  return r(a).n * r(b).d <= r(b).n * r(a).d ? [a, b] : [b, a];
}

const lastStep = (t: Timeline<DefState, DefSettings, unknown>) => t.entries.at(-1)!.steps.at(-1)!;

/** The witness the page is trying, as plain constants. */
const boundsNow = (s: DefState, rel: Relation): Bound[] => boundsOf(s, rel)!;

describe('big-o definition', () => {
  it('parses functions into canonical forms that read back the same', () => {
    const cases: [string, string][] = [
      ['3n^2 + 10n + 5', '3n² + 10n + 5'],
      ['5 + 10n + 3n^2', '3n² + 10n + 5'],
      ['n^2/2 - 3n', 'n²/2 − 3n'],
      ['0.5n² − 3·n', 'n²/2 − 3n'],
      ['n log n + n', 'n log n + n'],
      ['n lg n', 'n log n'],
      ['2^n', '2ⁿ'],
      ['3*2^n + n^10', '3·2ⁿ + n¹⁰'],
      ['n!', 'n!'],
      ['(log n)^2 + log^2 n', '2log² n'],
      ['n^2 + n^2 - n', '2n² − n'],
    ];
    for (const [src, text] of cases) {
      const e = parseExpr(src);
      expect(e instanceof Error ? e.message : e.text, src).toBe(text);
      const again = parseExpr(text);
      expect(again instanceof Error ? again.message : again.text, text).toBe(text);
    }
    for (const bad of [
      '',
      'n^',
      '3^n',
      'n^n',
      'x + 1',
      '-n^2',
      'n - n',
      'n^11',
      '1/0',
      'ln n',
      '2^n^2',
    ])
      expect(parseExpr(bad), bad).toBeInstanceOf(Error);
  });

  it('never throws on any input, and canonical text always reads back', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (src) => {
        const e = parseExpr(src);
        if (!(e instanceof Error))
          expect((parseExpr(e.text) as { text: string }).text).toBe(e.text);
      }),
      { numRuns: 400 },
    );
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 99 }),
            fc.integer({ min: 0, max: 4 }),
            fc.integer({ min: 0, max: 2 }),
            fc.constantFrom('', ' 2^n', ' n!'),
          ),
          { minLength: 1, maxLength: 4 },
        ),
        (terms) => {
          const src = terms
            .map(([k, a, b, x]) => `${k} n^${a} ${'log n '.repeat(b)}${x}`)
            .join(' + ');
          const e = parseExpr(src);
          expect(e).not.toBeInstanceOf(Error);
          const again = parseExpr((e as { text: string }).text);
          expect((again as { ascii: string }).ascii).toBe((e as { ascii: string }).ascii);
        },
      ),
    );
  });

  it('reads constants exactly and refuses what the definition forbids', () => {
    expect(parseConst('1/14')).toMatchObject({ text: '1/14' });
    expect(parseConst('2/4')).toMatchObject({ text: '1/2' });
    expect(parseConst('3.10')).toMatchObject({ text: '3.1' });
    expect(parseConst('4.0')).toMatchObject({ text: '4' });
    for (const bad of ['0', '0/3', '-1', '1001', '1/2000', 'c', '1e3', '1/0'])
      expect(parseConst(bad), bad).toBeInstanceOf(Error);
    expect(parseInput('3n^2 + 10n + 5 ; n²')).toBe('3n^2 + 10n + 5 ; n²');
    expect(parseInput('dog')).toBeInstanceOf(Error);
  });

  it('formats values as learners read them', () => {
    expect(fmt(rat(8005n))).toBe('8,005');
    expect(fmt(rat(-5n, 2n))).toBe('−2.5');
    expect(fmt(rat(9n, 14n))).toBe('9/14');
    expect(fmt(rat(1250n, 7n))).toBe('≈ 178.6');
    expect(fmt(rat(2n ** 100n))).toBe('1.27 × 10³⁰');
  });

  it('checks every menu pair exactly like a direct loop over the range', () => {
    fc.assert(
      fc.property(
        pairArb,
        relArb,
        rangeArb,
        constArb,
        constArb,
        fc.integer({ min: 1, max: 200 }),
        (id, relation, range, a, b, n0raw) => {
          const N = Number(range);
          const n0 = Math.min(n0raw, N);
          const [lo, hi] = ordered(a, b);
          const arg = relation === 'Theta' ? `${lo} ${hi} ${n0}` : `${a} ${n0}`;
          const s = settings({ relation, range });
          const t = new Timeline(bigODefinition, s, 1, [compareCall(id), ['check', arg]]);
          const end = t.endState();
          expect(end.n0).toBe(n0);
          const bounds = boundsNow(end, relation);
          const fails = refFailures(id, bounds, n0, N);
          const vars = lastStep(t).vars!;
          expect(vars['first failure']).toBe(fails[0] ?? 'none');
          expect(vars['n that fail']).toBe(fails.length);
          // The strip under the chart agrees too.
          const st = statuses(end, s)!;
          expect(st.filter((x) => x === 'fail').length).toBe(fails.length);
          expect(st.slice(0, n0 - 1).every((x) => x === 'skip')).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('finds the smallest n₀ in the range, and that witness really works there', () => {
    fc.assert(
      fc.property(pairArb, relArb, rangeArb, constArb, constArb, (id, relation, range, a, b) => {
        const N = Number(range);
        const [lo, hi] = ordered(a, b);
        const arg = relation === 'Theta' ? `${lo} ${hi}` : a;
        const s = settings({ relation, range });
        const t = new Timeline(bigODefinition, s, 1, [compareCall(id), ['find', arg]]);
        const end = t.endState();
        const bounds = boundsNow(end, relation);
        if (end.n0 === null) {
          expect(refHolds(id, BigInt(N), bounds), 'n = N breaks it').toBe(false);
          return;
        }
        expect(refFailures(id, bounds, end.n0, N)).toEqual([]);
        if (end.n0 > 1) expect(refHolds(id, BigInt(end.n0 - 1), bounds)).toBe(false);
        // Each walk step moves the candidate down, and never past the answer.
        const n0s = t.entries
          .at(-1)!
          .steps.map((x) => x.state.n0)
          .filter((x) => x !== null);
        for (let i = 1; i < n0s.length - 1; i++) expect(n0s[i]!).toBeLessThanOrEqual(n0s[i - 1]!);
        expect(Math.min(...n0s)).toBeGreaterThanOrEqual(end.n0);
      }),
      { numRuns: 300 },
    );
  });

  it('says what happens past the range, and the reference agrees', () => {
    fc.assert(
      fc.property(pairArb, relArb, rangeArb, constArb, constArb, (id, relation, range, a, b) => {
        const N = Number(range);
        const [lo, hi] = ordered(a, b);
        const s = settings({ relation, range });
        const arg = relation === 'Theta' ? `${lo} ${hi}` : a;
        const t = new Timeline(bigODefinition, s, 1, [compareCall(id), ['find', arg]]);
        const end = t.endState();
        const bounds = boundsNow(end, relation);
        const f = exprOf(end.f);
        const g = exprOf(end.g);
        // Far enough to see the exponentials turn, cheap enough for factorials.
        const far = id.startsWith('exponential') ? 260 : 2000;
        if (end.n0 !== null) {
          const v = beyondRange(f, g, bounds, N);
          expect(v.kind).not.toBe('open');
          if (v.kind === 'proved') {
            expect(refFailures(id, bounds, N + 1, far)).toEqual([]);
          } else if (v.kind === 'fails') {
            expect(v.first).toBe(true);
            expect(refHolds(id, v.n, bounds), `fails at ${v.n}`).toBe(false);
            if (v.n - BigInt(N) < 5000n)
              expect(refFailures(id, bounds, N + 1, Number(v.n) - 1)).toEqual([]);
          }
        } else {
          const v = smallestN0Past(f, g, bounds, N);
          expect(v.kind).not.toBe('open');
          if (v.kind === 'n0') {
            // A real witness past the range: nothing breaks it from n₀ on, and n₀ − 1 does.
            expect(v.n0).toBeGreaterThan(BigInt(N));
            expect(refHolds(id, v.n0 - 1n, bounds)).toBe(false);
            if (v.n0 < 6000n)
              expect(refFailures(id, bounds, Number(v.n0), Number(v.n0) + far)).toEqual([]);
            else
              for (const k of [0n, 1n, 2n, 7n, 100n])
                expect(refHolds(id, v.n0 + k, bounds)).toBe(true);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('a pair the page says has no witness fails for every c it tries', () => {
    // Where the limit rules a relation out, no c and no n₀ can work.
    const impossible: [string, Relation][] = [];
    for (const p of PAIRS) {
      const lim = limitOf(exprOf(p.f), exprOf(p.g));
      if (lim.kind === 'inf') impossible.push([p.id, 'O'], [p.id, 'Theta']);
      if (lim.kind === 'zero') impossible.push([p.id, 'Omega'], [p.id, 'Theta']);
    }
    expect(impossible.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(
        fc.constantFrom(...impossible),
        rangeArb,
        constArb,
        constArb,
        fc.integer({ min: 1, max: 200 }),
        ([id, relation], range, a, b, n0raw) => {
          const N = Number(range);
          const n0 = Math.min(n0raw, N);
          const [lo, hi] = ordered(a, b);
          const arg = relation === 'Theta' ? `${lo} ${hi} ${n0}` : `${a} ${n0}`;
          const s = settings({ relation, range });
          const t = new Timeline(bigODefinition, s, 1, [compareCall(id), ['check', arg]]);
          const vars = lastStep(t).vars!;
          const bounds = boundsNow(t.endState(), relation);
          expect(vars[`past ${N}`]).not.toBe('proved');
          if (vars['first failure'] === 'none') {
            const v = beyondRange(exprOf(t.endState().f), exprOf(t.endState().g), bounds, N);
            expect(v.kind).toBe('fails');
            if (v.kind === 'fails') expect(refHolds(id, v.n, bounds)).toBe(false);
          } else {
            expect(refHolds(id, BigInt(vars['first failure'] as number), bounds)).toBe(false);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('reads the limit off the biggest terms, and the ratio heads there', () => {
    // Polynomials with small coefficients: by n = 10⁹ the ratio is within 1% of a finite limit.
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 4 })), {
          minLength: 1,
          maxLength: 3,
        }),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 4 })), {
          minLength: 1,
          maxLength: 3,
        }),
        (ft, gt) => {
          const text = (ts: [number, number][]) => ts.map(([k, a]) => `${k}n^${a}`).join(' + ');
          const f = exprOf((parseExpr(text(ft)) as { text: string }).text);
          const g = exprOf((parseExpr(text(gt)) as { text: string }).text);
          const lim = limitOf(f, g);
          const n = 10n ** 9n;
          const at = (e: typeof f) =>
            e.terms.reduce((s, t) => s + (t.k.n * n ** BigInt(t.a)) / t.k.d, 0n);
          const ratio = Number((at(f) * 10n ** 6n) / at(g)) / 1e6;
          if (lim.kind === 'zero') expect(ratio).toBeLessThan(1e-3);
          else if (lim.kind === 'inf') expect(ratio).toBeGreaterThan(1e3);
          else {
            const v = Number(lim.value.n) / Number(lim.value.d);
            expect(Math.abs(ratio - v) / v).toBeLessThan(0.01);
          }
        },
      ),
    );
  });

  it('keeps every step consistent and every drawing inside its frame', () => {
    const call = fc.oneof(
      fc.constantFrom(...PAIRS.map((p) => p.id)).map(compareCall),
      fc
        .tuple(constArb, constArb, fc.integer({ min: 0, max: 210 }))
        .map(([a, b, n]) => ['check', `${a} ${b} ${n}`] as OpCall),
      fc
        .tuple(constArb, fc.integer({ min: 0, max: 210 }))
        .map(([a, n]) => ['check', `${a} ${n}`] as OpCall),
      constArb.map((a) => ['find', a] as OpCall),
      fc.tuple(constArb, constArb).map(([a, b]) => ['find', `${a} ${b}`] as OpCall),
      fc.constant<OpCall>(['limit']),
      fc.constantFrom<OpCall>(
        ['compare', 'n^3 + 2n ; 5n^2 log n'],
        ['compare', 'log n ; 1'],
        ['compare', 'n ; n - 100'],
      ),
    );
    const inFrame = (scene: ReturnType<typeof bigODefinition.view>) => {
      const b = scene.bounds;
      for (const sh of scene.shapes) {
        const pts =
          sh.kind === 'arrow'
            ? [
                [sh.x1, sh.y1],
                [sh.x2, sh.y2],
              ]
            : sh.kind === 'polygon'
              ? sh.points.map((p) => [p.x, p.y])
              : [[sh.x, sh.y]];
        for (const [x, y] of pts) {
          expect(Number.isFinite(x) && Number.isFinite(y), sh.id).toBe(true);
          expect(
            x! >= b.x - 1 && x! <= b.x + b.w + 1 && y! >= b.y - 1 && y! <= b.y + b.h + 1,
            sh.id,
          ).toBe(true);
        }
      }
    };
    fc.assert(
      fc.property(
        relArb,
        rangeArb,
        fc.constantFrom('auto', 'linear', 'log'),
        fc.array(call, { maxLength: 8 }),
        (relation, range, scale, calls) => {
          const s = settings({ relation, range, scale: scale as DefSettings['scale'] });
          const N = Number(range);
          const t = new Timeline(bigODefinition, s, 1, calls);
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const st = step.state;
            if (st.n0 !== null) expect(st.n0 >= 1 && st.n0 <= N).toBe(true);
            const v = step.vars!;
            expect(v['n₀']).toBe(st.n0 ?? '—');
            if (relation === 'O') expect(v.c).toBe(st.hi ?? '—');
            if (relation === 'Omega') expect(v.c).toBe(st.lo ?? '—');
            if (relation === 'Theta')
              expect([v['c₁'], v['c₂']]).toEqual([st.lo ?? '—', st.hi ?? '—']);
            inFrame(bigODefinition.view(step, s, { w: 360, h: 536 }));
          }
        },
      ),
      { numRuns: 120 },
    );
    // Every menu pair, range and scale, at the end of a check and the limit test: the extremes
    // (n! and 2ⁿ at n = 200 on a linear axis) are where a double would overflow.
    for (const p of PAIRS)
      for (const range of RANGES)
        for (const scale of ['auto', 'linear', 'log'] as const) {
          const s = settings({ range, scale });
          const t = new Timeline(bigODefinition, s, 1, [
            compareCall(p.id),
            ['check', '1 1'],
            ['limit'],
          ]);
          for (const stage of [undefined, { w: 880, h: 384 }, { w: 360, h: 536 }])
            inFrame(bigODefinition.view(t.at(t.length - 1).step, s, stage));
        }
  });

  it('samples every n for short ranges and at most 61 points for long ones', () => {
    expect(samples(20)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(samples(200).length).toBeLessThanOrEqual(61);
    expect(samples(200).at(-1)).toBe(200);
  });
});
