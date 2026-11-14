import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  childOf,
  common,
  NAMES,
  parsePrompt,
  plural,
  reusedOf,
  ROOT,
  type PrefixExtra,
  type PrefixSettings,
  type PrefixState,
} from './model';

type Def = VizDef<PrefixState, PrefixSettings, PrefixExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Prompts in families that share starts, so matches are partial and edges split. */
const FAMILIES: string[][] = [
  [
    'the cat sat on the mat',
    'the cat sat on the rug',
    'the cat sat in the box',
    'the cat ran under the tree',
    'the cat saw the dog',
    'the cat slept on the mat',
  ],
  [
    'the dog sat on the rug',
    'the dog saw the cat',
    'the dog chased the cat',
    'the dog ran to the box',
    'the dog ate the ball',
    'the dog chased it',
  ],
  ['a bird saw a cat', 'a bird sat on the tree', 'a dog ate the ball', 'a dog ran', 'a cat sat'],
];

/** The edges a prompt matches, as (run, tokens matched on it). */
export function matchedEdges(s: PrefixState, tokens: readonly string[]) {
  const out: { run: string; k: number; all: boolean }[] = [];
  let x = ROOT;
  let i = 0;
  while (i < tokens.length) {
    const y = childOf(s, x, tokens[i]!);
    if (y === null) break;
    const run = s.nodes[y]!.tokens;
    const k = common(run, tokens.slice(i));
    out.push({ run: run.join(' '), k, all: k === run.length });
    i += k;
    if (k < run.length) break;
    x = y;
  }
  return out;
}

function walkText(s: PrefixState, tokens: readonly string[]): string {
  const edges = matchedEdges(s, tokens);
  if (!edges.length) return `No edge from the root starts with "${tokens[0]}", so nothing matches.`;
  const parts = edges.map((e) =>
    e.all
      ? `"${e.run}" matches in full (${e.k})`
      : `"${e.run}" matches only its first ${plural(e.k, 'token')}`,
  );
  const total = edges.reduce((t, e) => t + e.k, 0);
  return `Walk down from the root: ${parts.join(', then ')}. In all ${plural(total, 'token')}.`;
}

/**
 * Practice for the prefix cache. The picture shows the cache after `setup`; the questions ask
 * about the request that comes next. Every answer comes from running the model.
 */
export function prefixPractice(def: () => Def): PracticeKind[] {
  const timeline = (settings: PrefixSettings, calls: OpCall[]) =>
    new Timeline(def(), settings, 1, calls);
  const run = (settings: PrefixSettings, calls: OpCall[]) => timeline(settings, calls).endState();

  /** Two to four finished requests from one family, and a new prompt from it. */
  function scene(rng: Rng) {
    const family = pick(rng, FAMILIES);
    const k = rng.int(2, 4);
    const prompts = Array.from({ length: k }, () => pick(rng, family));
    const setup = prompts.flatMap((p, i): OpCall[] => [
      ['request', p],
      ['finish', NAMES[i]!],
    ]);
    return { family, prompts, setup, next: NAMES[k]! };
  }

  return [
    {
      id: 'matched',
      title: 'The length matched',
      make(rng) {
        const settings: PrefixSettings = { capacity: '24' };
        const { family, setup, next } = scene(rng);
        const s = run(settings, setup);
        const prompt = pick(rng, family);
        const tokens = parsePrompt(prompt) as string[];
        const edges = matchedEdges(s, tokens);
        const matched = edges.reduce((t, e) => t + e.k, 0);
        return {
          prompt: `Request ${next} arrives with the prompt *${prompt}*. How many of its tokens, from the start, does the cache already hold?`,
          setup,
          settings,
          answer: { kind: 'number', value: matched },
          explain: walkText(s, tokens),
          watch: [['request', prompt]],
        };
      },
    },
    {
      id: 'prefilled',
      title: 'Tokens to prefill',
      make(rng) {
        const settings: PrefixSettings = { capacity: '24' };
        const { family, prompts, setup, next } = scene(rng);
        const s = run(settings, setup);
        // Sometimes a prompt the cache holds in full, or the start of one.
        const roll = rng.int(0, 2);
        const base = pick(rng, prompts).split(' ');
        const prompt =
          roll === 0
            ? base.join(' ')
            : roll === 1
              ? base.slice(0, rng.int(2, base.length)).join(' ')
              : pick(rng, family);
        const tokens = parsePrompt(prompt) as string[];
        const after = run(settings, [...setup, ['request', prompt]]);
        const req = after.running.at(-1)!;
        const n = tokens.length;
        const full = req.matched === n;
        return {
          prompt: `Request ${next} arrives with the prompt *${prompt}*. How many of its tokens does the model have to run (prefill)?`,
          setup,
          settings,
          answer: { kind: 'number', value: req.prefilled },
          explain: `${walkText(s, tokens)} ${
            full
              ? `The whole prompt is cached, but its last token still runs once: its output picks the first new token. So ${reusedOf(req.matched, n)} reused and 1 prefilled.`
              : `So ${n} − ${req.matched} = ${req.prefilled} ${req.prefilled === 1 ? 'token runs' : 'tokens run'}.`
          }`,
          watch: [['request', prompt]],
        };
      },
    },
    {
      id: 'evicted',
      title: 'What is evicted first?',
      make(rng) {
        const settings: PrefixSettings = { capacity: '12' };
        for (;;) {
          const family = pick(rng, FAMILIES);
          const prompts = Array.from({ length: rng.int(2, 3) }, () => pick(rng, family));
          // Finish some of them, and keep one running now and then.
          const keep = rng.int(0, 2) === 0 ? prompts.length - 1 : -1;
          const setup = prompts.flatMap((p, i): OpCall[] =>
            i === keep
              ? [['request', p]]
              : [
                  ['request', p],
                  ['finish', NAMES[i]!],
                ],
          );
          const before = run(settings, setup);
          const prompt = pick(rng, [...FAMILIES.flat()]);
          const t = timeline(settings, [...setup, ['request', prompt]]);
          const last = t.entries.at(-1)!;
          if (last.end === before) continue;
          const first = last.steps.find((st) => st.lines.includes('r-evict'));
          if (!first) continue;
          const uid = Number(first.marks.find((m) => m.id.startsWith('lru-'))!.id.slice(4));
          const leaves = Object.values(before.nodes).filter(
            (n) => n.uid !== ROOT && n.kids.length === 0,
          );
          const options = leaves.map((n) => n.tokens.join(' '));
          if (options.length < 2 || new Set(options).size !== options.length) continue;
          const gone = before.nodes[uid]!;
          const name = NAMES[prompts.length]!;
          const locked = leaves.filter((n) => n.ref > 0).map((n) => `"${n.tokens.join(' ')}"`);
          return {
            prompt: `The cache holds 12 tokens. Request ${name} arrives with *${prompt}* and needs room. Which cached run is evicted first?`,
            setup,
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(gone.tokens.join(' ')) },
            explain: `Only a leaf that no running request uses can go, and the least recently used goes first. ${locked.length ? `${locked.join(' and ')} ${locked.length === 1 ? 'is' : 'are'} in use. ` : ''}Of the rest, "${gone.tokens.join(' ')}" was used longest ago (time ${gone.last}).`,
            watch: [['request', prompt]],
          };
        }
      },
    },
    {
      id: 'evicted-tokens',
      title: 'How many tokens are evicted?',
      make(rng) {
        const settings: PrefixSettings = { capacity: '12' };
        for (;;) {
          const family = pick(rng, FAMILIES);
          const prompts = Array.from({ length: rng.int(2, 3) }, () => pick(rng, family));
          const setup = prompts.flatMap((p, i): OpCall[] => [
            ['request', p],
            ['finish', NAMES[i]!],
          ]);
          const before = run(settings, setup);
          const prompt = pick(rng, [...FAMILIES.flat()]);
          const after = run(settings, [...setup, ['request', prompt]]);
          if (after === before) continue;
          const evicted = after.evicted - before.evicted;
          if (evicted === 0 && rng.int(0, 3) > 0) continue;
          const req = after.running.at(-1)!;
          const need = req.tokens.length - req.matched;
          const used = Object.values(before.nodes).reduce((t, n) => t + n.tokens.length, 0);
          const name = NAMES[prompts.length]!;
          return {
            prompt: `The cache holds 12 tokens. Request ${name} arrives with *${prompt}*. How many cached tokens are evicted to make room for it? A leaf is evicted whole.`,
            setup,
            settings,
            answer: { kind: 'number', value: evicted },
            explain: `${req.matched} of its ${req.tokens.length} tokens are cached, so it needs ${plural(need, 'new slot')}. The cache holds ${used} of 12, so ${plural(Math.max(0, 12 - used), 'slot')} ${12 - used === 1 ? 'is' : 'are'} free. ${evicted === 0 ? 'That is enough: nothing is evicted.' : `Least recently used leaves go, whole, until the rest fits: ${plural(evicted, 'token')}.`}`,
            watch: [['request', prompt]],
          };
        }
      },
    },
  ];
}
