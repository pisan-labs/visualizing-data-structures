import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { short, two } from '../_lm/numbers';
import {
  cText,
  defaults,
  meanOf,
  ROOT,
  sentence,
  TREE,
  type MctsExtra,
  type MctsSettings,
  type MctsState,
} from './model';

type Def = VizDef<MctsState, MctsSettings, MctsExtra>;

const KIDS = TREE[ROOT]!.children;
const names = KIDS.map((k) => TREE[k]!.token);

/**
 * Practice for Monte Carlo tree search. The picture shows the tree after a few iterations (at
 * least three, so every child of the root has been tried); the questions ask about the next
 * one. Every answer comes from running the model.
 */
export function mctsPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng) {
    for (;;) {
      const c = (['sqrt2', 'sqrt2', '0.5', '2'] as const)[rng.int(0, 3)]!;
      const settings: MctsSettings = { ...defaults, c };
      const k = rng.int(3, 14);
      const ops: OpCall[] = Array.from({ length: k }, (): OpCall => ['iterate']);
      const t = new Timeline(def(), settings, 1, [...ops, ['iterate']]);
      const s = t.entries[k - 1]!.end;
      const after = t.endState();
      const trace = after.history.at(-1)!;
      const scores = trace.scores[0]!.ucb;
      // A clear winner at the root, so the answer does not hang on the third decimal.
      const sorted = scores.map(([, u]) => u).sort((a, b) => b - a);
      if (sorted[0]! - sorted[1]! < 0.02) continue;
      return { settings, ops, s, after, trace, scores, watch: [['iterate']] as OpCall[] };
    }
  }

  const ucbTerms = (s: MctsState, settings: MctsSettings, id: number, u: number) =>
    `${short(meanOf(s, id))} + ${cText(settings)} × √(ln ${s.n[ROOT]} / ${s.n[id]}) = ${two(u)}`;

  return [
    {
      id: 'select',
      title: 'Which child does UCB1 pick?',
      make(rng) {
        const { settings, ops, s, trace, scores, watch } = setup(rng);
        const chosen = trace.selected[1]!;
        return {
          prompt: `The next iteration starts at the root, "the", which has N = ${s.n[ROOT]} visits. With c = ${cText(settings)}, which child does selection pick? UCB1 = Q + c·√(ln N / n), with n and Q on each child.`,
          setup: ops,
          settings,
          answer: { kind: 'choice', options: names, correct: KIDS.indexOf(chosen) },
          explain: `${scores.map(([id, u]) => `${TREE[id]!.token}: ${ucbTerms(s, settings, id, u)}`).join('; ')}. The largest is ${TREE[chosen]!.token}.${
            s.n[chosen] !== Math.max(...KIDS.map((k) => s.n[k]!))
              ? ' It is not the most visited child: the bonus for being tried less wins.'
              : ''
          }`,
          watch,
        };
      },
    },
    {
      id: 'ucb',
      title: 'A UCB1 score',
      make(rng) {
        const { settings, ops, s, scores, watch } = setup(rng);
        const [id, u] = scores[rng.int(0, scores.length - 1)]!;
        return {
          prompt: `The root, "the", has N = ${s.n[ROOT]} visits. What is the UCB1 score of **${TREE[id]!.token}**, with c = ${cText(settings)}? UCB1 = Q + c·√(ln N / n). Two decimals.`,
          setup: ops,
          settings,
          answer: { kind: 'number', value: u, tolerance: 0.01 },
          explain: `${TREE[id]!.token} has n = ${s.n[id]} and Q = ${short(meanOf(s, id))}: ${ucbTerms(s, settings, id, u)}. The bonus is ${two(u - meanOf(s, id))}.`,
          watch,
        };
      },
    },
    {
      id: 'visits',
      title: 'Visit counts after an iteration',
      make(rng) {
        const { settings, ops, after, trace, watch } = setup(rng);
        const chosen = trace.selected[1]!;
        return {
          prompt: `After the next iteration (c = ${cText(settings)}), how many visits will ${names.join(', ')} have? Type three numbers, in that order.`,
          setup: ops,
          settings,
          answer: { kind: 'sequence', value: KIDS.map((k) => String(after.n[k])) },
          explain: `Selection picks ${TREE[chosen]!.token} (UCB1 ${two(trace.scores[0]!.ucb.find(([k]) => k === chosen)![1])}, the largest), so backpropagation gives it one more visit and leaves the other two alone: ${KIDS.map((k) => `${TREE[k]!.token} ${after.n[k]}`).join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'value',
      title: 'The mean after backpropagation',
      make(rng) {
        const { settings, ops, s, after, trace, watch } = setup(rng);
        const chosen = trace.selected[1]!;
        const q = meanOf(after, chosen);
        return {
          prompt: `The next iteration goes through **${TREE[chosen]!.token}**, which has n = ${s.n[chosen]} visits and a total reward W = ${two(s.w[chosen]!)}. Its rollout ends at "${sentence(trace.leaf)}", which scores ${two(trace.r)}. What is ${TREE[chosen]!.token}'s mean Q after backpropagation? Two decimals.`,
          setup: ops,
          settings,
          answer: { kind: 'number', value: q, tolerance: 0.005 },
          explain: `Backpropagation adds one visit and the score: Q = (${two(s.w[chosen]!)} + ${two(trace.r)}) / (${s.n[chosen]} + 1) = ${two(after.w[chosen]!)} / ${after.n[chosen]} = ${two(q)}. It was ${two(meanOf(s, chosen))}.`,
          watch,
        };
      },
    },
  ];
}
