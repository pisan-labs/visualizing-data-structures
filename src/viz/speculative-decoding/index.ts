import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { CORPUS } from '../_lm/corpus';
import cppSource from './code/cpp/speculative.hpp?raw';
import javaSource from './code/java/Speculative.java?raw';
import pythonSource from './code/python/speculative.py?raw';
import allAccepted from './examples/all-accepted.json';
import badDraft from './examples/bad-draft.json';
import generate from './examples/generate.json';
import givenU from './examples/given-u.json';
import greedy from './examples/greedy.json';
import oneDraft from './examples/one-draft.json';
import oneRound from './examples/one-round.json';
import rejection from './examples/rejection.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseInput,
  pseudocode,
  type SpecExtra,
  type SpecSettings,
  type SpecState,
} from './model';
import { speculativePractice } from './practice';
import { added, usedUs, type Round } from './spec';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** The first one to three words of a corpus sentence: a prompt the models know. */
export function randomPrompt(rng: Rng, size = 2): string {
  const s = pick(rng, CORPUS).split(' ');
  return s.slice(0, Math.max(1, Math.min(3, size, s.length - 1))).join(' ');
}

const preset = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size) => [['start', make(rng, size)], ['generate']],
});

export const speculative: VizDef<SpecState, SpecSettings, SpecExtra> = {
  id: 'speculative-decoding',
  title: 'Speculative decoding',
  family: 'Language models and decoding',
  blurb:
    'A small model guesses the next few words; the large model checks them all in one pass, keeps the ones it agrees with, and fixes the first it does not. The large model’s own distribution, in fewer slow passes.',
  settings: [
    {
      kind: 'number',
      key: 'k',
      label: 'Drafts per round (k)',
      min: 1,
      max: 5,
      help: 'Leviathan et al. call it γ. More drafts can save more passes, but every rejected draft was a small pass for nothing.',
    },
    {
      kind: 'choice',
      key: 'accept',
      label: 'Acceptance',
      options: [
        { value: 'sample', label: 'Sampling: accept with chance min(1, p/q)' },
        { value: 'greedy', label: 'Greedy: accept when the top words agree' },
      ],
      help: 'With sampling the text has exactly the large model’s distribution (Leviathan et al. 2023; Chen et al. 2023). With greedy decoding it is exactly the large model’s greedy text.',
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
      label: 'Prompt, or u values',
      placeholder: 'e.g. the cat, or 0.3 0.9 0.5',
      maxLength: 60,
      sample: 'the dog',
      parse: parseInput,
    },
    buttons: [
      { op: 'start', label: 'Start', usesInput: true, primary: true },
      { op: 'step', label: 'One round', usesInput: false },
      { op: 'generate', label: 'Generate', usesInput: false },
      { op: 'draft', label: 'Draft', usesInput: false, more: true },
      { op: 'verify', label: 'Verify', usesInput: false, more: true },
      { op: 'check', label: 'Verify with u', usesInput: true, more: true },
    ],
    random: {
      label: 'Random prompt',
      make: (rng) => [['start', randomPrompt(rng, rng.int(1, 3))], ['generate']],
    },
    presets: [
      preset('Random prompt', randomPrompt),
      preset('One word: the', () => 'the'),
      preset('A rare start: a', () => 'a'),
      preset('Mid-sentence: the dog ran', () => 'the dog ran'),
      preset('Where both models agree: the dog chased', () => 'the dog chased'),
    ],
    sizes: [1, 2, 3],
  },
  explain,
  complexity: [
    {
      op: 'Large passes for N words',
      best: {
        cost: 'N / (k + 1)',
        why: 'Every draft accepted: each pass adds k drafts and a bonus word.',
        example: 'all-accepted',
      },
      average: {
        cost: 'N (1 − α) / (1 − α^(k+1))',
        why: 'With acceptance rate α, a pass adds (1 − α^(k+1)) / (1 − α) words on average (Leviathan et al.).',
        example: 'generate',
      },
      worst: {
        cost: 'N',
        why: 'The first draft is rejected every time: one word per pass, as plain decoding.',
        example: 'bad-draft',
      },
      note: 'A large pass over k + 1 positions costs about as much as over one, when decoding is limited by memory, not arithmetic.',
    },
    {
      op: 'Small passes per round',
      best: { cost: '1', why: 'k = 1, or the first draft ends the text.', example: 'one-draft' },
      average: { cost: 'k', why: 'One small pass per draft.', example: 'one-round' },
      worst: {
        cost: 'k',
        why: 'All k are paid for even when the first is rejected.',
        example: 'rejection',
      },
    },
    {
      op: 'Checking one round',
      best: {
        cost: 'Θ(V)',
        why: 'The first test rejects: one leftover over the V words.',
        example: 'rejection',
      },
      average: {
        cost: 'Θ(k + V)',
        why: 'A test per draft is a division; the bonus or leftover draw walks V words.',
        example: 'one-round',
      },
      worst: {
        cost: 'Θ(k + V)',
        why: 'The checking is cheap; the large pass is what costs.',
        example: 'given-u',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SpecSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    generate,
    oneRound,
    rejection,
    givenU,
    greedy,
    allAccepted,
    badDraft,
    oneDraft,
  ] as unknown as SavedExample[],
  practice: speculativePractice(() => speculative),
  preview: { example: 'one-round', level: 2, hide: ['text', 'tok-', 'pl-', 'dist'] },
  opening: 'generate',
};

/**
 * Driver protocol for the code tabs. "s <sentence>" for each corpus sentence (no output), then
 * per round "round <k> <greedy|sample> <prefix ...> | <u ...>", the u values in the order the
 * round used them (drafts, tests, the word drawn). It prints "<drafts accepted> | <words added>".
 */
function codeScript(calls: OpCall[], settings: SpecSettings) {
  const t = new Timeline(speculative, settings, 1, calls);
  const input: string[] = CORPUS.map((s) => `s ${s}`);
  const expected: string[] = [];
  const seen = new Set<Round>();
  for (const e of t.entries)
    for (const step of [...e.steps.map((x) => x.state), e.end]) {
      const r = step.last;
      if (!r || seen.has(r)) continue;
      seen.add(r);
      input.push(
        `round ${r.k} ${r.greedy ? 'greedy' : 'sample'} ${r.prefix.join(' ')} | ${usedUs(r).join(' ')}`,
      );
      expected.push(`${r.accepted} | ${added(r).join(' ')}`);
    }
  return { input, expected };
}

export default speculative;
