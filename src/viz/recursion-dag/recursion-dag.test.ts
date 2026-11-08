import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { parseNumbers, recursionDag } from '.';
import { readArgs, type DagSettings, type Problem } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (problem: Problem): DagSettings =>
  ({ ...recursionDag.defaults, problem }) as DagSettings;

/** Counts calls like the code tabs do: the plain tree, and the run with a shared memo. */
function reference(p: Problem, args: number[]) {
  const kids = (a: number[]): number[][] =>
    p === 'fib'
      ? a[0]! <= 1
        ? []
        : [[a[0]! - 1], [a[0]! - 2]]
      : a[1] === 0 || a[1] === a[0]
        ? []
        : [
            [a[0]! - 1, a[1]! - 1],
            [a[0]! - 1, a[1]!],
          ];
  let calls = 0;
  const memo = new Map<string, number>();
  const go = (a: number[], useMemo: boolean): number => {
    calls++;
    const ks = kids(a);
    if (ks.length === 0) return p === 'fib' ? a[0]! : 1;
    const key = a.join(',');
    if (useMemo && memo.has(key)) return memo.get(key)!;
    const v = go(ks[0]!, useMemo) + go(ks[1]!, useMemo);
    if (useMemo) memo.set(key, v);
    return v;
  };
  const value = go(args, false);
  const tree = calls;
  calls = 0;
  go(args, true);
  const nodes = new Set<string>();
  const walk = (a: number[]) => {
    nodes.add(a.join(','));
    kids(a).forEach(walk);
  };
  walk(args);
  return { value, tree, memo: calls, nodes: nodes.size };
}

const argsArb = fc.oneof(
  fc.integer({ min: 0, max: 8 }).map((n) => ['fib', [n]] as const),
  fc
    .integer({ min: 0, max: 6 })
    .chain((n) => fc.integer({ min: 0, max: n }).map((k) => ['binom', [n, k]] as const)),
);

describe('recursion-dag', () => {
  it('draws fib(5) as 15 calls and 6 subproblems', () => {
    const t = new Timeline(recursionDag, settings('fib'), 1, [['call', '5']]);
    const end = t.entries[0]!.steps.at(-1)!;
    expect(end.vars).toMatchObject({
      result: 5,
      'tree calls': 15,
      'dag nodes': 6,
      'memo calls': 9,
    });
    expect(end.state.seen).toEqual({ 5: 1, 4: 1, 3: 2, 2: 3, 1: 5, 0: 3 });
  });

  it('lays C(n, k) out like Pascal’s triangle, and shares nothing for C(6, 1)', () => {
    const t = new Timeline(recursionDag, settings('binom'), 1, [
      ['call', '4 2'],
      ['call', '6 1'],
    ]);
    const first = t.entries[0]!.steps.at(-1)!;
    expect(first.vars).toMatchObject({ result: 6, 'tree calls': 11, 'dag nodes': 8 });
    const cols = Object.fromEntries(first.state.dag.map((d) => [d.key, [d.row, d.col]]));
    expect(cols).toMatchObject({ '4,2': [0, 0], '3,1': [1, -1], '3,2': [1, 1], '2,1': [2, 0] });
    const second = t.entries[1]!.steps.at(-1)!;
    expect(second.vars?.['tree calls']).toBe(11);
    expect(second.vars?.['dag nodes']).toBe(11);
  });

  it('reads its input per problem and refuses what does not fit', () => {
    expect(readArgs('fib', '5')).toEqual([5]);
    expect(readArgs('binom', '5 2')).toEqual([5, 2]);
    expect(readArgs('fib', '5 2')).toMatch(/one whole number/);
    expect(readArgs('binom', '5')).toMatch(/two whole numbers/);
    expect(readArgs('binom', '3 4')).toMatch(/between 0 and n/);
    expect(readArgs('binom', '9 2')).toMatch(/to 6 or less/);
    expect(readArgs('fib', '9')).toMatch(/0 to 8/);
    expect(parseNumbers(' 5, 2 ')).toBe('5 2');
    expect(parseNumbers('5 2 1')).toBeInstanceOf(Error);
    expect(parseNumbers('x')).toBeInstanceOf(Error);
  });

  it('matches a reference recursion, and the DAG mirrors every tree call', () => {
    fc.assert(
      fc.property(argsArb, ([p, args]) => {
        const t = new Timeline(recursionDag, settings(p), 1, [['call', args.join(' ')]]);
        const steps = t.entries[0]!.steps;
        const want = reference(p, [...args]);
        expect(steps.at(-1)!.vars).toMatchObject({
          result: want.value,
          'tree calls': want.tree,
          'dag nodes': want.nodes,
          'memo calls': want.memo,
        });
        for (const s of steps) {
          const st = s.state;
          // The stack is one path down the tree.
          st.stack.forEach((id, j) => {
            expect(st.tree[id - 1]!.parent).toBe(j === 0 ? null : st.stack[j - 1]);
          });
          // Each subproblem's count is the number of tree calls made to it so far.
          const made = st.tree.filter((n) => st.status[n.id] !== undefined);
          const counts: Record<string, number> = {};
          for (const n of made) counts[n.key] = (counts[n.key] ?? 0) + 1;
          expect(st.seen).toEqual(counts);
          // Every arrow walked is an edge of the DAG, and appears once.
          const dag = new Map(st.dag.map((d) => [d.key, d]));
          expect(new Set(st.edges).size).toBe(st.edges.length);
          for (const e of st.edges) {
            const [from, to] = e.split('>');
            expect(dag.get(from!)!.children).toContain(to);
          }
          for (const [id, v] of Object.entries(st.result))
            expect(v).toBe(st.tree[Number(id) - 1]!.returns);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('writes driver input that the code tabs can run', () => {
    expect(
      recursionDag.code!.script(
        [
          ['call', '5'],
          ['call', 'x'],
        ],
        settings('fib'),
      ),
    ).toEqual({
      input: ['fib 5'],
      expected: ['5 15 9'],
    });
    expect(recursionDag.code!.script([['call', '4 2']], settings('binom'))).toEqual({
      input: ['binom 4 2'],
      expected: ['6 11 9'],
    });
  });
});

describe('recursion-dag practice', () => {
  const kinds = recursionDag.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'memo-calls',
      'tree-calls',
      'dag-boxes',
      'most-called',
    ]);
  });

  it('gets every answer right, checked against the reference', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const p = q.settings!.problem as Problem;
        const args = String(q.watch![0]![1]).split(' ').map(Number);
        const want = reference(p, args);
        const a = q.answer;
        if (k.id === 'memo-calls') expect(a).toEqual({ kind: 'number', value: want.memo });
        else if (k.id === 'tree-calls') expect(a).toEqual({ kind: 'number', value: want.tree });
        else if (k.id === 'dag-boxes') expect(a).toEqual({ kind: 'number', value: want.nodes });
        else {
          if (a.kind !== 'choice') throw new Error('most-called is a choice');
          expect(a.options[a.correct]).toBe('fib(1)');
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // fib(8)'s tree drew its badges at 3.9 px on a phone growing down; growing right, at 6.6.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(recursionDag, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(10);
    expect(smallestText(recursionDag, PHONE_STAGE).px).toBeGreaterThanOrEqual(6.5);
  });
});
