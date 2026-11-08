import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { formText } from '../_grammar/grammar';
import {
  START,
  defaults,
  firstOf,
  setText,
  type Ll1Extra,
  type Ll1Settings,
  type Ll1State,
} from './model';

type Def = VizDef<Ll1State, Ll1Settings, Ll1Extra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const PARENS = 'S -> (S)S | eps';
const LISTS = "L -> aL'; L' -> ,aL' | eps";

const CASES: { grammar: string; words: string[] }[] = [
  { grammar: START, words: ['a', 'a+a', 'a*a', '(a)', 'a+a*a', 'a+', '(a', 'a)', '+a', 'aa'] },
  { grammar: PARENS, words: ['()', '(())', '()()', '(()', ')(', '(()())'] },
  { grammar: LISTS, words: ['a', 'a,a', 'a,a,a', 'a,', ',a', 'aa'] },
];

/** Practice for the LL(1) page. Answers come from running the model. */
export function ll1Practice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  const parsed = (g: string, w: string) =>
    run([
      ['load', g],
      ['parse', w],
    ]).entries.at(-1)!;

  return [
    {
      id: 'verdict',
      title: 'Accept or reject?',
      make(rng) {
        const c = pick(rng, CASES);
        const w = pick(rng, c.words);
        const end = parsed(c.grammar, w).end;
        const yes = end.run!.verdict === 'accept';
        return {
          prompt: `The table on the stage is LL(1). Does the parser accept ${w}?`,
          setup: [['load', c.grammar]],
          answer: { kind: 'choice', options: ['Accept', 'Reject'], correct: yes ? 0 : 1 },
          explain: yes
            ? `Every move finds a rule in the table or a matching terminal, and after ${end.run!.moves} moves only $ is left.`
            : `After ${end.run!.moves} moves the parser is stuck: the table has no rule for the variable on top and the next symbol, or the terminal on top does not match.`,
          watch: [['parse', w]],
        };
      },
    },
    {
      id: 'moves',
      title: 'How many moves?',
      make(rng) {
        const c = pick(rng, CASES);
        const w = pick(
          rng,
          c.words.filter((x) => parsed(c.grammar, x).end.run!.verdict === 'accept'),
        );
        const end = parsed(c.grammar, w).end;
        return {
          prompt: `The parser accepts ${w}. How many moves does it make? (Each expansion and each match is one move.)`,
          setup: [['load', c.grammar]],
          answer: { kind: 'number', value: end.run!.moves },
          explain: `${w.length} matches, one per symbol, plus one expansion per inner node of the parse tree: ${end.run!.moves} in all.`,
          watch: [['parse', w]],
        };
      },
    },
    {
      id: 'stack',
      title: 'The stack after k moves',
      make(rng) {
        const c = pick(rng, CASES.slice(0, 2));
        const w = pick(
          rng,
          c.words.filter((x) => parsed(c.grammar, x).end.run!.verdict === 'accept'),
        );
        const e = parsed(c.grammar, w);
        const k = rng.int(1, Math.min(6, e.end.run!.moves - 1));
        const step = e.steps.find((s) => s.state.run?.moves === k)!;
        const stack = [...step.state.run!.stack].reverse().map((x) => x.sym);
        return {
          prompt: `Parse ${w} with the table on the stage. What is on the stack after ${k} move${k === 1 ? '' : 's'}? Type it top first, ending with $.`,
          setup: [['load', c.grammar]],
          answer: { kind: 'sequence', value: stack },
          explain: `Start with ${c.grammar.startsWith('E') ? 'E' : 'S'} on $. Each expansion pops the variable and pushes the right side, first symbol on top; each match pops a terminal. After ${k}: ${stack.join(' ')}.`,
          watch: [['parse', w]],
        };
      },
    },
    {
      id: 'first-of',
      title: 'FIRST of a right side',
      make(rng) {
        const s = run([['load', START]]).endState();
        const g = s.grammar;
        const strings = [
          ["T'", "E'"],
          ["E'"],
          ['F', "T'"],
          ["T'", ')'],
          ["E'", "T'"],
          ['T', "E'"],
          ["T'"],
        ];
        const syms = pick(rng, strings);
        const f = firstOf(g, s.first, syms);
        const right = setText(f);
        const pool = [
          '{ + }',
          '{ *, ε }',
          '{ +, *, ε }',
          '{ (, a }',
          '{ *, ) }',
          '{ +, * }',
          '{ +, ε }',
          '{ ε }',
          '{ *, +, ε }',
        ];
        const options = shuffle(rng, [
          right,
          ...shuffle(
            rng,
            pool.filter((x) => x !== right),
          ).slice(0, 3),
        ]);
        return {
          prompt: `Using the FIRST sets on the stage, what is FIRST(${formText(syms)})?`,
          setup: [['load', START]],
          answer: { kind: 'choice', options, correct: options.indexOf(right) },
          explain: `Take FIRST of the first symbol without ε; only if that symbol can vanish, go on to the next. ε is in the answer only if every symbol can vanish. Here: ${right}.`,
          watch: [['load', START]],
        };
      },
    },
  ];
}
