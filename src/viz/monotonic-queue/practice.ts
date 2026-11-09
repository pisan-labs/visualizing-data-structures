import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { load, randomValues, type ArrayState } from '../_sorting/kit';
import { defaults, type Goal, type QueueExtra, type QueueSettings } from './model';

type Def = VizDef<ArrayState, QueueSettings, QueueExtra>;

/**
 * Practice questions for the monotonic queue. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function queuePractice(def: () => Def): PracticeKind[] {
  const steps = (vs: number[], k: number, goal: Goal = 'max') =>
    new Timeline(def(), { ...defaults, goal }, 1, [load(vs), ['slide', k]] as OpCall[]).entries[1]!
      .steps;

  return [
    {
      id: 'maxima',
      title: 'Every window',
      make(rng) {
        const vs = randomValues(rng, rng.int(7, 9), 1, 20);
        const k = rng.int(2, 4);
        const goal: Goal = rng.int(0, 2) ? 'max' : 'min';
        const out = String(steps(vs, k, goal).at(-1)!.vars!.result).split(' ');
        const word = goal === 'max' ? 'maximum' : 'minimum';
        return {
          prompt: `Type the ${word} of every window of ${k} consecutive values, from the left.`,
          setup: [load(vs)],
          settings: { ...defaults, goal } as Settings,
          answer: { kind: 'sequence', value: out },
          explain: `There are ${vs.length} − ${k} + 1 = ${out.length} windows: ${out.join(', ')}.`,
          watch: [['slide', k]],
        };
      },
    },
    {
      id: 'deque-after',
      title: 'What is in the deque?',
      make(rng) {
        const vs = randomValues(rng, rng.int(7, 9), 1, 20);
        const k = rng.int(3, 4);
        const i = rng.int(k, vs.length - 1);
        const push = steps(vs, k).find((s) => s.lines.includes('push') && s.vars!.i === i)!;
        const dq = push.extra!.deque!.map((j) => String(vs[j]));
        return {
          prompt: `Slide a window of k = ${k} for the maximum. Right after index ${i} is pushed, which values are in the deque, from front to back?`,
          setup: [load(vs)],
          answer: { kind: 'sequence', value: dq },
          explain: `Only values that could still be a window's maximum stay: in the window, and not beaten by a newer, bigger value. Front to back: ${dq.join(', ')}.`,
          watch: [['slide', k]],
        };
      },
    },
    {
      id: 'pop-back',
      title: 'How many leave from the back?',
      make(rng) {
        const vs = randomValues(rng, rng.int(7, 9), 1, 20);
        const k = rng.int(3, 4);
        const all = steps(vs, k);
        const counts = new Map<number, number>();
        for (const s of all)
          if (s.lines.includes('popback')) {
            const i = Number(s.vars!.i);
            counts.set(i, (counts.get(i) ?? 0) + 1);
          }
        const busy = [...counts.keys()];
        const i =
          busy.length && rng.int(0, 3)
            ? busy[rng.int(0, busy.length - 1)]!
            : rng.int(1, vs.length - 1);
        const pops = counts.get(i) ?? 0;
        return {
          prompt: `Slide a window of k = ${k} for the maximum. When A[${i}] = ${vs[i]} arrives, how many indices does it pop from the back of the deque?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: pops },
          explain: pops
            ? `${vs[i]} pops every value at the back that is no bigger: ${pops}.`
            : `The value at the back is already bigger than ${vs[i]} (or the deque is empty), so nothing is popped.`,
          watch: [['slide', k]],
        };
      },
    },
    {
      id: 'expire',
      title: 'How many leave from the front?',
      make(rng) {
        const vs = randomValues(rng, rng.int(7, 10), 1, 20);
        const k = rng.int(2, 3);
        const expired = steps(vs, k).filter((s) => s.lines.includes('expire')).length;
        return {
          prompt: `Slide a window of k = ${k} for the maximum. How many times does an index leave the deque from the front because it fell out of the window?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: expired },
          explain: `An index leaves from the front only if no value at least as big arrived while it was in the window, so it lasted until the window moved past it. That happens ${expired} ${expired === 1 ? 'time' : 'times'} here.`,
          watch: [['slide', k]],
        };
      },
    },
  ];
}
