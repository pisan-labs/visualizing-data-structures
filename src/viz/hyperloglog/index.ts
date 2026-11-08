import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { distinctKeys, parseNumberInput, readNumber } from '../_hashing/hashing';
import cppSource from './code/cpp/hyperloglog.hpp?raw';
import javaSource from './code/java/HyperLogLog.java?raw';
import pythonSource from './code/python/hyperloglog.py?raw';
import duplicates from './examples/duplicates.json';
import firstItems from './examples/first-items.json';
import hundredItems from './examples/hundred-items.json';
import moreRegisters from './examples/more-registers.json';
import noCorrection from './examples/no-correction.json';
import smallRange from './examples/small-range.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  estimate,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  rounded,
  split,
  type HllExtra,
  type HllSettings,
  type HllState,
} from './model';
import { hllPractice } from './practice';
import { view } from './view';

const adds = (xs: number[]): OpCall[] => xs.map((x) => ['add', x] as OpCall);

export const hyperloglog: VizDef<HllState, HllSettings, HllExtra> = {
  id: 'hyperloglog',
  title: 'HyperLogLog',
  family: 'Hashing and maps',
  blurb:
    'Counts distinct items in a few small registers. Each item’s hash picks a register and offers the length of its leading run of zeros; the harmonic mean of the registers gives the estimate.',
  settings: [
    {
      kind: 'number',
      key: 'b',
      label: 'Index bits b (m = 2^b registers)',
      min: 4,
      max: 6,
      help: 'More registers, smaller error: about 1.04/√m.',
    },
    {
      kind: 'boolean',
      key: 'small',
      label: 'Small-range correction (linear counting when E ≤ 2.5m)',
      help: 'From Flajolet et al. Without it, small counts are badly overestimated.',
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
      label: 'Item',
      placeholder: 'e.g. 42 or 1 2 3',
      maxLength: 400,
      sample: '42',
      parse: parseNumberInput,
    },
    buttons: [
      { op: 'add', label: 'Add', usesInput: true, bulk: true, primary: true },
      { op: 'estimate', label: 'Estimate', usesInput: false },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: { label: 'Add random', make: (rng) => [['add', rng.int(0, 999)]] },
    presets: [
      { label: 'Distinct items', make: (rng, n) => [...adds(distinctKeys(rng, n)), ['estimate']] },
      {
        label: 'Items with repeats',
        make: (rng, n) => {
          const pool = distinctKeys(rng, Math.max(1, Math.ceil(n / 3)));
          return [
            ...adds(Array.from({ length: n }, () => pool[rng.int(0, pool.length - 1)]!)),
            ['estimate'],
          ];
        },
      },
    ],
    sizes: [10, 40, 100],
  },
  explain,
  complexity: [
    {
      op: 'add(x)',
      best: {
        cost: 'O(1)',
        why: 'One hash, a count of leading zeros, one max.',
        example: 'first-items',
      },
      average: { cost: 'O(1)', why: 'The same few steps for every item.' },
      worst: {
        cost: 'O(1)',
        why: 'A repeat costs the same and changes nothing.',
        example: 'duplicates',
      },
    },
    {
      op: 'estimate()',
      best: { cost: 'O(m)', why: 'One pass over the registers for Z.', example: 'small-range' },
      average: { cost: 'O(m)', why: 'Z, then one division (and a log for linear counting).' },
      worst: {
        cost: 'O(m)',
        why: 'm = 2^b, fixed in advance however many items arrive.',
        example: 'hundred-items',
      },
      note: 'Space: m registers of about log₂log₂ n bits each. Real systems use m = 2^14 registers of 6 bits, 12 KB, for a standard error near 0.8%.',
    },
  ],
  practice: hllPractice(() => hyperloglog),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as HllSettings),
  },
  examples: [
    firstItems,
    duplicates,
    hundredItems,
    moreRegisters,
    smallRange,
    noCorrection,
  ] as unknown as SavedExample[],
  preview: { example: 'hundred-items', level: 1, hide: ['calc-'] },
};

/**
 * Driver protocol for the code tabs (with the small-range correction, as in the defaults):
 * "new b", then add -> "j ρ" and estimate -> the estimate rounded to a whole number; clear -> ok.
 */
function codeScript(calls: OpCall[], settings: HllSettings) {
  const same: HllSettings = { ...defaults, b: settings.b };
  const ok = calls.filter(([op, x]) => op !== 'add' || !(readNumber(x!) instanceof Error));
  const t = new Timeline(hyperloglog, same, 1, ok);
  const input = [`new ${same.b}`, ...ok.map((c) => c.join(' '))];
  const expected = t.entries.map((e) => {
    const [op, x] = e.call;
    if (op === 'add') {
      const { j, rho } = split(Number(x), same.b);
      return `${j} ${rho}`;
    }
    if (op === 'estimate') return String(rounded(estimate(e.end, true)));
    return 'ok';
  });
  return { input, expected };
}

export default hyperloglog;
