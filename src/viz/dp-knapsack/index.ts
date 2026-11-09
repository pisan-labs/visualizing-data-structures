import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/knapsack.hpp?raw';
import javaSource from './code/java/Knapsack.java?raw';
import pythonSource from './code/python/knapsack.py?raw';
import everythingFits from './examples/everything-fits.json';
import fourItems from './examples/four-items.json';
import greedyFails from './examples/greedy-fails.json';
import largest from './examples/largest.json';
import nothingFits from './examples/nothing-fits.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  itemsFromArg,
  itemsText,
  MAX_CAPACITY,
  MAX_ITEMS,
  ops,
  pseudocode,
  type Item,
  type KnapExtra,
  type KnapSettings,
  type KnapState,
} from './model';
import { knapPractice } from './practice';
import { view } from './view';

/** The input box holds items as weight:value pairs, or one capacity. */
export function parseKnapsack(text: string): Value | Error {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0)
    return new Error('Type items as weight:value, such as 1:6 2:10, or a capacity, such as 5.');
  if (tokens.length === 1 && /^\d+$/.test(tokens[0]!)) {
    const W = Number(tokens[0]);
    if (W > MAX_CAPACITY) return new Error(`Use a capacity from 0 to ${MAX_CAPACITY}.`);
    return W;
  }
  const items = itemsFromArg(tokens.join(' '));
  if (typeof items === 'string') return new Error(items);
  return tokens.join(' ');
}

const solve = (items: Item[], W: number): OpCall[] => [
  ['items', itemsText(items)],
  ['capacity', W],
  ['fill'],
  ['trace'],
];

function randomItems(rng: Rng, n: number, wMax = 6, vMax = 15): Item[] {
  return Array.from({ length: n }, () => ({ w: rng.int(1, wMax), v: rng.int(1, vMax) }));
}

const half = (items: Item[]) =>
  Math.max(1, Math.min(MAX_CAPACITY, Math.round(items.reduce((s, it) => s + it.w, 0) / 2)));

export const dpKnapsack: VizDef<KnapState, KnapSettings, KnapExtra> = {
  id: 'dp-knapsack',
  title: '0/1 knapsack',
  family: 'Dynamic programming',
  blurb:
    'Pick items, whole or not at all, to get the most value within a weight limit, from a table of every item and capacity.',
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
      label: 'Items or capacity',
      placeholder: 'e.g. 1:6 2:10 3:12, or 5',
      maxLength: 60,
      sample: '1:6 2:10 3:12',
      parse: parseKnapsack,
    },
    buttons: [
      { op: 'items', label: 'Load items', usesInput: true, primary: true },
      { op: 'capacity', label: 'Capacity', usesInput: true, more: true },
      { op: 'fill', label: 'Fill the table', usesInput: false },
      { op: 'trace', label: 'Trace back', usesInput: false },
      { op: 'row', label: 'Fill one row', usesInput: false, more: true },
    ],
    random: {
      label: 'Random items',
      make: (rng) => {
        const items = randomItems(rng, rng.int(3, 5));
        return solve(items, half(items));
      },
    },
    presets: [
      {
        label: 'Random items, capacity for about half',
        make: (rng, size) => {
          const items = randomItems(rng, Math.min(size, MAX_ITEMS));
          return solve(items, half(items));
        },
      },
      {
        label: 'Best value per weight first is wrong',
        make: () =>
          solve(
            [
              { w: 1, v: 6 },
              { w: 2, v: 10 },
              { w: 3, v: 12 },
            ],
            5,
          ),
      },
      {
        label: 'Equal value per weight',
        make: (rng, size) => {
          const items = Array.from({ length: Math.min(size, MAX_ITEMS) }, () => {
            const w = rng.int(1, 5);
            return { w, v: 2 * w };
          });
          return solve(items, half(items));
        },
      },
      {
        label: 'Everything fits (best case for the walk)',
        make: (rng, size) => {
          const items = randomItems(rng, Math.min(size, MAX_ITEMS), 2);
          return solve(
            items,
            Math.min(
              MAX_CAPACITY,
              items.reduce((s, it) => s + it.w, 0),
            ),
          );
        },
      },
      {
        label: 'Full capacity, many items (the most work)',
        make: (rng, size) => solve(randomItems(rng, Math.min(size, MAX_ITEMS)), MAX_CAPACITY),
      },
    ],
    sizes: [3, 4, 5, 6],
  },
  explain,
  complexity: [
    {
      op: 'fill the table',
      best: {
        cost: 'O(nW)',
        why: 'Every item gets a row and every capacity a column, even when nothing fits.',
        example: 'nothing-fits',
      },
      average: {
        cost: 'O(nW)',
        why: 'Each cell compares at most two values: skip the item, or take it.',
        example: 'greedy-fails',
      },
      worst: {
        cost: 'O(nW)',
        why: '6 items and capacity 12: 78 cells, each O(1).',
        example: 'largest',
      },
      note: 'Pseudo-polynomial: W is a number, so doubling its digits squares the number of columns. Space O(nW), or O(W) for the value alone.',
    },
    {
      op: 'trace back',
      best: {
        cost: 'O(n)',
        why: 'One step per row, whatever is taken.',
        example: 'everything-fits',
      },
      average: { cost: 'O(n)', why: 'Each step compares a cell with the one above it.' },
      worst: { cost: 'O(n)', why: 'Still one step per item.', example: 'four-items' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as KnapSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    greedyFails,
    fourItems,
    nothingFits,
    everythingFits,
    largest,
  ] as unknown as SavedExample[],
  practice: knapPractice(() => dpKnapsack),
  preview: { example: 'four-items', level: 2 },
};

/**
 * Driver protocol for the code tabs: "value W w1:v1 ..." prints the best value (after Fill
 * the table); "pack W w1:v1 ..." prints the best value and the items taken, by number
 * (after Trace back).
 */
function codeScript(calls: OpCall[], settings: KnapSettings) {
  const t = new Timeline(dpKnapsack, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const vars = e.steps.at(-1)!.vars ?? {};
    const problem = `${e.end.W}${e.end.items.length ? ` ${itemsText(e.end.items)}` : ''}`;
    if (e.call[0] === 'fill' && vars.best !== undefined && vars.n !== undefined) {
      input.push(`value ${problem}`);
      expected.push(String(vars.best));
    } else if (e.call[0] === 'trace' && vars.items !== undefined) {
      input.push(`pack ${problem}`);
      expected.push(`${String(vars.best)} ${String(vars.items)}`.trim());
    }
  }
  return { input, expected };
}

export default dpKnapsack;
