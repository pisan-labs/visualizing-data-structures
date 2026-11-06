import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { fmtNum, fmtVec } from '../../layouts/plane';
import { defaults, type RtExtra, type RtSettings, type RtState } from './model';

type Def = VizDef<RtState, RtSettings, RtExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;

/**
 * Practice for rigid motions. Answers come from running the model; `def` is a getter to avoid
 * an import cycle.
 */
export function rotateTranslatePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  /** Whether every call in the list was applied (none refused for leaving the drawing). */
  const applied = (cs: OpCall[]) => {
    const t = run(cs);
    let prev = t.initial.state;
    return t.entries.every((e) => {
      const ok = e.end !== prev;
      prev = e.end;
      return ok;
    });
  };
  const start = () => run([]).endState().pts[0]!;

  return [
    {
      id: 'where-a-goes',
      title: 'Where does A go?',
      make(rng) {
        for (;;) {
          const ops: OpCall[] = [
            ['rotate', pick(rng, [90, 180, -90])],
            ['translate', rng.int(-3, 3), rng.int(-3, 3)],
          ];
          if (rng.int(0, 1)) ops.reverse();
          if (!applied(ops)) continue;
          const after = run(ops).endState().pts[0]!;
          return {
            prompt: `Vertex A is at ${fmtVec(start())}. Where is it after ${ops.map(call).join(' then ')}? Rotations are about the origin. Type x and y.`,
            setup: [],
            answer: { kind: 'sequence', value: [fmtNum(after.x), fmtNum(after.y)] },
            explain: `Do them in order. A rotation about the origin turns A (90° sends (x, y) to (−y, x), 180° to (−x, −y), −90° to (y, −x)); a translation adds t. A ends at ${fmtVec(after)}.`,
            watch: ops,
          };
        }
      },
    },
    {
      id: 'same-order',
      title: 'Does the order matter?',
      make(rng) {
        const deg = pick(rng, [0, 90, 180, 360, 45]);
        const zero = rng.int(0, 3) === 0;
        const ask: OpCall = [
          'order',
          deg,
          zero ? 0 : pick(rng, [2, 3, -2]),
          zero ? 0 : pick(rng, [0, 1, -1]),
        ];
        const t = run([ask]);
        const same = t.at(t.length - 1).step.vars?.same === 'yes';
        const options = ['The same place', 'Different places'];
        return {
          prompt: `Rotate by ${ask[1]}° about the origin and translate by (${ask[2]}, ${ask[3]}). Do rotate-then-translate and translate-then-rotate put the shape in the same place?`,
          setup: [],
          answer: { kind: 'choice', options, correct: same ? 0 : 1 },
          explain: same
            ? 'The same: translate-then-rotate moves by R t instead of t, and here R t = t (no turn, or no slide).'
            : 'Different: translate-then-rotate turns the slide too, so the shape moves by R t instead of t.',
          watch: [ask],
        };
      },
    },
    {
      id: 'inverse-offset',
      title: 'The inverse’s offset',
      make(rng) {
        for (;;) {
          const setup: OpCall[] = [
            ['rotate', pick(rng, [90, 180, -90])],
            ['translate', rng.int(-3, 3), rng.int(-3, 3)],
          ];
          if (!applied(setup)) continue;
          const t = run([...setup, ['invert']]);
          const e = t.entries.at(-1)!;
          const inv = e.steps.find((st) => st.extra?.op?.name === 'M⁻¹')!.extra!.op!.m;
          const m = t.entries.at(-2)!.end.m;
          return {
            prompt: `The shape shown was moved by ${setup.map(call).join(' then ')}, so M = [R t; 0 0 1] with t = ${fmtVec({ x: m[2], y: m[5] })}. What is the offset (last column) of M⁻¹? Type x and y.`,
            setup,
            answer: { kind: 'sequence', value: [fmtNum(inv[2]), fmtNum(inv[5])] },
            explain: `M⁻¹ = [Rᵀ −Rᵀ t; 0 0 1]. Its offset is −Rᵀ t = ${fmtVec({ x: inv[2], y: inv[5] })}: undo the slide, then turn back, so the slide gets turned as well. It is −t only when R is the identity.`,
            watch: [['invert']],
          };
        }
      },
    },
    {
      id: 'about-a-point',
      title: 'Turning about a point',
      make(rng) {
        for (;;) {
          const ask: OpCall = ['about', pick(rng, [90, 180, -90]), rng.int(-2, 3), rng.int(-2, 3)];
          if (!applied([ask])) continue;
          const after = run([ask]).endState().pts[0]!;
          return {
            prompt: `Vertex A is at ${fmtVec(start())}. Where is it after ${call(ask)}, a rotation by ${ask[1]}° about c = (${ask[2]}, ${ask[3]})? Type x and y.`,
            setup: [],
            answer: { kind: 'sequence', value: [fmtNum(after.x), fmtNum(after.y)] },
            explain: `Slide c to the origin (A − c), rotate about the origin, slide back (+ c): A goes to ${fmtVec(after)}.`,
            watch: [ask],
          };
        }
      },
    },
  ];
}
