import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/merkle_tree.hpp?raw';
import javaSource from './code/java/MerkleTree.java?raw';
import pythonSource from './code/python/merkle_tree.py?raw';
import explain from './explain.md?raw';
import appendPath from './examples/append-path.json';
import buildEight from './examples/build-eight.json';
import changeBlock from './examples/change-block.json';
import duplicateOdd from './examples/duplicate-odd.json';
import forgedClaim from './examples/forged-claim.json';
import proveInclusion from './examples/prove-inclusion.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_BLOCKS,
  ops,
  parseBlocks,
  parseData,
  parseIndex,
  pseudocode,
  type MerkleExtra,
  type MerkleSettings,
  type MerkleState,
} from './model';
import { merklePractice } from './practice';
import { view } from './view';

/** Whole numbers stay numbers (block indices); a list of blocks becomes its canonical text. */
export function parseMerkleInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a block, a list of blocks, or a block number.');
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/[\s,]/.test(t)) {
    const blocks = parseBlocks(t);
    return blocks instanceof Error ? blocks : blocks.join(' ');
  }
  return parseData(t);
}

const NAMES = ['tx1', 'tx2', 'tx3', 'tx4', 'tx5', 'tx6', 'tx7', 'tx8'];
const blocksOf = (rng: Rng, n: number) =>
  Array.from({ length: Math.min(n, MAX_BLOCKS) }, (_, i) =>
    rng.int(0, 1) ? NAMES[i]! : `b${rng.int(10, 99)}`,
  );

export const merkleTree: VizDef<MerkleState, MerkleSettings, MerkleExtra> = {
  id: 'merkle-tree',
  title: 'Merkle tree',
  family: 'Trees',
  blurb:
    'Hashes of data blocks combined pairwise up to one root: change a block and the path to the root changes, and a few sibling hashes prove a block is in the tree.',
  settings: [
    {
      kind: 'choice',
      key: 'odd',
      label: 'A node with no partner',
      options: [
        { value: 'promote', label: 'Moves up unchanged' },
        { value: 'duplicate', label: 'Is paired with itself (as in Bitcoin)' },
      ],
      help: 'Only matters when a level has an odd number of nodes.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe: (s) => describe(s),
  controls: {
    input: {
      label: 'Block or number',
      placeholder: 'e.g. tx1 tx2 tx3 tx4, or 2',
      maxLength: 60,
      sample: 'tx1',
      parse: parseMerkleInput,
    },
    buttons: [
      { op: 'build', label: 'Build', usesInput: true, primary: true },
      {
        op: 'update',
        label: 'Change block',
        usesInput: true,
        args: ['a block number', 'new data'],
      },
      { op: 'prove', label: 'Prove block', usesInput: true },
      {
        op: 'verify',
        label: 'Check a claim',
        usesInput: true,
        args: ['a block number', 'claimed data'],
      },
      { op: 'append', label: 'Append block', usesInput: true, more: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: {
      label: 'Build random blocks',
      make: (rng) => [['build', blocksOf(rng, 4).join(' ')]],
    },
    presets: [
      { label: 'Random blocks', make: (rng, n) => [['build', blocksOf(rng, n).join(' ')]] },
      {
        label: 'Random, then change one',
        make: (rng, n) => {
          const b = blocksOf(rng, n);
          return [
            ['build', b.join(' ')],
            ['update', rng.int(0, b.length - 1), 'evil'],
          ];
        },
      },
      {
        label: 'Random, then prove one',
        make: (rng, n) => {
          const b = blocksOf(rng, n);
          return [
            ['build', b.join(' ')],
            ['prove', rng.int(0, b.length - 1)],
          ];
        },
      },
      {
        label: 'One block at a time',
        make: (rng, n) => blocksOf(rng, n).map((d) => ['append', d] as OpCall),
      },
    ],
    sizes: [4, 5, 8],
  },
  explain,
  practice: merklePractice(() => merkleTree),
  complexity: [
    {
      op: 'build(n blocks)',
      best: { cost: 'O(n)', why: 'n leaf hashes and n − 1 parent hashes.', example: 'build-eight' },
      average: { cost: 'O(n)', why: 'Every block is hashed once, every pair once.' },
      worst: { cost: 'O(n)', why: 'About 2n hashes, whatever the data.' },
    },
    {
      op: 'update(i, data)',
      best: {
        cost: 'O(log n)',
        why: 'One leaf and one hash per level above it.',
        example: 'change-block',
      },
      average: { cost: 'O(log n)', why: 'Only the path to the root depends on block i.' },
      worst: { cost: 'O(log n)', why: 'The height of the tree is ⌈log₂ n⌉.' },
    },
    {
      op: 'proof(i): size and time to verify',
      best: { cost: 'O(log n)', why: 'One sibling hash per level.', example: 'prove-inclusion' },
      average: { cost: 'O(log n)', why: 'The verifier hashes once per proof item.' },
      worst: {
        cost: 'O(log n)',
        why: 'Still one per level; a wrong claim fails at the root.',
        example: 'forged-claim',
      },
      note: 'Space: about 2n hashes. The verifier keeps only the root.',
    },
    {
      op: 'append(data)',
      best: { cost: 'O(log n)', why: 'A new leaf and the path above it.', example: 'append-path' },
      average: { cost: 'O(log n)', why: 'Only the right edge of the tree changes.' },
      worst: {
        cost: 'O(log n)',
        why: 'When n passes a power of two the tree gains a level: still one path.',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MerkleSettings),
  },
  examples: [
    buildEight,
    changeBlock,
    proveInclusion,
    forgedClaim,
    appendPath,
    duplicateOdd,
  ] as unknown as SavedExample[],
  preview: { example: 'change-block', level: 2 },
};

function unreadable([op, ...args]: OpCall): boolean {
  const bad = (v: Value | undefined, f: (v: Value) => unknown) =>
    v === undefined || f(v) instanceof Error;
  switch (op) {
    case 'build':
      return bad(args[0], parseBlocks);
    case 'append':
      return bad(args[0], parseData);
    case 'prove':
      return bad(args[0], parseIndex);
    case 'update':
    case 'verify':
      return bad(args[0], parseIndex) || bad(args[1], parseData);
    default:
      return false;
  }
}

/**
 * Driver protocol for the code tabs (a node with no partner moves up, the default):
 *   build d1 d2 ...  ->  the root
 *   update i data    ->  the root | "invalid"
 *   append data      ->  the root | "full" (the page draws at most 8 blocks)
 *   prove i          ->  the proof, "L:1a2b R:..." ("-" when empty) | "invalid"
 *   verify i data    ->  "ok" | "bad" | "invalid"
 *   clear            ->  "ok"
 */
function codeScript(calls: OpCall[], settings: MerkleSettings) {
  const same: MerkleSettings = { ...settings, odd: 'promote' };
  const kept = calls.filter((c) => !unreadable(c));
  const t = new Timeline(merkleTree, same, 1, kept);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const refused = last.marks.some((m) => m.id === 'arg-box');
    const root = String(last.vars?.root);
    input.push([op, ...args.map((a) => String(a).trim())].join(' '));
    if (op === 'build' || op === 'update') expected.push(refused ? 'invalid' : root);
    else if (op === 'append') expected.push(refused ? 'full' : root);
    else if (op === 'prove') {
      const items = (last.extra?.proof?.items ?? []).filter((it) => it.side !== null);
      expected.push(
        refused ? 'invalid' : items.map((it) => `${it.side}:${it.hash}`).join(' ') || '-',
      );
    } else if (op === 'verify')
      expected.push(refused ? 'invalid' : last.vars?.verified === 'yes' ? 'ok' : 'bad');
    else expected.push('ok');
  });
  return { input, expected };
}

export default merkleTree;
