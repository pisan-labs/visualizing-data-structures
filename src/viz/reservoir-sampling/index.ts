import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/reservoir.hpp?raw';
import javaSource from './code/java/Reservoir.java?raw';
import pythonSource from './code/python/reservoir.py?raw';
import biggerReservoir from './examples/bigger-reservoir.json';
import countsEvenOut from './examples/counts-even-out.json';
import fillingUp from './examples/filling-up.json';
import keepOne from './examples/keep-one.json';
import tenItems from './examples/ten-items.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_STREAM,
  ops,
  pseudocode,
  type ResSettings,
  type ResState,
} from './model';
import { reservoirPractice } from './practice';
import { view } from './view';

/** An item of up to 3 characters, or a number (for Stream and Run trials). */
export function parseItem(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type an item first.');
  if (t.length > 4 && !/^\d+$/.test(t)) return new Error('Keep items to 3 characters.');
  if (t.includes('|')) return new Error('Items cannot contain |.');
  return t;
}

const LETTERS = 'A B C D E F G H I J K L M N O P'.split(' ');

export const reservoirSampling: VizDef<ResState, ResSettings, undefined> = {
  id: 'reservoir-sampling',
  title: 'Reservoir sampling',
  family: 'Randomized algorithms',
  blurb:
    'Keep a fair sample of k items from a stream of unknown length: item i gets in with probability k/i.',
  settings: [
    {
      kind: 'number',
      key: 'k',
      label: 'Reservoir size k',
      min: 1,
      max: 4,
      help: 'Algorithm R (Waterman, as Knuth tells it). k = 1 picks one random item from the stream.',
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
      label: 'item or number',
      placeholder: 'e.g. A B C (one offer each), or 10',
      maxLength: 40,
      sample: 'A',
      parse: parseItem,
    },
    buttons: [
      { op: 'offer', label: 'Offer', usesInput: true, primary: true, bulk: true },
      { op: 'stream', label: 'Stream 1 to n', usesInput: true },
      { op: 'trials', label: 'Run trials', usesInput: true },
      { op: 'reset', label: 'Reset', usesInput: false, more: true },
    ],
    random: { label: 'Stream 12 items', make: () => [['stream', 12]] },
    presets: [
      { label: 'Stream 1 to n', make: (_rng, size) => [['stream', size]] },
      {
        label: 'Letters, one offer each',
        make: (_rng, size) => LETTERS.slice(0, size).map((v): OpCall => ['offer', v]),
      },
      { label: '1000 trials', make: () => [['trials', 1000]] },
      { label: '5000 trials', make: () => [['trials', 5000]] },
    ],
    sizes: [6, 10, MAX_STREAM],
  },
  explain,
  complexity: [
    {
      op: 'sample k from a stream of n',
      best: {
        cost: 'O(n)',
        why: 'One look at each item, and one random number for each item after the first k.',
        example: 'filling-up',
      },
      average: {
        cost: 'O(n)',
        why: 'Constant work per item; n never needs to be known in advance.',
        example: 'ten-items',
      },
      worst: {
        cost: 'O(n)',
        why: 'Every item still costs O(1), kept or not.',
        example: 'keep-one',
      },
      note: 'Memory is O(k), however long the stream. Algorithm L skips ahead over items it would not keep: O(k(1 + log(n/k))) random numbers.',
    },
    {
      op: 'chance an item is in the final sample',
      best: {
        cost: 'k/n',
        why: 'The same for every item: that is the point.',
        example: 'counts-even-out',
      },
      average: {
        cost: 'k/n',
        why: 'Item i gets in with k/i, then survives each later item j with (j − 1)/j: the product telescopes to k/n.',
        example: 'counts-even-out',
      },
      worst: {
        cost: 'k/n',
        why: 'No item is favored, early or late.',
        example: 'bigger-reservoir',
      },
    },
  ],
  practice: reservoirPractice(() => reservoirSampling),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as ResSettings),
  },
  examples: [
    tenItems,
    keepOne,
    countsEvenOut,
    fillingUp,
    biggerReservoir,
  ] as unknown as SavedExample[],
  preview: { example: 'ten-items', level: 2 },
};

/**
 * Driver protocol: "sample k x1 ... xn | draws" gives the stream so far and the model's draws for
 * the items after the first k, and prints the reservoir.
 */
function codeScript(calls: OpCall[], settings: ResSettings) {
  const t = new Timeline(reservoirSampling, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const op = e.call[0];
    if ((op !== 'offer' && op !== 'stream') || e.steps.length < 2) continue;
    const s = e.end;
    const draws = s.draws.filter((d): d is number => d !== null);
    input.push(`sample ${s.k} ${s.stream.map((x) => x.v).join(' ')} | ${draws.join(' ')}`);
    const kept = s.slots.filter((u): u is number => u !== null);
    expected.push(kept.map((u) => s.stream.find((x) => x.uid === u)!.v).join(' '));
  }
  return { input, expected };
}

export default reservoirSampling;
