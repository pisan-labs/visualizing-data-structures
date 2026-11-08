import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { writePoints } from '../../layouts/plane';
import { randomPoints } from '../_spatial/kit';
import { MAX, byId, defaults, pairs, type CPExtra, type CPSettings, type CPState } from './model';

type Def = VizDef<CPState, CPSettings, CPExtra>;

const setupOf = (rng: Rng, lo: number, hi: number): OpCall[] => [
  ['load', writePoints(randomPoints(rng, rng.int(lo, hi), 0, MAX))],
];

/**
 * Practice for the closest pair. Every answer comes from running the model; `def` is a getter
 * to avoid an import cycle.
 */
export function closestPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: CPSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);

  return [
    {
      id: 'distance',
      title: 'How close is the closest pair?',
      make(rng) {
        const setup = setupOf(rng, 6, 10);
        const end = run([...setup, ['closest']]).endState();
        const [a, b] = end.answer!.map((id) => byId(end, id));
        return {
          prompt: 'What is the squared distance between the closest two points?',
          setup,
          answer: { kind: 'number', value: end.d2! },
          explain: `${a!.name}(${a!.x}, ${a!.y}) and ${b!.name}(${b!.x}, ${b!.y}): (${a!.x} − ${b!.x})² + (${a!.y} − ${b!.y})² = ${end.d2}.`,
          watch: [['closest']],
        };
      },
    },
    {
      id: 'split-line',
      title: 'Where is the first split?',
      make(rng) {
        const setup = setupOf(rng, 8, 14);
        const t = run([...setup, ['closest']]);
        const e = t.entries.at(-1)!;
        const first = e.steps.find((st) => st.lines.includes('cp.split'))!;
        const xm = first.state.calls[0]!.xm!;
        const n = e.end.points.length;
        return {
          prompt: `The points are sorted by x and split in half (${Math.floor(n / 2)} on the left). The dividing line is x = xm, where xm is the x of the first point of the right half. What is xm?`,
          setup,
          answer: { kind: 'number', value: xm },
          explain: `Sorted by x (ties by y): ${e.end.byX.map((id) => byId(e.end, id).name).join(', ')}. The first point of the right half has x = ${xm}.`,
          watch: [['closest']],
        };
      },
    },
    {
      id: 'strip',
      title: 'Who is in the strip?',
      make(rng) {
        const setup = setupOf(rng, 8, 12);
        const t = run([...setup, ['closest']]);
        const e = t.entries.at(-1)!;
        const top = e.steps.filter((st) => st.lines.includes('cp.strip')).at(-1)!;
        const s = top.state;
        const xm = s.calls[0]!.xm!;
        const names = s.strip.map((id) => byId(s, id).name).sort();
        return {
          prompt: `After both halves are solved, δ² = ${s.stripD2} and the line is x = ${xm}. Which points are in the strip, closer than δ to the line? Type their names in alphabetical order (none if it is empty).`,
          setup,
          answer: { kind: 'sequence', value: names.length ? names : ['none'] },
          explain: `A point is in the strip when (x − ${xm})² < ${s.stripD2}. ${names.length ? `That is ${names.join(', ')}.` : 'No point is that close to the line.'}`,
          watch: [['closest']],
        };
      },
    },
    {
      id: 'savings',
      title: 'Divide and conquer against brute force',
      make(rng) {
        const settings: Settings = { ...defaults, method: rng.int(0, 1) ? 'brute' : 'divide' };
        const setup = setupOf(rng, 8, 16);
        const end = run([...setup, ['closest']], settings as CPSettings).endState();
        const n = end.points.length;
        return {
          prompt:
            settings.method === 'brute'
              ? `Brute force on these ${n} points: how many pairs does it compare?`
              : `Divide and conquer on these ${n} points: how many pairs does it compare in all (base cases and strips)?`,
          setup,
          settings,
          answer: { kind: 'number', value: end.comparisons },
          explain:
            settings.method === 'brute'
              ? `Every pair once: ${n} × ${n - 1} / 2 = ${pairs(n)}.`
              : `${end.comparisons} comparisons, against ${pairs(n)} for brute force. The base cases compare every pair of 2 or 3 points; the strips add a few each.`,
          watch: [['closest']],
        };
      },
    },
  ];
}
