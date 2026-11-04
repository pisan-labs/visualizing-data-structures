import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { callShapeId } from '../../layouts/calls';
import { L, and, mark, plural } from '../_recursion/kit';

export type Problem = 'subsets' | 'permutations';

export interface BtSettings {
  [key: string]: Scalar;
  problem: Problem;
  /** Subsets only: 0 lists every subset; a positive target lists the subsets with that sum. */
  target: number;
}

export const MAX_VALUES = 4;
export const MAX_TARGET = 36;

export const defaults: BtSettings = { problem: 'subsets', target: 0 };

/**
 * One call of the search, in call order. A subsets call decides about values[depth]; a
 * permutations call picks the next value. `kind` says what happens to it: a normal call, a
 * leaf that outputs `chosen`, a call that pruning stops at once, or a call that never happens
 * because a pruned call above it was cut off.
 */
export interface BtNode {
  id: number;
  parent: number | null;
  depth: number;
  chosen: number[];
  sum: number;
  /** The decision on the edge from the parent: "+3" (take 3) or "skip" for subsets, the value for permutations. */
  edge: string;
  kind: 'call' | 'leaf' | 'pruned' | 'cut';
}

export interface BtRun {
  problem: Problem;
  target: number;
  outcome: 'running' | 'done';
}

export interface BtState {
  values: number[];
  /** The whole decision tree of the current or last run, in call order. */
  nodes: BtNode[];
  /** Calls drawn so far: on the stack (open), finished (done), or cut off by pruning (cut). */
  status: Record<number, 'open' | 'done' | 'cut'>;
  stack: number[];
  /** The partial solution: the values chosen on the path to the running call. */
  chosen: number[];
  /** Outputs so far, in order. */
  found: number[][];
  run: BtRun | null;
}

type S = BtState;
type Op = OpSpec<S, BtSettings, undefined>;
type BtStep = Step<S, undefined>;

export function init(): S {
  return { values: [], nodes: [], status: {}, stack: [], chosen: [], found: [], run: null };
}

/** "1 2 3": 1 to 4 whole numbers from 1 to 9, or null. */
export function readValues(raw: Value | undefined): number[] | null {
  const words = String(raw ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (words.length < 1 || words.length > MAX_VALUES) return null;
  if (!words.every((w) => /^[1-9]$/.test(w))) return null;
  return words.map(Number);
}

export const seqText = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/** The search's whole decision tree, worked out first so the drawing never moves. */
export function plan(values: number[], problem: Problem, target: number): BtNode[] {
  const nodes: BtNode[] = [];
  const n = values.length;
  const rest = (i: number) => values.slice(i).reduce((a, b) => a + b, 0);
  const add = (
    parent: number | null,
    depth: number,
    chosen: number[],
    sum: number,
    edge: string,
    cut: boolean,
    used: readonly number[] = [],
  ) => {
    const id = nodes.length + 1;
    const pruned =
      !cut && problem === 'subsets' && target > 0 && (sum > target || sum + rest(depth) < target);
    const leaf = problem === 'subsets' ? depth === n : chosen.length === n;
    const kind = cut ? 'cut' : pruned ? 'pruned' : leaf ? 'leaf' : 'call';
    nodes.push({ id, parent, depth, chosen, sum, edge, kind });
    if (leaf) return;
    const below = cut || pruned;
    if (problem === 'subsets') {
      const v = values[depth]!;
      add(id, depth + 1, [...chosen, v], sum + v, `+${v}`, below);
      add(id, depth + 1, chosen, sum, 'skip', below);
    } else {
      // Values are told apart by position, so repeated values still give n! orders.
      values.forEach((v, k) => {
        if (!used.includes(k))
          add(id, depth + 1, [...chosen, v], sum + v, String(v), below, [...used, k]);
      });
    }
  };
  add(null, 0, [], 0, '', false);
  return nodes;
}

const reject: (s: S) => BtStep = (s) => ({
  state: s,
  marks: [],
  say: `Type 1 to ${MAX_VALUES} values from 1 to 9, such as 1 2 3. Nothing ran.`,
  lines: [],
  vars: { calls: 0, found: 0 },
  level: 1,
});

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [raw]) {
    const values = readValues(raw);
    if (!values) {
      yield reject(s);
      return s;
    }
    const next: S = { ...init(), values };
    yield {
      state: next,
      marks: [],
      say: `The values are ${values.join(', ')}. Press Run to search.`,
      lines: [],
      vars: { calls: 0, found: 0 },
      level: 1,
    };
    return next;
  },
};

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [raw], { settings }) {
    const values = readValues(raw);
    if (!values) {
      yield reject(s);
      return s;
    }
    return yield* search(values, settings);
  },
};

function* search(values: number[], settings: BtSettings): Generator<BtStep, S, void> {
  const problem = settings.problem;
  const target = problem === 'subsets' ? settings.target : 0;
  const nodes = plan(values, problem, target);
  const kids = new Map<number, BtNode[]>();
  for (const x of nodes)
    if (x.parent !== null) kids.set(x.parent, [...(kids.get(x.parent) ?? []), x]);
  const status: Record<number, 'open' | 'done' | 'cut'> = {};
  const stack: number[] = [];
  let chosen: number[] = [];
  const found: number[][] = [];
  const run: BtRun = { problem, target, outcome: 'running' };
  let calls = 0;
  let pruned = 0;
  const snap = (): S => ({
    values,
    nodes,
    status: { ...status },
    stack: [...stack],
    chosen: [...chosen],
    found: found.map((f) => [...f]),
    run: { ...run },
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
  ): BtStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: {
      calls,
      found: found.length,
      ...(target > 0 ? { pruned, sum: chosen.reduce((a, b) => a + b, 0), target } : {}),
    },
    level,
  });
  const show = seqText;
  const node = (x: BtNode) => callShapeId(String(x.id));
  const below = (x: BtNode): BtNode[] => (kids.get(x.id) ?? []).flatMap((k) => [k, ...below(k)]);

  function* visit(x: BtNode, say: string, line: string): Generator<BtStep, void, void> {
    calls++;
    status[x.id] = 'open';
    stack.push(x.id);
    yield step(say, [line], 2, [[node(x), 'active']]);
    if (x.kind === 'pruned') {
      pruned++;
      const cut = below(x);
      for (const c of cut) status[c.id] = 'cut';
      const why =
        x.sum > target
          ? `the sum is already ${x.sum}, more than ${target}`
          : x.depth === values.length
            ? `every value is decided and the sum is only ${x.sum}, less than ${target}`
            : `even taking every value left gives only ${x.sum + values.slice(x.depth).reduce((a, b) => a + b, 0)}, less than ${target}`;
      const after =
        cut.length === 0
          ? 'This call returns at once.'
          : `This call returns at once, and the ${plural(cut.length, 'call')} below it never happen${cut.length === 1 ? 's' : ''}.`;
      // The call is still on the stack while it gives up; it returns right after.
      yield step(`Prune: ${why}. ${after}`, ['prune', 'cut'], 2, [[node(x), 'remove']]);
      stack.pop();
      status[x.id] = 'done';
      return;
    }
    if (x.kind === 'leaf') {
      found.push([...chosen]);
      yield step(
        target > 0
          ? `Every value is decided and the sum is ${target}: output ${show(chosen)}. That is solution ${found.length}.`
          : problem === 'permutations'
            ? `Every value is placed: output ${show(chosen)}. That is permutation ${found.length}.`
            : `Every value is decided: output ${show(chosen)}. That is subset ${found.length}.`,
        ['leaf', 'out'],
        2,
        [
          [node(x), 'found'],
          [`found-${found.length - 1}`, 'new'],
        ],
      );
      stack.pop();
      status[x.id] = 'done';
      return;
    }
    const children = kids.get(x.id) ?? [];
    for (const [k, c] of children.entries()) {
      const v = c.chosen[c.chosen.length - 1]!;
      if (problem === 'subsets') {
        if (k === 0) {
          chosen = [...chosen, v];
          yield* visit(
            c,
            `Choose ${v}: chosen is now ${show(chosen)}. Explore: call the search for the values after it.`,
            'choose',
          );
          chosen = chosen.slice(0, -1);
          yield step(
            `Back from that call. Unchoose ${v}: chosen is ${show(chosen)} again, ready to explore without ${v}.`,
            ['unchoose'],
            2,
            [[node(x), 'active']],
          );
        } else {
          yield* visit(
            c,
            `Explore without ${values[x.depth]}: call the search with chosen still ${show(chosen)}.`,
            'skip',
          );
        }
      } else {
        chosen = [...chosen, v];
        yield* visit(
          c,
          `Choose ${v}: chosen is now ${show(chosen)}. Explore: call the search to fill the rest.`,
          'choose',
        );
        chosen = chosen.slice(0, -1);
        yield step(
          `Back from that call. Unchoose ${v}: chosen is ${show(chosen)} again${k < children.length - 1 ? ', ready for the next value' : ', and every value has had its turn here'}.`,
          ['unchoose'],
          3,
          [[node(x), 'active']],
        );
      }
    }
    stack.pop();
    status[x.id] = 'done';
  }

  yield* visit(
    nodes[0]!,
    `main starts the search with nothing chosen. The values are ${values.join(', ')}.`,
    'sig',
  );
  run.outcome = 'done';
  const outputs = found.map(show);
  const what =
    problem === 'permutations'
      ? `${plural(found.length, 'permutation')}`
      : target > 0
        ? `${plural(found.length, 'subset')} with sum ${target}`
        : `${plural(found.length, 'subset')}`;
  const list = outputs.length <= 8 ? `: ${and(outputs)}` : '';
  const prunedText = target > 0 ? ` Pruning stopped ${plural(pruned, 'call')} early.` : '';
  yield step(
    `The search is done after ${plural(calls, 'call')}. It found ${what}${list}.${prunedText}`,
    [],
    1,
  );
  return snap();
}

export const ops = { run, load };

export function pseudocode(s: BtSettings): PseudoBlock[] {
  const loadBlock: PseudoBlock = {
    op: 'load',
    lines: [L('load', 0, 'a = the values', 'Remember the values to search over.')],
  };
  if (s.problem === 'permutations') {
    return [
      {
        op: 'run',
        lines: [
          L('sig', 0, 'permute()', 'To list every order of the values:'),
          L('leaf', 1, 'if chosen has all n values', 'If every value is in place,'),
          L('out', 2, 'output chosen; return', 'that is one order: write it down.'),
          L('loop', 1, 'for each value v not in chosen', 'Otherwise, for each value not used yet:'),
          L('choose', 2, 'chosen.add(v); permute()', 'choose it and explore what follows,'),
          L('unchoose', 2, 'chosen.removeLast()', 'then unchoose it to try the next one.'),
        ],
      },
      loadBlock,
    ];
  }
  const target = s.target > 0;
  return [
    {
      op: 'run',
      lines: [
        L(
          'sig',
          0,
          target ? 'subsets(i, sum)' : 'subsets(i)',
          'To decide about the values from a[i] on:',
        ),
        ...(target
          ? [
              L(
                'prune',
                1,
                'if sum > target or sum + rest(i) < target',
                'If the sum is already too big, or can no longer reach the target,',
              ),
              L('cut', 2, 'return', 'give up on this branch.'),
            ]
          : []),
        L('leaf', 1, 'if i == n', 'If every value has been decided,'),
        L('out', 2, 'output chosen; return', 'write down the chosen values.'),
        L(
          'choose',
          1,
          target
            ? 'chosen.add(a[i]); subsets(i + 1, sum + a[i])'
            : 'chosen.add(a[i]); subsets(i + 1)',
          'Choose a[i] and explore the rest with it,',
        ),
        L('unchoose', 1, 'chosen.removeLast()', 'unchoose it,'),
        L(
          'skip',
          1,
          target ? 'subsets(i + 1, sum)' : 'subsets(i + 1)',
          'and explore the rest without it.',
        ),
      ],
    },
    loadBlock,
  ];
}

export function initialSay(_state: S, s: BtSettings): string {
  if (s.problem === 'permutations')
    return 'Type up to 4 values, such as 1 2 3, and press Run to list every order: choose a value, explore, unchoose.';
  return s.target > 0
    ? `Type up to 4 values and press Run to find the subsets with sum ${s.target}. Branches that cannot reach it are pruned.`
    : 'Type up to 4 values, such as 1 2 3, and press Run to list every subset: choose, explore, unchoose.';
}

export function initialVars(): Record<string, Scalar> {
  return { calls: 0, found: 0 };
}

export function describe(state: S): string {
  const run = state.run;
  if (!run) {
    return state.values.length
      ? `Values ${state.values.join(', ')}. No search yet.`
      : 'No values yet.';
  }
  const made = Object.values(state.status).filter((v) => v !== 'cut').length;
  const shown = seqText;
  if (run.outcome === 'running')
    return `Values ${state.values.join(', ')}. ${plural(made, 'call')} so far; chosen is ${shown(state.chosen)}; ${plural(state.found.length, 'output')}.`;
  return `Values ${state.values.join(', ')}. The search made ${plural(made, 'call')} and found ${plural(state.found.length, 'output')}.`;
}
