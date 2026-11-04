import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { choice, ordered, plural } from '../_recursion/kit';
import {
  baseTest,
  defaults,
  type Base,
  type FactSettings,
  type FactState,
  type Style,
} from './model';

type Def = VizDef<FactState, FactSettings, undefined>;

const STYLE_WORDS: Record<Style, string> = {
  plain: 'the plain version, `n * factorial(n - 1)`',
  tail: 'the tail version with an accumulator, in a language that gives every call a frame (like Python or Java)',
  tco: 'the tail version with an accumulator, in a language that reuses the frame for a tail call',
};

/**
 * Practice questions for recursive factorial. Every answer comes from running the model, so it
 * always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function factorialPractice(def: () => Def): PracticeKind[] {
  const steps = (settings: FactSettings, calls: OpCall[]): Step<FactState, undefined>[] => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const result = (settings: FactSettings, n: number) =>
    Number(steps(settings, [['factorial', n]]).at(-1)!.vars?.result);

  return [
    {
      id: 'returns',
      title: 'What does it return?',
      make(rng) {
        const k = rng.int(2, 5);
        const m = k + rng.int(1, 2);
        const setup: OpCall[] = [['factorial', k]];
        const value = result(defaults, m);
        const known = result(defaults, k);
        const chain = Array.from({ length: m - k }, (_, i) => String(m - i)).join(' × ');
        return {
          prompt: `The picture shows the calls \`factorial(${k})\` made and what each one returned. What does \`factorial(${m})\` return?`,
          setup,
          answer: { kind: 'number', value },
          explain: `Trust the smaller call: \`factorial(${m})\` is ${chain} × \`factorial(${k})\`, and the picture shows \`factorial(${k})\` = ${known}. So it returns ${chain} × ${known} = ${value}.`,
          watch: [['factorial', m]],
        };
      },
    },
    {
      id: 'depth',
      title: 'How deep does the stack get?',
      make(rng) {
        const style = (['plain', 'tail', 'tco'] as const)[rng.int(0, 2)]!;
        const base: Base = rng.int(0, 1) ? 'zero' : 'one';
        const settings: FactSettings = { ...defaults, style, base };
        const m = rng.int(3, 8);
        const deepest = Math.max(
          ...steps(settings, [['factorial', m]]).map((s) => s.state.stack.length),
        );
        const stop = base === 'zero' ? 0 : 1;
        return {
          prompt: `This is ${STYLE_WORDS[style]}, with the base case \`${baseTest(base)}\`. The picture shows \`factorial(2)\` done the same way. While \`factorial(${m})\` runs, what is the largest number of factorial frames on the stack at once? Do not count main.`,
          setup: [['factorial', 2]],
          settings,
          answer: { kind: 'number', value: deepest },
          explain:
            style === 'tco'
              ? `Every call is a tail call, and each one takes over the frame of the call before it, so the stack never holds more than ${plural(deepest, 'frame')}.`
              : `There is one call for every value from ${m} down to the base case at ${stop}, and none of them can finish until the base case returns. So all ${deepest} frames are on the stack at once.`,
          watch: [['factorial', m]],
        };
      },
    },
    {
      id: 'first-return',
      title: 'Which call returns first?',
      make(rng) {
        const base: Base = rng.int(0, 1) ? 'zero' : 'one';
        const settings: FactSettings = { ...defaults, base };
        const m = rng.int(3, 7);
        const run = steps(settings, [['factorial', m]]);
        // The first step where a call has a return value: the call that returns first.
        const first = run.find((s) => Object.keys(s.state.result).length > 0)!;
        const id = Number(Object.keys(first.state.result)[0]);
        const right = `factorial(${first.state.calls[id - 1]!.n})`;
        const wrong = [`factorial(${m})`, 'factorial(0)', 'factorial(1)', `factorial(${m - 1})`];
        return {
          prompt: `main calls \`factorial(${m})\`, and the base case is \`${baseTest(base)}\`. Which call is the first to return a value?`,
          setup: [],
          settings,
          answer: choice(rng, right, wrong),
          explain: `The calls go down until the base case, \`${right}\`, which answers without calling anything. Every call below it on the stack is still waiting, so the deepest call returns first and \`factorial(${m})\` returns last.`,
          watch: [['factorial', m]],
        };
      },
    },
    {
      id: 'overflow',
      title: 'Does it fit on the stack?',
      make(rng) {
        const limit = rng.int(4, 8);
        const pick = rng.int(0, 5);
        const base: Base = pick === 0 ? 'none' : pick <= 3 ? 'zero' : 'one';
        const n = pick === 1 ? rng.int(-3, -1) : rng.int(Math.max(0, limit - 3), limit + 1);
        const settings: FactSettings = { ...defaults, base, limit };
        const end = steps(settings, [['factorial', n]]).at(-1)!;
        const overflows = end.state.run?.outcome === 'overflow';
        const finishes = 'It finishes';
        const overflow = 'Stack overflow';
        const needed = base === 'one' ? Math.max(1, n) : n + 1;
        let explain: string;
        if (base === 'none') {
          explain = `With no base case nothing ever stops the calls, so the stack overflows after ${limit} frames whatever n is.`;
        } else if (n < 0 && base === 'zero') {
          explain = `n starts below 0 and only goes down, so it never reaches the base case n == 0. The calls go on until the stack is full.`;
        } else if (n < 0) {
          explain = `${n} <= 1, so the very first call is the base case and returns 1. It finishes, although (${n})! means nothing.`;
        } else {
          explain = overflows
            ? `\`factorial(${n})\` needs ${plural(needed, 'frame')} at once (one for each n from ${n} down to the base case), but only ${limit} fit.`
            : `\`factorial(${n})\` needs ${plural(needed, 'frame')} at once (one for each n from ${n} down to the base case), and ${limit} fit.`;
        }
        return {
          prompt: `The stack has room for ${limit} factorial frames, and ${base === 'none' ? 'the base case is missing' : `the base case is \`${baseTest(base)}\``}. Does \`factorial(${n})\` finish, or overflow the stack?`,
          setup: [],
          settings,
          answer: ordered([finishes, overflow], overflows ? overflow : finishes),
          explain,
          watch: [['factorial', n]],
        };
      },
    },
  ];
}
