import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { fmtNum, fmtVec } from '../../layouts/plane';
import { defaults, type RsExtra, type RsSettings, type RsState } from './model';

type Def = VizDef<RsState, RsSettings, RsExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;

/**
 * Practice for rotation and scale. Answers come from running the model; `def` is a getter to
 * avoid an import cycle.
 */
export function rotateScalePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: RsSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  // A small shape, so no scale here pushes it off the drawing.
  const square: Settings = { ...defaults, shape: 'square' };

  return [
    {
      id: 'where-a-goes',
      title: 'Where does A go?',
      make(rng) {
        const ask: OpCall = ['rotate', pick(rng, [90, 180, 270, -90])];
        const before = run([]).endState().pts[0]!;
        const after = run([ask]).endState().pts[0]!;
        return {
          prompt: `Vertex A is at ${fmtVec(before)}. Where is it after ${call(ask)}, about the origin? Type x and y.`,
          setup: [],
          answer: { kind: 'sequence', value: [fmtNum(after.x), fmtNum(after.y)] },
          explain: `R(${ask[1]}°) has cos = ${fmtNum(Math.cos(((ask[1] as number) * Math.PI) / 180))} and sin = ${fmtNum(Math.sin(((ask[1] as number) * Math.PI) / 180))}, so (x, y) goes to (cos·x − sin·y, sin·x + cos·y) = ${fmtVec(after)}.`,
          watch: [ask],
        };
      },
    },
    {
      id: 'area-factor',
      title: 'How much bigger?',
      make(rng) {
        const ops: OpCall[] = [
          ['scale', pick(rng, [0.5, 1, 1.5, 2]), pick(rng, [0.5, 1, 2])],
          ['rotate', pick(rng, [30, 45, 60, 90])],
        ];
        if (rng.int(0, 1)) ops.reverse();
        const t = run(ops, square as RsSettings);
        const det = Number(t.at(t.length - 1).step.vars?.['det M']);
        return {
          prompt: `Starting from the shape shown, run ${ops.map(call).join(' then ')}. By what factor does its area change?`,
          setup: [],
          settings: square,
          answer: { kind: 'number', value: Math.abs(det) },
          explain: `Areas scale by |det M|. A rotation has det 1 and S has det sx·sy, so det M = ${fmtNum(det)}.`,
          watch: ops,
        };
      },
    },
    {
      id: 'same-order',
      title: 'Does the order matter?',
      make(rng) {
        const uniform = rng.int(0, 1) === 1;
        const s = pick(rng, [0.5, 2, 1.5]);
        const ask: OpCall = [
          'order',
          pick(rng, [30, 45, 90, 180]),
          s,
          uniform
            ? s
            : pick(
                rng,
                [1, 0.5, 2].filter((x) => x !== s),
              ),
        ];
        const t = run([ask]);
        const same = t.at(t.length - 1).step.vars?.same === 'yes';
        const options = ['The same shape', 'Different shapes'];
        return {
          prompt: `Rotate by ${ask[1]}° and scale by (${ask[2]}, ${ask[3]}). Do the two orders, rotate then scale and scale then rotate, give the same shape?`,
          setup: [],
          answer: { kind: 'choice', options, correct: same ? 0 : 1 },
          explain: same
            ? 'The same: a uniform scale (or a half turn) does not care which way the shape points.'
            : 'Different: a non-uniform scale stretches along the world axes, so it matters whether the shape has turned first.',
          watch: [ask],
        };
      },
    },
    {
      id: 'basis',
      title: 'Where does e₁ go?',
      make(rng) {
        const ops: OpCall[] = [
          ['rotate', pick(rng, [90, 180, -90])],
          ['scale', pick(rng, [2, 1.5, -1]), pick(rng, [1, 2, 0.5])],
        ];
        if (rng.int(0, 1)) ops.reverse();
        const m = run(ops, square as RsSettings).endState().m;
        return {
          prompt: `After ${ops.map(call).join(' then ')} (about the origin), where does the basis vector e₁ = (1, 0) end up? That is the first column of M. Type x and y.`,
          setup: [],
          settings: square,
          answer: { kind: 'sequence', value: [fmtNum(m[0]), fmtNum(m[2])] },
          explain: `M e₁ is the first column of M: ${fmtVec({ x: m[0], y: m[2] })}. Follow e₁ through each step in order.`,
          watch: ops,
        };
      },
    },
  ];
}
