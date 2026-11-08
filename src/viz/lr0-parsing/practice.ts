import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { START, actText, defaults, terminalsOf, type Lr0Settings, type Lr0State } from './model';

type Def = VizDef<Lr0State, Lr0Settings, unknown>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const LISTS = 'S -> (L) | x; L -> S | L,S';
const CASES = [
  { grammar: START, words: ['a', 'a+a', '(a)', '(a+a)+a', 'a+', '+a', '(a', 'a)a', 'a+(a)'] },
  { grammar: LISTS, words: ['x', '(x)', '(x,x)', '((x),x)', '(x', 'x,x', '()', '(x,(x))'] },
];

/** Practice for the LR(0) page. Answers come from running the model. */
export function lr0Practice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  const parsed = (g: string, w: string) =>
    run([
      ['load', g],
      ['parse', w],
    ]).entries.at(-1)!;
  const accepted = (g: string, words: string[]) =>
    words.filter((w) => parsed(g, w).end.run!.verdict === 'accept');

  return [
    {
      id: 'action',
      title: 'Read the table',
      make(rng) {
        const c = pick(rng, CASES);
        const s = run([['load', c.grammar]]).endState();
        const i = rng.int(0, s.sets.length - 1);
        const a = pick(rng, terminalsOf(s.grammar));
        const right = (s.action[i]?.[a] ?? []).map(actText).join('/') || 'empty (an error)';
        const pool = [
          ...new Set(
            s.action.flatMap((r) => Object.values(r).map((x) => x.map(actText).join('/'))),
          ),
        ];
        const options = shuffle(rng, [
          right,
          ...shuffle(
            rng,
            [...pool, 'empty (an error)'].filter((x) => x !== right),
          ).slice(0, 3),
        ]);
        return {
          prompt: `The parser is in state ${i} and the next symbol is ${a}. What does ACTION[${i}, ${a}] say? (sN shifts and goes to state N; rN reduces by rule N.)`,
          setup: [['load', c.grammar]],
          answer: { kind: 'choice', options, correct: options.indexOf(right) },
          explain: `Row ${i}, column ${a}: ${right}. A shift comes from an arrow on ${a} out of I${i}; a reduce from a complete item in I${i}.`,
          watch: [['load', c.grammar]],
        };
      },
    },
    {
      id: 'verdict',
      title: 'Accept or reject?',
      make(rng) {
        const c = pick(rng, CASES);
        const w = pick(rng, c.words);
        const yes = parsed(c.grammar, w).end.run!.verdict === 'accept';
        return {
          prompt: `Does the LR(0) parser on the stage accept ${w}?`,
          setup: [['load', c.grammar]],
          answer: { kind: 'choice', options: ['Accept', 'Reject'], correct: yes ? 0 : 1 },
          explain: yes
            ? 'Every move finds an action, and the parser reaches acc under $.'
            : 'At some point the state on top has an empty cell for the next symbol: a syntax error.',
          watch: [['parse', w]],
        };
      },
    },
    {
      id: 'moves',
      title: 'Shifts plus reductions',
      make(rng) {
        const c = pick(rng, CASES);
        const w = pick(rng, accepted(c.grammar, c.words));
        const moves = parsed(c.grammar, w).end.run!.moves;
        return {
          prompt: `The parser accepts ${w}. How many moves does it make, counting each shift and each reduction (not the final accept)?`,
          setup: [['load', c.grammar]],
          answer: { kind: 'number', value: moves },
          explain: `${w.length} shifts, one per symbol, and one reduction per inner node of the parse tree (besides the root of the augmented rule): ${moves} in all.`,
          watch: [['parse', w]],
        };
      },
    },
    {
      id: 'stack',
      title: 'The stack of states',
      make(rng) {
        const c = pick(rng, CASES);
        const w = pick(
          rng,
          accepted(c.grammar, c.words).filter((x) => x.length >= 3),
        );
        const e = parsed(c.grammar, w);
        const k = rng.int(2, Math.min(6, e.end.run!.moves - 1));
        const states = e.steps.find((s) => s.state.run?.moves === k)!.state.run!.states.map(String);
        return {
          prompt: `Parse ${w} with the table on the stage. Which states are on the stack after ${k} moves? Type them bottom first, starting with 0.`,
          setup: [['load', c.grammar]],
          answer: { kind: 'sequence', value: states },
          explain: `A shift pushes one state; a reduction by A → β pops |β| states and pushes GOTO of the state uncovered. After ${k} moves: ${states.join(' ')}.`,
          watch: [['parse', w]],
        };
      },
    },
  ];
}
