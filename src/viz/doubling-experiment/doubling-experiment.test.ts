import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { doublingExperiment as def, parseN } from '.';
import {
  ALGO,
  ALGOS,
  MISSING,
  VALUE_MAX,
  binarySearch,
  choose3,
  count,
  distinctValues,
  insertionCount,
  insertionSort,
  linearSearch,
  makeInput,
  median,
  mergeSort,
  noisy,
  spread,
  threeSum,
  type AlgoId,
} from './algos';
import {
  MAX_ROWS,
  REPEATS,
  aText,
  bOf,
  errorText,
  fix2,
  ratios,
  sizesText,
  type DxSettings,
  type DxState,
} from './model';
import { nShort } from './view';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (s: Partial<DxSettings> = {}): DxSettings =>
  ({ ...def.defaults, ...s }) as DxSettings;

const runFrom = (s: DxSettings, n: number, seed = 1) => new Timeline(def, s, seed, [['run', n]]);

const bsOf = (st: DxState) => ratios(st.rows).map((r) => r.b);

/** Random inputs in the page's range, small enough to check against slow references. */
const inputArb = (max: number) =>
  fc
    .array(fc.integer({ min: -VALUE_MAX, max: VALUE_MAX }), { minLength: 1, maxLength: max })
    .map((xs) => Int32Array.from(xs));

/** Inputs with many repeats, to test ties in the sorts and hits in the hash set. */
const tiesArb = (max: number) =>
  fc
    .array(fc.integer({ min: -3, max: 3 }), { minLength: 1, maxLength: max })
    .map((xs) => Int32Array.from(xs));

// ----- References, written apart from the instrumented code -----

/** Insertion sort's comparisons from the pairs: item j passes every bigger earlier item, then
 * stops at a smaller-or-equal one unless it reaches the front. */
function insertionReference(a: Int32Array): number {
  let total = 0;
  for (let j = 1; j < a.length; j++) {
    let bigger = 0;
    for (let i = 0; i < j; i++) if (a[i]! > a[j]!) bigger++;
    total += bigger + (bigger < j ? 1 : 0);
  }
  return total;
}

/**
 * Merge sort's comparisons from sorted halves. Merging left L and right R compares until one
 * side runs out; the left side runs out first when max(L) ≤ max(R) (ties go to the left), and
 * what is left over then is every item of R at least max(L). Comparisons = |L| + |R| − leftover.
 */
function mergeReference(a: number[]): number {
  if (a.length < 2) return 0;
  const mid = Math.floor(a.length / 2);
  const l = a.slice(0, mid);
  const r = a.slice(mid);
  const inner = mergeReference(l) + mergeReference(r);
  const maxL = Math.max(...l);
  const maxR = Math.max(...r);
  const leftover =
    maxL <= maxR ? r.filter((x) => x >= maxL).length : l.filter((x) => x > maxR).length;
  return inner + a.length - leftover;
}

/** The hash set with BigInt arithmetic for the hash, a Map for the table. */
function hashReference(a: Int32Array): { steps: number; distinct: number } {
  let bits = 1;
  while (2 ** bits < 2 * a.length) bits++;
  const size = 2 ** bits;
  const table = new Map<number, number>();
  let steps = 0;
  for (const x of a) {
    const h = (BigInt(x) * 2654435761n) & 0xffffffffn;
    let slot = Number(h >> BigInt(32 - bits));
    for (;;) {
      steps++;
      if (!table.has(slot)) {
        table.set(slot, x);
        break;
      }
      if (table.get(slot) === x) break;
      slot = (slot + 1) % size;
    }
  }
  return { steps, distinct: table.size };
}

const floorLog2 = (n: number) => 31 - Math.clz32(n);

describe('the instrumented algorithms', () => {
  it('linear search for a missing value compares every item: n', () => {
    fc.assert(
      fc.property(inputArb(300), (a) => {
        expect(linearSearch(a)).toBe(a.length);
      }),
    );
    // A value that is there stops it early.
    expect(linearSearch(Int32Array.from([5, 7, 9]), 7)).toBe(2);
  });

  it('binary search for a missing value halves until nothing is left: ⌊log₂ n⌋ + 1', () => {
    fc.assert(
      fc.property(inputArb(300), (a) => {
        a.sort();
        expect(binarySearch(a)).toBe(floorLog2(a.length) + 1);
      }),
    );
    for (const n of [1, 2, 3, 7, 8, 1000, 1024, 1_000_000])
      expect(binarySearch(makeInput(n, 9, true)), `n = ${n}`).toBe(floorLog2(n) + 1);
  });

  it('the hash set looks at the slots a plain reference looks at, and keeps every value once', () => {
    for (const arb of [inputArb(400), tiesArb(60)])
      fc.assert(
        fc.property(arb, (a) => {
          const ref = hashReference(a);
          expect(distinctValues(a)).toBe(ref.steps);
          expect(ref.distinct).toBe(new Set(a).size);
          expect(ref.steps).toBeGreaterThanOrEqual(a.length);
        }),
      );
  });

  it('merge sort sorts, and makes the comparisons the merge of sorted halves needs', () => {
    for (const arb of [inputArb(300), tiesArb(80)])
      fc.assert(
        fc.property(arb, (a) => {
          const plain = [...a];
          const steps = mergeSort(a);
          expect([...a]).toEqual([...plain].sort((p, q) => p - q));
          expect(steps).toBe(mergeReference(plain));
          // Each merge of k items makes at least k/2 and at most k − 1 comparisons.
          expect(steps).toBeLessThanOrEqual(plain.length * Math.ceil(Math.log2(plain.length || 1)));
        }),
      );
  });

  it('insertion sort sorts, and its count matches the pairs and the fast count', () => {
    for (const arb of [inputArb(200), tiesArb(80)])
      fc.assert(
        fc.property(arb, (a) => {
          const plain = Int32Array.from(a);
          const fast = insertionCount(plain);
          const steps = insertionSort(a);
          expect([...a]).toEqual([...plain].sort((p, q) => p - q));
          expect(steps).toBe(insertionReference(plain));
          expect(fast).toBe(steps);
        }),
      );
    // Sorted input: one comparison per item after the first. Reversed: every pair.
    const up = Int32Array.from({ length: 50 }, (_, i) => i);
    expect(insertionSort(Int32Array.from(up))).toBe(49);
    expect(insertionSort(up.reverse())).toBe((50 * 49) / 2);
  });

  it('brute-force 3-sum checks every triple: n(n − 1)(n − 2)/6', () => {
    fc.assert(
      fc.property(inputArb(60), (a) => {
        const { steps, triples } = threeSum(a);
        expect(steps).toBe(choose3(a.length));
        expect(ALGO.threesum.fast!(a)).toBe(steps);
        let ref = 0;
        for (let i = 0; i < a.length; i++)
          for (let j = i + 1; j < a.length; j++)
            for (let k = j + 1; k < a.length; k++) if (a[i]! + a[j]! + a[k]! === 0) ref++;
        expect(triples).toBe(ref);
      }),
    );
  });

  it('counts what the instrumented algorithm counts on the seeded input, for every algorithm', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALGOS),
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 1, max: 999_999 }),
        (id, n, seed) => {
          const al = ALGO[id];
          if (n < al.minN) return;
          expect(count(id, n, seed)).toBe(al.run(makeInput(n, seed, al.sorted)));
          expect(count(id, n, seed)).toBeGreaterThan(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('makes the same input from the same seed, in range, and a different one from another', () => {
    const a = makeInput(1000, 42);
    expect([...makeInput(1000, 42)]).toEqual([...a]);
    expect([...makeInput(1000, 43)]).not.toEqual([...a]);
    expect(Math.max(...a)).toBeLessThanOrEqual(VALUE_MAX);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(-VALUE_MAX);
    expect([...a]).not.toContain(MISSING);
    // Size n of seed s is n values from makeRng(s + n), as the code tabs' drivers make them.
    const rng = makeRng(47);
    expect([...makeInput(5, 42)]).toEqual(
      Array.from({ length: 5 }, () => rng.int(-VALUE_MAX, VALUE_MAX)),
    );
  });
});

describe('doubling experiments', () => {
  it('measure n, 2n, 4n, … up to the largest n or eight sizes', () => {
    const t = runFrom(settings({ algo: 'insertion' }), 100);
    const s = t.endState();
    expect(s.sizes).toEqual([100, 200, 400, 800, 1600, 3200, 6400, 12800]);
    expect(s.rows.map((r) => r.n)).toEqual(s.sizes);
    expect(runFrom(settings({ algo: 'threesum' }), 200).endState().sizes).toEqual([200, 400, 800]);
    // One size only: no ratio, no fit, and the reading says why.
    const one = runFrom(settings({ algo: 'threesum' }), 600);
    expect(one.endState().rows).toHaveLength(1);
    expect(one.endState().fit).toBeNull();
    expect(one.entries[0]!.steps.at(-1)!.say).toContain('Start smaller to get a ratio.');
  });

  it('gives one step per size, then the fit, then the reading', () => {
    const t = runFrom(settings(), 100);
    const steps = t.entries[0]!.steps;
    expect(steps).toHaveLength(1 + MAX_ROWS + 2);
    expect(steps.slice(1, 1 + MAX_ROWS).map((s) => s.state.rows.length)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(steps.at(-2)!.lines).toEqual(['run.fit']);
    expect(steps.at(-1)!.level).toBe(1);
    const row3 = steps[4]!;
    const b = bOf(row3.state.rows[2]!.t, row3.state.rows[3]!.t);
    expect(row3.vars?.b).toBe(fix2(b));
    expect(row3.say).toContain(`b = log₂`);
    expect(row3.marks.map((m) => m.id)).toEqual(['t-row-3', 'p-pt-3', 'p-seg-3']);
  });

  it('reads exact powers exactly: linear search b = 1, and 3-sum ratios fall toward 8', () => {
    const lin = runFrom(settings({ algo: 'linear' }), 1000).endState();
    expect(lin.rows.map((r) => r.t)).toEqual(lin.sizes);
    for (const b of bsOf(lin)) expect(b).toBe(1);
    expect(lin.fit).toEqual({ a: 1, b: 1 });

    // C(2n, 3) / C(n, 3) = 8 (2n − 1)(2n − 2) / (4 (n − 1)(n − 2)) > 8, falling to 8.
    const tri = runFrom(settings({ algo: 'threesum' }), 3).endState();
    const bs = bsOf(tri);
    for (let k = 1; k < bs.length; k++) expect(bs[k]!).toBeLessThan(bs[k - 1]!);
    for (const b of bs) expect(b).toBeGreaterThan(3);
    // From n = 192 to 384, b = log₂(2 · 383 · 382 / (191 · 190)) ≈ 3.0113.
    expect(bs.at(-1)!).toBeCloseTo(Math.log2((2 * 383 * 382) / (191 * 190)), 10);
    expect(bs.at(-1)! - 3).toBeLessThan(0.02);
  });

  it('estimates b near 2 for insertion sort once n is large, whatever the seed', () => {
    // Insertion sort on random distinct input makes n²/4 + O(n) comparisons on average, with a
    // standard deviation of about n^1.5/6 (the inversions'). At n = 6,400 and 12,800 that is
    // under 1% of the count, so b = log₂ of their ratio is within about 0.03 of 2 (two standard
    // deviations); 0.1 leaves room for the seed and the O(n) term. At n = 4 to 8 the counts
    // are a handful and b strays far more, which is the point of the page.
    let small = 0;
    let large = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const fromSmall = bsOf(runFrom(settings(), 4, seed).endState());
      const fromLarge = bsOf(runFrom(settings(), 100, seed).endState());
      expect(Math.abs(fromLarge.at(-1)! - 2), `seed ${seed}`).toBeLessThan(0.1);
      small += Math.abs(fromSmall[0]! - 2);
      large += Math.abs(fromLarge.at(-1)! - 2);
    }
    expect(large).toBeLessThan(small / 4);
  });

  it('estimates b near 1 for the hash set and the linear search at large n', () => {
    // The table doubles whenever n does, so the load and the slots per value stay about the
    // same: ratios near 2. Duplicates (n / 4 million of the values at most) barely move them.
    for (let seed = 1; seed <= 6; seed++) {
      const bs = bsOf(runFrom(settings({ algo: 'hash' }), 1000, seed).endState());
      expect(Math.abs(bs.at(-1)! - 1), `seed ${seed}`).toBeLessThan(0.1);
    }
  });

  it('shows log factors as a b that keeps sliding: merge sort above 1, binary search above 0', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const merge = bsOf(runFrom(settings({ algo: 'merge' }), 1000, seed).endState());
      // n log₂ n − 1.25n gives b = 1.16 at 1,000 and 1.09 at 128,000; random input moves the
      // counts by well under 1%.
      expect(merge[0]!).toBeGreaterThan(1.12);
      expect(merge.at(-1)!).toBeGreaterThan(1.05);
      expect(merge.at(-1)!).toBeLessThan(merge[0]! - 0.03);
    }
    const binary = bsOf(runFrom(settings({ algo: 'binary' }), 1).endState());
    expect(binary.map(fix2)).toEqual(['1.00', '0.58', '0.42', '0.32', '0.26', '0.22', '0.19']);
  });

  it("quotes merge sort's own b values in the concept check", () => {
    const merge = bsOf(runFrom(settings({ algo: 'merge' }), 1000).endState()).map(fix2);
    const quoted = /Merge sort's b reads ([\d., ]+) as n doubles from 1,000 to 32,000/.exec(
      def.explain,
    )![1]!;
    // 1,000 to 32,000 is five doublings.
    expect(quoted.split(', ')).toEqual(merge.slice(0, 5));
  });

  it('fits through the last row, or by least squares through all of them', () => {
    const last = runFrom(settings({ algo: 'threesum' }), 3).endState();
    const end = last.rows.at(-1)!;
    expect(last.fit!.b).toBeCloseTo(bsOf(last).at(-1)!, 12);
    expect(last.fit!.a * end.n ** last.fit!.b).toBeCloseTo(end.t, 3);
    const all = runFrom(settings({ algo: 'threesum', fit: 'all' }), 3).endState();
    // The small sizes, with ratios far above 8, pull the least-squares slope up.
    expect(all.fit!.b).toBeGreaterThan(last.fit!.b + 0.1);
    // On exact powers both fits agree.
    const lin = runFrom(settings({ algo: 'linear', fit: 'all' }), 10).endState();
    expect(lin.fit!.b).toBeCloseTo(1, 12);
    expect(lin.fit!.a).toBeCloseTo(1, 10);
  });

  it('predicts from the model and checks on the same seed', () => {
    const t = new Timeline(def, settings(), 1, [
      ['run', 100],
      ['predict', 20000],
    ]);
    const s = t.endState();
    const g = s.guess!;
    expect(g.guess).toBeCloseTo(s.fit!.a * 20000 ** s.fit!.b, 3);
    expect(g.t).toBe(count('insertion', 20000, s.seed!));
    expect(Math.abs(g.guess - g.t!) / g.t!).toBeLessThan(0.05);
    const steps = t.entries[1]!.steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]!.state.guess!.t).toBeNull();
    expect(steps[1]!.vars?.error).toBe(errorText(g.guess, g.t!));
    // A size already in the table reads the same count.
    const again = new Timeline(def, settings(), 1, [
      ['run', 100],
      ['predict', 3200],
    ]).endState();
    expect(again.guess!.t).toBe(again.rows[5]!.t);
  });

  it('turns bad input away and leaves the table alone', () => {
    const t = new Timeline(def, settings({ algo: 'threesum' }), 1, [
      ['predict', 100],
      ['run', 2],
      ['run', 1001],
      ['run', 10],
      ['predict', 'x'],
      ['predict', 5000],
    ]);
    const says = t.entries.map((e) => e.steps.at(-1)!.say);
    expect(says[0]).toContain('Run an experiment first');
    expect(says[1]).toContain('Pick a starting n from 3 to 1,000 for brute-force 3-sum.');
    expect(says[2]).toContain('Nothing changed.');
    expect(says[4]).toContain('Pick n from 3 to 1,000');
    expect(says[5]).toContain('Nothing changed.');
    for (const k of [0, 1, 2, 4, 5]) expect(t.entries[k]!.steps).toHaveLength(1);
    expect(t.entries[5]!.end).toBe(t.entries[3]!.end);
  });
});

describe('timing noise', () => {
  const noisyRun = (noise: DxSettings['noise'], seed: number, algo: AlgoId = 'insertion') =>
    new Timeline(def, settings({ algo, noise }), seed, [
      ['run', 10],
      ['predict', 5000],
    ]).endState();

  it('is reproducible from the seed, and differs between seeds', () => {
    for (const noise of ['one', 'median'] as const) {
      expect(noisyRun(noise, 7)).toEqual(noisyRun(noise, 7));
      expect(noisyRun(noise, 7).rows.map((r) => r.t)).not.toEqual(
        noisyRun(noise, 8).rows.map((r) => r.t),
      );
    }
    expect(noisy(1000, 5, 64, 2)).toBe(noisy(1000, 5, 64, 2));
  });

  it('changes the readings, never the true counts or the sizes', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const off = noisyRun('off', seed);
      for (const noise of ['one', 'median'] as const) {
        const on = noisyRun(noise, seed);
        expect(on.sizes).toEqual(off.sizes);
        expect(on.rows.map((r) => r.exact)).toEqual(off.rows.map((r) => r.exact));
        expect(on.guess!.exact).toBe(off.guess!.exact);
      }
      for (const r of off.rows) expect(r.t).toBe(r.exact);
    }
  });

  it('takes the median of five readings, the first of which is the one-run reading', () => {
    const one = noisyRun('one', 3);
    const med = noisyRun('median', 3);
    med.rows.forEach((r, k) => {
      expect(r.runs).toHaveLength(REPEATS);
      expect(r.t).toBe(median(r.runs!));
      expect(r.runs![0]).toBe(one.rows[k]!.t);
    });
  });

  it('strays by a factor whose spread shrinks as the runs get longer', () => {
    // Readings are t·e^(σz) with z a standard normal: within 5σ every time, in practice.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e8 }),
        fc.integer({ min: 1, max: 999_999 }),
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 0, max: 4 }),
        (t, seed, n, rep) => {
          const r = noisy(t, seed, n, rep);
          expect(r).toBeGreaterThanOrEqual(1);
          expect(Math.abs(Math.log(r / t))).toBeLessThan(5 * spread(t) + 1 / t);
        },
      ),
    );
    expect(spread(10)).toBeGreaterThan(0.4);
    expect(spread(1e7)).toBeLessThan(0.03);
  });
});

describe('every step', () => {
  const settingsArb = fc.record({
    algo: fc.constantFrom(...ALGOS),
    noise: fc.constantFrom('off' as const, 'one' as const, 'median' as const),
    fit: fc.constantFrom('last' as const, 'all' as const),
  });
  const callArb = fc.oneof(
    fc.integer({ min: 0, max: 1200 }).map((n) => ['run', n] as OpCall),
    fc.integer({ min: 0, max: 40000 }).map((n) => ['predict', n] as OpCall),
  );

  it('keeps the table, the fit and the frame consistent with the readings', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(callArb, { maxLength: 6 }),
        fc.integer({ min: 1, max: 1000 }),
        (st, calls, seed) => {
          const al = ALGO[st.algo];
          const t = new Timeline(def, st, seed, calls);
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s = step.state;
            expect(s.rows.length).toBeLessThanOrEqual(s.sizes.length);
            expect(s.sizes.length).toBeLessThanOrEqual(MAX_ROWS);
            s.sizes.forEach((n, k) => {
              expect(n).toBeGreaterThanOrEqual(al.minN);
              expect(n).toBeLessThanOrEqual(al.maxN);
              if (k) expect(n).toBe(2 * s.sizes[k - 1]!);
            });
            if (s.sizes.length)
              expect(2 * s.sizes.at(-1)! > al.maxN || s.sizes.length === MAX_ROWS).toBe(true);
            s.rows.forEach((r, k) => {
              expect(r.n).toBe(s.sizes[k]);
              expect(r.exact).toBe(count(st.algo, r.n, s.seed!));
              if (st.noise === 'off') expect(r.t).toBe(r.exact);
              if (st.noise === 'median') expect(r.t).toBe(median(r.runs!));
            });
            if (s.fit) {
              expect(s.rows.length).toBe(s.sizes.length);
              expect(s.rows.length).toBeGreaterThanOrEqual(2);
            }
            // The frame holds every point drawn: the rows, the guess and its check.
            const pts = s.rows.map((r) => [r.n, r.t] as const);
            if (s.guess) pts.push([s.guess.n, s.guess.guess]);
            if (s.guess?.t) pts.push([s.guess.n, s.guess.t]);
            for (const [n, v] of pts) {
              expect(Math.log2(n)).toBeGreaterThanOrEqual(s.axes.x0);
              expect(Math.log2(n)).toBeLessThanOrEqual(s.axes.x1);
              expect(Math.log10(v)).toBeGreaterThanOrEqual(s.axes.y0 - 1e-9);
              expect(Math.log10(v)).toBeLessThanOrEqual(s.axes.y1 + 1e-9);
            }
            if (s.guess) {
              expect(s.fit).not.toBeNull();
              expect(s.guess.guess).toBeCloseTo(s.fit!.a * s.guess.n ** s.fit!.b, 6);
            }
            if (step.vars?.b !== undefined && s.rows.length >= 2 && !s.fit) {
              const r = s.rows;
              expect(step.vars.b).toBe(fix2(bOf(r.at(-2)!.t, r.at(-1)!.t)));
            }
          }
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe('text', () => {
  it('reads n with or without commas, from 1 to a million', () => {
    expect(parseN('1,000')).toBe(1000);
    expect(parseN('20000')).toBe(20000);
    expect(parseN('0')).toBeInstanceOf(Error);
    expect(parseN('1000001')).toBeInstanceOf(Error);
    expect(parseN('ten')).toBeInstanceOf(Error);
  });

  it('writes sizes, coefficients and errors briefly', () => {
    expect(sizesText([100, 200, 400])).toBe('100, 200 and 400');
    expect(sizesText([1, 2, 4, 8, 16])).toBe('1, 2, 4, …, 16');
    expect(nShort(800)).toBe('800');
    expect(nShort(1600)).toBe('1.6k');
    expect(nShort(12800)).toBe('12.8k');
    expect(nShort(128000)).toBe('128k');
    expect(nShort(1_000_000)).toBe('1M');
    expect(aText(0.28512)).toBe('0.285');
    expect(aText(5.1449)).toBe('5.14');
    expect(aText(3.1e-7)).toBe('3.1e-7');
    expect(errorText(99, 100)).toBe('1.0% low');
    expect(errorText(330, 100)).toBe('3.3 times too high');
    expect(errorText(100, 100)).toBe('spot on');
    expect(fix2(-0.25)).toBe('−0.25');
  });
});

describe('practice', () => {
  // "Which algorithm made this table?" offered linear search and the hash set side by side; both
  // grow like n, so only the exact counts told them apart.
  it('never offers a look-alike that grows like the right answer', () => {
    const kind = def.practice!.find((k) => k.id === 'which')!;
    const byLabel = new Map(ALGOS.map((id) => [ALGO[id].label, id]));
    const right = new Map<AlgoId, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const a = kind.make(makeRng(seed)).answer;
      if (a.kind !== 'choice') throw new Error('expected a choice');
      const ids = a.options.map((o) => byLabel.get(o)!);
      const answer = ids[a.correct]!;
      for (const id of ids) {
        if (id !== answer) expect(ALGO[id].order).not.toBe(ALGO[answer].order);
      }
      right.set(answer, (right.get(answer) ?? 0) + 1);
    }
    // Six algorithms, about 50 each; none should come up more than a third of the time.
    expect(right.size).toBe(ALGOS.length);
    expect(Math.max(...right.values())).toBeLessThan(100);
  });
});

describe('drawn text size', () => {
  // The table title shrank to 8.4 px on a phone; on two lines (or as wide as the chart), at 9.1.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
