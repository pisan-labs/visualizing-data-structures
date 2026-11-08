import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/matrix_chain.hpp?raw';
import javaSource from './code/java/MatrixChain.java?raw';
import pythonSource from './code/python/matrix_chain.py?raw';
import allSquare from './examples/all-square.json';
import byLength from './examples/by-length.json';
import oneMatrix from './examples/one-matrix.json';
import sixMatrices from './examples/six-matrices.json';
import tenTimes from './examples/ten-times.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  dimsFromArg,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  pseudocode,
  type ChainExtra,
  type ChainSettings,
  type ChainState,
} from './model';
import { chainPractice, randomDims } from './practice';
import { view } from './view';

export function parseDims(text: string): Value | Error {
  const p = dimsFromArg(text);
  if (typeof p === 'string') return new Error(p);
  return p.join(' ');
}

const solve = (p: number[]): OpCall[] => [['dims', p.join(' ')], ['fill'], ['paren']];

export const dpMatrixChain: VizDef<ChainState, ChainSettings, ChainExtra> = {
  id: 'dp-matrix-chain',
  title: 'Matrix-chain order',
  family: 'Dynamic programming',
  blurb:
    'Bracket a chain of matrix products to do the fewest multiplications, from tables of every sub-chain filled by length.',
  settings: [],
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
      label: 'Dimensions',
      placeholder: 'e.g. 30 35 15 5 10 20 25',
      maxLength: 40,
      sample: '30 35 15 5',
      parse: parseDims,
    },
    buttons: [
      { op: 'dims', label: 'Set dimensions', usesInput: true, primary: true },
      { op: 'fill', label: 'Fill the tables', usesInput: false },
      { op: 'paren', label: 'Parenthesize', usesInput: false },
      { op: 'diagonal', label: 'Fill one chain length', usesInput: false, more: true },
    ],
    random: { label: 'Random chain', make: (rng) => solve(randomDims(rng, rng.int(3, MAX_N))) },
    presets: [
      { label: 'Random sizes', make: (rng, size) => solve(randomDims(rng, Math.min(size, MAX_N))) },
      {
        label: 'All square (every order ties)',
        make: (rng, size) => solve(Array(Math.min(size, MAX_N) + 1).fill(rng.int(2, 20))),
      },
      {
        label: 'One thin dimension in the middle',
        make: (rng, size) => {
          const p = randomDims(rng, Math.min(size, MAX_N)).map((d) => d + 10);
          p[Math.floor(p.length / 2)] = 2;
          return solve(p);
        },
      },
      {
        label: 'Growing sizes (left to right is best)',
        make: (_rng, size) =>
          solve(Array.from({ length: Math.min(size, MAX_N) + 1 }, (_, k) => 2 + 6 * k)),
      },
    ],
    sizes: [3, 4, 5, 6],
  },
  explain,
  complexity: [
    {
      op: 'fill the tables',
      best: {
        cost: 'Θ(n³)',
        why: 'Every chain tries every split, whatever the sizes.',
        example: 'all-square',
      },
      average: {
        cost: 'Θ(n³)',
        why: 'About n³/6 splits: n²/2 cells, each trying up to n splits.',
        example: 'six-matrices',
      },
      worst: {
        cost: 'Θ(n³)',
        why: 'The same for every chain of n matrices.',
        example: 'by-length',
      },
      note: 'Space Θ(n²) for m and s. Trying every bracketing instead is exponential: the number of orders is a Catalan number, 42 for six matrices.',
    },
    {
      op: 'parenthesize',
      best: { cost: 'O(1)', why: 'One matrix: nothing to split.', example: 'one-matrix' },
      average: { cost: 'Θ(n)', why: 'One split per product: n − 1 of them.' },
      worst: { cost: 'Θ(n)', why: 'Still n − 1 splits.', example: 'ten-times' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as ChainSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [sixMatrices, tenTimes, byLength, allSquare, oneMatrix] as unknown as SavedExample[],
  practice: chainPractice(() => dpMatrixChain),
  preview: { example: 'six-matrices', level: 2 },
};

/**
 * Driver protocol for the code tabs: "cost p0 ... pn" prints m[1][n] (after Fill the tables);
 * "order p0 ... pn" prints m[1][n] and the order (after Parenthesize).
 */
function codeScript(calls: OpCall[], settings: ChainSettings) {
  const t = new Timeline(dpMatrixChain, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const vars = e.steps.at(-1)!.vars ?? {};
    if (e.call[0] === 'fill' && vars.worst !== undefined) {
      input.push(`cost ${e.end.p.join(' ')}`);
      expected.push(String(vars.cost));
    } else if (e.call[0] === 'paren' && vars.order !== undefined) {
      input.push(`order ${e.end.p.join(' ')}`);
      expected.push(`${String(vars.cost)} ${String(vars.order)}`);
    }
  }
  return { input, expected };
}

export default dpMatrixChain;
