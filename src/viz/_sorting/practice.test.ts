/**
 * The practice explanations on the sorting and searching pages state facts (swaps equal
 * inversions, n - 1 merges, the pivot lands after the smaller values...). The answers come from
 * the models; these checks make sure the two agree.
 */
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import type { AnyVizDef, PracticeQuestion } from '../../engine/types';
import { vizzes } from '../all';
import { gapsFor } from '../shell-sort/model';
import { inversions } from './check';

const def = (id: string) => vizzes.find((v) => v.id === id) as AnyVizDef;

/** Every question of one kind over many seeds. */
function questions(id: string, kind: string): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  for (let seed = 1; out.length < 25 && seed < 400; seed++)
    for (const item of practiceSet(def(id), seed, def(id).practice!.length))
      if (item.kind.id === kind) out.push(item.question);
  expect(out.length).toBeGreaterThan(5);
  return out;
}

const loaded = (q: PracticeQuestion) =>
  String(q.setup.find((c) => c[0] === 'load')![1])
    .split(' ')
    .map(Number);

const value = (q: PracticeQuestion) => {
  if (q.answer.kind !== 'number') throw new Error('not a number answer');
  return q.answer.value;
};

describe('sorting practice', () => {
  it('gives every page 3 or 4 kinds of question', () => {
    for (const id of [
      'bubble-sort',
      'cocktail-sort',
      'selection-sort',
      'insertion-sort',
      'shell-sort',
      'merge-sort',
      'quick-sort',
      'quickselect',
      'linear-search',
      'binary-search',
    ]) {
      const n = def(id).practice?.length ?? 0;
      expect(n >= 3 && n <= 4, id).toBe(true);
    }
  });

  it('counts swaps as inversions in cocktail sort', () => {
    for (const q of questions('cocktail-sort', 'swaps'))
      expect(value(q)).toBe(inversions(loaded(q)));
  });

  it('counts n(n - 1)/2 comparisons in selection sort', () => {
    for (const q of questions('selection-sort', 'comparisons')) {
      const n = loaded(q).length;
      expect(value(q)).toBe((n * (n - 1)) / 2);
    }
  });

  it('shifts a key past the bigger values before it in insertion sort', () => {
    for (const q of questions('insertion-sort', 'shifts')) {
      const vs = loaded(q);
      const key = Number(/the key (\d+)/.exec(q.prompt)![1]);
      const i = vs.indexOf(key);
      expect(value(q)).toBe(vs.slice(0, i).filter((v) => v > key).length);
    }
  });

  it("uses the page's own gap rules in Shell sort", () => {
    for (const q of questions('shell-sort', 'gaps')) {
      const rule = q.settings!.gaps as 'shell' | 'knuth' | 'ciura';
      const want = gapsFor(rule, loaded(q).length).map(String);
      expect(q.answer).toEqual({ kind: 'sequence', value: want });
    }
  });

  it('merges n - 1 times in merge sort', () => {
    for (const q of questions('merge-sort', 'merges')) expect(value(q)).toBe(loaded(q).length - 1);
  });

  it('puts the pivot after the smaller values in quicksort and quickselect', () => {
    for (const [id, kind] of [
      ['quick-sort', 'pivot'],
      ['quickselect', 'first-pivot'],
    ] as const) {
      for (const q of questions(id, kind)) {
        const vs = loaded(q);
        expect(value(q)).toBe(vs.filter((v) => v < vs.at(-1)!).length);
      }
    }
  });

  it('checks the index once with a sentinel, and once more than it compares on a miss', () => {
    for (const q of questions('linear-search', 'index-checks')) {
      const vs = loaded(q);
      const x = Number(q.watch![0]![1]);
      const at = vs.indexOf(x);
      const want = q.settings!.sentinel ? 1 : at >= 0 ? at + 1 : vs.length + 1;
      expect(value(q)).toBe(want);
    }
  });

  it('probes at most log n + 1 values in binary search', () => {
    for (const q of questions('binary-search', 'probes')) {
      const n = loaded(q).length;
      if (q.answer.kind !== 'sequence') throw new Error('not a sequence');
      expect(q.answer.value.length).toBeLessThanOrEqual(Math.floor(Math.log2(n)) + 1);
    }
  });
});
