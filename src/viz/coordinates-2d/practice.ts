import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { fmtNum, fmtVec } from '../../layouts/plane';
import { defaults, type CoordExtra, type CoordSettings, type CoordState } from './model';

type Def = VizDef<CoordState, CoordSettings, CoordExtra>;

/** Whole-number axes with det ±1, so every answer is a whole number. */
const UNIMODULAR: [number, number, number, number][] = [
  [1, 0, 0, 1],
  [0, 1, -1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, -1],
  [1, 0, 1, 1],
  [1, 1, 0, 1],
  [1, 0, -1, 1],
  [2, 1, 1, 1],
  [0, 1, 1, 0],
  [1, -1, 0, 1],
];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/**
 * Practice for changing frames. Answers come from running the model; `def` is a getter to
 * avoid an import cycle.
 */
export function coordinatesPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const frameSetup = (rng: Rng): OpCall[] => {
    const [ux, uy, vx, vy] = pick(rng, UNIMODULAR);
    return [
      ['origin', rng.int(-3, 3), rng.int(-3, 3)],
      ['axes', ux, uy, vx, vy],
    ];
  };
  const frameText = (s: CoordState) =>
    `B has origin o = ${fmtVec(s.o)} and axes u = ${fmtVec(s.u)}, v = ${fmtVec(s.v)}.`;

  return [
    {
      id: 'to-world',
      title: 'From B to the world',
      make(rng) {
        for (;;) {
          const setup = frameSetup(rng);
          const q: OpCall = ['toWorld', rng.int(-3, 3), rng.int(-3, 3)];
          const t = run([...setup, q]);
          const s = t.endState();
          if (!s.p || Math.abs(s.p.x) > 7 || Math.abs(s.p.y) > 7) continue;
          return {
            prompt: `${frameText(s)} Which world point has coordinates (${q[1]}, ${q[2]}) in B? Type x and y.`,
            setup,
            answer: { kind: 'sequence', value: [fmtNum(s.p.x), fmtNum(s.p.y)] },
            explain: `p = o + a·u + b·v = ${fmtVec(s.o)} + ${q[1]}·${fmtVec(s.u)} + ${q[2]}·${fmtVec(s.v)} = ${fmtVec(s.p)}.`,
            watch: [q],
          };
        }
      },
    },
    {
      id: 'to-local',
      title: 'From the world to B',
      make(rng) {
        for (;;) {
          const setup = frameSetup(rng);
          // Pick the answer first, so it is a whole number, then ask about its world point.
          const there = run([...setup, ['toWorld', rng.int(-3, 3), rng.int(-3, 3)]]).endState();
          const p = there.p!;
          if (Math.abs(p.x) > 7 || Math.abs(p.y) > 7) continue;
          const ask: OpCall = ['toLocal', p.x, p.y];
          const s = run([...setup, ask]).endState();
          const l = s.local!;
          return {
            prompt: `${frameText(s)} What are the coordinates of the world point ${fmtVec(p)} in B? Type a and b.`,
            setup,
            answer: { kind: 'sequence', value: [fmtNum(l.x), fmtNum(l.y)] },
            explain: `d = p − o = ${fmtVec({ x: p.x - s.o.x, y: p.y - s.o.y })}, and M⁻¹ d = ${fmtVec(l)}. Check: o + ${fmtNum(l.x)}·u + ${fmtNum(l.y)}·v lands on p.`,
            watch: [ask],
          };
        }
      },
    },
    {
      id: 'determinant',
      title: 'Is it a frame?',
      make(rng) {
        const u = [rng.int(-3, 3), rng.int(-3, 3)];
        const k = rng.int(-2, 2);
        // Half the time v is a multiple of u, so det M = 0.
        const v = rng.int(0, 1) ? [k * u[0]!, k * u[1]!] : [rng.int(-3, 3), rng.int(-3, 3)];
        const call: OpCall = ['axes', u[0]!, u[1]!, v[0]!, v[1]!];
        const t = run([call]);
        const step = t.entries[0]!.steps.at(-1)!;
        const d = Number(step.vars?.['det M']);
        return {
          prompt: `What is det M for the axes u = (${u[0]}, ${u[1]}) and v = (${v[0]}, ${v[1]})?`,
          setup: [],
          answer: { kind: 'number', value: d },
          explain: `det M = u.x·v.y − v.x·u.y = ${u[0]}·${v[1]} − ${v[0]}·${u[1]} = ${d}. ${d === 0 ? 'Zero: the axes lie on one line, so they do not make a frame.' : 'Not zero, so the axes make a frame and M has an inverse.'}`,
          watch: [call],
        };
      },
    },
    {
      id: 'transpose',
      title: 'Can the transpose undo it?',
      make(rng) {
        const turned = rng.int(0, 1) === 1;
        const setup: OpCall[] = turned
          ? [['angle', pick(rng, [15, 30, 45, 60, 120, 150, 200, 300])]]
          : [['axes', ...pick(rng, UNIMODULAR.slice(4))]];
        const ask: OpCall = ['toLocal', rng.int(-5, 5), rng.int(-5, 5)];
        const t = run([...setup, ask]);
        const e = t.entries.at(-1)!;
        const inv = e.steps.find((st) => st.vars?.['M⁻¹ = Mᵀ'] !== undefined)!;
        const yes = inv.vars!['M⁻¹ = Mᵀ'] === 'yes';
        const s = e.end;
        const options = ['Yes: a = u·d and b = v·d', 'No: it needs the real inverse'];
        return {
          prompt: `B has axes u = ${fmtVec(s.u)} and v = ${fmtVec(s.v)}. To convert a world point into B, can you use dot products with u and v (M⁻¹ = Mᵀ)?`,
          setup,
          answer: { kind: 'choice', options, correct: yes ? 0 : 1 },
          explain: yes
            ? `Yes. u and v are perpendicular and both have length 1, so M is a ${s.u.x * s.v.y - s.v.x * s.u.y < 0 ? 'mirror (det M = −1)' : 'rotation'} and its inverse is its transpose.`
            : 'No. The axes are not perpendicular unit vectors, so the dot products give the wrong numbers. Use (1 / det M) [v.y −v.x; −u.y u.x].',
          watch: [ask],
        };
      },
    },
  ];
}
