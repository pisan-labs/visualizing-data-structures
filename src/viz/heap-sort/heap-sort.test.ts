import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { AnyVizDef, PracticeQuestion } from '../../engine/types';
import { checkSort, counters, repeatsArb, valuesArb } from '../_sorting/check';
import type { ArrayStep } from '../_sorting/kit';
import { heapSort } from '.';
import type { HeapSortSettings } from './model';
import { heapSizeOf } from './view';

const settings = (s: Partial<HeapSortSettings> = {}): HeapSortSettings =>
  ({ ...heapSort.defaults, ...s }) as HeapSortSettings;

const variants = fc.record({
  index: fc.constantFrom('one' as const, 'zero' as const),
  draw: fc.constantFrom('bars' as const, 'cells' as const),
});

/**
 * CLRS heapsort by hand, on uids, with the same counters: every key comparison in maxHeapify
 * and every exchange. `stages` holds the array after the build and after each sift-down.
 */
function reference(values: number[]) {
  const a = values.map((v, uid) => ({ v, uid }));
  const n = a.length;
  let comparisons = 0;
  let swaps = 0;
  let buildSwaps = 0;
  const stages: number[][] = [];
  const swap = (i: number, j: number) => {
    [a[i], a[j]] = [a[j]!, a[i]!];
    swaps++;
  };
  const heapify = (i: number, size: number) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let largest = i;
      if (l < size) {
        comparisons++;
        if (a[l]!.v > a[i]!.v) largest = l;
      }
      if (r < size) {
        comparisons++;
        if (a[r]!.v > a[largest]!.v) largest = r;
      }
      if (largest === i) return;
      swap(i, largest);
      i = largest;
    }
  };
  if (n >= 2) {
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(i, n);
    buildSwaps = swaps;
    stages.push(a.map((x) => x.v));
    for (let last = n - 1; last >= 1; last--) {
      swap(0, last);
      if (last > 1) {
        heapify(0, last);
        stages.push(a.map((x) => x.v));
      }
    }
  }
  return { uids: a.map((x) => x.uid), comparisons, swaps, buildSwaps, stages };
}

/** Is a[0..size-1] a max-heap? */
function isMaxHeap(vs: number[], size: number): boolean {
  for (let p = 1; p < size; p++) if (vs[Math.floor((p - 1) / 2)]! < vs[p]!) return false;
  return true;
}

/** The sort's steps for these values. */
function sortSteps(values: number[], st: HeapSortSettings): ArrayStep[] {
  const t = new Timeline(heapSort, st, 1, [['load', values.join(' ')], ['sort']]);
  return t.entries[1]!.steps as ArrayStep[];
}

// Property tests run thousands of steps; give them room on a busy machine.
describe('heap sort', { timeout: 60_000 }, () => {
  it('sorts with the same comparisons, swaps and moves as a hand-written CLRS heapsort', () => {
    fc.assert(
      fc.property(variants, fc.oneof(valuesArb(), repeatsArb), (st, values) => {
        const steps = checkSort(heapSort, st, values);
        const ref = reference(values);
        const c = counters(steps);
        expect(c.comparisons ?? 0).toBe(ref.comparisons);
        expect(c.swaps ?? 0).toBe(ref.swaps);
        const t = new Timeline(heapSort, st, 1, [['load', values.join(' ')], ['sort']]);
        const firstUid = t.entries[0]!.end.a[0]?.uid ?? 0;
        expect(t.endState().a.map((x) => x.uid - firstUid)).toEqual(ref.uids);
      }),
      { numRuns: 120 },
    );
  });

  it('keeps a max-heap in front of the sorted part, and shows heapSize, on every milestone', () => {
    fc.assert(
      fc.property(variants, fc.oneof(valuesArb(2), repeatsArb), (st, values) => {
        const steps = sortSteps(values, st);
        const ref = reference(values);
        const n = values.length;
        const milestones = steps.filter((s) => s.level === 1);
        // The build, one per sift-down of phase 2, and the sorted array.
        expect(milestones).toHaveLength(ref.stages.length + 1);
        milestones.slice(0, -1).forEach((m, k) => {
          const vs = m.state.a.map((x) => x.value);
          expect(vs).toEqual(ref.stages[k]);
          const size = heapSizeOf(m);
          expect(size).toBe(n - k);
          expect(m.vars?.heapSize).toBe(size);
          expect(isMaxHeap(vs, size)).toBe(true);
          // Everything past the heap is the largest values, in order.
          const sorted = [...values].sort((x, y) => x - y);
          expect(vs.slice(size)).toEqual(sorted.slice(size));
        });
        expect(heapSizeOf(milestones.at(-1)!)).toBe(0);
      }),
      { numRuns: 120 },
    );
  });

  it('never lets a value in the sorted part move, and only compares within the heap', () => {
    fc.assert(
      fc.property(variants, fc.oneof(valuesArb(2), repeatsArb), (st, values) => {
        const steps = sortSteps(values, st);
        let prev = steps[0]!;
        for (const step of steps) {
          const size = heapSizeOf(step);
          const before = heapSizeOf(prev);
          // heapSize only shrinks, one slot at a time.
          expect(before - size === 0 || before - size === 1 || size === 0).toBe(true);
          // Slots past the heap (both before and after this step) keep their values.
          for (let p = Math.max(size, before); p < values.length; p++)
            expect(step.state.a[p]!.uid).toBe(prev.state.a[p]!.uid);
          // Compared values sit inside the heap.
          for (const m of step.marks.filter((m) => m.role === 'compare')) {
            const p = step.state.a.findIndex((x) => `v${x.uid}` === m.id);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThan(size);
          }
          prev = step;
        }
      }),
      { numRuns: 80 },
    );
  });

  it('shows every comparison once, at level 3, and every swap at level 2 or above', () => {
    const steps = sortSteps([4, 1, 3, 2, 16, 9, 10, 14, 8, 7], settings());
    const questions = steps.filter((s) => /Is A\[\d+\] = \d+ bigger than/.test(s.say));
    expect(questions).toHaveLength(steps.at(-1)!.vars!.comparisons as number);
    expect(questions.every((s) => s.level === 3)).toBe(true);
    const swaps = steps.filter((s) => s.lines.includes('mh.swap') || s.lines.includes('swap'));
    expect(swaps.every((s) => s.level <= 2)).toBe(true);
  });

  it('matches the curated examples', () => {
    const end = (values: string, st = settings()) =>
      sortSteps(values.split(' ').map(Number), st).at(-1)!;
    expect(end('4 1 3 2 16 9 10 14 8 7').say).toContain('42 comparisons and 30 swaps');
    expect(end('10 20 30 40 50 60 70').say).toContain('21 comparisons and 16 swaps');
    expect(end('70 60 50 40 30 20 10').say).toContain('18 comparisons and 11 swaps');
    expect(end('40 40 40 40 40 40 40').say).toContain('15 comparisons and 6 swaps');
    expect(end('9 7 7 3 5 1').say).toContain('The two 7s ended up in the opposite order');
    const build = (values: string) =>
      sortSteps(values.split(' ').map(Number), settings()).find((s) => s.level === 1)!.say;
    expect(build('4 1 3 2 16 9 10 14 8 7')).toContain(
      'Building it took 14 comparisons and 7 swaps',
    );
    expect(build('10 20 30 40 50 60 70')).toContain('8 comparisons and 4 swaps');
    expect(build('70 60 50 40 30 20 10')).toContain('6 comparisons and no swaps');
  });

  it('follows the indexing setting in its pseudocode and narration', () => {
    const text = (s: Partial<HeapSortSettings>) =>
      heapSort.pseudocode(settings(s))[0]!.lines.map((l) => l.text);
    expect(text({})).toContain('l = 2i; r = 2i + 1');
    expect(text({})).toContain('for i = ⌊n/2⌋ downto 1');
    expect(text({ index: 'zero' })).toContain('l = 2i + 1; r = 2i + 2');
    expect(text({ index: 'zero' })).toContain('swap A[0] and A[last]');
    const first = (index: 'one' | 'zero') => sortSteps([3, 1, 2], settings({ index }))[0]!.say;
    expect(first('one')).toContain('A[2..3] are leaves');
    expect(first('zero')).toContain('A[1..2] are leaves');
  });
});

describe('heap sort practice', () => {
  const def = heapSort as unknown as AnyVizDef;

  /** Every question of one kind over many seeds. */
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 400; seed++)
      for (const item of practiceSet(def, seed, heapSort.practice!.length))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }

  const loaded = (q: PracticeQuestion) =>
    String(q.setup.find((c) => c[0] === 'load')![1])
      .split(' ')
      .map(Number);

  it('has 3 or 4 kinds of question', () => {
    expect(heapSort.practice!.length).toBeGreaterThanOrEqual(3);
    expect(heapSort.practice!.length).toBeLessThanOrEqual(4);
  });

  it('answers the build question with the reference heap', () => {
    for (const q of questions('build')) {
      expect(q.answer).toEqual({
        kind: 'sequence',
        value: reference(loaded(q)).stages[0]!.map(String),
      });
    }
  });

  it('counts the swaps of the build like the reference', () => {
    for (const q of questions('build-swaps'))
      expect(q.answer).toEqual({ kind: 'number', value: reference(loaded(q)).buildSwaps });
  });

  it('starts the first-pass question from a max-heap and answers with the first sift-down', () => {
    for (const q of questions('first-pass')) {
      const vs = loaded(q);
      expect(isMaxHeap(vs, vs.length)).toBe(true);
      const ref = reference(vs);
      // The build changes nothing on a heap.
      expect(ref.buildSwaps).toBe(0);
      expect(q.answer).toEqual({ kind: 'sequence', value: ref.stages[1]!.map(String) });
      expect(q.explain).toMatch(/sinks (one level|\d+ levels)/);
    }
  });

  it('says which equal value comes first, as the reference does', () => {
    for (const q of questions('stable')) {
      const vs = loaded(q);
      const ref = reference(vs);
      const twin = vs.find((v, k) => vs.indexOf(v) !== k)!;
      const [i, j] = [vs.indexOf(twin), vs.lastIndexOf(twin)];
      const kept = ref.uids.indexOf(i) < ref.uids.indexOf(j);
      if (q.answer.kind !== 'choice') throw new Error('not a choice');
      expect(q.answer.options[q.answer.correct]).toContain(`started in A[${kept ? i : j}]`);
    }
  });
});

describe('drawn text size', () => {
  // The tree's indices were 16 units (8 px on a phone next to 15 bars): now 19.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(heapSort, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(heapSort, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
