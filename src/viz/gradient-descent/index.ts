import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/optimizers.hpp?raw';
import javaSource from './code/java/Optimizers.java?raw';
import pythonSource from './code/python/optimizers.py?raw';
import adamNarrow from './examples/adam-narrow.json';
import bounce from './examples/bounce.json';
import converge from './examples/converge.json';
import crawl from './examples/crawl.json';
import curvedValley from './examples/curved-valley.json';
import diverge from './examples/diverge.json';
import localMinimum from './examples/local-minimum.json';
import momentumEscapes from './examples/momentum-escapes.json';
import momentumValley from './examples/momentum-valley.json';
import narrowDiverge from './examples/narrow-diverge.json';
import noBiasCorrection from './examples/no-bias-correction.json';
import roundOneStep from './examples/round-one-step.json';
import zigzag from './examples/zigzag.json';
import explain from './explain.md?raw';
import {
  BETA1,
  BETA2,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  LEARNING_RATES,
  ops,
  parsePoint,
  pseudocode,
  type GdExtra,
  type GdSettings,
  type GdState,
} from './model';
import { gdPractice } from './practice';
import { SURFACES, type Surface } from './surfaces';
import { view } from './view';

/** A point as the input field writes it: "3" or "-3.5, 1". */
export const pointText = (p: readonly number[]) => p.map((v) => String(v)).join(', ');

const surfaceOfSettings = (settings?: Settings): Surface =>
  SURFACES[(settings?.surface as GdSettings['surface']) ?? defaults.surface] ?? SURFACES.bowl;

/** A point with two decimals at most, inside the plot (a margin of 10% left clear). */
function randomPoint(rng: Rng, sf: Surface): number[] {
  const pick = ([lo, hi]: [number, number]) => {
    const m = (hi - lo) * 0.1;
    return Math.round((lo + m + rng.next() * (hi - lo - 2 * m)) * 4) / 4;
  };
  return sf.dims === 1 ? [pick(sf.xr)] : [pick(sf.xr), pick(sf.yr)];
}

const preset = (label: string, where: (rng: Rng, sf: Surface) => number[]): Preset => ({
  label,
  make: (rng, _size, settings) => [
    ['start', pointText(where(rng, surfaceOfSettings(settings)))],
    ['run'],
  ],
});

const option = (v: string) => ({ value: v, label: v });

export const gradientDescent: VizDef<GdState, GdSettings, GdExtra> = {
  id: 'gradient-descent',
  title: 'Gradient descent (momentum, Adam)',
  family: 'Training',
  blurb:
    'Walk downhill on a loss curve or surface: a learning rate too small crawls, one too large diverges. Momentum builds up speed along a valley; Adam scales each step by the size of its recent gradients.',
  settings: [
    {
      kind: 'choice',
      key: 'surface',
      label: 'Loss',
      options: [
        { value: 'bowl', label: 'f(x) = x²: a bowl' },
        { value: 'wells', label: 'f(x) = x⁴/4 − x² + 0.3x: two valleys' },
        { value: 'round', label: 'f(x, y) = (x² + y²)/2: a round bowl' },
        { value: 'narrow', label: 'f(x, y) = (x² + 10y²)/2: a long, narrow bowl' },
        { value: 'valley', label: 'f(x, y) = (1 − x)² + 5(y − x²)²: a curved valley' },
      ],
      help: 'Changing the loss starts again from its usual starting point.',
    },
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'gd', label: 'Plain gradient descent' },
        { value: 'momentum', label: 'Momentum (heavy ball)' },
        { value: 'adam', label: 'Adam' },
      ],
    },
    {
      kind: 'choice',
      key: 'lr',
      label: 'Learning rate η',
      options: LEARNING_RATES.map(option),
      help: 'On f(x) = x², plain gradient descent converges for η below 1 and diverges above it.',
    },
    {
      kind: 'choice',
      key: 'beta1',
      label: 'β (momentum) or β₁ (Adam)',
      options: BETA1.map(option),
      help: 'How much of the past each step keeps. 0.9 is the usual choice for both.',
    },
    {
      kind: 'choice',
      key: 'beta2',
      label: 'β₂ (Adam)',
      options: BETA2.map(option),
      help: 'How long Adam remembers the size of the gradients. Kingma and Ba suggest 0.999.',
    },
    {
      kind: 'boolean',
      key: 'bias',
      label: 'Adam’s bias correction',
      help: 'Both of Adam’s averages start at 0; the correction scales them up over the first steps.',
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
      label: 'Start at',
      placeholder: 'e.g. 3, or -3.5, 1 on a surface',
      maxLength: 30,
      sample: '2',
      parse: (text) => {
        const p = parsePoint(text);
        return p instanceof Error ? p : pointText(p);
      },
    },
    buttons: [
      { op: 'start', label: 'Start', usesInput: true, primary: true },
      { op: 'step', label: 'Step', usesInput: false },
      { op: 'run', label: 'Run 50 steps', usesInput: false },
    ],
    presets: [
      preset('The usual start', (_rng, sf) => sf.start),
      preset('A random start', randomPoint),
      preset('Near the minimum', (rng, sf) =>
        sf.min.map(
          (v, i) => Math.round((v + (rng.int(0, 1) ? 0.5 : -0.5) * (i ? 0.5 : 1)) * 100) / 100,
        ),
      ),
      preset('Far out, at the edge', (rng, sf) =>
        sf.dims === 1
          ? [rng.int(0, 1) ? sf.xr[1] : sf.xr[0]]
          : [rng.int(0, 1) ? sf.xr[1] : sf.xr[0], sf.yr[1]],
      ),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'One step, with d parameters',
      best: {
        cost: 'Θ(d)',
        why: 'Plain: one multiply and one subtract per parameter.',
        example: 'converge',
      },
      average: {
        cost: 'Θ(d)',
        why: 'Momentum: one more multiply-add per parameter, for the velocity.',
        example: 'momentum-valley',
      },
      worst: {
        cost: 'Θ(d)',
        why: 'Adam: two averages and a square root per parameter, still linear.',
        example: 'adam-narrow',
      },
      note: 'Plus the gradient itself, which backpropagation gets for about the cost of one more pass through the model.',
    },
    {
      op: 'Steps to get within ε of the minimum of a bowl',
      best: {
        cost: '1',
        why: 'A round bowl and η = 1/L, where L is the curvature: one step lands on the minimum.',
        example: 'round-one-step',
      },
      average: {
        cost: 'O(κ log(1/ε))',
        why: 'κ = L/μ, steepest curvature over flattest. A narrow bowl (κ = 10) zigzags.',
        example: 'zigzag',
      },
      worst: {
        cost: 'never',
        why: 'With η > 2/L every step overshoots by more than the last.',
        example: 'diverge',
      },
      note: 'Momentum with well-chosen η and β brings κ down to √κ on a bowl.',
    },
    {
      op: 'Extra memory, with d parameters',
      best: { cost: '0', why: 'Plain gradient descent keeps only the point.', example: 'converge' },
      average: {
        cost: 'Θ(d)',
        why: 'Momentum keeps one velocity per parameter.',
        example: 'momentum-valley',
      },
      worst: {
        cost: 'Θ(2d)',
        why: 'Adam keeps two averages per parameter: two extra copies of the model.',
        example: 'adam-narrow',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as GdSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    converge,
    crawl,
    bounce,
    diverge,
    zigzag,
    narrowDiverge,
    momentumValley,
    adamNarrow,
    noBiasCorrection,
    localMinimum,
    momentumEscapes,
    curvedValley,
    roundOneStep,
  ] as unknown as SavedExample[],
  practice: gdPractice(() => gradientDescent),
  preview: {
    example: 'zigzag',
    hide: ['lc-', 'tx-', 'ty-', 'title', 'sub', 'min-t', 'ax-xn', 'ax-yn'],
  },
  opening: 'converge',
};

/**
 * Driver protocol for the code tabs. "surface <id>" picks the loss, "optimizer <method> <lr>
 * <β₁> <β₂> <bias 1|0>" the method, and "start <x> [y]" a starting point (and a fresh
 * optimizer); none of them prints. "step" takes one step and prints the new point, three
 * decimals per coordinate. A run of the page's is one "step" per step it took.
 */
function codeScript(calls: OpCall[], settings: GdSettings) {
  const t = new Timeline(gradientDescent, settings, 1, calls);
  const input = [
    `surface ${settings.surface}`,
    `optimizer ${settings.method} ${settings.lr} ${settings.beta1} ${settings.beta2} ${settings.bias ? 1 : 0}`,
  ];
  const expected: string[] = [];
  let path: number[][] | undefined;
  const sync = (s: GdState) => {
    if (s.t === 0 && s.path !== path) input.push(`start ${s.x.join(' ')}`);
    else if (path)
      for (const p of s.path.slice(path.length)) {
        input.push('step');
        expected.push(p.map(round3).join(' '));
      }
    path = s.path;
  };
  sync(t.initial.state);
  for (const e of t.entries) sync(e.end);
  return { input, expected };
}

export default gradientDescent;
