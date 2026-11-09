import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { dpEditDistance } from '.';
import { MAX_LEN, type EditSettings } from './model';

type Costs = Pick<EditSettings, 'ins' | 'del' | 'sub'>;

/** The reference: plain recursion with a memo. */
function refDistance(a: string, b: string, c: Costs) {
  const memo = new Map<string, number>();
  const E = (i: number, j: number): number => {
    if (i === 0) return j * c.ins;
    if (j === 0) return i * c.del;
    const key = `${i},${j}`;
    if (!memo.has(key))
      memo.set(
        key,
        Math.min(
          E(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 0 : c.sub),
          E(i - 1, j) + c.del,
          E(i, j - 1) + c.ins,
        ),
      );
    return memo.get(key)!;
  };
  return E;
}

/** The walk back with the diagonal first, then up, then left, from the reference values. */
function refAlignment(a: string, b: string, c: Costs): string {
  const E = refDistance(a, b, c);
  let i = a.length;
  let j = b.length;
  const ops: string[] = [];
  while (i > 0 || j > 0) {
    const same = i > 0 && j > 0 && a[i - 1] === b[j - 1];
    if (i > 0 && j > 0 && E(i, j) === E(i - 1, j - 1) + (same ? 0 : c.sub)) {
      ops.push(same ? 'M' : 'S');
      i--;
      j--;
    } else if (i > 0 && E(i, j) === E(i - 1, j) + c.del) {
      ops.push('D');
      i--;
    } else {
      ops.push('I');
      j--;
    }
  }
  return ops.reverse().join('');
}

/** Apply the edits to a: they must produce b. Returns their total cost. */
function apply(a: string, b: string, ops: string, c: Costs): number {
  let p = 0;
  let q = 0;
  let cost = 0;
  for (const op of ops) {
    if (op === 'M') expect(a[p++]).toBe(b[q++]);
    else if (op === 'S') {
      expect(a[p++]).not.toBe(b[q++]);
      cost += c.sub;
    } else if (op === 'D') {
      p++;
      cost += c.del;
    } else {
      q++;
      cost += c.ins;
    }
  }
  expect([p, q]).toEqual([a.length, b.length]);
  return cost;
}

const wordArb = fc.string({
  unit: fc.constantFrom('a', 'b', 'c', 'd'),
  minLength: 1,
  maxLength: 7,
});
const costsArb = fc.record({
  ins: fc.integer({ min: 1, max: 5 }),
  del: fc.integer({ min: 1, max: 5 }),
  sub: fc.integer({ min: 1, max: 9 }),
});

const run = (c: Costs, ops: OpCall[]) => new Timeline(dpEditDistance, { ...c }, 1, ops);

describe('edit distance', { timeout: 60_000 }, () => {
  it('fills every cell like the reference and walks back to a cheapest alignment', () => {
    fc.assert(
      fc.property(wordArb, wordArb, costsArb, fc.integer({ min: 0, max: 3 }), (a, b, c, rows) => {
        const t = run(c, [
          ['load', a, b],
          ...Array.from({ length: rows }, () => ['row'] as OpCall),
          ['fill'],
          ['trace'],
        ]);
        const E = refDistance(a, b, c);
        for (let s = 0; s < t.length; s++) {
          const { step } = t.at(s);
          if (step.state.a !== a || step.state.b !== b) continue;
          step.state.d.forEach((r, i) =>
            r.forEach((v, j) => {
              if (v === null) return;
              expect(v, `D[${i}][${j}]`).toBe(E(i, j));
              if (i > 0 && j > 0) {
                expect(step.state.d[i - 1]![j]).not.toBeNull();
                expect(step.state.d[i]![j - 1]).not.toBeNull();
              }
            }),
          );
          // Alignment columns already placed never change, and sit where they end up.
          const cols = step.extra?.columns ?? [];
          for (const { k } of cols) expect(k).toBeLessThan(step.extra!.width!);
        }
        const end = t.entries.at(-1)!.steps.at(-1)!;
        const ops = String(end.vars?.ops);
        expect(end.vars?.distance).toBe(E(a.length, b.length));
        expect(apply(a, b, ops, c)).toBe(E(a.length, b.length));
        expect(ops).toBe(refAlignment(a, b, c));
      }),
      { numRuns: 150 },
    );
  });

  it('matches the examples: kitten, intention, and the effect of the costs', () => {
    const solve = (a: string, b: string, c: Costs = { ins: 1, del: 1, sub: 1 }) =>
      run(c, [['load', a, b], ['fill'], ['trace']])
        .entries.at(-1)!
        .steps.at(-1)!.vars;
    expect(solve('kitten', 'sitting')).toMatchObject({ distance: 3, ops: 'SMMMSMI' });
    expect(solve('intention', 'execution')).toMatchObject({ distance: 5 });
    expect(solve('intention', 'execution', { ins: 1, del: 1, sub: 2 })).toMatchObject({
      distance: 8,
    });
    expect(solve('flaw', 'lawn')).toMatchObject({ distance: 2, ops: 'DMMMI' });
    expect(solve('abc', 'cab')).toMatchObject({ distance: 2 });
    expect(solve('abc', 'cab', { ins: 1, del: 3, sub: 1 })).toMatchObject({
      distance: 3,
      ops: 'SSS',
    });
    expect(solve('a', 'banana')).toMatchObject({ distance: 5, ops: 'IIIIIM' });
  });

  it('lists the edits without a stray comma and says "no matches" for none', () => {
    const last = (a: string, b: string, c: Costs = { ins: 1, del: 1, sub: 1 }) =>
      run(c, [['load', a, b], ['fill'], ['trace']])
        .entries.at(-1)!
        .steps.at(-1)!.say;
    expect(last('intention', 'execution')).toContain(': 5 substitutions and 4 matches.');
    expect(last('kitten', 'sitting')).toContain(': 2 substitutions, 1 insert and 4 matches.');
    expect(last('abc', 'cab', { ins: 1, del: 3, sub: 1 })).toContain(
      ': 3 substitutions and no matches.',
    );
    // With substitutions at 2 the walk still shows some, as the concept page says.
    expect(last('intention', 'execution', { ins: 1, del: 1, sub: 2 })).toContain('3 substitutions');
    expect(dpEditDistance.explain).toContain('so it shows three substitutions');
  });

  it('refuses words it cannot draw and a walk before the table is full', () => {
    const t = run({ ins: 1, del: 1, sub: 1 }, [
      ['trace'],
      ['load', 'two words', 'x'],
      ['load', 'a'.repeat(MAX_LEN + 1), 'b'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/^Fill the table first/);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
  });

  it('puts the costs in its pseudocode', () => {
    const text = dpEditDistance
      .pseudocode({ ins: 2, del: 3, sub: 4 })
      .flatMap((b) => b.lines.map((l) => l.text));
    expect(text).toContain('D[i][j] = min(D[i-1][j-1] + cost, D[i-1][j] + 3, D[i][j-1] + 2)');
    expect(text).toContain('cost = 0 if A[i] == B[j] else 4');
  });
});

describe('edit distance practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 500; seed++)
      for (const item of practiceSet(dpEditDistance, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }
  const words = (q: PracticeQuestion) => [String(q.setup[0]![1]), String(q.setup[0]![2])] as const;
  const costsOf = (q: PracticeQuestion): Costs => ({
    ins: 1,
    del: 1,
    sub: 1,
    ...(q.settings as Partial<Costs>),
  });

  it('expects the reference value of the asked cell', () => {
    for (const q of questions('cell')) {
      const [a, b] = words(q);
      const [, i, j] = /D\[(\d+)\]\[(\d+)\]\?/.exec(q.prompt)!.map(Number);
      expect(q.answer).toEqual({ kind: 'number', value: refDistance(a, b, costsOf(q))(i!, j!) });
    }
  });

  it('expects the edit the reference walk makes at the asked cell', () => {
    for (const q of questions('which-edit')) {
      const [a, b] = words(q);
      const c = costsOf(q);
      const [, i, j] = /reaches D\[(\d+)\]\[(\d+)\]/.exec(q.prompt)!.map(Number);
      // Replay the reference walk to the asked cell.
      const ops = refAlignment(a, b, c);
      let pi = a.length;
      let pj = b.length;
      let op = '';
      for (const o of [...ops].reverse()) {
        if (pi === i && pj === j) {
          op = o;
          break;
        }
        if (o !== 'I') pi--;
        if (o !== 'D') pj--;
      }
      if (q.answer.kind !== 'choice') throw new Error('not a choice');
      const picked = q.answer.options[q.answer.correct]!;
      const want = { M: 'match', S: 'substitution', D: 'delete', I: 'insert' }[op]!;
      expect(picked.toLowerCase()).toContain(want);
    }
  });

  it('expects the reference distance and alignment', () => {
    for (const q of questions('distance')) {
      const [a, b] = words(q);
      expect(q.answer).toEqual({
        kind: 'number',
        value: refDistance(a, b, costsOf(q))(a.length, b.length),
      });
    }
    for (const q of questions('alignment')) {
      const [a, b] = words(q);
      expect(q.answer).toEqual({
        kind: 'sequence',
        value: refAlignment(a, b, costsOf(q)).split(''),
      });
    }
  });
});

describe('drawn text size', () => {
  // Corner names and alignment labels were 17 units (10.9 px on a laptop, 8.4 on a phone): now 20.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(dpEditDistance, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(dpEditDistance, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
