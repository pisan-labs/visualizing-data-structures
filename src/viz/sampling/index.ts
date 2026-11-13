import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/sampling.hpp?raw';
import javaSource from './code/java/Sampling.java?raw';
import pythonSource from './code/python/sampling.py?raw';
import cold from './examples/cold.json';
import flatTopK from './examples/flat-top-k.json';
import givenU from './examples/given-u.json';
import greedySame from './examples/greedy-same.json';
import hot from './examples/hot.json';
import minP from './examples/min-p.json';
import nucleus from './examples/nucleus.json';
import peakedTopP from './examples/peaked-top-p.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  fmt,
  init,
  initialSay,
  initialVars,
  ops,
  parseLogits,
  parseU,
  pseudocode,
  randomLogits,
  WORDS,
  type Pass,
  type SampExtra,
  type SampSettings,
  type SampState,
} from './model';
import { samplingPractice } from './practice';
import { view } from './view';

const preset = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size) => [['load', make(rng, size)], ['sample']],
});

const clampN = (size: number) => Math.max(2, Math.min(WORDS.length, size));

export const sampling: VizDef<SampState, SampSettings, SampExtra> = {
  id: 'sampling',
  title: 'Sampling: temperature, top-k, top-p',
  family: 'Language models and decoding',
  blurb:
    'Turn a model’s scores for the next word into a choice: temperature, softmax, then greedy, top-k, top-p or min-p cut the list, and a random number picks from what is left.',
  settings: [
    {
      kind: 'choice',
      key: 'strategy',
      label: 'Strategy',
      options: [
        { value: 'top-p', label: 'Top-p (nucleus): the most likely words up to p' },
        { value: 'top-k', label: 'Top-k: the k most likely words' },
        { value: 'min-p', label: 'Min-p: words with a share of the top word’s probability' },
        { value: 'pure', label: 'Plain sampling: every word' },
        { value: 'greedy', label: 'Greedy: always the most likely word' },
      ],
      help: 'Holtzman et al. (2020) introduced top-p; top-k is older (Fan et al. 2018); min-p is from Nguyen et al. (2024).',
    },
    {
      kind: 'choice',
      key: 'temperature',
      label: 'Temperature T',
      options: ['0.5', '0.7', '1', '1.5', '2'].map((v) => ({ value: v, label: v })),
      help: 'Each logit is divided by T before the softmax. Below 1 sharpens the distribution; above 1 flattens it.',
    },
    { kind: 'number', key: 'k', label: 'k (for top-k)', min: 1, max: 8 },
    {
      kind: 'choice',
      key: 'p',
      label: 'p (for top-p)',
      options: ['0.5', '0.75', '0.9', '0.95'].map((v) => ({ value: v, label: v })),
    },
    {
      kind: 'choice',
      key: 'minP',
      label: 'Ratio (for min-p)',
      options: ['0.05', '0.1', '0.2', '0.3'].map((v) => ({ value: v, label: v })),
      help: 'Min-p keeps every word whose probability is at least this fraction of the top word’s.',
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
      label: 'Logits, or u',
      placeholder: 'e.g. 3.2 2.4 1.9 1.1',
      maxLength: 60,
      sample: '3.2 2.4 1.9 1.1 0.6 0.1 -0.8 -1.5',
      parse: (text) => {
        const one = text.trim().split(/[\s,]+/).length === 1;
        if (one) {
          const u = parseU(text);
          return u instanceof Error ? u : String(u);
        }
        const xs = parseLogits(text);
        return xs instanceof Error ? xs : xs.join(' ');
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'softmax', label: 'Softmax', usesInput: false },
      { op: 'sample', label: 'Sample', usesInput: false },
      { op: 'repeat', label: 'Sample 20 times', usesInput: false },
      { op: 'draw', label: 'Draw with u', usesInput: true, more: true },
    ],
    random: {
      label: 'Random logits',
      make: (rng) => [['load', randomLogits(rng, rng.int(4, 8))], ['sample']],
    },
    presets: [
      preset('Random logits', randomLogits),
      preset('Confident: one clear favourite', (rng, size) => {
        const n = clampN(size);
        return fmt([rng.int(50, 70) / 10, ...Array.from({ length: n - 1 }, (_, i) => 1 - i * 0.4)]);
      }),
      preset('Unsure: nearly flat', (rng, size) =>
        fmt(Array.from({ length: clampN(size) }, (_, i) => 1.2 - i * (rng.int(1, 2) / 10))),
      ),
      preset('A two-way tie at the top', (rng, size) => {
        const n = clampN(size);
        const t = rng.int(25, 35) / 10;
        return fmt([t, t, ...Array.from({ length: n - 2 }, (_, i) => t - 1.5 - i * 0.5)]);
      }),
      preset('Every word equal', (_rng, size) => fmt(Array(clampN(size)).fill(1))),
      preset('A long tail', (_rng, size) =>
        fmt(Array.from({ length: clampN(size) }, (_, i) => (i === 0 ? 2.5 : 0.8 - i * 0.05))),
      ),
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'Temperature and softmax',
      best: {
        cost: 'Θ(V)',
        why: 'One pass for the largest, one for the powers, one to divide.',
        example: 'nucleus',
      },
      average: {
        cost: 'Θ(V)',
        why: 'Every one of the V tokens gets a probability.',
        example: 'nucleus',
      },
      worst: { cost: 'Θ(V)', why: 'The same for any logits and any T.', example: 'hot' },
    },
    {
      op: 'Greedy (argmax)',
      best: { cost: 'Θ(V)', why: 'One pass to find the largest.', example: 'greedy-same' },
      average: { cost: 'Θ(V)', why: 'No sort and no random number.', example: 'greedy-same' },
      worst: { cost: 'Θ(V)', why: 'Every token has to be looked at once.', example: 'greedy-same' },
    },
    {
      op: 'Top-k cut',
      best: { cost: 'Θ(V)', why: 'k = 1 is the argmax.', example: 'greedy-same' },
      average: {
        cost: 'Θ(V log k)',
        why: 'Keep the k best in a min-heap of size k as you scan.',
        example: 'flat-top-k',
      },
      worst: {
        cost: 'Θ(V log k)',
        why: 'Every token may enter the heap; quickselect gets Θ(V) on average.',
        example: 'flat-top-k',
      },
      note: 'Sorting all V tokens, as this page does, costs Θ(V log V).',
    },
    {
      op: 'Top-p cut',
      best: {
        cost: 'Θ(V)',
        why: 'Build a heap in Θ(V); the top token alone reaches p.',
        example: 'peaked-top-p',
      },
      average: {
        cost: 'Θ(V + m log V)',
        why: 'Pop the m tokens kept, largest first.',
        example: 'nucleus',
      },
      worst: {
        cost: 'Θ(V log V)',
        why: 'A flat distribution keeps nearly every token: a full sort.',
        example: 'hot',
      },
    },
    {
      op: 'Min-p cut',
      best: {
        cost: 'Θ(V)',
        why: 'One pass for the top probability, one to filter.',
        example: 'min-p',
      },
      average: { cost: 'Θ(V)', why: 'No sort is needed to filter.', example: 'min-p' },
      worst: { cost: 'Θ(V)', why: 'The same however many survive.', example: 'min-p' },
    },
    {
      op: 'The draw',
      best: { cost: 'Θ(1)', why: 'u lands in the first, most likely token.', example: 'given-u' },
      average: {
        cost: 'Θ(m)',
        why: 'Walk the m kept tokens until the total passes u.',
        example: 'nucleus',
      },
      worst: {
        cost: 'Θ(m)',
        why: 'u lands in the last token; prefix sums and binary search make it Θ(log m).',
        example: 'hot',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SampSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    nucleus,
    peakedTopP,
    flatTopK,
    minP,
    cold,
    hot,
    greedySame,
    givenU,
  ] as unknown as SavedExample[],
  practice: samplingPractice(() => sampling),
  preview: { example: 'nucleus', level: 2 },
  opening: 'nucleus',
};

/** The code tabs' line for one pass: the kept words with p′, most likely first, and the pick. */
export const passLine = (s: SampState, pass: Pass): string =>
  `${pass.order
    .slice(0, pass.keep)
    .map((i) => `${s.words[i]} ${round3(pass.q[i]!)}`)
    .join(' ')} | ${s.words[pass.order[pass.at]!]}`;

/**
 * Driver protocol for the code tabs. "logits <word> <logit> ..." sets the logits (no output).
 * "softmax <T>" prints every word with its probability, most likely first. "sample <strategy>
 * <T> <k> <p> <ratio> <u>" prints `passLine`.
 */
function codeScript(calls: OpCall[], settings: SampSettings) {
  const t = new Timeline(sampling, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let logits: number[] | undefined;
  const sync = (s: SampState) => {
    if (s.logits !== logits)
      input.push(`logits ${s.words.map((w, i) => `${w} ${s.logits[i]}`).join(' ')}`);
    logits = s.logits;
  };
  sync(t.initial.state);
  const T = settings.temperature;
  for (const e of t.entries) {
    sync(e.end);
    const op = e.call[0];
    if (op === 'softmax') {
      const pass = e.end.pass!;
      input.push(`softmax ${T}`);
      expected.push(pass.order.map((i) => `${e.end.words[i]} ${round3(pass.p[i]!)}`).join(' '));
      continue;
    }
    if (op !== 'sample' && op !== 'draw' && op !== 'repeat') continue;
    const seen = new Set<Pass>();
    for (const step of e.steps) {
      const pass = step.extra?.work?.pass;
      if (!pass || seen.has(pass)) continue;
      seen.add(pass);
      input.push(
        `sample ${settings.strategy} ${T} ${settings.k} ${settings.p} ${settings.minP} ${pass.u ?? 0}`,
      );
      expected.push(passLine(e.end, pass));
    }
  }
  return { input, expected };
}

export default sampling;
