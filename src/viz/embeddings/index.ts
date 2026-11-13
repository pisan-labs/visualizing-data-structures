import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/embeddings.hpp?raw';
import javaSource from './code/java/Embeddings.java?raw';
import pythonSource from './code/python/embeddings.py?raw';
import analogyDot from './examples/analogy-dot.json';
import bestFirst from './examples/best-first.json';
import kingQueen from './examples/king-queen.json';
import kittenCosine from './examples/kitten-cosine.json';
import kittenDot from './examples/kitten-dot.json';
import noAnswer from './examples/no-answer.json';
import normalizedDot from './examples/normalized-dot.json';
import oneNeighbour from './examples/one-neighbour.json';
import puppyKitten from './examples/puppy-kitten.json';
import sameWay from './examples/same-way.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  kOf,
  MAX_K,
  ops,
  pseudocode,
  WORDS,
  type EmbExtra,
  type EmbSettings,
  type EmbState,
  type Search,
} from './model';
import { embeddingPractice } from './practice';
import { view } from './view';

const NAMES = WORDS.map((w) => w.w);
const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;
const PEOPLE = ['man', 'woman', 'king', 'queen'];
const ANIMALS = ['cat', 'kitten', 'dog', 'puppy', 'fox'];
const FOOD = ['apple', 'bread', 'cake'];

/** Three different words from one group, in a random order. */
function three(rng: Rng, group: readonly string[]): [string, string, string] {
  const a = [...group];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return [a[0]!, a[1]!, a[2]!];
}

const preset = (label: string, make: (rng: Rng) => OpCall[]): Preset => ({
  label,
  make: (rng) => make(rng),
});

export const embeddings: VizDef<EmbState, EmbSettings, EmbExtra> = {
  id: 'embeddings',
  title: 'Embeddings and similarity',
  family: 'Inside the transformer',
  blurb:
    'Words as arrows: similar words point the same way. Dot product against cosine, the nearest words by brute force with a heap, and analogies such as king − man + woman.',
  settings: [
    {
      kind: 'choice',
      key: 'measure',
      label: 'Similarity',
      options: [
        { value: 'cosine', label: 'Cosine: direction only' },
        { value: 'dot', label: 'Dot product: direction and length' },
      ],
      help: 'SLP3 uses the cosine. The dot product is what attention computes; it favours long arrows.',
    },
    {
      kind: 'boolean',
      key: 'normalize',
      label: 'Normalize the vectors to length 1',
      help: 'After normalizing, the dot product and the cosine are the same number.',
    },
    {
      kind: 'number',
      key: 'k',
      label: 'Neighbours to keep (k)',
      min: 1,
      max: MAX_K,
      help: 'The heap holds the best k so far; the weakest of them sits on top.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Word',
      placeholder: 'e.g. kitten',
      maxLength: 40,
      sample: 'cat',
      parse: (text) => {
        const w = text.trim().toLowerCase();
        if (!w) return new Error('Type a word first, such as kitten.');
        if (!NAMES.includes(w))
          return new Error(`Use one of the words shown: ${NAMES.join(', ')}.`);
        return w;
      },
    },
    buttons: [
      { op: 'nearest', label: 'Nearest', usesInput: true, primary: true },
      {
        op: 'similarity',
        label: 'Similarity',
        usesInput: true,
        args: ['a word', 'another word'],
      },
      {
        op: 'analogy',
        label: 'Analogy (a − b + c)',
        usesInput: true,
        args: ['a', 'b', 'c'],
      },
    ],
    random: {
      label: 'Nearest to a random word',
      make: (rng) => [['nearest', pick(rng, NAMES)]],
    },
    presets: [
      preset('Nearest to a random word', (rng) => [['nearest', pick(rng, NAMES)]]),
      preset('A short arrow (dot against cosine)', (rng) => [
        ['nearest', pick(rng, ['kitten', 'puppy', 'cake'])],
      ]),
      preset('An analogy among people', (rng) => [['analogy', ...three(rng, PEOPLE)]]),
      preset('An analogy among animals', (rng) => [['analogy', ...three(rng, ANIMALS)]]),
      preset('An analogy across groups', (rng) => [
        ['analogy', pick(rng, ANIMALS), pick(rng, PEOPLE), pick(rng, FOOD)],
      ]),
      preset('Two random words', (rng) => {
        const a = pick(rng, NAMES);
        return [
          [
            'similarity',
            a,
            pick(
              rng,
              NAMES.filter((w) => w !== a),
            ),
          ],
        ];
      }),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'similarity(a, b)',
      best: {
        cost: 'Θ(d)',
        why: 'One multiply and add per dimension, plus two lengths.',
        example: 'same-way',
      },
      average: { cost: 'Θ(d)', why: 'The same for any pair.', example: 'same-way' },
      worst: { cost: 'Θ(d)', why: 'd = 2 here; 300 to 4096 in real models.', example: 'same-way' },
    },
    {
      op: 'nearest(w), k neighbours',
      best: {
        cost: 'Θ(N · d)',
        why: 'The best k come first; every later word is turned away at the top of the heap.',
        example: 'best-first',
      },
      average: {
        cost: 'Θ(N · d + k log k · log(N/k))',
        why: 'In a random order a newcomer gets in less and less often.',
        example: 'kitten-cosine',
      },
      worst: {
        cost: 'Θ(N · (d + log k))',
        why: 'Scores that rise along the list: every word gets in and sifts down.',
      },
      note: 'Sorting all N scores would cost Θ(N log N); the heap needs only Θ(k) extra room.',
    },
    {
      op: 'analogy(a, b, c)',
      best: {
        cost: 'Θ(N · d)',
        why: 'Two vector sums, then the same search.',
        example: 'king-queen',
      },
      average: {
        cost: 'Θ(N · d + k log k · log(N/k))',
        why: 'The search dominates.',
        example: 'puppy-kitten',
      },
      worst: {
        cost: 'Θ(N · (d + log k))',
        why: 'As for nearest; the three inputs are skipped.',
        example: 'no-answer',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as EmbSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    kittenCosine,
    kittenDot,
    normalizedDot,
    sameWay,
    kingQueen,
    puppyKitten,
    analogyDot,
    noAnswer,
    bestFirst,
    oneNeighbour,
  ] as unknown as SavedExample[],
  practice: embeddingPractice(() => embeddings),
  // The plane alone: the table and the heap are side panels.
  preview: {
    example: 'king-queen',
    level: 2,
    hide: ['th-', 'tr-', 'tw-', 'tx-', 'ty-', 'ts-', 'h-', 'he-', 'hn-', 'rk-', 'sr-'],
  },
};

const ranked = (s: EmbState, q: Search) =>
  q.top.map((e) => `${s.vocab[e.i]!.w} ${round3(e.s)}`).join(' ');

/**
 * Driver protocol for the code tabs: the words, "normalize" when the setting is on, then one
 * line per operation that ran (an unknown word prints nothing and is left out).
 */
function codeScript(calls: OpCall[], settings: EmbSettings) {
  const t = new Timeline(embeddings, settings, 1, calls);
  const input = t.initial.state.vocab.map((x) => `word ${x.w} ${x.v[0]} ${x.v[1]}`);
  if (settings.normalize) input.push('normalize');
  const expected: string[] = [];
  const measure = settings.measure;
  const k = kOf(settings);
  let prev = t.initial.state;
  for (const e of t.entries) {
    const q = e.end.query;
    const ran = e.end !== prev;
    prev = e.end;
    if (!ran || !q) continue;
    const name = (i: number) => e.end.vocab[i]!.w;
    if (q.kind === 'similarity') {
      input.push(`sim ${name(q.a)} ${name(q.b)}`);
      expected.push(`${round3(q.dot)} ${round3(q.cos)}`);
    } else if (q.kind === 'nearest') {
      input.push(`nearest ${measure} ${k} ${name(q.words[0]!)}`);
      expected.push(ranked(e.end, q));
    } else {
      input.push(`analogy ${measure} ${k} ${q.words.map(name).join(' ')}`);
      expected.push(`${round3(q.target[0])} ${round3(q.target[1])} | ${ranked(e.end, q)}`);
    }
  }
  return { input, expected };
}

export default embeddings;
