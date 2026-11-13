import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS } from '../_lm/vocab';
import cppSource from './code/cpp/moe.hpp?raw';
import javaSource from './code/java/Moe.java?raw';
import pythonSource from './code/python/moe.py?raw';
import animalsOnly from './examples/animals-only.json';
import catSat from './examples/cat-sat.json';
import expertChoiceTight from './examples/expert-choice-tight.json';
import expertChoice from './examples/expert-choice.json';
import moreRoom from './examples/more-room.json';
import smallWords from './examples/small-words.json';
import topOneDrop from './examples/top-one-drop.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  E,
  init,
  initialSay,
  initialVars,
  MAX_TOKENS,
  ops,
  parseTokens,
  pseudocode,
  W_R,
  type MoeExtra,
  type MoeSettings,
  type MoeState,
  type Routed,
} from './model';
import { moePractice } from './practice';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** A sentence of `size` words (1 to 8) from the toy vocabulary. */
export function randomSentence(rng: Rng, size: number): string {
  const words = [
    'the',
    pick(rng, ANIMALS),
    pick(rng, ACTIONS),
    pick(rng, ['on', 'under']),
    'the',
    pick(rng, THINGS),
    'and',
    pick(rng, ['it', 'the', 'a']),
  ];
  const n = Math.max(1, Math.min(MAX_TOKENS, size));
  return n === 1 ? words[1]! : words.slice(0, n).join(' ');
}

const preset = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size) => [['load', make(rng, size)], ['route']],
});

export const moeRouting: VizDef<MoeState, MoeSettings, MoeExtra> = {
  id: 'moe-routing',
  title: 'Mixture-of-experts routing',
  family: 'Inside the transformer',
  blurb:
    'A router scores four experts for each token and sends it to the best one or two, as long as they have room. Tokens over capacity are dropped, and a load-balance loss measures how evenly the work is spread.',
  settings: [
    {
      kind: 'choice',
      key: 'k',
      label: 'Experts per token (top-k)',
      options: [
        { value: '2', label: 'k = 2 (GShard, Mixtral)' },
        { value: '1', label: 'k = 1 (Switch Transformer)' },
      ],
      help: 'Each token goes to its k best experts. With k = 2 the softmax over the two chosen scores splits the token between them.',
    },
    {
      kind: 'choice',
      key: 'cf',
      label: 'Capacity factor',
      options: [
        { value: '1', label: '1: room for exactly an even share' },
        { value: '1.25', label: '1.25: a quarter more room' },
        { value: '1.5', label: '1.5' },
        { value: '2', label: '2: twice an even share' },
      ],
      help: 'Each expert has ⌈factor × k × tokens / experts⌉ slots. More room drops fewer tokens but wastes memory and compute on empty slots.',
    },
    {
      kind: 'choice',
      key: 'routing',
      label: 'Who chooses',
      options: [
        { value: 'token', label: 'Token choice: each token picks its experts' },
        {
          value: 'expert',
          label: 'Expert choice: each expert picks its tokens (Zhou et al. 2022)',
        },
      ],
      help: 'With expert choice every expert is exactly full, so the load is balanced by construction, but some tokens may get no expert at all.',
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
      label: 'Sentence',
      placeholder: 'e.g. the cat sat on the mat',
      maxLength: 60,
      sample: 'the cat sat on the mat',
      parse: (text) => {
        const words = parseTokens(text);
        return words instanceof Error ? words : words.join(' ');
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'score', label: 'Score (router)', usesInput: false },
      { op: 'route', label: 'Route', usesInput: false },
    ],
    random: {
      label: 'Random sentence',
      make: (rng) => [['load', randomSentence(rng, rng.int(3, MAX_TOKENS))], ['route']],
    },
    presets: [
      preset('Random sentence', randomSentence),
      preset('Lots of small words (one busy expert)', () => 'the cat and the dog and the fox'),
      preset('All one kind (the router collapses)', (rng, size) =>
        Array.from({ length: Math.max(2, Math.min(MAX_TOKENS, size)) }, () =>
          pick(rng, ANIMALS),
        ).join(' '),
      ),
      preset(
        'One of each kind (even load)',
        (rng) => `${pick(rng, ANIMALS)} ${pick(rng, THINGS)} ${pick(rng, ACTIONS)} the`,
      ),
      preset('One token', (rng) => pick(rng, ANIMALS)),
      preset('Words it does not know', () => 'the zorp blip on a quux'),
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Router scores for T tokens',
      best: {
        cost: 'Θ(T · d · E)',
        why: 'One small matrix product: d numbers per token, E experts.',
        example: 'more-room',
      },
      average: {
        cost: 'Θ(T · d · E)',
        why: 'The router is tiny next to the experts.',
        example: 'cat-sat',
      },
      worst: {
        cost: 'Θ(T · d · E)',
        why: 'The same however the tokens are spread.',
        example: 'animals-only',
      },
    },
    {
      op: 'Top-k per token (token choice)',
      best: {
        cost: 'Θ(T · E)',
        why: 'k = 1 is one pass for the largest score.',
        example: 'top-one-drop',
      },
      average: {
        cost: 'Θ(T · E · k)',
        why: 'k passes over E scores, or a heap of size k.',
        example: 'cat-sat',
      },
      worst: {
        cost: 'Θ(T · E log E)',
        why: 'Sorting every row, if done naively.',
        example: 'small-words',
      },
    },
    {
      op: 'Expert work (the FFNs)',
      best: {
        cost: 'Θ(T · k · d · d_ff)',
        why: 'Each token runs through only k experts, not all E.',
        example: 'cat-sat',
      },
      average: {
        cost: 'Θ(E · C · d · d_ff)',
        why: 'Experts compute on all C slots, full or not: the capacity factor is paid for.',
        example: 'more-room',
      },
      worst: {
        cost: 'Θ(E · C · d · d_ff)',
        why: 'An unbalanced router fills one expert and leaves the rest empty, yet they still cost C slots each.',
        example: 'animals-only',
      },
      note: 'Parameters grow with E, but compute per token grows only with k: that is the point of a mixture of experts.',
    },
    {
      op: 'Expert choice: each expert picks C tokens',
      best: {
        cost: 'Θ(E · T)',
        why: 'One pass per expert down its column of p, for small C.',
        example: 'expert-choice',
      },
      average: {
        cost: 'Θ(E · T log C)',
        why: 'A heap of size C per expert.',
        example: 'expert-choice',
      },
      worst: { cost: 'Θ(E · T log T)', why: 'Sorting every column.', example: 'expert-choice' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MoeSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    catSat,
    topOneDrop,
    smallWords,
    moreRoom,
    animalsOnly,
    expertChoice,
    expertChoiceTight,
  ] as unknown as SavedExample[],
  practice: moePractice(() => moeRouting),
  preview: { example: 'small-words', level: 2, hide: ['l-'] },
  opening: 'cat-sat',
};

/**
 * The code tabs' line: for each token its kept experts and weights ("2:0.818"), "-" for none,
 * tokens separated by " / "; then the number of dropped assignments and of tokens with no
 * expert; then the load-balance loss, three decimals.
 */
export const resultLine = (r: Routed, tokens: number): string => {
  const per = Array.from({ length: tokens }, (_, t) => {
    const kept = r.assignments
      .filter((a) => a.token === t && a.kept)
      .sort((a, b) => a.expert - b.expert)
      .map((a) => `${a.expert + 1}:${round3(a.weight)}`);
    return kept.length ? kept.join(',') : '-';
  });
  return `${per.join(' / ')} | ${r.dropped} ${r.orphans.length} | ${round3(r.loss)}`;
};

/**
 * Driver protocol for the code tabs. "w <rows> <cols> <values>" sets the router; "clear" starts a
 * sentence and "x <4 numbers>" adds a token. Neither prints. "route <k> <cf> <token|expert>"
 * prints `resultLine`.
 */
function codeScript(calls: OpCall[], settings: MoeSettings) {
  const t = new Timeline(moeRouting, settings, 1, calls);
  const input: string[] = [`w ${W_R.length} ${E} ${W_R.flat().join(' ')}`];
  const expected: string[] = [];
  let x: number[][] | undefined;
  const sync = (s: MoeState) => {
    if (s.x !== x) input.push('clear', ...s.x.map((row) => `x ${row.join(' ')}`));
    x = s.x;
  };
  sync(t.initial.state);
  for (const e of t.entries) {
    sync(e.end);
    if (e.call[0] !== 'route' || !e.end.result) continue;
    input.push(`route ${settings.k} ${settings.cf} ${settings.routing}`);
    expected.push(resultLine(e.end.result, e.end.words.length));
  }
  return { input, expected };
}

export default moeRouting;
