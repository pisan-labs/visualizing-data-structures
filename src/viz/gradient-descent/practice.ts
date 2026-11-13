import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, PracticeKind, VizDef } from '../../engine/types';
import { defaults, MAX_STEPS, num, type GdExtra, type GdSettings, type GdState } from './model';
import { SURFACES, type SurfaceId } from './surfaces';

type Def = VizDef<GdState, GdSettings, GdExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
/** A multiple of 0.25 between lo and hi, not 0. */
const quarter = (rng: Rng, lo: number, hi: number) => {
  for (;;) {
    const v = rng.int(lo * 4, hi * 4) / 4;
    if (v !== 0) return v;
  }
};

const answer = (x: number): PracticeAnswer =>
  Math.abs(x - Math.round(x)) < 1e-9
    ? { kind: 'number', value: Math.round(x) }
    : { kind: 'number', value: x, tolerance: 0.005 };

const OUTCOMES = [
  'It converges to the minimum',
  'It bounces between two points forever',
  'It diverges',
];

/**
 * Practice for gradient descent. The picture shows the run after the setup (a start, and
 * sometimes a step or two); the questions ask about the next step or the rest of the run.
 * Every answer comes from running the model.
 */
export function gdPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: GdSettings) =>
    new Timeline(def(), settings, 1, ops).endState();
  const startOf = (rng: Rng, surface: SurfaceId) =>
    surface === 'narrow'
      ? [quarter(rng, -3.5, 3.5), quarter(rng, -1.25, 1.25)]
      : [quarter(rng, -3.5, 3.5)];
  const text = (p: number[]) => p.join(', ');

  return [
    {
      id: 'next',
      title: 'The next point',
      make(rng) {
        const surface = pick(rng, ['bowl', 'narrow'] as const);
        const lr =
          surface === 'bowl'
            ? pick(rng, ['0.1', '0.3', '0.5', '0.9'])
            : pick(rng, ['0.05', '0.1', '0.15']);
        const settings: GdSettings = { ...defaults, surface, method: 'gd', lr };
        const p = startOf(rng, surface);
        const setup: OpCall[] = [
          ['start', text(p)],
          ...Array.from({ length: rng.int(0, 1) }, () => ['step'] as OpCall),
        ];
        const before = run(setup, settings);
        const after = run([...setup, ['step']], settings);
        const sf = SURFACES[surface];
        const g = sf.grad(before.x);
        const k = surface === 'bowl' ? 0 : rng.int(0, 1);
        const name = surface === 'bowl' ? 'x' : k === 0 ? 'x' : 'y';
        return {
          prompt: `Plain gradient descent on ${sf.text} with η = ${lr}. The point is at ${sf.dims === 1 ? `x = ${num(before.x[0]!)}` : `(${before.x.map(num).join(', ')})`}. What is **${name}** after one more step? Two decimals.`,
          setup,
          settings,
          answer: answer(after.x[k]!),
          explain: `The gradient's ${name} part is ${num(g[k]!)} (${sf.gradText}). The step is ${name} − η × ${num(g[k]!)} = ${num(before.x[k]!)} − ${lr} × ${num(g[k]!)} = ${num(after.x[k]!)}.`,
          watch: [['step']],
        };
      },
    },
    {
      id: 'converges',
      title: 'Does it converge?',
      make(rng) {
        const surface = pick(rng, ['bowl', 'narrow'] as const);
        const lr =
          surface === 'bowl'
            ? pick(rng, ['0.1', '0.5', '0.9', '1', '1.1'])
            : pick(rng, ['0.1', '0.15', '0.19', '0.21', '0.3']);
        const settings: GdSettings = { ...defaults, surface, method: 'gd', lr };
        const sf = SURFACES[surface];
        const setup: OpCall[] = [['start', text(sf.start)]];
        const ops: OpCall[] = [
          ...setup,
          ...Array.from({ length: MAX_STEPS / 50 }, () => ['run'] as OpCall),
        ];
        const end = run(ops, settings);
        const f0 = sf.f(sf.start);
        const f1 = sf.f(end.x);
        const correct =
          end.status === 'converged' || (end.status === 'ready' && f1 < f0 / 2)
            ? 0
            : end.status === 'diverged'
              ? 2
              : 1;
        const eta = Number(lr);
        const why =
          surface === 'bowl'
            ? `Here f′(x) = 2x, so a step takes x to x − η·2x = (1 − 2η)·x = ${num(1 - 2 * eta)}·x.`
            : `Here ∇f = (x, 10y), so a step multiplies x by 1 − η = ${num(1 - eta)} and y by 1 − 10η = ${num(1 - 10 * eta)}: the steep direction sets the limit.`;
        return {
          prompt: `Plain gradient descent on ${sf.text} with η = ${lr}, from the point shown. What happens if it keeps going?`,
          setup,
          settings,
          answer: { kind: 'choice', options: OUTCOMES, correct },
          explain: `${why} ${
            correct === 0
              ? 'Every factor is smaller than 1 in size, so the point shrinks toward the minimum.'
              : correct === 1
                ? 'A factor of exactly −1 flips the point to the other side, at the same height, forever.'
                : 'A factor larger than 1 in size makes every step land farther out than the last.'
          } The run: ${end.status === 'ready' ? `${end.t} steps, still at f = ${num(f1)}` : `${end.status} after ${end.t} steps`}.`,
          watch: [['run']],
        };
      },
    },
    {
      id: 'momentum',
      title: 'A step with momentum',
      make(rng) {
        const beta1 = pick(rng, ['0.5', '0.9']);
        const lr = pick(rng, ['0.1', '0.05']);
        const settings: GdSettings = {
          ...defaults,
          surface: 'bowl',
          method: 'momentum',
          lr,
          beta1,
        };
        const setup: OpCall[] = [['start', text(startOf(rng, 'bowl'))], ['step']];
        const before = run(setup, settings);
        const after = run([...setup, ['step']], settings);
        const g = 2 * before.x[0]!;
        return {
          prompt: `Momentum on f(x) = x², with η = ${lr} and β = ${beta1}. After one step, x = ${num(before.x[0]!)} and the velocity is v = ${num(before.m[0]!)}. What is x after the next step? Two decimals.`,
          setup,
          settings,
          answer: answer(after.x[0]!),
          explain: `The slope is f′(x) = 2x = ${num(g)}. The new velocity is β·v − η·f′ = ${beta1} × ${num(before.m[0]!)} − ${lr} × ${num(g)} = ${num(after.m[0]!)}, and x + v = ${num(after.x[0]!)}.`,
          watch: [['step']],
        };
      },
    },
    {
      id: 'adam',
      title: 'Adam’s first step',
      make(rng) {
        const surface = pick(rng, ['bowl', 'narrow'] as const);
        const lr = pick(rng, ['0.1', '0.3', '0.5']);
        const settings: GdSettings = { ...defaults, surface, method: 'adam', lr, bias: true };
        const p = startOf(rng, surface);
        const setup: OpCall[] = [['start', text(p)]];
        const after = run([...setup, ['step']], settings);
        const k = surface === 'bowl' ? 0 : 1;
        const name = k === 0 ? 'x' : 'y';
        const moved = Math.abs(after.x[k]! - p[k]!);
        const sf = SURFACES[surface];
        return {
          prompt: `Adam with bias correction on ${sf.text}, η = ${lr}, from the point shown. How far does **${name}** move in the first step? Two decimals.`,
          setup,
          settings,
          answer: answer(moved),
          explain: `After one step m̂ = g and ŝ = g², because bias correction undoes the averages' start at 0. So the step is η·g/(|g| + ε): ${num(moved)}, about η whatever the slope${surface === 'narrow' ? ', even though y’s slope is ten times steeper than x’s' : ''}.`,
          watch: [['step']],
        };
      },
    },
  ];
}
