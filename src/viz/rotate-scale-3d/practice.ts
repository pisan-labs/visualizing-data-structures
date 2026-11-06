import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { fmtNum } from '../../layouts/plane';
import { column3, det3, fmtVec3 } from '../../layouts/space';
import { SHAPES, defaults, type Rs3Extra, type Rs3Settings, type RsState } from './model';

type Def = VizDef<RsState, Rs3Settings, Rs3Extra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const ROTATIONS = ['rotateX', 'rotateY', 'rotateZ'] as const;

/**
 * Practice for 3D rotation and scale. Answers come from running the model; `def` is a getter
 * to avoid an import cycle.
 */
export function rotateScale3dPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const a = SHAPES.cube.a;

  return [
    {
      id: 'where-a-goes',
      title: 'Where does A go?',
      make(rng) {
        const ask: OpCall = [pick(rng, ROTATIONS), pick(rng, [90, 180, -90])];
        const before = run([]).endState().pts[a]!;
        const after = run([ask]).endState().pts[a]!;
        return {
          prompt: `Vertex A of the cube is at ${fmtVec3(before)}. Where is it after ${call(ask)}? Type x, y and z.`,
          setup: [],
          answer: {
            kind: 'sequence',
            value: [fmtNum(after.x), fmtNum(after.y), fmtNum(after.z)],
          },
          explain: `The coordinate along the rotation axis does not change; the other two turn as in 2D. A goes to ${fmtVec3(after)}.`,
          watch: [ask],
        };
      },
    },
    {
      id: 'volume-factor',
      title: 'How much bigger?',
      make(rng) {
        for (;;) {
          const ops: OpCall[] = [
            ['scale', pick(rng, [0.5, 1, 1.5]), pick(rng, [1, 1.5]), pick(rng, [0.5, 1, -1])],
            [pick(rng, ROTATIONS), pick(rng, [30, 45, 90])],
          ];
          if (rng.int(0, 1)) ops.reverse();
          const end = run(ops).endState();
          // Both must be applied (a big box turned by 45° can leave the drawing).
          if (end.transforms < 2) continue;
          const d = det3(end.m);
          return {
            prompt: `Starting from the cube shown, run ${ops.map(call).join(' then ')}. By what factor does its volume change?`,
            setup: [],
            answer: { kind: 'number', value: Number(fmtNum(Math.abs(d))) },
            explain: `Volumes scale by |det M|. A rotation has det 1 and S has det sx·sy·sz, so |det M| = ${fmtNum(Math.abs(d))}${d < 0 ? ' (det M is negative: the cube was also mirrored)' : ''}.`,
            watch: ops,
          };
        }
      },
    },
    {
      id: 'same-order',
      title: 'Does the order matter?',
      make(rng) {
        const ask: OpCall = ['order', pick(rng, [90, 180, 45, 360, -90, 120])];
        const t = run([ask]);
        const same = t.at(t.length - 1).step.vars?.same === 'yes';
        const options = ['The same place', 'Different places'];
        return {
          prompt: `Rotate the cube by ${ask[1]}° about x and then about y, or about y and then about x. Do the two orders put it in the same place?`,
          setup: [],
          answer: { kind: 'choice', options, correct: same ? 0 : 1 },
          explain: same
            ? 'The same: rotations by a multiple of 180° about perpendicular axes commute (half turns, or no turn at all).'
            : 'Different: in 3D, rotations about different axes do not commute.',
          watch: [ask],
        };
      },
    },
    {
      id: 'basis',
      title: 'Where does e₁ go?',
      make(rng) {
        const first = pick(rng, ROTATIONS);
        const second = pick(
          rng,
          ROTATIONS.filter((r) => r !== first),
        );
        const ops: OpCall[] = [
          [first, pick(rng, [90, -90])],
          [second, pick(rng, [90, -90, 180])],
        ];
        const e1 = column3(run(ops).endState().m, 0);
        return {
          prompt: `After ${ops.map(call).join(' then ')}, where does the basis vector e₁ = (1, 0, 0) end up? That is the first column of M. Type x, y and z.`,
          setup: [],
          answer: { kind: 'sequence', value: [fmtNum(e1.x), fmtNum(e1.y), fmtNum(e1.z)] },
          explain: `M e₁ is the first column of M: ${fmtVec3(e1)}. Follow e₁ through each rotation in order.`,
          watch: ops,
        };
      },
    },
  ];
}
