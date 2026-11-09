import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import { defaults, turnKind, type HullExtra, type HullSettings, type HullState } from './model';

type Def = VizDef<HullState, HullSettings, HullExtra>;

/** Distinct random points, so every question is about the hull and not about repeats. */
function distinctPoints(rng: Rng, n: number): Vec[] {
  const seen = new Set<string>();
  const out: Vec[] = [];
  while (out.length < n) {
    const p = { x: rng.int(1, 11), y: rng.int(1, 11) };
    const k = `${p.x},${p.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * Practice for the convex hull. Every answer comes from running the model; `def` is a getter
 * to avoid an import cycle.
 */
export function hullPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: HullSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const names = (s: HullState, ids: number[]) =>
    ids.map((id) => s.points.find((p) => p.id === id)!.name);

  return [
    {
      id: 'corners',
      title: 'Which points are corners?',
      make(rng) {
        const setup: OpCall[] = [['load', writePoints(distinctPoints(rng, rng.int(6, 9)))]];
        const end = run([...setup, ['hull']]).endState();
        // The model's hull starts at p0, the lowest point (leftmost if tied).
        const corners = names(end, end.hull!);
        return {
          prompt:
            'Which points are corners of the convex hull? Type their names counter-clockwise, starting from the lowest point (the leftmost one if two are lowest).',
          setup,
          answer: { kind: 'sequence', value: corners },
          explain: `Graham scan keeps ${corners.join(', ')}. Every other point is inside the hull, or on one of its edges.`,
          watch: [['hull']],
        };
      },
    },
    {
      id: 'first-turn',
      title: 'Left or right?',
      make(rng) {
        const setup: OpCall[] = [['load', writePoints(distinctPoints(rng, rng.int(5, 8)))]];
        const t = run([...setup, ['hull']]);
        const e = t.entries[1]!;
        const tests = e.steps.filter((st) => st.extra?.turn);
        const pick = tests[rng.int(0, tests.length - 1)]!;
        const { a, b, c, cross } = pick.extra!.turn!;
        const [na, nb, nc] = names(e.end, [a, b, c]);
        const kind = turnKind(cross);
        const options = ['Left turn', 'Right turn', 'Collinear'];
        const correct = kind === 'left' ? 0 : kind === 'right' ? 1 : 2;
        return {
          prompt: `During the scan, Graham tests TURN(${na}, ${nb}, ${nc}). Which way does ${na} → ${nb} → ${nc} turn?`,
          setup,
          answer: { kind: 'choice', options, correct },
          explain: `TURN(${na}, ${nb}, ${nc}) = ${cross}. ${kind === 'left' ? `Positive means a left turn, so ${nb} stays on the stack (for now).` : kind === 'right' ? `Negative means a right turn, so ${nb} is popped.` : `Zero means the three points are on one line, so ${nb} is popped.`}`,
          watch: [['hull']],
        };
      },
    },
    {
      id: 'pops',
      title: 'How many pops?',
      make(rng) {
        const setup: OpCall[] = [['load', writePoints(distinctPoints(rng, rng.int(6, 9)))]];
        const end = run([...setup, ['hull']]).endState();
        const n = end.points.length;
        const h = end.hull!.length;
        const dropped = end.dropped.length;
        return {
          prompt: `Run Graham scan on these ${n} points. How many times does it pop the stack?`,
          setup,
          answer: { kind: 'number', value: end.pops },
          explain: `Every point that is pushed is either a corner at the end or popped once. ${n - dropped} points are pushed${dropped ? ` (${dropped} set aside after the sort, for sharing an angle with a farther point)` : ''} and ${h} are corners, so ${end.pops === 1 ? 'there is 1 pop' : `there are ${end.pops} pops`}.`,
          watch: [['hull']],
        };
      },
    },
    {
      id: 'wrap-tests',
      title: 'Gift wrapping work',
      make(rng) {
        const settings: Settings = { ...defaults, algorithm: 'jarvis' };
        const setup: OpCall[] = [['load', writePoints(distinctPoints(rng, rng.int(6, 9)))]];
        const end = run([...setup, ['hull']], settings as HullSettings).endState();
        const n = end.points.length;
        const h = end.hull!.length;
        return {
          prompt: `Gift wrapping finds that these ${n} points have ${h} corners. At each corner it takes a first guess and tests every other point against it. How many turn tests does it make in all?`,
          setup,
          settings,
          answer: { kind: 'number', value: end.tests },
          explain: `At each of the ${h} corners, it tests every point except the corner and the first guess: ${n - 2} tests. ${h} × ${n - 2} = ${end.tests}. That is the O(nh) cost.`,
          watch: [['hull']],
        };
      },
    },
  ];
}
