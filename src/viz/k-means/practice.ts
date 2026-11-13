import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import { two } from '../_lm/numbers';
import { blobs, randomPoints } from '../_retrieve/points';
import {
  cName,
  defaults,
  num,
  wcss,
  type KmExtra,
  type KmSettings,
  type KmState,
} from './model';

type Def = VizDef<KmState, KmSettings, KmExtra>;

/** Centres typed by hand: k distinct whole-number points. */
function someCentres(rng: Rng, k: number): Vec[] {
  return randomPoints(rng, k, 0, 10);
}

/**
 * Practice for k-means with the default settings (k = 3, k-means++, an empty centre jumps). The
 * picture shows the points, and the centres when the setup placed them; every answer comes from
 * running the model.
 */
export function kmeansPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: KmSettings = defaults) => new Timeline(def(), settings, 1, ops);

  /** Points and hand-placed centres; `rounds` assign-update rounds already done. */
  function setup(rng: Rng, rounds: number) {
    const k = rng.int(2, 3);
    const pts = blobs(rng, rng.int(6, 8), k);
    const ops: OpCall[] = [
      ['load', writePoints(pts)],
      ['place', writePoints(someCentres(rng, k))],
    ];
    for (let r = 0; r < rounds; r++) ops.push(['assign'], ['update']);
    return { ops, s: run(ops).endState() };
  }

  return [
    {
      id: 'assign',
      title: 'The next assignment of a point',
      make(rng) {
        for (;;) {
          const { ops, s } = setup(rng, rng.int(0, 1));
          const watch: OpCall[] = [['assign']];
          const after = run([...ops, ...watch]).endState();
          const i = rng.int(0, s.points.length - 1);
          const p = s.points[i]!;
          const dists = s.centres.map((c) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2);
          const sorted = [...dists].sort((a, b) => a - b);
          // A clear nearest centre, so the answer does not hang on rounding.
          if (sorted[1]! - sorted[0]! < 0.5) continue;
          const options = s.centres.map((c) => cName(c.id));
          const best = after.assign[i]!;
          return {
            prompt: `In the next assignment step, which centre does point **${p.name}** at (${p.x}, ${p.y}) join?`,
            setup: ops,
            answer: { kind: 'choice', options, correct: best },
            explain: `Squared distances from ${p.name}: ${s.centres.map((c, j) => `${cName(c.id)} at (${num(c.x)}, ${num(c.y)}): ${num(dists[j]!)}`).join('; ')}. The nearest is ${options[best]}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'centre',
      title: 'Where a centre moves',
      make(rng) {
        for (;;) {
          const { ops } = setup(rng, 0);
          const assigned = [...ops, ['assign'] as OpCall];
          const s = run(assigned).endState();
          const watch: OpCall[] = [['update']];
          const after = run([...assigned, ...watch]).endState();
          const j = rng.int(0, s.centres.length - 1);
          const members = s.points.filter((_, i) => s.assign[i] === j);
          if (members.length < 2) continue;
          const axis = rng.int(0, 1) ? 'x' : 'y';
          const c = after.centres[j]!;
          const value = c[axis];
          return {
            prompt: `The points have just been assigned. In the update step, where does **${cName(s.centres[j]!.id)}** move? Give its **${axis}** coordinate, to two decimals.`,
            setup: assigned,
            answer: { kind: 'number', value, tolerance: 0.005 },
            explain: `${cName(s.centres[j]!.id)}'s points are ${members.map((p) => `${p.name}(${p.x}, ${p.y})`).join(', ')}. The mean of their ${axis} coordinates is (${members.map((p) => p[axis]).join(' + ')}) / ${members.length} = ${two(value)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'wcss',
      title: 'The sum of squares',
      make(rng) {
        const { ops } = setup(rng, 0);
        const assigned = [...ops, ['assign'] as OpCall];
        const s = run(assigned).endState();
        const parts = s.points.map((p, i) => {
          const c = s.centres[s.assign[i]!]!;
          return (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        });
        const value = wcss(s);
        return {
          prompt:
            'The points have just been assigned to the centres placed by hand. What is the within-cluster sum of squares (WCSS): the sum, over the points, of the squared distance to their own centre?',
          setup: assigned,
          answer: { kind: 'number', value, tolerance: 0.005 },
          explain: `Each point's squared distance to its centre: ${s.points.map((p, i) => `${p.name} ${num(parts[i]!)}`).join(', ')}. They add up to ${num(value)}.`,
          watch: [['update']],
        };
      },
    },
    {
      id: 'plus',
      title: 'A k-means++ draw',
      make(rng) {
        for (;;) {
          const pts = randomPoints(rng, 5, 0, 8);
          const settings: KmSettings = { ...defaults, k: 2, seeding: 'plus' };
          const ops: OpCall[] = [['load', writePoints(pts)]];
          const watch: OpCall[] = [['seed']];
          const t = run([...ops, ...watch], settings);
          const draws = t.entries[1]!.steps.flatMap((st) =>
            st.extra?.draw && st.extra.draw.pick >= 0 ? [st.extra.draw] : [],
          );
          const second = draws[1];
          if (!second || second.mode !== 'd2') continue;
          const s = t.entries[0]!.end;
          const first = s.points[draws[0]!.pick]!;
          // Keep away from the edges of an interval, so a slip in adding is not rewarded.
          const target = second.target!;
          if (second.cum!.some((c) => Math.abs(c - target) < 0.5)) continue;
          const options = s.points.filter((p) => p !== first).map((p) => p.name);
          const answer = s.points[second.pick]!.name;
          return {
            prompt: `k-means++ chose **${first.name}** at (${first.x}, ${first.y}) as the first centre. For the second it draws **u = ${two(second.u)}**. Which point does it pick? Work out each point's D², the squared distance to ${first.name}, and walk their running total until it passes u × (the sum of D²).`,
            setup: ops,
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain: `D²: ${s.points.map((p, i) => `${p.name} ${second.dd![i]}`).join(', ')}, which add up to ${second.total}. The target is ${two(second.u)} × ${second.total} = ${two(target)}. Running totals: ${s.points.map((p, i) => `${p.name} ${second.cum![i]}`).join(', ')}. The first to pass ${two(target)} is ${answer}.`,
            watch,
          };
        }
      },
    },
  ];
}
