import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { ACCEPT, separators, tapeText } from './machine';
import { ADD, COPY_COMPARE, MULTIPLY, PALINDROME } from './machines';
import { defaults, type MtExtra, type MtSettings, type MtState } from './model';

type Def = VizDef<MtState, MtSettings, MtExtra>;

/**
 * Accepts a word with no 1 and rejects one where a 0 follows the first 1. Otherwise it runs
 * forever: in seen, head 2 walks right over blanks while head 1 waits.
 */
export const LOOPY =
  'scan 0,_ -> scan R,S; scan _,_ -> accept S,S; scan 1,_ -> seen R,S; seen 0,_ -> reject S,S; seen 1|_,_ -> seen S,R';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

const bits = (rng: Rng, n: number) =>
  Array.from({ length: n }, () => String(rng.int(0, 1))).join('');

function palindrome(rng: Rng): string {
  const half = bits(rng, rng.int(1, 2));
  return half + (rng.int(0, 1) ? String(rng.int(0, 1)) : '') + [...half].reverse().join('');
}

function copyWord(rng: Rng): string {
  const w = bits(rng, rng.int(1, 3));
  if (rng.int(0, 1)) return `${w}=${w}`;
  return `${w}=${rng.int(0, 1) ? bits(rng, w.length) : bits(rng, rng.int(1, 3))}`;
}

const sum = (rng: Rng) => {
  const n = rng.int(1, 3);
  return `${bits(rng, n)},${bits(rng, n)}`;
};

const product = (rng: Rng) => `${'1'.repeat(rng.int(1, 3))}*${'1'.repeat(rng.int(1, 3))}`;

const moves = (n: number) => `${n} move${n === 1 ? '' : 's'}`;

/**
 * Practice questions for the multi-tape page. Every answer comes from running the model, so it
 * agrees with what the page shows. `def` is a getter to avoid an import cycle.
 */
export function mtPractice(def: () => Def): PracticeKind[] {
  const timeline = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  const setupFor = (machine: string, w: string): OpCall[] => [
    ['load', machine],
    ['start', w],
  ];
  /** The last operation's entry, after the setup and `more`. */
  const after = (machine: string, w: string, more: OpCall[]) =>
    timeline([...setupFor(machine, w), ...more]).entries.at(-1)!;

  return [
    {
      id: 'verdict',
      title: 'Accept, reject or run forever?',
      make(rng) {
        const which = rng.int(0, 3);
        const [machine, w] = [
          [COPY_COMPARE, copyWord(rng)],
          [PALINDROME, rng.int(0, 1) ? palindrome(rng) : bits(rng, rng.int(2, 5))],
          [ADD, rng.int(0, 2) ? sum(rng) : `${bits(rng, 2)},${bits(rng, 1)}`],
          [LOOPY, bits(rng, rng.int(2, 4))],
        ][which] as [string, string];
        const e = after(machine, w, [['run', w]]);
        const last = e.steps.at(-1)!;
        const c = e.end.config!;
        const verdict = last.extra?.capped ? 2 : c.state === ACCEPT ? 0 : 1;
        const options = ['It accepts', 'It rejects', 'It never halts'];
        return {
          prompt: `The rules are beside the tapes, and \`${w}\` is on ${w.includes(',') ? 'tapes 1 and 2' : 'tape 1'}. Trace the machine: what happens?`,
          setup: setupFor(machine, w),
          answer: { kind: 'choice', options, correct: verdict },
          explain:
            verdict === 2
              ? 'After the first 1, a 1 or a blank sends the machine to seen, where head 2 walks right over blanks forever while head 1 waits. The page gives up after 500 moves.'
              : last.say,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'tape-after',
      title: 'What is left on a tape?',
      make(rng) {
        const which = rng.int(0, 2);
        const [machine, w, tape] = [
          [ADD, sum(rng), 3],
          [MULTIPLY, product(rng), 3],
          [COPY_COMPARE, copyWord(rng), 2],
        ][which] as [string, string, number];
        const e = after(machine, w, [['run', w]]);
        const c = e.end.config!;
        const text = tapeText(c.tapes[tape - 1]!);
        return {
          prompt: `Run the machine in the rules on \`${w}\`. When it halts, what is on tape ${tape}? Type the symbols from cell 0 to the last one that is not blank, separated by spaces, such as \`1 0 1\`.`,
          setup: setupFor(machine, w),
          answer: { kind: 'sequence', value: [...text] },
          explain: `It halts in ${c.state} after ${moves(c.moves)} with \`${text}\` on tape ${tape}.`,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'shifts',
      title: 'How many shifts on one tape?',
      make(rng) {
        const [machine, w] = pick(rng, [
          [COPY_COMPARE, copyWord(rng)],
          [PALINDROME, palindrome(rng)],
          [MULTIPLY, product(rng)],
        ] as const);
        const begin = timeline(setupFor(machine, w)).endState().sim!;
        const e = after(machine, w, [['simulate', w]]);
        const end = e.end.sim!;
        const shifts = end.cells.length - begin.cells.length;
        const grew = segmentLengths(begin.cells)
          .map((n, i) => [i + 1, n, segmentLengths(end.cells)[i]!] as const)
          .filter(([, a, b]) => b > a)
          .map(
            ([i, a, b], j) => `${j ? 'tape' : 'Tape'} ${i}'s segment grows from ${a} to ${b} cells`,
          );
        return {
          prompt: `The single tape starts as shown, for \`${w}\`. Simulate the run: how many times does S shift part of its tape right to make room for a head?`,
          setup: setupFor(machine, w),
          answer: { kind: 'number', value: shifts },
          explain: grew.length
            ? `Each shift adds one cell. ${grew.join(', and ')}: ${shifts} shift${shifts === 1 ? '' : 's'} in all.`
            : 'No head ever moves past the end of its segment, so S never shifts.',
          watch: [['simulate', w]],
        };
      },
    },
    {
      id: 'mark-cell',
      title: 'Where is the mark?',
      make(rng) {
        const [machine, w] = pick(rng, [
          [COPY_COMPARE, copyWord(rng)],
          [PALINDROME, palindrome(rng)],
          [MULTIPLY, product(rng)],
          [ADD, sum(rng)],
        ] as const);
        const total = after(machine, w, [['run', w]]).end.config!.moves;
        const j = rng.int(Math.min(2, total), Math.min(6, total));
        const watch: OpCall[] = Array.from({ length: j }, () => ['step'] as OpCall);
        const end = timeline([...setupFor(machine, w), ...watch]).endState();
        const tape = machine === ADD || machine === MULTIPLY ? rng.int(2, 3) : 2;
        const sim = end.sim!;
        const at = sim.dots[tape - 1]!;
        const head = end.config!.tapes[tape - 1]!.head;
        const sep = separators(sim)[tape - 1]!;
        return {
          prompt: `The machine starts on \`${w}\`, and the single tape below is formatted for it. After ${moves(j)} of the ${machine === ADD || machine === MULTIPLY ? 'three' : 'two'}-tape machine, which cell of the single tape holds the mark for tape ${tape}? Count from cell 0, the first #.`,
          setup: setupFor(machine, w),
          answer: { kind: 'number', value: at },
          explain: `After ${moves(j)}, head ${tape} is on cell ${head} of its tape. Tape ${tape}'s segment starts after the # in cell ${sep}, so its cell ${head} is cell ${sep} + 1 + ${head} = ${at} of the single tape.`,
          watch,
        };
      },
    },
  ];
}

/** The length of each segment between the #s. */
function segmentLengths(cells: readonly string[]): number[] {
  const seps = separators({ cells: [...cells] });
  return seps.slice(0, -1).map((a, i) => seps[i + 1]! - a - 1);
}
