import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS } from '../_lm/vocab';
import { parseSentence } from '../self-attention/model';
import cppSource from './code/cpp/flash_attention.hpp?raw';
import javaSource from './code/java/FlashAttention.java?raw';
import pythonSource from './code/python/flash_attention.py?raw';
import catSatTiles from './examples/cat-sat-tiles.json';
import maxGrows from './examples/max-grows.json';
import noMask from './examples/no-mask.json';
import oneKvBlock from './examples/one-kv-block.json';
import oneRowBlocks from './examples/one-row-blocks.json';
import plainTable from './examples/plain-table.json';
import qOutside from './examples/q-outside.json';
import tileByTile from './examples/tile-by-tile.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  tileOrder,
  type FlashExtra,
  type FlashSettings,
  type FlashState,
  type Traffic,
} from './model';
import { flashPractice } from './practice';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** A sentence of `size` words (1 to 7) from the toy vocabulary. */
export function randomSentence(rng: Rng, size: number): string {
  const words = [
    'the',
    pick(rng, ANIMALS),
    pick(rng, ACTIONS),
    pick(rng, ['on', 'under']),
    'the',
    pick(rng, THINGS),
    'and',
  ];
  const n = Math.max(1, Math.min(7, size));
  return n === 1 ? words[1]! : words.slice(0, n).join(' ');
}

const preset = (label: string, make: (rng: Rng, size: number) => string, op = 'flash'): Preset => ({
  label,
  make: (rng, size) => [['load', make(rng, size)], [op]],
});

const blockOptions = [
  { value: '1', label: '1 row' },
  { value: '2', label: '2 rows' },
  { value: '3', label: '3 rows' },
  { value: '4', label: '4 rows' },
];

export const flashAttention: VizDef<FlashState, FlashSettings, FlashExtra> = {
  id: 'flash-attention',
  title: 'FlashAttention (online softmax)',
  family: 'Serving LLMs',
  blurb:
    'Compute attention one tile at a time, keeping a running max, sum and output per row, so the n × n table of scores never goes to slow memory, and the answer is exactly plain attention’s.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Outer loop',
      options: [
        { value: 'kv', label: 'K/V blocks (FlashAttention, 2022)' },
        { value: 'q', label: 'Q blocks (FlashAttention-2, 2023)' },
      ],
      help: 'Dao et al. 2022 read each K/V block once and Q, O, m and ℓ again for every tile. FlashAttention-2 swaps the loops: each Q block is read once and its O written once.',
    },
    {
      kind: 'choice',
      key: 'br',
      label: 'Q block (B_r)',
      options: blockOptions,
      help: 'Rows of Q per tile. On a GPU the block sizes are set by the size of the fast on-chip memory.',
    },
    {
      kind: 'choice',
      key: 'bc',
      label: 'K/V block (B_c)',
      options: blockOptions,
      help: 'Rows of K and V per tile.',
    },
    {
      kind: 'boolean',
      key: 'causal',
      label: 'Causal mask (a word sees only the words before it)',
      help: 'As on the self-attention page. A tile whose every score is masked is skipped.',
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
      label: 'Sentence',
      placeholder: 'e.g. the cat sat on the mat',
      maxLength: 60,
      sample: 'the dog saw the ball',
      parse: (text) => {
        const words = parseSentence(text);
        return words instanceof Error ? words : words.join(' ');
      },
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'tile', label: 'Next tile', usesInput: false },
      { op: 'flash', label: 'All tiles', usesInput: false },
      { op: 'plain', label: 'Plain attention', usesInput: false },
    ],
    random: {
      label: 'Random sentence',
      make: (rng) => [['load', randomSentence(rng, rng.int(3, 7))], ['flash']],
    },
    presets: [
      preset('Random sentence', randomSentence),
      preset(
        'A later key scores higher',
        (rng) => `the ${pick(rng, THINGS)} and the ${pick(rng, ANIMALS)} ${pick(rng, ACTIONS)}`,
      ),
      preset('The same word twice', (rng) => {
        const a = pick(rng, ANIMALS);
        return `the ${a} saw the ${a}`;
      }),
      preset('One word', (rng) => pick(rng, ANIMALS)),
      preset('Plain attention, for comparison', randomSentence, 'plain'),
    ],
    sizes: [3, 5, 7],
  },
  explain,
  complexity: [
    {
      op: 'Arithmetic: every score and every blend',
      best: {
        cost: 'Θ(n² · d)',
        why: 'The same dot products as plain attention, plus a little rescaling per tile.',
        example: 'one-kv-block',
      },
      average: {
        cost: 'Θ(n² · d)',
        why: 'Tiling changes where the numbers live, not how many there are.',
        example: 'cat-sat-tiles',
      },
      worst: {
        cost: 'Θ(n² · d)',
        why: 'The mask lets a tile be skipped, but the order of growth stays.',
        example: 'no-mask',
      },
    },
    {
      op: 'Memory for the scores',
      best: {
        cost: 'Θ(B_r · B_c)',
        why: 'One tile on chip at a time; nothing of the table in HBM.',
        example: 'one-row-blocks',
      },
      average: {
        cost: 'Θ(B_r · B_c) + Θ(n)',
        why: 'The tile, plus m and ℓ for every row.',
        example: 'cat-sat-tiles',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'Plain attention writes the whole table to HBM.',
        example: 'plain-table',
      },
    },
    {
      op: 'HBM traffic, K/V blocks outside',
      best: {
        cost: 'Θ(n · d)',
        why: 'One K/V block (B_c ≥ n): every number is read or written about once.',
        example: 'one-kv-block',
      },
      average: {
        cost: 'Θ(n² · d / B_c)',
        why: 'Q, O, m and ℓ are read and written once for every one of the n / B_c K/V blocks.',
        example: 'cat-sat-tiles',
      },
      worst: {
        cost: 'Θ(n² · d)',
        why: 'Blocks of one row: Q and O go back and forth once per key.',
        example: 'one-row-blocks',
      },
      note: 'With Q blocks outside it is Θ(n² · d / B_r): K and V are read once per Q block.',
    },
    {
      op: 'HBM traffic, plain attention',
      best: {
        cost: 'Θ(n · d + n²)',
        why: 'The table is written and read twice.',
        example: 'plain-table',
      },
      average: {
        cost: 'Θ(n · d + n²)',
        why: 'At real sizes n² is far larger than n · d.',
        example: 'plain-table',
      },
      worst: {
        cost: 'Θ(n · d + n²)',
        why: 'The mask does not help: the table is still n × n.',
        example: 'plain-table',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FlashSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    catSatTiles,
    maxGrows,
    qOutside,
    noMask,
    oneKvBlock,
    plainTable,
    oneRowBlocks,
    tileByTile,
  ] as unknown as SavedExample[],
  practice: flashPractice(() => flashAttention),
  preview: { example: 'cat-sat-tiles', level: 2 },
  opening: 'cat-sat-tiles',
};

const rows = (m: readonly (readonly number[])[]) =>
  m.map((r) => r.map(round3).join(' ')).join(' / ');
const trafficText = (t: Traffic) => `${t.q} ${t.kv} ${t.oml} ${t.table}`;

/** The code tabs' line: O by rows, m, ℓ, and the numbers moved (Q, K and V, O m ℓ, table). */
export function resultLine(r: {
  o: number[][];
  m: number[];
  l: number[];
  traffic: Traffic;
}): string {
  return `${rows(r.o)} | ${r.m.map(round3).join(' ')} | ${r.l.map(round3).join(' ')} | ${trafficText(r.traffic)}`;
}

/**
 * Driver protocol for the code tabs. "clear" starts a sentence and "qkv <q1 q2 k1 k2 v1 v2>" adds
 * a word's query, key and value; neither prints. "flash <kv|q> <br> <bc> <causal 1|0>" runs
 * every tile and "plain <causal 1|0>" runs plain attention; each prints `resultLine`. A run of
 * Next tile prints when its last tile is done.
 */
function codeScript(calls: OpCall[], settings: FlashSettings) {
  const t = new Timeline(flashAttention, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const causal = settings.causal ? 1 : 0;
  let words: string[] | undefined;
  const sync = (s: FlashState) => {
    if (s.words === words) return;
    input.push('clear', ...s.q.map((q, i) => `qkv ${[...q, ...s.k[i]!, ...s.v[i]!].join(' ')}`));
    words = s.words;
  };
  sync(t.initial.state);
  let before = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    sync(s);
    const total = tileOrder(s.words.length, settings).length;
    const finished = (x: FlashState) => x.flash !== undefined && x.flash.done === total;
    if (s !== before && finished(s) && !finished(before)) {
      input.push(`flash ${settings.order} ${settings.br} ${settings.bc} ${causal}`);
      expected.push(resultLine(s.flash!));
    }
    if (e.call[0] === 'plain' && s.plain) {
      input.push(`plain ${causal}`);
      expected.push(resultLine(s.plain));
    }
    before = s;
  }
  return { input, expected };
}

export default flashAttention;
