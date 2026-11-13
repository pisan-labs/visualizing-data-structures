import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import { ANIMALS, THINGS } from '../_lm/vocab';
import {
  divisor,
  PAIRS,
  type PosExtra,
  type PosSettings,
  type PosState,
  type Scheme,
} from './model';

type Def = VizDef<PosState, PosSettings, PosExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function sentence(rng: Rng): string {
  const a = pick(rng, ANIMALS);
  const t = pick(rng, THINGS);
  return pick(rng, [
    `the ${a} sat on the ${t}`,
    `the ${a} saw the ${t} and it`,
    `a ${a} ate the ${t}`,
    `the ${a} ran under the ${t}`,
  ]);
}

const PAIR_NAMES = Array.from({ length: PAIRS }, (_, i) => `pair ${i}`);

/**
 * Practice for positional encoding. The picture shows the sentence after Load with the
 * question's scheme; the questions ask about Encode, and every answer comes from running it.
 */
export function positionPractice(def: () => Def): PracticeKind[] {
  function encoded(rng: Rng, scheme: Scheme) {
    const settings: PosSettings = { scheme };
    const ops: OpCall[] = [['load', sentence(rng)]];
    const watch: OpCall[] = [['encode']];
    const t = new Timeline(def(), settings, 1, [...ops, ...watch]);
    const s = t.endState();
    return { settings, ops, watch, s, table: s.table! };
  }

  return [
    {
      id: 'angle',
      title: 'The angle of a pair',
      make(rng) {
        const { settings, ops, watch, s, table } = encoded(rng, 'rope');
        const n = s.words.length;
        const pos = rng.int(1, n - 1);
        const i = rng.int(0, 2);
        const value = table[pos]![i]!;
        return {
          prompt: `RoPE with d = 8 turns pair i at position pos by pos / 10000^(2i/8) radians. By how much is **pair ${i}** of the word at **position ${pos}** (${s.words[pos]}) turned? Radians, two decimals.`,
          setup: ops,
          settings,
          answer: { kind: 'number', value, tolerance: 0.005 },
          explain: `10000^(2·${i}/8) = ${divisor(i)}, so the angle is ${pos} / ${divisor(i)} = ${two(value)} radians.`,
          watch,
        };
      },
    },
    {
      id: 'fastest',
      title: 'Which pair spins fastest?',
      make(rng) {
        const scheme: Scheme = rng.int(0, 1) ? 'rope' : 'sinusoidal';
        const { settings, ops, watch, s, table } = encoded(rng, scheme);
        const n = s.words.length;
        const slow = rng.int(0, 1) === 1;
        // Read the speeds off the table: the angle each pair has reached at the last position.
        const last = n - 1;
        const reached = scheme === 'rope' ? table[last]! : [];
        const speeds = Array.from({ length: PAIRS }, (_, i) => 1 / divisor(i));
        const answer = speeds.indexOf(slow ? Math.min(...speeds) : Math.max(...speeds));
        return {
          prompt: `With ${scheme === 'rope' ? 'RoPE' : 'the sinusoidal encoding'} (d = 8), which pair turns ${slow ? 'slowest' : 'fastest'} as the position grows?`,
          setup: ops,
          settings,
          answer: { kind: 'choice', options: PAIR_NAMES, correct: answer },
          explain: `Pair i turns 1 / 10000^(2i/8) radians per position: ${speeds.map((v, i) => `pair ${i} ${v}`).join(', ')}. ${slow ? 'The last pair is slowest' : 'Pair 0 is fastest'}${scheme === 'rope' ? `: at position ${last} the angles are ${reached.map(two).join(', ')}.` : '.'}`,
          watch,
        };
      },
    },
    {
      id: 'value',
      title: 'Read the sinusoid table',
      make(rng) {
        const { settings, ops, watch, s, table } = encoded(rng, 'sinusoidal');
        const n = s.words.length;
        const pos = rng.int(1, n - 1);
        const i = rng.int(0, 1);
        const cos = rng.int(0, 1) === 1;
        const value = table[pos]![2 * i + (cos ? 1 : 0)]!;
        const fn = cos ? 'cos' : 'sin';
        return {
          prompt: `In the sinusoidal encoding (d = 8), what is **PE[${pos}][${2 * i + (cos ? 1 : 0)}]**, the ${fn} of pair ${i} at position ${pos}? Two decimals.`,
          setup: ops,
          settings,
          answer: { kind: 'number', value, tolerance: 0.005 },
          explain: `The angle is ${pos} / ${divisor(i)} = ${pos / divisor(i)} radians, and ${fn}(${pos / divisor(i)}) = ${two(value)}.`,
          watch,
        };
      },
    },
    {
      id: 'bias',
      title: 'An ALiBi bias',
      make(rng) {
        const { settings, ops, watch, s, table } = encoded(rng, 'alibi');
        const n = s.words.length;
        const i = rng.int(1, n - 1);
        const j = rng.int(0, i - 1);
        const value = table[i]![j]!;
        return {
          prompt: `ALiBi with slope 1/2: what bias is added to the score of the word at **position ${i}** (${s.words[i]}) looking back at **position ${j}** (${s.words[j]})?`,
          setup: ops,
          settings,
          answer: { kind: 'number', value, tolerance: 0.005 },
          explain: `The distance is ${i} − ${j} = ${i - j}, and the bias is −1/2 × ${i - j} = ${two(value)}.`,
          watch,
        };
      },
    },
  ];
}
