import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { distinctValues, load, randomValues, type ArrayState } from '../_sorting/kit';
import { defaults, type Find, type MonoExtra, type StackSettings } from './model';

type Def = VizDef<ArrayState, StackSettings, MonoExtra>;

/**
 * Practice questions for the monotonic stack. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function stackPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: StackSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);
  const scanSteps = (vs: number[], settings: StackSettings = defaults) =>
    run([load(vs), ['scan']], settings).entries[1]!.steps;

  return [
    {
      id: 'answers',
      title: 'Every answer',
      make(rng) {
        const vs = randomValues(rng, rng.int(6, 8), 1, 20);
        const find: Find = rng.int(0, 2) ? 'next-greater' : 'previous-smaller';
        const settings = { ...defaults, find };
        const result = String(scanSteps(vs, settings).at(-1)!.vars!.result).split(' ');
        const what =
          find === 'next-greater'
            ? 'the first bigger value to its right'
            : 'the nearest smaller value to its left';
        return {
          prompt: `For each value of A, type ${what}, in order. Type −1 where there is none.`,
          setup: [load(vs)],
          settings: settings as Settings,
          answer: { kind: 'sequence', value: result },
          explain: `Scanning with a stack: ${result.join(' ')}.`,
          watch: [['scan']],
        };
      },
    },
    {
      id: 'pops',
      title: 'How many pops?',
      make(rng) {
        const vs = distinctValues(rng, rng.int(7, 9)).map((v) => 1 + (v % 30));
        const steps = scanSteps(vs);
        // A value that pops something, when there is one.
        const popped = new Map<number, number>();
        for (const s of steps)
          if (s.lines.includes('answer')) {
            const i = Number(s.vars!.i);
            popped.set(i, (popped.get(i) ?? 0) + 1);
          }
        const choices = [...popped.keys()];
        const i =
          choices.length && rng.int(0, 3)
            ? choices[rng.int(0, choices.length - 1)]!
            : rng.int(1, vs.length - 1);
        const pops = popped.get(i) ?? 0;
        return {
          prompt: `Scan A for each value's next greater value. When the scan reaches A[${i}] = ${vs[i]}, how many indices does it pop off the stack?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: pops },
          explain: pops
            ? `${vs[i]} pops every smaller value waiting on top of the stack, and answers each of them: ${pops}.`
            : `The value on top of the stack is already bigger than ${vs[i]}, so nothing is popped.`,
          watch: [['scan']],
        };
      },
    },
    {
      id: 'stack-after',
      title: 'What is on the stack?',
      make(rng) {
        const vs = randomValues(rng, rng.int(7, 9), 1, 30);
        const i = rng.int(2, vs.length - 1);
        const steps = scanSteps(vs);
        const push = steps.find((s) => s.lines.includes('push') && s.vars!.i === i)!;
        const stack = push.extra!.stack!.map((k) => String(vs[k]));
        return {
          prompt: `Scan A for each value's next greater value. Right after index ${i} is pushed, which values are on the stack, from bottom to top?`,
          setup: [load(vs)],
          answer: { kind: 'sequence', value: stack },
          explain: `The stack holds the values still waiting for something bigger. Their values never increase from bottom to top: ${stack.join(', ')}.`,
          watch: [['scan']],
        };
      },
    },
    {
      id: 'rectangle',
      title: 'The largest rectangle',
      make(rng) {
        const vs = randomValues(rng, rng.int(6, 8), 1, 9);
        const best = Number(run([load(vs), ['histogram']]).entries[1]!.steps.at(-1)!.vars!.result);
        return {
          prompt: `The values are the heights of bars of width 1, side by side. What is the area of the largest rectangle that fits under them?`,
          setup: [load(vs)],
          answer: { kind: 'number', value: best },
          explain: `Each bar is popped once, and its rectangle measured then: as high as the bar, as wide as the bars around it that are at least as high. The largest is ${best}.`,
          watch: [['histogram']],
        };
      },
    },
  ];
}
