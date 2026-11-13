import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/beam.hpp?raw';
import javaSource from './code/java/BeamSearch.java?raw';
import pythonSource from './code/python/beam.py?raw';
import afterDog from './examples/after-dog.json';
import greedyMisses from './examples/greedy-misses.json';
import lengthNorm from './examples/length-norm.json';
import refill from './examples/refill.json';
import shortLimit from './examples/short-limit.json';
import wideBeam from './examples/wide-beam.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_WIDTH,
  ops,
  parseStart,
  pseudocode,
  STARTS,
  TABLE,
  words,
  type BeamExtra,
  type BeamSettings,
  type BeamState,
} from './model';
import { beamPractice } from './practice';
import { view } from './view';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

const preset = (label: string, make: (rng: Rng) => OpCall[]): Preset => ({
  label,
  make: (rng) => make(rng),
});

export const beamSearch: VizDef<BeamState, BeamSettings, BeamExtra> = {
  id: 'beam-search',
  title: 'Beam search',
  family: 'Language models and decoding',
  blurb:
    'Grow a tree of guesses one word at a time and keep only the best few by log-probability: more careful than greedy, far cheaper than trying every sentence.',
  settings: [
    {
      kind: 'number',
      key: 'width',
      label: 'Beam width B',
      min: 1,
      max: MAX_WIDTH,
      help: 'How many hypotheses survive each step. B = 1 is greedy decoding.',
    },
    {
      kind: 'boolean',
      key: 'norm',
      label: 'Length normalization (score ÷ length)',
      help: 'Every word adds a negative log-probability, so raw scores favour short outputs. SLP3 divides by the length to compare finished hypotheses fairly.',
    },
    {
      kind: 'choice',
      key: 'eos',
      label: 'When a hypothesis ends with </s>',
      options: [
        { value: 'shrink', label: 'Set it aside; the beam narrows by one (SLP3)' },
        { value: 'refill', label: 'Set it aside; refill the beam; stop when B have finished' },
      ],
      help: 'Implementations differ here, and so can the answer.',
    },
    {
      kind: 'number',
      key: 'maxLen',
      label: 'Longest output (tokens)',
      min: 2,
      max: 6,
      help: 'A hypothesis still going at this length is cut and counts as finished.',
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
      label: 'Start after',
      placeholder: '<s>, or a word such as dog',
      maxLength: 10,
      sample: '<s>',
      parse: (text) => parseStart(text),
    },
    buttons: [
      { op: 'search', label: 'Beam search', usesInput: true, primary: true },
      { op: 'greedy', label: 'Greedy', usesInput: true },
    ],
    random: {
      label: 'Random start',
      make: (rng) => [['search', pick(rng, STARTS.slice(0, 8))]],
    },
    presets: [
      preset('From the start: greedy, then beam', () => [
        ['greedy', '<s>'],
        ['search', '<s>'],
      ]),
      preset('From the start', () => [['search', '<s>']]),
      preset('After "the"', () => [['search', 'the']]),
      preset('After "dog"', () => [['search', 'dog']]),
      preset('After a random word', (rng) => [['search', pick(rng, STARTS.slice(1, 8))]]),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'One step',
      best: {
        cost: 'Θ(B · V)',
        why: 'Each of B hypotheses tries each of V next words.',
        example: 'greedy-misses',
      },
      average: {
        cost: 'Θ(B · V · log B)',
        why: 'Keep the best B of the B · V candidates with a heap of size B.',
        example: 'greedy-misses',
      },
      worst: {
        cost: 'Θ(B · V · log(B · V))',
        why: 'Sorting all the candidates, as this page does.',
        example: 'wide-beam',
      },
      note: 'With a real model, the B forward passes cost far more than the bookkeeping.',
    },
    {
      op: 'A whole search of T steps',
      best: {
        cost: 'Θ(T · V)',
        why: 'B = 1, greedy: one hypothesis per step.',
        example: 'greedy-misses',
      },
      average: {
        cost: 'Θ(T · B · V · log B)',
        why: 'T steps of the one above.',
        example: 'greedy-misses',
      },
      worst: {
        cost: 'Θ(T · B · V · log B)',
        why: 'Never more, however the sentences end. Trying every sentence would be Θ(Vᵀ).',
        example: 'wide-beam',
      },
    },
    {
      op: 'Memory',
      best: {
        cost: 'Θ(B · T)',
        why: 'B hypotheses of up to T words (or back pointers).',
        example: 'greedy-misses',
      },
      average: {
        cost: 'Θ(B · T)',
        why: 'Dropped candidates are thrown away.',
        example: 'after-dog',
      },
      worst: {
        cost: 'Θ(B · V · T)',
        why: 'Keeping the whole tree, as this page draws it.',
        example: 'wide-beam',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BeamSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    greedyMisses,
    lengthNorm,
    wideBeam,
    refill,
    afterDog,
    shortLimit,
  ] as unknown as SavedExample[],
  practice: beamPractice(() => beamSearch),
  preview: { example: 'greedy-misses', level: 3, hide: ['f-'] },
  opening: 'greedy-misses',
};

/**
 * Driver protocol for the code tabs. "p <word> <next> <probability>" adds a row of the model
 * (no output). "search <start> <B> <norm 1|0> <shrink|refill> <max length>" prints the finished
 * hypotheses in the order they finished, each with its log-probability, then "=>" and the best.
 */
function codeScript(calls: OpCall[], settings: BeamSettings) {
  const t = new Timeline(beamSearch, settings, 1, calls);
  const input: string[] = Object.entries(TABLE).flatMap(([w, row]) =>
    row.map(([next, p]) => `p ${w} ${next} ${p}`),
  );
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const sr = e.end.search;
    const refused = e.end === prev;
    prev = e.end;
    if (refused || !sr) continue;
    const B = e.call[0] === 'greedy' ? 1 : settings.width;
    input.push(
      `search ${sr.start} ${B} ${settings.norm ? 1 : 0} ${settings.eos} ${settings.maxLen}`,
    );
    const hyp = (id: number) => words(sr, id).join(' ');
    expected.push(
      `${sr.finished.map((f) => `${hyp(f)} ${round3(sr.nodes[f]!.score)}`).join(' | ')} => ${sr.best === null ? 'none' : hyp(sr.best)}`,
    );
  }
  return { input, expected };
}

export default beamSearch;
