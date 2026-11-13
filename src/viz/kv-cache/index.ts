import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { ACTIONS, ANIMALS } from '../_lm/vocab';
import cppSource from './code/cpp/kv_cache.hpp?raw';
import javaSource from './code/java/KVCache.java?raw';
import pythonSource from './code/python/kv_cache.py?raw';
import cacheGrows from './examples/cache-grows.json';
import noCache from './examples/no-cache.json';
import oneByOne from './examples/one-by-one.json';
import onePass from './examples/one-pass.json';
import windowNoCache from './examples/window-no-cache.json';
import windowed from './examples/window.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  DESIGNED,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  rowAttention,
  windowOf,
  type KvExtra,
  type KvSettings,
  type KvState,
} from './model';
import { parseSentence } from '../self-attention/model';
import { kvPractice } from './practice';
import { randomWords } from './texts';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** Prefill the first `prompt` words, then generate the rest one at a time. */
const split = (words: readonly string[], prompt: number): OpCall[] => [
  ['prefill', words.slice(0, prompt).join(' ')],
  ...words.slice(prompt).map((w): OpCall => ['generate', w]),
];

const preset = (label: string, make: (rng: Rng, size: number) => OpCall[]): Preset => ({
  label,
  make,
});

export const kvCache: VizDef<KvState, KvSettings, KvExtra> = {
  id: 'kv-cache',
  title: 'KV cache',
  family: 'Serving LLMs',
  blurb:
    'Generating text one token at a time: keep every earlier key and value instead of computing them again. Prefill against decode, the work and the memory, and a sliding window that evicts the oldest.',
  settings: [
    {
      kind: 'boolean',
      key: 'cache',
      label: 'Keep a KV cache',
      help: 'On: each new token computes one row of K and one of V and appends them. Off: every step computes K and V again for every token it sees.',
    },
    {
      kind: 'choice',
      key: 'window',
      label: 'Sliding window',
      options: [
        { value: 'all', label: 'None: every token sees all before it' },
        { value: '2', label: 'The last 2 tokens' },
        { value: '3', label: 'The last 3 tokens' },
        { value: '4', label: 'The last 4 tokens' },
      ],
      help: 'Sliding-window attention (as in Mistral 7B): a token sees only the last w tokens, itself included, so the cache never holds more than w rows and evicts the oldest.',
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
      label: 'Text',
      placeholder: 'e.g. the cat sat',
      maxLength: 60,
      sample: 'the cat sat',
      parse: (text) => {
        const words = parseSentence(text);
        return words instanceof Error ? words : words.join(' ');
      },
    },
    buttons: [
      { op: 'prefill', label: 'Prefill', usesInput: true, primary: true },
      { op: 'generate', label: 'Generate', usesInput: true, bulk: true },
    ],
    random: {
      label: 'Random text',
      make: (rng) => {
        const size = rng.int(4, 8);
        return split(randomWords(rng, size), rng.int(1, 4));
      },
    },
    presets: [
      preset('Text from the corpus', (rng, size) =>
        split(randomWords(rng, size), Math.min(3, size - 1)),
      ),
      preset('A long prompt, one new token', (rng, size) =>
        split(randomWords(rng, size), Math.min(7, size - 1)),
      ),
      preset('A one-word prompt, the rest one by one', (rng, size) =>
        split(randomWords(rng, size), 1),
      ),
      preset('The same word again and again', (rng, size) => {
        const a = pick(rng, ANIMALS);
        return split(['the', ...Array<string>(size - 1).fill(a)], 2);
      }),
      preset('Words it does not know', (rng, size) =>
        split(
          ['the', 'zorp', pick(rng, ACTIONS), 'a', 'blip', 'and', 'it', 'ran'].slice(0, size),
          2,
        ),
      ),
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Generate one token, with the cache',
      best: {
        cost: 'Θ(d · d_k + w · d_k)',
        why: 'With a window the cache stops growing: the same cost for every token.',
        example: 'window',
      },
      average: {
        cost: 'Θ(d · d_k + t · d_k)',
        why: 'One new row of K and of V, then t scores and t values to blend.',
        example: 'cache-grows',
      },
      worst: {
        cost: 'Θ(d · d_k + n · d_k)',
        why: 'The last of n tokens sees all n.',
        example: 'one-by-one',
      },
    },
    {
      op: 'Generate one token, without the cache',
      best: {
        cost: 'Θ(w · d · d_k)',
        why: 'With a window, only w rows of K and V to compute again.',
        example: 'window-no-cache',
      },
      average: {
        cost: 'Θ(t · d · d_k)',
        why: 'K and V again for all t tokens so far.',
        example: 'no-cache',
      },
      worst: {
        cost: 'Θ(n · d · d_k)',
        why: 'The last token recomputes all n rows.',
        example: 'no-cache',
      },
      note: 'With many layers it is worse: every earlier token goes through every layer again.',
    },
    {
      op: 'Prefill a prompt of n tokens',
      best: {
        cost: 'Θ(n · d · d_k + n · w · d_k)',
        why: 'With a window, each token attends to at most w.',
        example: 'window',
      },
      average: {
        cost: 'Θ(n · d · d_k + n² · d_k)',
        why: 'Q, K and V in one matrix product each; n(n + 1)/2 scores under the mask.',
        example: 'one-pass',
      },
      worst: {
        cost: 'Θ(n · d · d_k + n² · d_k)',
        why: 'The same arithmetic as n steps with a cache, but in one pass instead of n.',
        example: 'one-pass',
      },
    },
    {
      op: 'Generate n tokens in all',
      best: {
        cost: 'Θ(n · (d + w) · d_k)',
        why: 'A cache and a window: a fixed cost per token.',
        example: 'window',
      },
      average: {
        cost: 'Θ(n · d · d_k + n² · d_k)',
        why: 'A cache: the projections are linear, attention to a growing cache quadratic.',
        example: 'one-by-one',
      },
      worst: {
        cost: 'Θ(n² · d · d_k)',
        why: 'No cache: token t computes t rows of K and V again.',
        example: 'no-cache',
      },
    },
    {
      op: 'Memory for the cache',
      best: { cost: 'Θ(w · d_k)', why: 'A window caps it at w rows.', example: 'window' },
      average: {
        cost: 'Θ(t · d_k)',
        why: 'A row of K and a row of V for every token so far.',
        example: 'cache-grows',
      },
      worst: {
        cost: 'Θ(n · d_k)',
        why: 'Per head and per layer, for every sequence being served.',
        example: 'one-by-one',
      },
      note: 'Without a cache nothing is kept; the price is paid in work instead.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as KvSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    cacheGrows,
    noCache,
    windowed,
    windowNoCache,
    onePass,
    oneByOne,
  ] as unknown as SavedExample[],
  practice: kvPractice(() => kvCache),
  preview: { example: 'cache-grows', level: 2 },
  opening: 'cache-grows',
};

const three = (v: readonly number[]) => v.map(round3).join(' ');

/**
 * Driver protocol for the code tabs. "w q|k|v rows cols <values row by row>" sets a weight
 * matrix and "settings <window, 0 for none> <cache 1|0>" the options; neither prints.
 * "prefill <four numbers per token>" prints every prompt token's output (" / " between them),
 * a bar and the rows in the cache; "decode <four numbers>" prints the new token's output, a bar
 * and the rows in the cache.
 */
function codeScript(calls: OpCall[], settings: KvSettings) {
  const t = new Timeline(kvCache, settings, 1, calls);
  const w = windowOf(settings);
  const input = [
    ...(['q', 'k', 'v'] as const).map((m) => {
      const x = m === 'q' ? DESIGNED.wq : m === 'k' ? DESIGNED.wk : DESIGNED.wv;
      return `w ${m} ${x.length} ${x[0]!.length} ${x.flat().join(' ')}`;
    }),
    `settings ${Number.isFinite(w) ? w : 0} ${settings.cache ? 1 : 0}`,
  ];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    // A refused operation leaves the state as it was.
    if (s !== before) {
      if (e.call[0] === 'prefill') {
        input.push(`prefill ${s.x.flat().join(' ')}`);
        const z = s.words.map((_, i) => three(rowAttention(s.x, i, w).z));
        expected.push(`${z.join(' / ')} | ${s.k.length}`);
      } else {
        input.push(`decode ${s.x.at(-1)!.join(' ')}`);
        expected.push(`${three(s.last!.z)} | ${s.k.length}`);
      }
    }
    before = s;
  }
  return { input, expected };
}

export default kvCache;
