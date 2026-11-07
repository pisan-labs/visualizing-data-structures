import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/aliasing.hpp?raw';
import javaSource from './code/java/Aliasing.java?raw';
import pythonSource from './code/python/aliasing.py?raw';
import aliasing from './examples/aliasing.json';
import bumpNumber from './examples/bump-number.json';
import cppCopy from './examples/cpp-copy.json';
import cppPass from './examples/cpp-pass.json';
import cppReference from './examples/cpp-reference.json';
import garbage from './examples/garbage.json';
import numbersCopy from './examples/numbers-copy.json';
import passReferenceValue from './examples/pass-reference-value.json';
import reassignVsMutate from './examples/reassign-vs-mutate.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  mainText,
  ops,
  pseudocode,
  readStmt,
  stmtText,
  type MemSettings,
  type MemState,
} from './model';
import { memoryPractice } from './practice';
import { view } from './view';

/** The whole box is one statement, checked here so typos show up at once. */
export function parseStatement(token: string): Value | Error {
  const s = readStmt(token);
  return typeof s === 'string' ? new Error(s) : stmtText(s);
}

const list = (name: string, size: number, start = 1) =>
  `${name} = [${Array.from({ length: size }, (_, i) => start + i).join(', ')}]`;

export const memoryModel: VizDef<MemState, MemSettings, undefined> = {
  id: 'memory-model',
  title: 'Memory model: values, references, aliasing',
  family: 'Foundations',
  blurb:
    'Stack frames on the left, heap objects on the right: see what x = y copies, when two names share one list, and what a function can change.',
  settings: [
    {
      kind: 'choice',
      key: 'lang',
      label: 'Language model',
      options: [
        { value: 'refs', label: 'Python and Java: variables refer to objects' },
        { value: 'values', label: 'C++: variables hold values, & makes a reference' },
      ],
      help: 'The same statements mean different things. In Python and Java, ys = xs shares one list; in C++ it copies the list.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Statement',
      placeholder: 'e.g. xs = [1, 2], ys = xs, ys.append(3), grow(xs)',
      maxLength: 40,
      sample: 'x = 5',
      parse: parseStatement,
    },
    buttons: [
      { op: 'run', label: 'Run', usesInput: true, primary: true },
      { op: 'clear', label: 'Clear memory', usesInput: false },
    ],
    presets: [
      {
        label: 'Two names for one list',
        make: (_rng, size) => [
          ['run', list('xs', size)],
          ['run', 'ys = xs'],
          ['run', 'ys.append(0)'],
        ],
      },
      {
        label: 'Reassign one name',
        make: (_rng, size) => [
          ['run', list('xs', size)],
          ['run', 'ys = xs'],
          ['run', list('ys', size, 7)],
        ],
      },
      {
        label: 'Pass a list to a function',
        make: (_rng, size) => [
          ['run', list('xs', size)],
          ['run', 'grow(xs)'],
          ['run', 'reset(xs)'],
        ],
      },
      {
        label: 'Make some garbage',
        make: (rng, size) => [
          ['run', list('xs', size)],
          ['run', list('xs', size, rng.int(5, 9))],
        ],
      },
      {
        label: 'Random numbers',
        make: (rng) => [
          ['run', `x = ${rng.int(1, 99)}`],
          ['run', 'y = x'],
          ['run', `y = ${rng.int(1, 99)}`],
        ],
      },
    ],
    sizes: [2, 3, 4],
  },
  explain,
  complexity: [
    {
      op: 'x = 5, or y = x for a number',
      best: { cost: 'O(1)', why: 'One value into one box.', example: 'numbers-copy' },
      average: { cost: 'O(1)', why: 'A number is one machine word.' },
      worst: { cost: 'O(1)', why: 'Same in every language.' },
    },
    {
      op: 'ys = xs for a list of n items',
      best: {
        cost: 'O(1)',
        why: 'Python and Java copy one reference.',
        example: 'aliasing',
      },
      average: {
        cost: 'O(1)',
        why: 'A C++ reference, &ys = xs, copies nothing either.',
        example: 'cpp-reference',
      },
      worst: {
        cost: 'O(n)',
        why: 'A C++ vector copy copies every element.',
        example: 'cpp-copy',
      },
      note: 'Cheap sharing is what makes aliasing bugs possible: the copy you thought you made is the same list.',
    },
    {
      op: 'xs.append(v)',
      best: {
        cost: 'O(1)',
        why: 'There is room at the end of the array behind the list.',
        example: 'aliasing',
      },
      average: { cost: 'O(1)', why: 'Amortized: the array doubles when it fills, rarely.' },
      worst: {
        cost: 'O(n)',
        why: 'The append that finds the array full copies it into a bigger one.',
      },
    },
    {
      op: 'calling f(xs)',
      best: {
        cost: 'O(1)',
        why: 'Passing a reference (Python, Java, C++ &) copies one word.',
        example: 'pass-reference-value',
      },
      average: { cost: 'O(1)', why: 'Plus a new stack frame, which is also O(1).' },
      worst: {
        cost: 'O(n)',
        why: 'C++ pass by value copies the whole vector.',
        example: 'cpp-pass',
      },
    },
    {
      op: 'freeing an unreachable list',
      best: {
        cost: 'O(1)',
        why: 'Reference counting frees it as the last reference goes.',
        example: 'garbage',
      },
      average: { cost: 'O(n)', why: 'Freeing n items touches each one.' },
      worst: {
        cost: 'O(heap)',
        why: 'A tracing collector may walk every live object to find the garbage.',
      },
      note: 'C++ frees a vector when its variable goes out of scope; no collector runs.',
    },
  ],
  practice: memoryPractice(() => memoryModel),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MemSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    aliasing,
    numbersCopy,
    reassignVsMutate,
    garbage,
    passReferenceValue,
    bumpNumber,
    cppCopy,
    cppReference,
    cppPass,
  ] as unknown as SavedExample[],
  preview: { example: 'reassign-vs-mutate', level: 3 },
};

/**
 * Driver protocol for the code tabs: one statement per line, written as stmtText writes it,
 * or "clear". After each, the driver prints the variables of main, "xs=[1,2] n=5", or
 * "(empty)". The code follows the default setting (Python and Java references), so C++-mode
 * runs send nothing. Statements the model turned down are left out.
 */
function codeScript(calls: OpCall[], settings: MemSettings) {
  if (settings.lang === 'values') return { input: [], expected: [] };
  const t = new Timeline(memoryModel, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const last = e.steps.at(-1)!;
    if (last.lines.length === 0) continue;
    if (e.call[0] === 'clear') input.push('clear');
    else input.push(stmtText(readStmt(e.call[1]) as Exclude<ReturnType<typeof readStmt>, string>));
    expected.push(mainText(e.end));
  }
  return { input, expected };
}

export default memoryModel;
