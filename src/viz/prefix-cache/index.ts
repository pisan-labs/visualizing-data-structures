import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { CORPUS } from '../_lm/corpus';
import cppSource from './code/cpp/radix_cache.hpp?raw';
import javaSource from './code/java/RadixCache.java?raw';
import pythonSource from './code/python/radix_cache.py?raw';
import chatTurns from './examples/chat-turns.json';
import lruEvicts from './examples/lru-evicts.json';
import nothingShared from './examples/nothing-shared.json';
import runningProtected from './examples/running-protected.json';
import sharedStart from './examples/shared-start.json';
import sharedSystemPrompt from './examples/shared-system-prompt.json';
import waits from './examples/waits.json';
import wholePrompt from './examples/whole-prompt.json';
import explain from './explain.md?raw';
import {
  capacityOf,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  NAMES,
  ops,
  parsePrompt,
  pseudocode,
  ROOT,
  type PrefixExtra,
  type PrefixSettings,
  type PrefixState,
} from './model';
import { prefixPractice } from './practice';
import { view } from './view';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Corpus sentences short enough for a prompt. */
export const PROMPTS = CORPUS.filter((t) => !(parsePrompt(t) instanceof Error));

/** Requests one after another, each finished before the next arrives. */
export function oneByOne(prompts: readonly string[]): OpCall[] {
  return prompts.flatMap((p, i): OpCall[] => [
    ['request', p],
    ['finish', NAMES[i]!],
  ]);
}

/** `size` prompts that start with "the cat" or "the dog". */
function sharedStarts(rng: Rng, size: number): string[] {
  const start = pick(rng, ['the cat', 'the dog']);
  const pool = PROMPTS.filter((p) => p.startsWith(start));
  return Array.from({ length: size }, () => pick(rng, pool));
}

/** Parse what the shared input holds: a prompt, or a request's letter. */
function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (/^[a-z]$/i.test(t)) return t;
  const words = parsePrompt(t);
  return words instanceof Error ? words : words.join(' ');
}

const preset = (label: string, make: (rng: Rng, size: number) => OpCall[]): Preset => ({
  label,
  make,
});

export const prefixCache: VizDef<PrefixState, PrefixSettings, PrefixExtra> = {
  id: 'prefix-cache',
  title: 'Prefix cache (radix tree)',
  family: 'Serving LLMs',
  blurb:
    'Keep the keys and values of prompts already run in a radix tree of tokens, so a new prompt that starts the same way skips that part of prefill; evict the least recently used leaves nobody is using.',
  settings: [
    {
      kind: 'choice',
      key: 'capacity',
      label: 'Cache size',
      options: [
        { value: '12', label: '12 tokens' },
        { value: '16', label: '16 tokens' },
        { value: '24', label: '24 tokens' },
      ],
      help: 'How many tokens’ keys and values fit. A real server keeps the cache in the GPU memory the model’s weights leave free.',
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
      label: 'Prompt or request',
      placeholder: 'e.g. the cat sat on the mat, or A',
      maxLength: 70,
      sample: 'the cat sat on the rug',
      parse: parseInput,
    },
    buttons: [
      { op: 'request', label: 'Request', usesInput: true, primary: true },
      { op: 'finish', label: 'Finish', usesInput: true },
    ],
    random: {
      label: 'Random requests',
      make: (rng) => oneByOne(Array.from({ length: rng.int(3, 5) }, () => pick(rng, PROMPTS))),
    },
    presets: [
      preset('Prompts that start the same way', (rng, size) => oneByOne(sharedStarts(rng, size))),
      preset('A chat that grows turn by turn', (rng, size) => {
        const words = pick(
          rng,
          PROMPTS.filter((p) => p.split(' ').length >= 6),
        ).split(' ');
        const cuts = Array.from({ length: size }, (_, i) =>
          Math.max(1, Math.round(((i + 1) * words.length) / size)),
        );
        return oneByOne(cuts.map((k) => words.slice(0, k).join(' ')));
      }),
      preset('The same prompt again and again', (rng, size) =>
        oneByOne(Array.from({ length: size }, () => 'the dog chased the cat')),
      ),
      preset('Nothing in common', (_rng, size) =>
        oneByOne(
          [
            'the cat sat',
            'a dog ran',
            'it ate the ball',
            'on the mat',
            'under the tree',
            'and it slept',
            'cat and dog',
            'dog saw it',
          ].slice(0, size),
        ),
      ),
      preset('Requests that stay running', (rng, size) =>
        sharedStarts(rng, size).map((p): OpCall => ['request', p]),
      ),
      preset('Fill a small cache until it evicts', (rng, size) =>
        oneByOne(Array.from({ length: size + 2 }, () => pick(rng, PROMPTS))),
      ),
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'match: find the longest cached prefix of n tokens',
      best: {
        cost: 'Θ(1)',
        why: 'No edge from the root starts with the first token.',
        example: 'nothing-shared',
      },
      average: {
        cost: 'Θ(m)',
        why: 'Compare token by token along the m tokens that match; one child lookup per edge.',
        example: 'shared-start',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'The whole prompt is in the tree.',
        example: 'whole-prompt',
      },
    },
    {
      op: 'insert: cache the rest',
      best: {
        cost: 'Θ(1)',
        why: 'Everything matched: nothing to add.',
        example: 'whole-prompt',
      },
      average: {
        cost: 'Θ(n − m)',
        why: 'One new leaf holds the n − m new tokens, after at most one split.',
        example: 'shared-start',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'Nothing matched: the whole prompt is a new leaf.',
        example: 'nothing-shared',
      },
    },
    {
      op: 'evict k leaves to make room',
      best: {
        cost: 'Θ(1)',
        why: 'There is room already: nothing is evicted.',
        example: 'shared-start',
      },
      average: {
        cost: 'Θ(L + k log L)',
        why: 'Put the L leaves in a heap by last use, then pop the oldest unused ones.',
        example: 'lru-evicts',
      },
      worst: {
        cost: 'Θ(N log N)',
        why: 'Evicting a leaf can make its parent a leaf: the whole tree of N nodes can go.',
        example: 'running-protected',
      },
    },
    {
      op: 'prefill: tokens the model runs',
      best: {
        cost: '1 token',
        why: 'The prompt is cached in full; only its last token runs again, for its output.',
        example: 'whole-prompt',
      },
      average: {
        cost: 'n − m tokens',
        why: 'Only the part after the match runs; it still attends to the cached keys.',
        example: 'shared-start',
      },
      worst: {
        cost: 'n tokens',
        why: 'Nothing is shared: the cache saves nothing.',
        example: 'nothing-shared',
      },
      note: 'Prefill is the expensive part: every layer runs over every prompt token.',
    },
    {
      op: 'finish: release a request',
      best: { cost: 'Θ(1)', why: 'A path of one node.', example: 'nothing-shared' },
      average: {
        cost: 'Θ(depth)',
        why: 'Lower one reference count per node on the path.',
        example: 'chat-turns',
      },
      worst: {
        cost: 'Θ(depth)',
        why: 'Nothing is freed: the tokens stay cached.',
        example: 'chat-turns',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PrefixSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    sharedStart,
    chatTurns,
    lruEvicts,
    runningProtected,
    waits,
    wholePrompt,
    nothingShared,
    sharedSystemPrompt,
  ] as unknown as SavedExample[],
  practice: prefixPractice(() => prefixCache),
  preview: { example: 'shared-system-prompt', level: 2, hide: ['cap', 'run-', 'lru-', 'req-'] },
  opening: 'shared-start',
};

/** The tree as the code tabs print it: each node's run, reference count and last use. */
export function treeLine(s: PrefixState, u: number = ROOT): string {
  const kids = s.nodes[u]!.kids;
  if (u === ROOT && !kids.length) return '-';
  return kids
    .map((k) => {
      const n = s.nodes[k]!;
      return `${n.tokens.join('_')}:${n.ref}:${n.last}${n.kids.length ? `(${treeLine(s, k)})` : ''}`;
    })
    .join(' ');
}

/**
 * Driver protocol for the code tabs. "capacity <tokens>" starts an empty cache and prints
 * nothing; "request <X> <tokens>" prints "X matched m reused r prefilled p evicted e | tree";
 * "finish <X>" prints "X done | tree". A refused operation leaves the state as it was and is
 * not sent.
 */
function codeScript(calls: OpCall[], settings: PrefixSettings) {
  const t = new Timeline(prefixCache, settings, 1, calls);
  const input = [`capacity ${capacityOf(settings)}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    if (s !== before) {
      if (e.call[0] === 'request') {
        const r = s.running.at(-1)!;
        input.push(`request ${r.name} ${r.tokens.join(' ')}`);
        expected.push(
          `${r.name} matched ${r.matched} reused ${r.reused} prefilled ${r.prefilled} evicted ${s.evicted - before.evicted} | ${treeLine(s)}`,
        );
      } else {
        const name = String(e.call[1]).trim().toUpperCase();
        input.push(`finish ${name}`);
        expected.push(`${name} done | ${treeLine(s)}`);
      }
    }
    before = s;
  }
  return { input, expected };
}

export default prefixCache;
