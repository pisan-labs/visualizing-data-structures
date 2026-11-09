import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { PracticeQuestion } from '../../engine/types';
import { checkSortStep } from '../_sorting/check';
import { valuesOf } from '../_sorting/kit';
import { countingSort } from '.';
import { RANGE, type CountSettings, type CountStep } from './model';

const settings = (draw: CountSettings['draw'] = 'bars'): CountSettings => ({ draw });

const valuesArb = fc.array(fc.integer({ min: 0, max: RANGE.hi }), { minLength: 1, maxLength: 20 });

const run = (values: number[], draw: CountSettings['draw'] = 'bars') =>
  new Timeline(countingSort, settings(draw), 1, [['load', values.join(' ')], ['sort']]);

describe('counting sort', { timeout: 60_000 }, () => {
  it('sorts like the built-in sort, stably, with the right counts at every stage', () => {
    fc.assert(
      fc.property(valuesArb, fc.constantFrom('bars' as const, 'cells' as const), (values, draw) => {
        const t = run(values, draw);
        const loaded = t.entries[0]!.end.a;
        const steps = t.entries[1]!.steps as CountStep[];
        // The reference: a stable sort by value, which also gives each copy's final place.
        const order = loaded
          .map((x, i) => ({ x, i }))
          .sort((p, q) => p.x.value - q.x.value || p.i - q.i)
          .map((p) => p.x.uid);
        const k = Math.max(...values);
        const count = (v: number) => values.filter((x) => x === v).length;
        const upTo = (v: number) => values.filter((x) => x <= v).length;
        for (const step of steps) {
          // The shared checks: nothing lost or duplicated, done marks and regions right. C's
          // pointer is left out, since C can be longer than A.
          checkSortStep(
            {
              ...step,
              extra: {
                ...step.extra,
                pointers: step.extra?.pointers?.filter((p) => p.row !== 'c'),
              },
            },
            values,
          );
          const C = step.extra?.counts?.values;
          if (C) expect(C).toHaveLength(k + 1);
          if (C && step.level === 1 && step.lines.includes('count'))
            C.forEach((c, v) => expect(c, `C[${v}] after counting`).toBe(count(v)));
          if (C && step.level === 1 && step.lines.includes('prefix') && k > 0)
            C.forEach((c, v) => expect(c, `C[${v}] after the sums`).toBe(upTo(v)));
          // Each value lands in B at the place a stable sort gives it.
          (step.extra?.aux?.items ?? []).forEach((x, p) => {
            if (x && !x.stale) expect(order.indexOf(x.uid), `B[${p}]`).toBe(p);
          });
        }
        const end = t.endState();
        expect(valuesOf(end)).toEqual([...values].sort((a, b) => a - b));
        expect(end.a.map((x) => x.uid)).toEqual(order);
        expect(steps.at(-1)!.vars).toMatchObject({ comparisons: 0, steps: 3 * values.length + k });
      }),
      { numRuns: 150 },
    );
  });

  it('does not claim every other sort on the site compares values (radix sort does not)', () => {
    expect(countingSort.explain).not.toContain('Every other sort on this site compares');
  });

  it('turns the counts into the prefix sums for the example values', () => {
    const steps = run([2, 5, 3, 0, 2, 3, 0, 3]).entries[1]!.steps as CountStep[];
    const at = (line: string) =>
      steps.filter((s) => s.level === 1 && s.lines.includes(line)).at(-1)!.extra!.counts!.values;
    expect(at('count')).toEqual([2, 0, 2, 3, 0, 1]);
    expect(at('prefix')).toEqual([2, 2, 4, 7, 7, 8]);
  });

  it('refuses values outside 0 to 20', () => {
    const t = new Timeline(countingSort, settings(), 1, [
      ['load', '3 21'],
      ['load', '-1'],
      ['load', 'x'],
    ]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    expect(t.entries[0]!.steps[0]!.say).toContain('21 is out of range');
  });
});

describe('counting sort practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 500; seed++)
      for (const item of practiceSet(countingSort, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }
  const loaded = (q: PracticeQuestion) => String(q.setup[0]![1]).split(' ').map(Number);

  it('expects the reference counts and prefix sums', () => {
    for (const q of questions('counts')) {
      const vs = loaded(q);
      const want = Array.from({ length: Math.max(...vs) + 1 }, (_, v) =>
        String(vs.filter((x) => x === v).length),
      );
      expect(q.answer).toEqual({ kind: 'sequence', value: want });
    }
    for (const q of questions('prefix')) {
      const vs = loaded(q);
      const want = Array.from({ length: Math.max(...vs) + 1 }, (_, v) =>
        String(vs.filter((x) => x <= v).length),
      );
      expect(q.answer).toEqual({ kind: 'sequence', value: want });
    }
  });

  it('expects the stable sorted position of A[j]', () => {
    for (const q of questions('place')) {
      const vs = loaded(q);
      const j = Number(/A\[(\d+)\] =/.exec(q.prompt)![1]);
      const v = vs[j]!;
      const want = vs.filter((x) => x < v).length + vs.slice(0, j).filter((x) => x === v).length;
      expect(q.answer).toEqual({ kind: 'number', value: want });
    }
  });

  it('names the later copies by their value in the placement explanation', () => {
    let one = 0;
    for (const q of questions('place')) {
      const vs = loaded(q);
      const j = Number(/A\[(\d+)\] =/.exec(q.prompt)![1]);
      const v = vs[j]!;
      const later = vs.slice(j + 1).filter((x) => x === v).length;
      if (later === 1) {
        one++;
        expect(q.explain).toContain(`1 later ${v} in A is placed before it`);
      }
      if (!vs.some((x) => x < v)) expect(q.explain).toMatch(/^No value is smaller/);
    }
    expect(one).toBeGreaterThan(0);
  });

  it('says the earlier copy comes first, since the sort is stable', () => {
    for (const q of questions('stable')) expect(q.answer).toMatchObject({ correct: 0 });
  });
});
