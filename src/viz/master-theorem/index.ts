import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/master.hpp?raw';
import javaSource from './code/java/Master.java?raw';
import pythonSource from './code/python/master.py?raw';
import binarySearch from './examples/binary-search.json';
import leavesWin from './examples/leaves-win.json';
import logFactor from './examples/log-factor.json';
import mergeSort from './examples/merge-sort.json';
import rootWins from './examples/root-wins.json';
import simpleForm from './examples/simple-form.json';
import strassen from './examples/strassen.json';
import theGap from './examples/the-gap.json';
import explain from './explain.md?raw';
import {
  caseNumber,
  checkRows,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  readRec,
  unroll,
  type MtSettings,
  type MtState,
} from './model';
import { masterPractice } from './practice';
import { view } from './view';

/** The whole box is one recurrence, checked here so mistakes show up at once. */
export function parseRecurrence(token: string): Value | Error {
  const r = readRec(token);
  if (typeof r === 'string') return new Error(r);
  return `${r.a} ${r.b} ${r.d}${r.k ? ` ${r.k}` : ''}`;
}

const solveOf = (a: number, b: number, d: number, k = 0): OpCall => [
  'solve',
  `${a} ${b} ${d}${k ? ` ${k}` : ''}`,
];

export const masterTheorem: VizDef<MtState, MtSettings, undefined> = {
  id: 'master-theorem',
  title: 'Recurrences and the Master theorem',
  family: 'Foundations',
  blurb:
    'Expand T(n) = aT(n/b) + f(n) into a recursion tree level by level, add up the work, and name the case.',
  settings: [
    {
      kind: 'choice',
      key: 'form',
      label: 'Form of the theorem',
      options: [
        { value: 'clrs', label: 'CLRS: three cases, f(n) = n^d lg^k n' },
        { value: 'simple', label: 'Simplified: compare a with b^d, f(n) = n^d' },
      ],
      help: 'Both give the same answers when f is a plain power of n. The CLRS form also handles log factors, and shows where the theorem has a gap.',
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
      label: 'a b d [k]',
      placeholder: 'e.g. 2 2 1, or T(n) = 2T(n/2) + n',
      maxLength: 40,
      sample: '2 2 1',
      parse: parseRecurrence,
    },
    buttons: [
      { op: 'solve', label: 'Solve', usesInput: true, primary: true },
      { op: 'check', label: 'Check with numbers', usesInput: false },
    ],
    random: {
      label: 'Random recurrence',
      make: (rng) => [solveOf(rng.int(1, 8), rng.int(2, 4), rng.int(0, 3))],
    },
    // The size picked next to a preset is b, the factor each call shrinks the problem by.
    presets: [
      { label: 'Levels tie: T(n) = bT(n/b) + n', make: (_rng, b) => [solveOf(b, b, 1), ['check']] },
      { label: 'Root wins: T(n) = bT(n/b) + n²', make: (_rng, b) => [solveOf(b, b, 2), ['check']] },
      {
        label: 'Leaves win: T(n) = b²T(n/b) + n',
        make: (_rng, b) => [solveOf(b * b, b, 1), ['check']],
      },
      { label: 'One call: T(n) = T(n/b) + 1', make: (_rng, b) => [solveOf(1, b, 0), ['check']] },
      {
        label: 'Random a and d, split by b',
        make: (rng, b) => [solveOf(rng.int(1, 8), b, rng.int(0, 3)), ['check']],
      },
    ],
    sizes: [2, 3, 4],
  },
  explain,
  complexity: [
    {
      op: 'merge sort: T(n) = 2T(n/2) + n',
      best: {
        cost: 'Θ(n lg n)',
        why: 'Case 2: n work on each of lg n + 1 levels.',
        example: 'merge-sort',
      },
      average: {
        cost: 'Θ(n lg n)',
        why: 'The split is the same for every input.',
        example: 'merge-sort',
      },
      worst: { cost: 'Θ(n lg n)', why: 'Same recurrence, same answer.', example: 'merge-sort' },
    },
    {
      op: 'binary search: T(n) = T(n/2) + 1',
      best: { cost: 'Θ(1)', why: 'Found at the first probe: the recurrence stops early.' },
      average: {
        cost: 'Θ(lg n)',
        why: 'Case 2 with c = 0: one step per level.',
        example: 'binary-search',
      },
      worst: { cost: 'Θ(lg n)', why: 'All lg n + 1 levels.', example: 'binary-search' },
      note: 'The recurrence describes the worst case; the best case never recurses.',
    },
    {
      op: 'Karatsuba multiplication: T(n) = 3T(n/2) + n',
      best: {
        cost: 'Θ(n^1.585)',
        why: 'Case 1: the 3^(lg n) leaves outweigh everything.',
        example: 'leaves-win',
      },
      average: {
        cost: 'Θ(n^1.585)',
        why: 'n^(log₂ 3), whatever the digits.',
        example: 'leaves-win',
      },
      worst: {
        cost: 'Θ(n^1.585)',
        why: 'Better than the n² of school multiplication.',
        example: 'leaves-win',
      },
    },
    {
      op: 'Strassen: T(n) = 7T(n/2) + n²',
      best: {
        cost: 'Θ(n^2.807)',
        why: 'Case 1: 7 > 2² so the leaves dominate.',
        example: 'strassen',
      },
      average: { cost: 'Θ(n^2.807)', why: 'n^(log₂ 7).', example: 'strassen' },
      worst: { cost: 'Θ(n^2.807)', why: 'One product fewer than 8 beats n³.', example: 'strassen' },
    },
    {
      op: 'applying the theorem itself',
      best: {
        cost: 'O(1)',
        why: 'Compare b^d with a: one power and one comparison.',
        example: 'root-wins',
      },
      average: { cost: 'O(1)', why: 'No tree is built; the drawing is for you.' },
      worst: {
        cost: 'no answer',
        why: 'f in the gap, such as n / lg n, needs the tree summed by hand.',
        example: 'the-gap',
      },
    },
  ],
  practice: masterPractice(() => masterTheorem),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MtSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    mergeSort,
    binarySearch,
    leavesWin,
    rootWins,
    strassen,
    logFactor,
    theGap,
    simpleForm,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "case a b d k" prints the CLRS case ("1", "2", "3" or
 * "none"), and "T a b d n" prints T(n) with T(1) = 1 and f(n) = n^d. Each solve becomes a case
 * line; each check of a recurrence without a log factor becomes T lines for the powers of b
 * the check shows (those that fit in 53 bits). Rejected calls are left out.
 */
function codeScript(calls: OpCall[], settings: MtSettings) {
  const t = new Timeline(masterTheorem, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const r = e.end.rec;
    const last = e.steps.at(-1)!;
    if (!r || last.lines.length === 0) continue;
    if (e.call[0] === 'solve') {
      input.push(`case ${r.a} ${r.b} ${r.d} ${r.k}`);
      expected.push(caseNumber(e.end.result!.kind));
    } else if (r.k === 0) {
      for (const { n, t: v } of unroll(r, checkRows(r)).slice(1)) {
        if ((v as bigint) >= 2n ** 53n) break;
        input.push(`T ${r.a} ${r.b} ${r.d} ${n}`);
        expected.push(v.toString());
      }
    }
  }
  return { input, expected };
}

export default masterTheorem;
