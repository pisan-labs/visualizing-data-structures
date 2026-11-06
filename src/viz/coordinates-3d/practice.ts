import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { fmtNum } from '../../layouts/plane';
import { fmtVec3, sub3 } from '../../layouts/space';
import { R, defaults, type Coord3Extra, type Coord3Settings, type Coord3State } from './model';

type Def = VizDef<Coord3State, Coord3Settings, Coord3Extra>;

/** Whole-number axes (u, v, w) with det ±1, so every answer is a whole number. */
const UNIMODULAR: number[][] = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [0, 1, 0, -1, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, -1, 0],
  [0, 0, 1, 1, 0, 0, 0, 1, 0],
  [1, 0, 0, 0, 0, 1, 0, 1, 0],
  [1, 0, 0, 1, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 0, 1, 0, 1],
  [1, 1, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 1, 0, 0, 1],
];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const inside = (p: { x: number; y: number; z: number }) =>
  Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= R;

/**
 * Practice for changing frames in 3D. Answers come from running the model; `def` is a getter
 * to avoid an import cycle.
 */
export function coordinates3dPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const frameSetup = (rng: Rng): OpCall[] => [
    ['origin', rng.int(-2, 2), rng.int(-2, 2), rng.int(-1, 2)],
    ['axes', ...pick(rng, UNIMODULAR)],
  ];
  const frameText = (s: Coord3State) =>
    `B has origin o = ${fmtVec3(s.o)} and axes u = ${fmtVec3(s.u)}, v = ${fmtVec3(s.v)}, w = ${fmtVec3(s.w)}.`;
  const three = (p: { x: number; y: number; z: number }) => [fmtNum(p.x), fmtNum(p.y), fmtNum(p.z)];

  return [
    {
      id: 'to-world',
      title: 'From B to the world',
      make(rng) {
        const setup = frameSetup(rng);
        const q: OpCall = ['toWorld', rng.int(-2, 2), rng.int(-2, 2), rng.int(-2, 2)];
        const s = run([...setup, q]).endState();
        return {
          prompt: `${frameText(s)} Which world point has coordinates (${q[1]}, ${q[2]}, ${q[3]}) in B? Type x, y and z.`,
          setup,
          answer: { kind: 'sequence', value: three(s.p!) },
          explain: `p = o + a·u + b·v + c·w = ${fmtVec3(s.o)} + ${q[1]}·${fmtVec3(s.u)} + ${q[2]}·${fmtVec3(s.v)} + ${q[3]}·${fmtVec3(s.w)} = ${fmtVec3(s.p!)}.`,
          watch: [q],
        };
      },
    },
    {
      id: 'to-local',
      title: 'From the world to B',
      make(rng) {
        for (;;) {
          const setup = frameSetup(rng);
          // Pick the answer first, so it is a whole number, then ask about its world point.
          const there = run([
            ...setup,
            ['toWorld', rng.int(-2, 2), rng.int(-2, 2), rng.int(-2, 2)],
          ]).endState();
          const p = there.p!;
          if (!inside(p)) continue;
          const ask: OpCall = ['toLocal', p.x, p.y, p.z];
          const s = run([...setup, ask]).endState();
          return {
            prompt: `${frameText(s)} What are the coordinates of the world point ${fmtVec3(p)} in B? Type a, b and c.`,
            setup,
            answer: { kind: 'sequence', value: three(s.local!) },
            explain: `d = p − o = ${fmtVec3(sub3(p, s.o))}, and M⁻¹ d = ${fmtVec3(s.local!)}. Check: o + ${fmtNum(s.local!.x)}·u + ${fmtNum(s.local!.y)}·v + ${fmtNum(s.local!.z)}·w lands on p.`,
            watch: [ask],
          };
        }
      },
    },
    {
      id: 'determinant',
      title: 'Is it a frame?',
      make(rng) {
        const u = [rng.int(-2, 2), rng.int(-2, 2), rng.int(-2, 2)];
        const v = [rng.int(-2, 2), rng.int(-2, 2), rng.int(-2, 2)];
        // Half the time w = u + v, so the three axes lie in one plane and det M = 0.
        const w = rng.int(0, 1)
          ? u.map((x, i) => x + v[i]!)
          : [rng.int(-2, 2), rng.int(-2, 2), rng.int(-2, 2)];
        const call: OpCall = ['axes', ...u, ...v, ...w];
        const step = run([call]).entries[0]!.steps.at(-1)!;
        const d = Number(step.vars?.['det of those axes'] ?? step.vars?.['det M']);
        const v3 = (a: number[]) => `(${a.join(', ')})`;
        return {
          prompt: `What is det M = u · (v × w) for the axes u = ${v3(u)}, v = ${v3(v)} and w = ${v3(w)}?`,
          setup: [],
          answer: { kind: 'number', value: d },
          explain: `v × w = (v.y·w.z − v.z·w.y, v.z·w.x − v.x·w.z, v.x·w.y − v.y·w.x), and its dot product with u is ${d}. ${d === 0 ? 'Zero: the axes lie in one plane, so they do not make a frame.' : 'Not zero, so the axes make a frame and M has an inverse.'}`,
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
          ? [['turn', pick(rng, [15, 30, 45, 60, 120, 200]), pick(rng, [0, 30, 45, 90])]]
          : [['axes', ...pick(rng, UNIMODULAR.slice(5))]];
        const ask: OpCall = ['toLocal', rng.int(-3, 3), rng.int(-3, 3), rng.int(-3, 3)];
        const e = run([...setup, ask]).entries.at(-1)!;
        const inv = e.steps.find((st) => st.vars?.['M⁻¹ = Mᵀ'] !== undefined)!;
        const yes = inv.vars!['M⁻¹ = Mᵀ'] === 'yes';
        const s = e.end;
        const options = ['Yes: a = u·d, b = v·d, c = w·d', 'No: it needs the real inverse'];
        return {
          prompt: `B has axes u = ${fmtVec3(s.u)}, v = ${fmtVec3(s.v)} and w = ${fmtVec3(s.w)}. To convert a world point into B, can you use dot products with u, v and w (M⁻¹ = Mᵀ)?`,
          setup,
          answer: { kind: 'choice', options, correct: yes ? 0 : 1 },
          explain: yes
            ? 'Yes. The axes are perpendicular and all have length 1, so M is a rotation and its inverse is its transpose.'
            : 'No. The axes are not perpendicular unit vectors, so the dot products give the wrong numbers. Use the rows (v×w, w×u, u×v) / det M.',
          watch: [ask],
        };
      },
    },
  ];
}
