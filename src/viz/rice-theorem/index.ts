import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/rice.hpp?raw';
import javaSource from './code/java/Rice.java?raw';
import pythonSource from './code/python/rice.py?raw';
import emptyWord from './examples/empty-word.json';
import haltsHasP from './examples/halts-has-p.json';
import loopsLacksP from './examples/loops-lacks-p.json';
import nonempty from './examples/nonempty.json';
import theArgument from './examples/the-argument.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  mPrimeHas,
  ops,
  parseInputWord,
  programIndex,
  propOf,
  pseudocode,
  vars,
  type RiceSettings,
  type RiceState,
} from './model';
import { ricePractice } from './practice';
import { view } from './view';

/** The input box: program numbers for Build M′ ("3 2"), or an input word for Test. */
export function parseInput(token: string): Value | Error {
  const k = programIndex(token);
  if (k !== null) return k + 1;
  const w = parseInputWord(token);
  return w instanceof Error ? w : w || 'eps';
}

const preset = (label: string, make: () => OpCall[]): Preset => ({ label, make: () => make() });

export const riceTheorem: VizDef<RiceState, RiceSettings, unknown> = {
  id: 'rice-theorem',
  title: "Rice's theorem",
  family: 'Automata and computability',
  blurb:
    'No program decides a non-trivial property of what programs accept. Build the machine of the proof, which runs M on w and then behaves like a machine with the property, and see why a decider for the property would decide halting.',
  settings: [
    {
      kind: 'choice',
      key: 'property',
      label: 'The property P',
      options: [
        { value: 'accepts-A', label: 'L(M) contains the word A' },
        { value: 'accepts-eps', label: 'L(M) contains the empty word' },
        { value: 'nonempty', label: 'L(M) is not empty' },
      ],
      help: 'Each is a semantic property (about the language, not the code) that some programs have and some do not. The empty language never has it, so M′ has P exactly when M halts on w.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars: (s) => vars(s),
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Programs or input',
      placeholder: 'e.g. 3 2 for Build M′; A or eps for Test',
      maxLength: 12,
      sample: '3',
      parse: parseInput,
    },
    buttons: [
      {
        op: 'build',
        label: 'Build M′',
        usesInput: true,
        primary: true,
        args: ['M (a program number)', 'w (the program whose description is w)'],
      },
      { op: 'test', label: 'Test', usesInput: true },
      { op: 'decide', label: 'Decide', usesInput: false },
    ],
    presets: [
      preset('M halts on w: M′ has P', () => [['build', 3, 2], ['test', 'A'], ['decide']]),
      preset('M loops on w: L(M′) is empty', () => [['build', 3, 1], ['test', 'A'], ['decide']]),
      preset('M loops at once', () => [['build', 2, 5], ['test', 'eps'], ['decide']]),
      preset('M accepts at once', () => [
        ['build', 1, 6],
        ['test', 'A'],
        ['test', 'G'],
        ['decide'],
      ]),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Build M′ from M and w',
      best: {
        cost: 'O(|M| + |w|)',
        why: 'Writing the code of M′ copies M, w and M_P; nothing runs.',
        example: 'halts-has-p',
      },
      average: {
        cost: 'O(|M| + |w|)',
        why: 'The same for every M and w: a reduction must always finish.',
        example: 'loops-lacks-p',
      },
      worst: {
        cost: 'O(|M| + |w|)',
        why: 'Even when M loops on w, building M′ halts: it never runs M.',
        example: 'the-argument',
      },
    },
    {
      op: 'Decide a non-trivial semantic property',
      best: {
        cost: 'impossible',
        why: 'Any decider would decide HALT through M′.',
        example: 'the-argument',
      },
      average: {
        cost: 'impossible',
        why: 'Rice: true for every property of the language that some, not all, machines have.',
        example: 'nonempty',
      },
      worst: {
        cost: 'impossible',
        why: 'Even "is L(M) empty?" is undecidable.',
        example: 'nonempty',
      },
      note: 'Syntactic properties (about the code, like "has 5 states") and trivial ones are decidable. So are semantic ones for machines that always halt, or here, for toy programs that cannot write.',
    },
    {
      op: 'Run M′ on x (toy programs)',
      best: {
        cost: 'O(1) steps',
        why: 'M1 accepts at once, then M_P answers at once.',
        example: 'empty-word',
      },
      average: {
        cost: 'O(L·|w| + L·|x|)',
        why: 'A toy program halts or repeats a (line, head) pair within L·(n + 1) steps.',
        example: 'halts-has-p',
      },
      worst: {
        cost: 'never halts',
        why: 'If M loops on w, M′ loops on every input.',
        example: 'loops-lacks-p',
      },
    },
  ],
  practice: ricePractice(() => riceTheorem),
  preview: { example: 'halts-has-p', level: 2, hide: ['prop-', 'arg-'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RiceSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [haltsHasP, loopsLacksP, emptyWord, nonempty, theArgument] as unknown as SavedExample[],
};

/**
 * Driver protocol: "property <id>", then "build i j" for each M′ built (prints nothing), "test x"
 * (prints accept, reject or loop) and "decide" (prints yes or no: whether M′ has P).
 */
function codeScript(calls: OpCall[], settings: RiceSettings) {
  const t = new Timeline(riceTheorem, settings, 1, calls);
  const p = propOf(t.initial.state);
  const input = [`property ${p.id}`];
  const expected: string[] = [];
  let built: [number, number] | null = null;
  for (const e of t.entries) {
    const s = e.end;
    const [op] = e.call;
    if (s.m === null || s.w === null) continue;
    if (op === 'build' && e.steps.length > 1) {
      built = [s.m, s.w];
      input.push(`build ${s.m + 1} ${s.w + 1}`);
    } else if (op === 'test' && built && s.current && s.rows.length && e.steps.length > 1) {
      input.push(`test ${s.current.x || 'eps'}`);
      expected.push(s.rows.at(-1)!.outcome);
    } else if (op === 'decide' && built && s.argued === 5 && e.steps.length > 1) {
      input.push('decide');
      expected.push(mPrimeHas(p, s.m, s.w) ? 'yes' : 'no');
    }
  }
  return { input, expected };
}

export default riceTheorem;
