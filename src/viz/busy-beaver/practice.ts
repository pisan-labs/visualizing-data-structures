import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { CHAMPIONS, HALT, stateLetter } from './machines';
import { defaults, ones, stateOf, type BbExtra, type BbSettings, type BbState } from './model';
import { cellAt } from '../_turing/machine';

type Def = VizDef<BbState, BbSettings, BbExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The machines questions use: the small champions, and a few ordinary 2-state halters. */
const SMALL = ['bb2', 'bb3', 'bb3s'];
const ORDINARY = [
  '1RB1LB_1LA0RH',
  '1RB0LB_1LA1RH',
  '1LB0RB_1RA1RH',
  '1RB1RH_1LB1LA',
  '1LB0LA_1RB1RH',
  '1LB1RB_1RA0RH',
];

/**
 * Practice for the busy beaver page. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function bbPractice(def: () => Def): PracticeKind[] {
  const after = (machine: string, calls: OpCall[]) =>
    new Timeline(def(), defaults, 1, [['load', machine], ...calls]).entries.at(-1)!;
  const champion = (name: string) => CHAMPIONS.find((c) => c.name === name)!;
  /** A champion and a number of moves before it halts. */
  const partway = (rng: Rng) => {
    const name = pick(rng, SMALL);
    const k = rng.int(2, champion(name).moves - 1);
    return { name, k, end: after(name, [['steps', k]]).end };
  };

  return [
    {
      id: 'ones',
      title: '1s after some moves',
      make(rng) {
        const { name, k, end } = partway(rng);
        const n = ones(end.config);
        return {
          prompt: `The machine on the stage starts on a blank tape. How many 1s are on the tape after ${plural(k, 'move')}?`,
          setup: [['load', name]],
          answer: { kind: 'number', value: n },
          explain: `Follow the rules from A on all 0s: after ${plural(k, 'move')} the tape holds ${plural(n, 'one', 'ones')}. A rule that writes 1 over a 1, or 0 over a 0, changes nothing.`,
          watch: [['steps', k]],
        };
      },
    },
    {
      id: 'state',
      title: 'Which state?',
      make(rng) {
        const { name, k, end } = partway(rng);
        const q = stateOf(end);
        const options = [
          ...Array.from({ length: champion(name).states }, (_, i) => stateLetter(i)),
          HALT,
        ];
        return {
          prompt: `The machine on the stage starts in A on a blank tape. Which state is it in after ${plural(k, 'move')}?`,
          setup: [['load', name]],
          answer: { kind: 'choice', options, correct: options.indexOf(q) },
          explain: `Each move reads the bit under the head and the rule for that state and bit names the next state. After ${plural(k, 'move')} it is in ${q}, with the head on cell ${end.config.head}.`,
          watch: [['steps', k]],
        };
      },
    },
    {
      id: 'halt',
      title: 'Moves until it halts',
      make(rng) {
        const machine = pick(rng, ORDINARY);
        const end = after(machine, [['run']]).end;
        const n = end.config.moves;
        return {
          prompt: `How many moves does the machine on the stage make, from a blank tape, before it halts? The move into H counts.`,
          setup: [['load', machine]],
          answer: { kind: 'number', value: n },
          explain: `Run it: it halts after ${plural(n, 'move')}, leaving ${plural(ones(end.config), 'one', 'ones')}. The 2-state record is 6 moves and 4 ones.`,
          watch: [['run']],
        };
      },
    },
    {
      id: 'tape',
      title: 'The tape after some moves',
      make(rng) {
        const { name, k, end } = partway(rng);
        const c = end.config;
        const lo = c.lo;
        const hi = c.hi;
        const cells = Array.from({ length: hi - lo + 1 }, (_, i) =>
          cellAt(c, lo + i) === '1' ? '1' : '0',
        );
        return {
          prompt: `The machine on the stage starts on a blank tape with the head on cell 0. After ${plural(k, 'move')}, what do cells ${lo} to ${hi} hold? Type the bits from left to right.`,
          setup: [['load', name]],
          answer: { kind: 'sequence', value: cells },
          explain: `After ${plural(k, 'move')}, cells ${lo} to ${hi} (every cell the head has been on) hold ${cells.join(' ')}.`,
          watch: [['steps', k]],
        };
      },
    },
  ];
}
