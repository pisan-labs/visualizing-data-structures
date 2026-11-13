import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import {
  WORDS,
  type EmbExtra,
  type EmbSettings,
  type EmbState,
  type Measure,
  type Pair,
  type Search,
} from './model';

type Def = VizDef<EmbState, EmbSettings, EmbExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const NAMES = WORDS.map((w) => w.w);
const fn = (m: Measure) => (m === 'cosine' ? 'cos' : 'dot');
const by = (m: Measure) => (m === 'cosine' ? 'cosine similarity' : 'the dot product');

/** Analogies whose answer means something, and a few that test the arithmetic only. */
const ANALOGIES: [string, string, string][] = [
  ['king', 'man', 'woman'],
  ['queen', 'woman', 'man'],
  ['man', 'king', 'queen'],
  ['woman', 'queen', 'king'],
  ['puppy', 'dog', 'cat'],
  ['kitten', 'cat', 'dog'],
  ['cat', 'kitten', 'puppy'],
  ['dog', 'puppy', 'kitten'],
  ['bread', 'apple', 'cake'],
  ['apple', 'cake', 'bread'],
];

/**
 * Practice for embeddings. The picture shows the words and their coordinates (no setup); each
 * question names the measure, and its answer comes from running the model with it.
 */
export function embeddingPractice(def: () => Def): PracticeKind[] {
  const run = (settings: EmbSettings, ops: OpCall[]) => new Timeline(def(), settings, 1, ops);
  const settingsFor = (measure: Measure, k: number): EmbSettings => ({
    measure,
    normalize: false,
    k,
  });

  return [
    {
      id: 'nearest',
      title: 'The nearest word',
      make(rng) {
        for (;;) {
          const measure: Measure = rng.int(0, 1) ? 'cosine' : 'dot';
          const w = pick(rng, NAMES);
          const settings = settingsFor(measure, 4);
          const watch: OpCall[] = [['nearest', w]];
          const q = run(settings, watch).endState().query as Search;
          const [first, second] = q.top;
          // A clear winner, so the answer does not hang on the third decimal.
          if (!first || !second || first.s - second.s < (measure === 'cosine' ? 0.02 : 0.2))
            continue;
          const options = shuffle(
            rng,
            q.top.map((e) => NAMES[e.i]!),
          );
          const answer = NAMES[first.i]!;
          return {
            prompt: `Which word is nearest to **${w}** by ${by(measure)}? The table has every word's coordinates.`,
            setup: [],
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain: `Scored against ${w}: ${q.top.map((e) => `${fn(measure)}(${w}, ${NAMES[e.i]}) = ${two(e.s)}`).join(', ')}. ${answer} is highest.${measure === 'dot' ? ' The dot product counts length as well as direction.' : ''}`,
            watch,
          };
        }
      },
    },
    {
      id: 'larger',
      title: 'Which similarity is larger?',
      make(rng) {
        for (;;) {
          const measure: Measure = rng.int(0, 1) ? 'cosine' : 'dot';
          const [a, b, c] = shuffle(rng, NAMES).slice(0, 3) as [string, string, string];
          const settings = settingsFor(measure, 3);
          const watch: OpCall[] = [
            ['similarity', a, b],
            ['similarity', a, c],
          ];
          const t = run(settings, watch);
          const [p, q] = t.entries.map((e) => e.end.query as Pair) as [Pair, Pair];
          const value = (x: Pair) => (measure === 'cosine' ? x.cos : x.dot);
          if (Math.abs(value(p) - value(q)) < (measure === 'cosine' ? 0.05 : 0.5)) continue;
          // Most interesting when the two measures disagree; take such a triple when one comes up.
          const disagree = Math.sign(p.cos - q.cos) !== Math.sign(p.dot - q.dot);
          if (!disagree && rng.int(0, 2) > 0) continue;
          const options = [`${fn(measure)}(${a}, ${b})`, `${fn(measure)}(${a}, ${c})`];
          const correct = value(p) > value(q) ? 0 : 1;
          const other = measure === 'cosine' ? 'dot product' : 'cosine';
          return {
            prompt: `Which is larger: **${options[0]}** or **${options[1]}**?`,
            setup: [],
            settings,
            answer: { kind: 'choice', options, correct },
            explain: `${options[0]} = ${two(value(p))} and ${options[1]} = ${two(value(q))}.${disagree ? ` The ${other} would say the opposite (${two(measure === 'cosine' ? p.dot : p.cos)} against ${two(measure === 'cosine' ? q.dot : q.cos)}): ${measure === 'cosine' ? 'length' : 'direction alone'} decides it.` : ''}`,
            watch,
          };
        }
      },
    },
    {
      id: 'value',
      title: 'Work out a similarity',
      make(rng) {
        const measure: Measure = rng.int(0, 1) ? 'cosine' : 'dot';
        const [a, b] = shuffle(rng, NAMES).slice(0, 2) as [string, string];
        const settings = settingsFor(measure, 3);
        const watch: OpCall[] = [['similarity', a, b]];
        const p = run(settings, watch).endState().query as Pair;
        const value = measure === 'cosine' ? p.cos : p.dot;
        return {
          prompt:
            measure === 'cosine'
              ? `What is the cosine similarity of **${a}** and **${b}**? Two decimals.`
              : `What is the dot product of **${a}** and **${b}**? Two decimals.`,
          setup: [],
          settings,
          answer: { kind: 'number', value, tolerance: 0.005 },
          explain:
            measure === 'cosine'
              ? `The dot product is ${two(p.dot)}, the lengths are ${two(p.la)} and ${two(p.lb)}, so the cosine is ${two(p.dot)} / (${two(p.la)} × ${two(p.lb)}) = ${two(p.cos)}.`
              : `Multiply the matching coordinates and add: the dot product is ${two(p.dot)}.`,
          watch,
        };
      },
    },
    {
      id: 'analogy',
      title: 'Solve an analogy',
      make(rng) {
        const [a, b, c] = pick(rng, ANALOGIES);
        const settings = settingsFor('cosine', 4);
        const watch: OpCall[] = [['analogy', a, b, c]];
        const q = run(settings, watch).endState().query as Search;
        const answer = NAMES[q.top[0]!.i]!;
        const options = shuffle(
          rng,
          q.top.map((e) => NAMES[e.i]!),
        );
        return {
          prompt: `Which word is nearest to **${a} − ${b} + ${c}** by cosine similarity, leaving out ${a}, ${b} and ${c}?`,
          setup: [],
          settings,
          answer: { kind: 'choice', options, correct: options.indexOf(answer) },
          explain: `${a} − ${b} + ${c} = (${two(q.target[0])}, ${two(q.target[1])}). The nearest other words: ${q.top.map((e) => `${NAMES[e.i]} ${two(e.s)}`).join(', ')}.`,
          watch,
        };
      },
    },
  ];
}
