import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/policy.hpp?raw';
import javaSource from './code/java/Policy.java?raw';
import pythonSource from './code/python/policy.py?raw';
import allEqual from './examples/all-equal.json';
import dpoPairs from './examples/dpo-pairs.json';
import dpoRun from './examples/dpo-run.json';
import grpoRun from './examples/grpo-run.json';
import grpoStep from './examples/grpo-step.json';
import klLeash from './examples/kl-leash.json';
import ppoClip from './examples/ppo-clip.json';
import ppoRun from './examples/ppo-run.json';
import rareAnswer from './examples/rare-answer.json';
import reinforceRaw from './examples/reinforce-raw.json';
import explain from './explain.md?raw';
import {
  ANSWERS,
  BETAS,
  CLIPS,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseRewards,
  policy,
  pseudocode,
  REF_LOGITS,
  rewardsText,
  type PoExtra,
  type PoSettings,
  type PoState,
  type Rec,
} from './model';
import { policyPractice } from './practice';
import { view } from './view';

const tenth = (rng: Rng) => rng.int(0, 10) / 10;

const preset = (
  label: string,
  rewards: (rng: Rng) => string,
  then: OpCall[] = [['run']],
): Preset => ({
  label,
  make: (rng) => [['rewards', rewards(rng)], ...then],
});

export const policyOptimization: VizDef<PoState, PoSettings, PoExtra> = {
  id: 'policy-optimization',
  title: 'Policy optimization (PPO, GRPO, DPO)',
  family: 'Training',
  blurb:
    'Tune a model with rewards: let it answer, score the answers, and make the good ones more likely. REINFORCE, PPO’s clipped ratio, GRPO’s group scores and DPO’s preference pairs, one prompt and four bars.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'grpo', label: 'GRPO: scores against the group, no critic' },
        { value: 'ppo', label: 'PPO: clipped ratio, a critic’s baseline' },
        { value: 'reinforce', label: 'REINFORCE: the raw rewards' },
        { value: 'dpo', label: 'DPO: preference pairs, no reward model' },
      ],
      help: 'GRPO (Shao et al. 2024) is what DeepSeek used for reasoning; PPO (Schulman et al. 2017) is the classic; DPO (Rafailov et al. 2023) skips the rewards altogether.',
    },
    {
      kind: 'choice',
      key: 'clip',
      label: 'Clip ε (PPO, GRPO)',
      options: CLIPS.map((v) => ({ value: v, label: v })),
      help: 'A sample stops counting once its ratio π/π_old leaves 1 ± ε. Schulman et al. found 0.2 best.',
    },
    {
      kind: 'choice',
      key: 'beta',
      label: 'KL weight β',
      options: BETAS.map((v) => ({ value: v, label: v })),
      help: 'How hard the policy is held near the reference. In DPO, β also sets how far the winner must pull ahead before a pair is learned.',
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
      label: 'Rewards',
      placeholder: `e.g. 1 0.3 0.2 0.5, for ${ANSWERS.join(', ')}`,
      maxLength: 40,
      sample: '1 0.3 0.2 0.5',
      parse: (text) => {
        const r = parseRewards(text);
        return r instanceof Error ? r : rewardsText(r);
      },
    },
    buttons: [
      { op: 'rewards', label: 'Set rewards', usesInput: true, primary: true },
      { op: 'step', label: 'Step', usesInput: false },
      { op: 'run', label: 'Run 10 steps', usesInput: false },
      { op: 'reset', label: 'Back to the reference', usesInput: false, more: true },
    ],
    random: {
      label: 'Random rewards',
      make: (rng) => [['rewards', Array.from({ length: 4 }, () => tenth(rng)).join(' ')], ['step']],
    },
    presets: [
      preset('A reward model’s scores', () => '1 0.3 0.2 0.5'),
      preset('Right or wrong (a checker)', () => '1 0 0 0'),
      preset('Wrong answers cost', () => '1 -1 -1 0'),
      preset('All rewards equal', (rng) => Array(4).fill(tenth(rng)).join(' '), [['step']]),
      preset('Only the rare answer is good', () => '0 0 0 1'),
      preset('Random rewards', (rng) => Array.from({ length: 4 }, () => tenth(rng)).join(' ')),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Scoring a group of G answers',
      best: {
        cost: 'Θ(G)',
        why: 'REINFORCE: the rewards are the scores.',
        example: 'reinforce-raw',
      },
      average: {
        cost: 'Θ(G)',
        why: 'GRPO: a mean and a standard deviation over the group.',
        example: 'grpo-step',
      },
      worst: {
        cost: 'Θ(G) + a critic',
        why: 'PPO: one more network, as large as the policy, to predict each reward.',
        example: 'ppo-clip',
      },
      note: 'In a real model, drawing the answers dominates: G answers of T tokens are G·T forward passes.',
    },
    {
      op: 'One update, V answers (or tokens)',
      best: {
        cost: 'Θ(V)',
        why: 'DPO: two logits move, but softmax needs all V.',
        example: 'dpo-pairs',
      },
      average: {
        cost: 'Θ(G · V)',
        why: 'REINFORCE: each of G samples touches every logit.',
        example: 'reinforce-raw',
      },
      worst: {
        cost: 'Θ(K · G · V)',
        why: 'PPO and GRPO reuse the group for K passes (2 here).',
        example: 'ppo-clip',
      },
    },
    {
      op: 'Models held during training',
      best: {
        cost: '2',
        why: 'DPO: the policy and the reference. No reward model, no critic.',
        example: 'dpo-run',
      },
      average: {
        cost: '3',
        why: 'GRPO: the policy, the reference and a reward model (or a checker).',
        example: 'grpo-run',
      },
      worst: {
        cost: '4',
        why: 'PPO: those three and the critic.',
        example: 'ppo-run',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PoSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    grpoStep,
    grpoRun,
    reinforceRaw,
    ppoClip,
    ppoRun,
    klLeash,
    allEqual,
    rareAnswer,
    dpoPairs,
    dpoRun,
  ] as unknown as SavedExample[],
  practice: policyPractice(() => policyOptimization),
  preview: {
    example: 'grpo-run',
    level: 2,
    hide: ['gr-', 'rw-', 'adv-', 'rho-', 'lr-', 'w-g', 'gb-', 'r-a', 'z-', 'dz-', 'ab-'],
  },
  opening: 'grpo-step',
};

const line = (xs: readonly number[]) => xs.map(round3).join(' ');

/** What the drivers print for one update. */
export function recLine(r: Rec): string {
  if (r.kind === 'dpo') return `${r.w} ${r.l} | ${round3(r.h)} | ${line(policy(r.z))}`;
  const last = r.passes.at(-1)!;
  const clipped = r.method === 'reinforce' ? '-' : last.clipped.map((c) => (c ? 1 : 0)).join('');
  return `${r.draws.map((d) => d.a).join(' ')} | ${line(r.adv)} | ${clipped} | ${line(policy(last.z))} | ${round3(r.vAfter)}`;
}

/**
 * Driver protocol for the code tabs. "ref <4 logits>" sets the reference policy's logits and
 * "logits <4>" the policy's, "rewards <4>" the rewards and "critic <v>" PPO's value; none
 * prints. "rl <method> <ε> <β> <4 u's>" draws a group with the u's, updates and prints the
 * group, the advantages, which samples the last pass clipped, the new π and the critic's value.
 * "dpo <β> <u's>" draws pairs from the reference with the u's until the rewards differ,
 * updates and prints the winner, the loser, h and the new π.
 */
function codeScript(calls: OpCall[], settings: PoSettings) {
  const t = new Timeline(policyOptimization, settings, 1, calls);
  const input = [`ref ${REF_LOGITS.join(' ')}`];
  const expected: string[] = [];
  const sync = (s: PoState) =>
    input.push(`logits ${s.z.join(' ')}`, `rewards ${s.rewards.join(' ')}`, `critic ${s.v}`);
  sync(t.initial.state);
  for (const e of t.entries) {
    const name = e.call[0];
    if (name === 'rewards' || name === 'reset') {
      sync(e.end);
      continue;
    }
    for (const r of e.steps.at(-1)!.extra?.log ?? []) {
      input.push(
        r.kind === 'dpo'
          ? `dpo ${settings.beta} ${r.draws.map((d) => String(d.u)).join(' ')}`
          : `rl ${settings.method} ${settings.clip} ${settings.beta} ${r.draws.map((d) => String(d.u)).join(' ')}`,
      );
      expected.push(recLine(r));
    }
  }
  return { input, expected };
}

export default policyOptimization;
