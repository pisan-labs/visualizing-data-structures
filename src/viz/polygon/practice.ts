import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { writePoints } from '../../layouts/plane';
import {
  defaults,
  half,
  randomPolygon,
  type PolyExtra,
  type PolySettings,
  type PolyState,
} from './model';

type Def = VizDef<PolyState, PolySettings, PolyExtra>;

/**
 * Practice for the polygon page. Every answer comes from running the model; `def` is a getter
 * to avoid an import cycle, and `convexPolygon` comes from the page for the same reason.
 */
export function polygonPractice(
  def: () => Def,
  convexPolygon: (n: number, offset: number) => { x: number; y: number }[] = () => [],
): PracticeKind[] {
  const run = (cs: OpCall[], settings: PolySettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const loadRandom = (rng: Parameters<PracticeKind['make']>[0], lo: number, hi: number) =>
    ['load', writePoints(randomPolygon(rng, rng.int(lo, hi)))] as OpCall;

  return [
    {
      id: 'area',
      title: 'Shoelace area',
      make(rng) {
        const setup: OpCall[] = [loadRandom(rng, 3, 5)];
        const r = run([...setup, ['area']]).endState().result;
        const sum = r?.kind === 'area' ? r.sum : 0;
        return {
          prompt:
            'What is the area of this polygon? Use the shoelace formula (the answer may end in .5).',
          setup,
          answer: { kind: 'number', value: Math.abs(sum) / 2 },
          explain: `Adding x_i·y_(i+1) − x_(i+1)·y_i around the polygon gives ${sum}, so the area is |${sum}| / 2 = ${half(sum)}.`,
          watch: [['area']],
        };
      },
    },
    {
      id: 'crossings',
      title: 'Count the crossings',
      make(rng) {
        const setup: OpCall[] = [loadRandom(rng, 5, 8)];
        // Pick a query point that is not on the boundary.
        for (let tries = 0; ; tries++) {
          const q: OpCall = ['inside', rng.int(1, 11), rng.int(1, 11)];
          const end = run([...setup, q]).endState();
          const r = end.result;
          if (r?.kind !== 'inside' || (r.where === 'boundary' && tries < 50)) continue;
          return {
            prompt: `A ray goes from q = (${q[1]}, ${q[2]}) to the right. How many edges of the polygon does it cross? (An edge end that lies exactly on the ray counts as below it.)`,
            setup,
            answer: { kind: 'number', value: r.count },
            explain: `It crosses ${r.count} edge${r.count === 1 ? '' : 's'}: ${r.count % 2 ? 'odd, so q is inside' : 'even, so q is outside'}.`,
            watch: [q],
          };
        }
      },
    },
    {
      id: 'orientation',
      title: 'Clockwise or not?',
      make(rng) {
        const base = randomPolygon(rng, rng.int(4, 7));
        const pts = rng.int(0, 1) ? base : [...base].reverse();
        const setup: OpCall[] = [['load', writePoints(pts)]];
        const r = run([...setup, ['orientation']]).endState().result;
        const turn = r?.kind === 'orient' ? r.turn : 0;
        const options = ['Counter-clockwise', 'Clockwise'];
        return {
          prompt: 'Walking from A to B to C and so on, which way does this polygon go round?',
          setup,
          answer: { kind: 'choice', options, correct: turn > 0 ? 0 : 1 },
          explain: `At the lowest vertex the boundary makes a ${turn > 0 ? 'left' : 'right'} turn (TURN = ${turn}), so it goes ${turn > 0 ? 'counter-clockwise' : 'clockwise'}. The shoelace sum has the same sign.`,
          watch: [['orientation']],
        };
      },
    },
    {
      id: 'convex',
      title: 'Convex or not?',
      make(rng) {
        const pts = rng.int(0, 1)
          ? convexPolygon(rng.int(4, 8), rng.int(0, 11))
          : randomPolygon(rng, rng.int(5, 8));
        const setup: OpCall[] = [['load', writePoints(pts)]];
        const r = run([...setup, ['convex']]).endState().result;
        const ok = r?.kind === 'convex' && r.convex;
        const options = ['Convex', 'Not convex'];
        return {
          prompt: 'Is this polygon convex?',
          setup,
          answer: { kind: 'choice', options, correct: ok ? 0 : 1 },
          explain: ok
            ? 'Yes: every vertex turns the same way, and the turns add up to one full circle.'
            : `No: ${r?.kind === 'convex' ? r.why : 'it has a dent'}.`,
          watch: [['convex']],
        };
      },
    },
  ];
}
