import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/block_manager.hpp?raw';
import javaSource from './code/java/BlockManager.java?raw';
import pythonSource from './code/python/block_manager.py?raw';
import bigBlocks from './examples/big-blocks.json';
import finishFrees from './examples/finish-frees.json';
import forkCopies from './examples/fork-copies.json';
import forkShares from './examples/fork-shares.json';
import manyShort from './examples/many-short.json';
import onDemand from './examples/on-demand.json';
import outOfBlocks from './examples/out-of-blocks.json';
import explain from './explain.md?raw';
import {
  blocksOf,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LEN,
  ops,
  pseudocode,
  sizeOf,
  type PagedExtra,
  type PagedSettings,
  type PagedState,
} from './model';
import { pagedPractice } from './practice';
import { view } from './view';

const steps = (k: number): OpCall[] => Array.from({ length: k }, (): OpCall => ['step']);
const adds = (ns: number[]): OpCall[] => ns.map((n): OpCall => ['add', n]);

const preset = (label: string, make: (rng: Rng, size: number) => OpCall[]): Preset => ({
  label,
  make,
});

/** Parse what the shared input holds: a prompt length or a request's letter. */
function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (/^[a-z]$/i.test(t)) return t.toUpperCase();
  return new Error(`Type a prompt length (1 to ${MAX_LEN}) for Add, or a request's letter, such as A.`);
}

export const pagedAttention: VizDef<PagedState, PagedSettings, PagedExtra> = {
  id: 'paged-attention',
  title: 'Paged KV cache (PagedAttention)',
  family: 'Serving LLMs',
  blurb:
    'Keep every request’s KV cache in small fixed-size blocks from one pool, with a block table per request, a free list, and reference counts so parallel samples share their prompt.',
  settings: [
    {
      kind: 'choice',
      key: 'block',
      label: 'Block size',
      options: [
        { value: '2', label: '2 tokens (24 blocks)' },
        { value: '4', label: '4 tokens (12 blocks)' },
        { value: '8', label: '8 tokens (6 blocks)' },
      ],
      help: 'The pool always holds 48 slots. Small blocks waste less at the end of a request but make longer tables; vLLM uses 16 tokens by default.',
    },
    {
      kind: 'boolean',
      key: 'sharing',
      label: 'Share blocks between forks (copy on write)',
      help: 'On: a fork points at its parent’s blocks and copies one only when it writes into it. Off: a fork copies every block at once.',
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
      label: 'Prompt length or request',
      placeholder: 'e.g. 5, or A',
      maxLength: 30,
      sample: '5',
      parse: parseInput,
    },
    buttons: [
      { op: 'add', label: 'Add', usesInput: true, primary: true, bulk: true },
      { op: 'step', label: 'Step', usesInput: false },
      { op: 'finish', label: 'Finish', usesInput: true },
      { op: 'fork', label: 'Fork', usesInput: true },
    ],
    random: {
      label: 'Random requests',
      make: (rng) => [
        ...adds(Array.from({ length: rng.int(2, 4) }, () => rng.int(2, 9))),
        ...steps(rng.int(1, 4)),
      ],
    },
    presets: [
      preset('Requests of different lengths', (rng, size) => [
        ...adds(Array.from({ length: size }, () => rng.int(1, 9))),
        ...steps(rng.int(2, 5)),
      ]),
      preset('Parallel sampling: one prompt, several answers', (rng, size) => [
        ['add', rng.int(3, 7)],
        ...Array.from({ length: Math.max(1, size - 1) }, (): OpCall => ['fork', 'A']),
        ...steps(rng.int(2, 4)),
      ]),
      preset('Requests come and go', (rng, size) => {
        const calls: OpCall[] = adds([rng.int(3, 8), rng.int(3, 8)]);
        const names = 'ABCDEF';
        for (let i = 0; i < size - 2; i++) {
          calls.push(...steps(rng.int(1, 3)), ['finish', names[i]!], ['add', rng.int(2, 9)]);
        }
        return [...calls, ...steps(2)];
      }),
      preset('Many short requests', (rng, size) => [
        ...adds(Array.from({ length: size }, () => rng.int(1, 4))),
        ...steps(1),
      ]),
      preset('Fill the pool until a request waits', (rng) => [
        ...adds([rng.int(6, 10), rng.int(6, 10), rng.int(6, 10)]),
        ...steps(rng.int(5, 7)),
      ]),
    ],
    sizes: [2, 4, 6],
  },
  explain,
  complexity: [
    {
      op: 'add(n): a prompt of n tokens',
      best: {
        cost: 'Θ(1) blocks',
        why: 'A prompt that fits in one block takes one pop off the free list.',
        example: 'many-short',
      },
      average: {
        cost: 'Θ(n / B) blocks',
        why: 'One pop per block of B tokens; writing the n keys and values is Θ(n).',
        example: 'on-demand',
      },
      worst: {
        cost: 'Θ(n / B) blocks',
        why: 'No search for a hole big enough: any free block will do.',
        example: 'finish-frees',
      },
    },
    {
      op: 'step: one token for each of r requests',
      best: {
        cost: 'Θ(r)',
        why: 'Each request writes into the room left in its last block.',
        example: 'on-demand',
      },
      average: {
        cost: 'Θ(r)',
        why: 'Now and then a last block is full, and one pop gives a new one.',
        example: 'on-demand',
      },
      worst: {
        cost: 'Θ(r · B)',
        why: 'Every request copies a shared last block of B slots before it writes.',
        example: 'fork-shares',
      },
    },
    {
      op: 'fork: parallel sampling',
      best: {
        cost: 'Θ(n / B)',
        why: 'With sharing, copy the table and add one to each block’s count.',
        example: 'fork-shares',
      },
      average: {
        cost: 'Θ(n / B)',
        why: 'The partly filled last block is copied later, on the first write.',
        example: 'fork-shares',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'Without sharing, every token’s key and value is copied at once.',
        example: 'fork-copies',
      },
    },
    {
      op: 'finish: free a request',
      best: {
        cost: 'Θ(n / B)',
        why: 'One count to lower, and maybe one push, per block.',
        example: 'finish-frees',
      },
      average: {
        cost: 'Θ(n / B)',
        why: 'No merging of neighbours: a block is a block.',
        example: 'finish-frees',
      },
      worst: {
        cost: 'Θ(n / B)',
        why: 'Shared blocks stay; the work is the same.',
        example: 'fork-shares',
      },
    },
    {
      op: 'Memory wasted per request',
      best: {
        cost: '0 slots',
        why: 'The length is a multiple of B: every block is full.',
        example: 'on-demand',
      },
      average: {
        cost: 'about B / 2 slots',
        why: 'Only the last block is ever partly empty.',
        example: 'many-short',
      },
      worst: {
        cost: 'B − 1 slots',
        why: 'One token in a fresh block.',
        example: 'big-blocks',
      },
      note: 'Reserving the maximum length wastes up to that length minus one per request, and nothing can be shared.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PagedSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    onDemand,
    finishFrees,
    forkShares,
    forkCopies,
    bigBlocks,
    manyShort,
    outOfBlocks,
  ] as unknown as SavedExample[],
  practice: pagedPractice(() => pagedAttention),
  preview: { example: 'fork-shares', level: 2, hide: ['free', 'f-', 'tables-title', 'lb-'] },
  opening: 'finish-frees',
};

/** The code tabs' line: every block table, the free list (top first) and the copies so far. */
export function stateLine(s: PagedState): string {
  const tables = s.seqs.length
    ? s.seqs.map((q) => `${q.name} ${q.table.join(' ')}`).join(' / ')
    : '-';
  return `${tables} | free ${s.free.length ? s.free.join(' ') : '-'} | copies ${s.copies}`;
}

/**
 * Driver protocol for the code tabs. "settings <blocks> <block size> <sharing 1|0>" starts an
 * empty pool and prints nothing; "add <n>", "step", "finish <X>" and "fork <X>" each print
 * `stateLine`. A refused operation leaves the state as it was and is not sent.
 */
function codeScript(calls: OpCall[], settings: PagedSettings) {
  const t = new Timeline(pagedAttention, settings, 1, calls);
  const input = [`settings ${blocksOf(settings)} ${sizeOf(settings)} ${settings.sharing ? 1 : 0}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    if (e.end !== before) {
      const [op, arg] = e.call;
      input.push(op === 'step' ? 'step' : `${op} ${String(arg).trim().toUpperCase()}`);
      expected.push(stateLine(e.end));
    }
    before = e.end;
  }
  return { input, expected };
}

export default pagedAttention;
