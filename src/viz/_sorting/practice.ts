/**
 * Building blocks for the practice sets of the sorting and searching pages. Every answer comes
 * from running the page's own model with seed 1, the way the practice panel replays a question,
 * so it always agrees with what the visualization shows.
 */
import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, PracticeKind, Settings, VizDef } from '../../engine/types';
import { distinctValues, valuesOf, type ArrayExtra, type ArrayState, type ArrayStep } from './kit';

// Settings differ from page to page; each page's practice.ts knows its own.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArrayDef = VizDef<ArrayState, any, ArrayExtra>;

/** An operation as code: `search(35)`. */
export const call = ([op, ...args]: OpCall): string => `\`${op}(${args.join(', ')})\``;

/** "8, 17, 42". */
export const list = (vs: readonly (number | string)[]): string => vs.join(', ');

export const load = (vs: readonly number[]): OpCall => ['load', vs.join(' ')];

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A multiple-choice answer: the right option and up to three distinct wrong ones, shuffled. */
export function choice(rng: Rng, right: string, wrong: readonly string[]): PracticeAnswer {
  const others = [...new Set(wrong.filter((w) => w !== right))].slice(0, 3);
  const options = shuffle(rng, [right, ...others]);
  return { kind: 'choice', options, correct: options.indexOf(right) };
}

/** A multiple-choice answer whose options keep their order (Yes before No). */
export function ordered(options: string[], right: string): PracticeAnswer {
  return { kind: 'choice', options, correct: options.indexOf(right) };
}

/** Run operations from the page's start state, as the practice panel does. */
export function runOps(def: ArrayDef, settings: Settings, ops: OpCall[]) {
  return new Timeline(def, { ...def.defaults, ...settings }, 1, ops);
}

/** The steps of the last operation. */
export function stepsOf(def: ArrayDef, settings: Settings, ops: OpCall[]): ArrayStep[] {
  return runOps(def, settings, ops).entries.at(-1)!.steps as ArrayStep[];
}

/** A sort's milestones: the end of each pass, merge or partition, then the sorted array. */
export const milestones = (steps: readonly ArrayStep[]): ArrayStep[] =>
  steps.filter((s) => s.level === 1);

/** A counter at a step, 0 when it is missing. */
export const counter = (step: ArrayStep, name: string): number => Number(step.vars?.[name] ?? 0);

export const valuesAt = (step: ArrayStep): string[] => valuesOf(step.state).map(String);

/** n distinct values from 1 to 99, in random order. */
export const distinct = (rng: Rng, n: number): number[] => distinctValues(rng, n);

/** n values in which exactly one value appears twice, at indices i < j. */
export function withTwin(rng: Rng, n: number): { values: number[]; i: number; j: number } {
  const vs = distinctValues(rng, n - 1);
  const i = rng.int(0, n - 2);
  const j = rng.int(i + 1, n - 1);
  const values = [...vs.slice(0, j), vs[i]!, ...vs.slice(j)];
  return { values, i, j };
}

/**
 * "Which of the two equal values comes first after sorting?" The model's uids say which copy
 * ended up where: load hands them out left to right, so the copy from A[i] has the smaller uid.
 */
export function twinKind(
  def: () => ArrayDef,
  opts: {
    /** The sort's name in prose: "Bubble sort". */
    name: string;
    settings?: (rng: Rng) => Settings;
    /** Why the order was kept, or why it changed. */
    why: (kept: boolean) => string;
    size?: [number, number];
  },
): PracticeKind {
  return {
    id: 'stable',
    title: 'Which copy comes first?',
    make(rng) {
      const settings = opts.settings?.(rng) ?? {};
      const [lo, hi] = opts.size ?? [5, 7];
      const { values, i, j } = withTwin(rng, rng.int(lo, hi));
      const v = values[i]!;
      const setup = [load(values)];
      const end = runOps(def(), settings, [...setup, ['sort']]).endState();
      const uids = end.a.filter((x) => x.value === v).map((x) => x.uid);
      const kept = uids[0]! < uids[1]!;
      const first = `The ${v} that started in A[${i}]`;
      const second = `The ${v} that started in A[${j}]`;
      return {
        prompt: `A has two ${v}s, in A[${i}] and A[${j}]. ${opts.name} sorts A. Which ${v} comes first in the result?`,
        setup,
        settings,
        answer: ordered([first, second], kept ? first : second),
        explain: `${kept ? `They keep their order: the ${v} from A[${i}] stays in front.` : `They swap places: the ${v} from A[${j}] ends up in front.`} ${opts.why(kept)}`,
        watch: [['sort']],
      };
    },
  };
}
