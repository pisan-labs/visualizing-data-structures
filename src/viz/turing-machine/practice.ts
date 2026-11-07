import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { ACCEPT, REJECT, parseMachine, tapeText, type Machine } from '../_turing/machine';
import { ADD, COPY, INCREMENT, PALINDROME, ZERO_ONE } from './machines';
import { defaults, type TmExtra, type TmSettings, type TmState } from './model';

type Def = VizDef<TmState, TmSettings, TmExtra>;

/**
 * Accepts a word with no 1, rejects one where a 0 follows the first 1, and runs forever when
 * the word ends in 1s: in q1 it walks right over 1s and then over blanks, for good.
 */
export const LOOPY =
  'q0 0 -> q0 R; q0 1 -> q1 R; q0 _ -> accept L; q1 0 -> reject R; q1 1,_ -> q1 R';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const bits = (rng: Rng, n: number, first = '') =>
  first + Array.from({ length: n - first.length }, () => String(rng.int(0, 1))).join('');

const unary = (rng: Rng) => `${'1'.repeat(rng.int(1, 3))}+${'1'.repeat(rng.int(1, 3))}`;

function palindrome(rng: Rng): string {
  const half = bits(rng, rng.int(1, 2));
  return half + (rng.int(0, 1) ? String(rng.int(0, 1)) : '') + [...half].reverse().join('');
}

const zeroOneWord = (rng: Rng) => {
  if (rng.int(0, 1)) {
    const k = rng.int(1, 3);
    return '0'.repeat(k) + '1'.repeat(k);
  }
  return bits(rng, rng.int(2, 5), '0');
};

const twoWay: TmSettings = { ...defaults, tape: 'two-way' };
const moves = (n: number) => `${n} move${n === 1 ? '' : 's'}`;

/**
 * Practice questions for the Turing machine page. Every answer comes from running the model,
 * so it agrees with what the page shows. `def` is a getter to avoid an import cycle.
 */
export function tmPractice(def: () => Def): PracticeKind[] {
  const timeline = (calls: OpCall[], settings: TmSettings = defaults) =>
    new Timeline(def(), settings, 1, calls);
  /** How a run of w ends: the last configuration, the verdict and the narration. */
  const ending = (machine: string, w: string, settings: TmSettings = defaults) => {
    const e = timeline(
      [
        ['load', machine],
        ['run', w],
      ],
      settings,
    ).entries.at(-1)!;
    const last = e.steps.at(-1)!;
    const c = e.end.config!;
    const verdict = last.extra?.capped ? 'running' : c.state === ACCEPT ? 'accept' : 'reject';
    return { c, verdict, say: last.say };
  };
  const setupFor = (machine: string, w: string): OpCall[] => [
    ['load', machine],
    ['start', w],
  ];

  return [
    {
      id: 'verdict',
      title: 'Accept, reject or run forever?',
      make(rng) {
        const which = rng.int(0, 2);
        const machine = [ZERO_ONE, PALINDROME, LOOPY][which]!;
        const w =
          which === 0
            ? zeroOneWord(rng)
            : which === 1
              ? rng.int(0, 1)
                ? palindrome(rng)
                : bits(rng, rng.int(2, 5))
              : bits(rng, rng.int(2, 5));
        const r = ending(machine, w);
        const options = ['It accepts', 'It rejects', 'It never halts'];
        const correct = r.verdict === 'accept' ? 0 : r.verdict === 'reject' ? 1 : 2;
        return {
          prompt: `Run the machine in the table on \`${w}\`, shown on the tape. Trace it with the table: what happens?`,
          setup: setupFor(machine, w),
          answer: { kind: 'choice', options, correct },
          explain:
            r.verdict === 'running'
              ? 'In q1 the machine moves right over 1s and blanks, and nothing ever sends it anywhere else: it never halts. The page gives up after 500 moves.'
              : r.say,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'state-after',
      title: 'Which state after k moves?',
      make(rng) {
        const [machine, w] = pick(rng, [
          [ZERO_ONE, zeroOneWord(rng)],
          [PALINDROME, bits(rng, rng.int(2, 4))],
          [ADD, unary(rng)],
          [COPY, bits(rng, 2)],
        ] as const);
        const total = ending(machine, w).c.moves;
        const k = rng.int(Math.min(2, total), Math.min(8, total));
        const watch: OpCall[] = Array.from({ length: k }, () => ['step'] as OpCall);
        const end = timeline([...setupFor(machine, w), ...watch]).endState();
        const q = end.config!.state;
        const m = parseMachine(machine) as Machine;
        const others = shuffle(
          rng,
          [...m.states, ACCEPT, REJECT].filter((s) => s !== q),
        ).slice(0, 3);
        const options = shuffle(rng, [q, ...others]);
        const line = end.trace.at(-1)!;
        const config = line.u ? `${line.u} ${line.q} ${line.v}` : `${line.q} ${line.v}`;
        return {
          prompt: `The machine starts on \`${w}\` in ${m.start}, as shown. Which state is it in after ${moves(k)}?`,
          setup: setupFor(machine, w),
          answer: { kind: 'choice', options, correct: options.indexOf(q) },
          explain: `After ${moves(k)} the configuration is \`${config}\`, so the machine is in ${q}.`,
          watch,
        };
      },
    },
    {
      id: 'tape-after',
      title: 'What is left on the tape?',
      make(rng) {
        const which = rng.int(0, 2);
        const [machine, w, settings] = [
          [INCREMENT, bits(rng, rng.int(3, 5), '1'), twoWay],
          [ADD, unary(rng), defaults],
          [COPY, bits(rng, rng.int(1, 3)), defaults],
        ][which] as [string, string, TmSettings];
        const r = ending(machine, w, settings);
        const tape = tapeText(r.c);
        return {
          prompt: `Run the machine in the table on \`${w}\`${which === 0 ? ' (the tape is infinite both ways)' : ''}. What is on the tape when it halts? Type the symbols from the first non-blank cell to the last, separated by spaces, such as \`1 0 1\`.`,
          setup: setupFor(machine, w),
          settings,
          answer: { kind: 'sequence', value: [...tape] },
          explain: `It halts in ${r.c.state} after ${moves(r.c.moves)} with \`${tape}\` on the tape.`,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'moves',
      title: 'How many moves?',
      make(rng) {
        const which = rng.int(0, 2);
        const [machine, w, settings] = [
          [ADD, unary(rng), defaults],
          [INCREMENT, bits(rng, rng.int(2, 4), '1'), twoWay],
          [ZERO_ONE, rng.int(0, 1) ? '0011' : bits(rng, rng.int(2, 4), '0'), defaults],
        ][which] as [string, string, TmSettings];
        const r = ending(machine, w, settings);
        return {
          prompt: `How many moves does the machine in the table make on \`${w}\` before it halts${which === 1 ? ' (the tape is infinite both ways)' : ''}? A missing rule rejects without a move.`,
          setup: setupFor(machine, w),
          settings,
          answer: { kind: 'number', value: r.c.moves },
          explain: r.say,
          watch: [['run', w]],
        };
      },
    },
  ];
}
