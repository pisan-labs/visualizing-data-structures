import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import cppSource from './code/cpp/pq.hpp?raw';
import javaSource from './code/java/Pq.java?raw';
import pythonSource from './code/python/pq.py?raw';
import copiedPieces from './examples/copied-pieces.json';
import eightCentres from './examples/eight-centres.json';
import fourPieces from './examples/four-pieces.json';
import onePiece from './examples/one-piece.json';
import orderFlips from './examples/order-flips.json';
import twoCentres from './examples/two-centres.json';
import twoPieces from './examples/two-pieces.json';
import explain from './explain.md?raw';
import {
  D,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  K,
  MAX,
  nearPrototypes,
  ops,
  parseVectors,
  pseudocode,
  randomVectors,
  writeVectors,
  type PqExtra,
  type PqSettings,
  type PqState,
} from './model';
import { pqPractice } from './practice';
import { view } from './view';

const query = (rng: Rng) => Array.from({ length: D }, () => rng.int(0, MAX)).join(',');
const build = (vs: number[][], rng: Rng): OpCall[] => [
  ['load', writeVectors(vs)],
  ['train'],
  ['encode'],
  ['search', query(rng)],
];
const preset = (label: string, make: (rng: Rng, n: number) => number[][]): Preset => ({
  label,
  make: (rng, n) => build(make(rng, n), rng),
});

export const productQuantization: VizDef<PqState, PqSettings, PqExtra> = {
  id: 'product-quantization',
  title: 'Product quantization',
  family: 'Retrieval and vector search',
  blurb:
    'Compress vectors to a few small numbers: cut each one into pieces, run k-means on each piece to get a codebook, and store the number of the nearest centre. A query’s distance to every stored vector comes from a small table of piece-to-centre distances.',
  settings: [
    {
      kind: 'choice',
      key: 'pieces',
      label: 'Pieces (m), each with its own codebook',
      options: [
        { value: '2', label: '2 pieces of 2 numbers' },
        { value: '4', label: '4 pieces of 1 number' },
        { value: '1', label: '1 piece of 4 numbers (plain k-means)' },
      ],
      help: 'More pieces means more codes per vector (more bits), and more vectors the codes can stand for. One piece is ordinary vector quantization.',
    },
    {
      kind: 'choice',
      key: 'size',
      label: 'Codebook size (k*), centres per piece',
      options: [
        { value: '4', label: '4 centres: 2 bits a code' },
        { value: '2', label: '2 centres: 1 bit a code' },
        { value: '8', label: '8 centres: 3 bits a code' },
      ],
      help: 'Train runs k-means with this many centres on each piece, so it needs at least this many vectors. The paper uses 256 centres, one byte a code.',
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
      label: 'Vectors',
      placeholder: 'e.g. 1,9,1,8 2,9,9,9 to load; 2,8,2,7 to search',
      maxLength: 120,
      sample: '2,8,2,7',
      parse: parseVectors,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'train', label: 'Train', usesInput: false },
      { op: 'encode', label: 'Encode', usesInput: false },
      { op: 'search', label: 'Search', usesInput: true },
    ],
    random: {
      label: 'Random vectors',
      make: (rng) => build(nearPrototypes(rng, rng.int(8, 10)), rng),
    },
    presets: [
      preset('Near four prototypes', (rng, n) => nearPrototypes(rng, n)),
      preset('Random vectors (no groups)', randomVectors),
      preset('Near two prototypes', (rng, n) => nearPrototypes(rng, n, 2)),
      preset('Copied pieces (x₃, x₄ repeat x₁, x₂)', (rng, n) =>
        nearPrototypes(rng, n).map((v) => [v[0]!, v[1]!, v[0]!, v[1]!]),
      ),
      preset('One piece the same in every vector', (rng, n) =>
        nearPrototypes(rng, n).map((v) => [v[0]!, v[1]!, 5, 5]),
      ),
    ],
    sizes: [6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'Search: distances to all N vectors by the table (ADC)',
      best: {
        cost: 'Θ(k*·d + N·m)',
        why: 'The table is k* distances on pieces of d/m numbers for each of m pieces; then m lookups per vector.',
        example: 'one-piece',
      },
      average: {
        cost: 'Θ(k*·d + N·m)',
        why: 'The same for any query: every code is read once.',
        example: 'two-pieces',
      },
      worst: {
        cost: 'Θ(k*·d + N·m)',
        why: 'No shortcut, and none needed: m is small (8 in the paper).',
        example: 'four-pieces',
      },
      note: 'For large N the lookups dominate, and m lookups are much cheaper than a d-number distance.',
    },
    {
      op: 'Search: exact distances to all N vectors',
      best: { cost: 'Θ(N·d)', why: 'Every number of every vector.', example: 'two-pieces' },
      average: { cost: 'Θ(N·d)', why: 'N distances of d numbers each.', example: 'order-flips' },
      worst: {
        cost: 'Θ(N·d)',
        why: 'And the raw vectors must be kept in memory.',
        example: 'eight-centres',
      },
    },
    {
      op: 'Encode one vector',
      best: {
        cost: 'Θ(k*·d)',
        why: 'Each of m pieces is measured against k* centres of d/m numbers.',
        example: 'two-centres',
      },
      average: { cost: 'Θ(k*·d)', why: 'The same for every vector.', example: 'two-pieces' },
      worst: { cost: 'Θ(k*·d)', why: 'Independent of N.', example: 'eight-centres' },
    },
    {
      op: 'Memory per vector',
      best: {
        cost: 'm·log₂ k* bits',
        why: 'One code per piece; here 1 piece of 4 centres is 2 bits.',
        example: 'one-piece',
      },
      average: {
        cost: 'm·log₂ k* bits',
        why: '2 pieces of 4 centres: 4 bits, against 128 for 4 floats.',
        example: 'two-pieces',
      },
      worst: {
        cost: 'm·log₂ k* bits',
        why: '4 pieces of 4 centres: 8 bits. The codebooks add k*·d numbers, shared by all vectors.',
        example: 'four-pieces',
      },
    },
    {
      op: 'Train the codebooks',
      best: {
        cost: 'Θ(I·N·k*·d)',
        why: 'k-means on each piece; each round measures N pieces against k* centres.',
        example: 'two-pieces',
      },
      average: {
        cost: 'Θ(I·N·k*·d)',
        why: 'I rounds of k-means, summed over the m pieces.',
        example: 'copied-pieces',
      },
      worst: {
        cost: 'Θ(I·N·k*·d)',
        why: 'More rounds when the pieces have no clear groups.',
        example: 'one-piece',
      },
      note: 'Done once, often on a sample of the vectors.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PqSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twoPieces,
    orderFlips,
    twoCentres,
    eightCentres,
    onePiece,
    fourPieces,
    copiedPieces,
  ] as unknown as SavedExample[],
  practice: pqPractice(() => productQuantization),
  preview: { example: 'two-pieces', level: 2, hide: ['r-', 'vs-', 'k0-', 'k1-', 't-'] },
  opening: 'two-pieces',
};

/**
 * Driver protocol for the code tabs. "vectors a b c d a b c d ..." sets the vectors (no output).
 * "train m k u1 ... u(m·k)" trains m codebooks of k centres with those k-means++ draws and
 * prints them (pieces split by " | ", centres by " / "). "encode" prints every vector's code.
 * "search a b c d k" prints the distance to every vector by the table, then the k nearest by it.
 * Three decimals.
 */
function codeScript(calls: OpCall[], settings: PqSettings) {
  const t = new Timeline(productQuantization, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const [op] = e.call;
    const end = e.end;
    if (end === prev) continue;
    if (op === 'load') input.push(`vectors ${end.vecs.map((v) => v.v.join(' ')).join(' ')}`);
    if (op === 'train') {
      input.push(`train ${end.m} ${end.ks} ${end.draws.map(String).join(' ')}`);
      expected.push(
        end.books.map((b) => b.map((c) => c.map(round3).join(' ')).join(' / ')).join(' | '),
      );
    }
    if (op === 'encode' && end.codes) {
      input.push('encode');
      expected.push(end.codes.map((c) => c.join(' ')).join(' / '));
    }
    if (op === 'search' && end.last) {
      input.push(`search ${end.last.q.join(' ')} ${K}`);
      expected.push(`${end.last.approx.map(round3).join(' ')} | ${end.last.found.join(' ')}`);
    }
    prev = end;
  }
  return { input, expected };
}

export default productQuantization;
