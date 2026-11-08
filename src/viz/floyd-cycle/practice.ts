import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { choice, distinct } from '../_lists/practice-util';
import { defaults, formatSpec, type FExtra, type FSettings, type FState } from './model';

type Def = VizDef<FState, FSettings, FExtra>;

/** A build call for n different values; the last node links back to a random index, maybe. */
function randomList(rng: Rng, cycle: boolean): { values: number[]; build: OpCall } {
  const n = rng.int(4, 8);
  const values = distinct(rng, n);
  const loopAt = cycle ? rng.int(0, n - 1) : null;
  return { values, build: ['build', formatSpec({ values, loopAt })] };
}

/**
 * Practice for Floyd's cycle detection. Every answer comes from running the model's detect().
 * `def` is a getter to avoid an import cycle.
 */
export function floydPractice(def: () => Def): PracticeKind[] {
  const detect = (build: OpCall) =>
    new Timeline(def(), defaults, 1, [build, ['detect']]).entries[1]!.steps;

  return [
    {
      id: 'meet',
      title: 'Where do the tortoise and the hare meet?',
      make(rng) {
        const { values, build } = randomList(rng, true);
        const steps = detect(build);
        const meet = steps.find((s) => s.lines.includes('detect.meet') && s.level === 1)!;
        const i = (meet.extra as FExtra).slow!;
        const right = String(values[i]);
        const k = Number(meet.vars?.steps);
        return {
          prompt:
            'Both pointers start at head; each step `slow` moves one node and `fast` moves two. On which node do they first meet?',
          setup: [build],
          answer: choice(rng, right, values.map(String)),
          explain: `After ${k} ${k === 1 ? 'step' : 'steps'}, slow has moved ${k} nodes and fast ${2 * k}, and both are on ${right} (index ${i}). The meeting point is often not where the cycle starts.`,
          watch: [['detect']],
        };
      },
    },
    {
      id: 'phase-one',
      title: 'How long is phase 1?',
      make(rng) {
        const { build } = randomList(rng, rng.int(0, 3) > 0);
        const last = detect(build).at(-1)!;
        const k = Number(last.vars?.steps);
        const cycle = last.vars?.cycle === true;
        return {
          prompt:
            'In phase 1, how many times does `slow` move before the two pointers meet, or before `fast` runs out of list?',
          setup: [build],
          answer: { kind: 'number', value: k },
          explain: cycle
            ? `They meet after ${k} ${k === 1 ? 'step' : 'steps'}. Once both are in the cycle, fast gains one node per step, so it cannot jump over slow.`
            : `There is no cycle, so fast reaches the end first, after ${k} ${k === 1 ? 'step' : 'steps'}: about half the length of the list.`,
          watch: [['detect']],
        };
      },
    },
    {
      id: 'mu-lambda',
      title: 'What are μ and λ?',
      make(rng) {
        const { build } = randomList(rng, true);
        const last = detect(build).at(-1)!;
        const mu = Number(last.vars?.['μ']);
        const lambda = Number(last.vars?.['λ']);
        return {
          prompt:
            'Type μ, the number of nodes before the cycle starts, and λ, the number of nodes in the cycle, separated by a space.',
          setup: [build],
          answer: { kind: 'sequence', value: [String(mu), String(lambda)] },
          explain: `The tail has ${mu} ${mu === 1 ? 'node' : 'nodes'} and the cycle has ${lambda}, so μ = ${mu} and λ = ${lambda}. Phase 2 finds μ by walking from head and from the meeting point together; phase 3 counts λ by going round once.`,
          watch: [['detect']],
        };
      },
    },
  ];
}
