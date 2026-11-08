import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/fractional.hpp?raw';
import javaSource from './code/java/FractionalKnapsack.java?raw';
import pythonSource from './code/python/fractional.py?raw';
import equalRatio from './examples/equal-ratio.json';
import everythingFits from './examples/everything-fits.json';
import partOfOne from './examples/part-of-one.json';
import sixItems from './examples/six-items.json';
import wholeFails from './examples/whole-fails.json';
import wholeLucky from './examples/whole-lucky.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  fracPlain,
  init,
  initialSay,
  initialVars,
  itemsFromArg,
  itemsText,
  MAX_CAPACITY,
  MAX_ITEMS,
  ops,
  pseudocode,
  valueOf,
  type FracExtra,
  type FracSettings,
  type FracState,
  type Item,
} from './model';
import { fracPractice, randomItems } from './practice';
import { view } from './view';

/** The input box holds items as weight:value pairs, or one capacity. */
export function parseFrac(text: string): Value | Error {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 1 && /^\d+$/.test(tokens[0]!)) {
    const W = Number(tokens[0]);
    if (W < 1 || W > MAX_CAPACITY) return new Error(`Use a capacity from 1 to ${MAX_CAPACITY}.`);
    return W;
  }
  const items = itemsFromArg(tokens.join(' '));
  if (typeof items === 'string') return new Error(items);
  return itemsText(items);
}

const solve = (items: Item[], W: number): OpCall[] => [
  ['items', itemsText(items)],
  ['capacity', W],
  ['fill'],
];
const half = (items: Item[]) =>
  Math.max(1, Math.min(MAX_CAPACITY, Math.round(items.reduce((s, it) => s + it.w, 0) / 2)));

export const fractionalKnapsack: VizDef<FracState, FracSettings, FracExtra> = {
  id: 'fractional-knapsack',
  title: 'Fractional knapsack',
  family: 'Greedy algorithms',
  blurb:
    'Carry the most value when items can be cut: take the best value per weight first, then a fraction of the next. With whole items greedy fails.',
  settings: [
    {
      kind: 'choice',
      key: 'mode',
      label: 'Items',
      options: [
        { value: 'fractional', label: 'Can be cut (fractional knapsack: greedy is right)' },
        { value: 'whole', label: 'Whole items only (0/1 knapsack: greedy can be wrong)' },
      ],
      help: 'The same greedy, by value per weight. With whole items it skips what does not fit.',
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
      label: 'Items or capacity',
      placeholder: 'e.g. 1:6 2:10 3:12, or 5',
      maxLength: 60,
      sample: '1:6 2:10 3:12',
      parse: parseFrac,
    },
    buttons: [
      { op: 'items', label: 'Load items', usesInput: true, primary: true },
      { op: 'capacity', label: 'Capacity', usesInput: true },
      { op: 'fill', label: 'Fill the knapsack', usesInput: false },
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
        label: 'Random items, room for about half',
        make: (rng, size) => {
          const items = randomItems(rng, Math.min(size, MAX_ITEMS));
          return solve(items, half(items));
        },
      },
      {
        label: 'Greedy with whole items fails',
        make: () =>
          solve(
            [
              { id: 1, w: 1, v: 6 },
              { id: 2, w: 2, v: 10 },
              { id: 3, w: 3, v: 12 },
            ],
            5,
          ),
      },
      {
        label: 'Equal value per weight',
        make: (rng, size) => {
          const items = Array.from({ length: Math.min(size, MAX_ITEMS) }, (_, k) => {
            const w = rng.int(1, 5);
            return { id: k + 1, w, v: 3 * w };
          });
          return solve(items, half(items));
        },
      },
      {
        label: 'Room for everything',
        make: (rng, size) => {
          const items = randomItems(rng, Math.min(size, 5), 3);
          return solve(
            items,
            Math.min(
              MAX_CAPACITY,
              items.reduce((s, it) => s + it.w, 0),
            ),
          );
        },
      },
    ],
    sizes: [3, 4, 5, 6],
  },
  explain,
  complexity: [
    {
      op: 'fill the knapsack',
      best: {
        cost: 'Θ(n log n)',
        why: 'The sort, even when everything fits.',
        example: 'everything-fits',
      },
      average: {
        cost: 'Θ(n log n)',
        why: 'The sort; the pass after it is Θ(n).',
        example: 'part-of-one',
      },
      worst: { cost: 'Θ(n log n)', why: 'Still the sort.', example: 'six-items' },
      note: 'Without sorting, a linear-time selection of the weighted median gives Θ(n). The 0/1 knapsack, where greedy fails, takes the Θ(nW) table instead.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FracSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    partOfOne,
    wholeFails,
    everythingFits,
    equalRatio,
    wholeLucky,
    sixItems,
  ] as unknown as SavedExample[],
  practice: fracPractice(() => fractionalKnapsack),
  preview: { example: 'six-items', level: 2 },
};

/**
 * Driver protocol for the code tabs: "best W w1:v1 ..." prints the value the fractional greedy
 * gets, as a whole number or a fraction. The code cuts items, the default, so the expected output
 * comes from a run with it.
 */
function codeScript(calls: OpCall[], settings: FracSettings) {
  const t = new Timeline(fractionalKnapsack, { ...settings, mode: 'fractional' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.call[0] !== 'fill') continue;
    input.push(`best ${e.end.W} ${itemsText(e.end.items)}`);
    expected.push(fracPlain(valueOf(e.end)));
  }
  return { input, expected };
}

export default fractionalKnapsack;
