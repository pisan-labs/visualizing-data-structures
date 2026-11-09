import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { choice } from '../_recursion/kit';
import { bin, defaults, type BitExtra, type BitSettings, type BitState } from './model';

type Def = VizDef<BitState, BitSettings, BitExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;

/**
 * Practice questions for bitmasks. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function bitmaskPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const last = (cs: OpCall[]): Step<BitState, BitExtra> => run(cs).entries.at(-1)!.steps.at(-1)!;
  const w = defaults.width;

  return [
    {
      id: 'x-after',
      title: 'What is x afterwards?',
      make(rng) {
        const x = rng.int(1, 255);
        const setup: OpCall[] = [['load', x]];
        const kinds = ['set', 'clear', 'toggle'] as const;
        const ask: OpCall[] = Array.from({ length: 3 }, () => [
          kinds[rng.int(0, 2)]!,
          rng.int(0, w - 1),
        ]);
        const end = run([...setup, ...ask]).endState().x;
        return {
          prompt: `x = ${x} = \`${bin(x, w)}\`. Run ${ask.map(call).join(', ')}. What is x now, in decimal?`,
          setup,
          answer: { kind: 'number', value: end },
          explain: `Each operation touches only its own bit: set leaves a 1 alone, clear leaves a 0 alone, toggle always flips. x ends as \`${bin(end, w)}\`, which is ${end}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'lowest-bit',
      title: 'What is x & -x?',
      make(rng) {
        const x = rng.int(1, 255);
        const setup: OpCall[] = [['load', x]];
        const low = Number(last([...setup, ['lowbit']]).vars?.returned);
        return {
          prompt: `x = ${x} = \`${bin(x, w)}\`. What is \`x & -x\`, in decimal?`,
          setup,
          answer: { kind: 'number', value: low },
          explain: `x & -x keeps only the lowest 1 of x. In \`${bin(x, w)}\` that is the bit worth ${low}.`,
          watch: [['lowbit']],
        };
      },
    },
    {
      id: 'popcount-loops',
      title: 'How many passes does popcount make?',
      make(rng) {
        const x = rng.int(1, 255);
        const setup: OpCall[] = [['load', x]];
        const count = Number(last([...setup, ['popcount']]).vars?.count);
        return {
          prompt: `x = \`${bin(x, w)}\`. How many times does the loop \`while x != 0: x = x & (x - 1)\` run?`,
          setup,
          answer: { kind: 'number', value: count },
          explain: `Each pass clears exactly one 1 bit, so the loop runs once per set bit: ${count === 1 ? 'once' : `${count} times`}.`,
          watch: [['popcount']],
        };
      },
    },
    {
      id: 'submask-count',
      title: 'How many submasks?',
      make(rng) {
        const bits = rng.int(1, 4);
        let x = 0;
        while (x.toString(2).replace(/0/g, '').length < bits) x |= 1 << rng.int(0, w - 1);
        const setup: OpCall[] = [['load', x]];
        const found = last([...setup, ['submasks']]).state.list.length;
        const k = x.toString(2).replace(/0/g, '').length;
        return {
          prompt: `x = \`${bin(x, w)}\`. How many submasks does x have, counting x itself and 0?`,
          setup,
          answer: choice(
            rng,
            String(found),
            [String(k), String(2 * k), String(found * 2), String(x)].filter(
              (o) => o !== String(found),
            ),
          ),
          explain: `${k === 1 ? 'The one set bit is' : `Each of the ${k} set bits is`} either kept or dropped, so there are 2^${k} = ${found} submasks.`,
          watch: [['submasks']],
        };
      },
    },
  ];
}
