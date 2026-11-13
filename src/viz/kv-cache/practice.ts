import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  MAX_TOKENS,
  QKV_COST,
  ROW_COST,
  ROW_NUMBERS,
  SEEN_COST,
  windowOf,
  type KvExtra,
  type KvSettings,
  type KvState,
} from './model';
import { randomWords } from './texts';

type Def = VizDef<KvState, KvSettings, KvExtra>;

const COSTS = `A row of q, K or V costs ${ROW_COST} multiply-adds (four numbers times a 4 × 2 matrix); each token the new query sees costs ${SEEN_COST} more (${SEEN_COST / 2} for its score, ${SEEN_COST / 2} to blend its value).`;

/** A text of `before` tokens (a prompt, then generated words) and the `after` words that follow. */
function text(rng: Rng, before: number, after: number) {
  const words = randomWords(rng, before + after);
  const prompt = rng.int(1, Math.min(before, 4));
  const setup: OpCall[] = [
    ['prefill', words.slice(0, prompt).join(' ')],
    ...words.slice(prompt, before).map((w): OpCall => ['generate', w]),
  ];
  const watch = words.slice(before).map((w): OpCall => ['generate', w]);
  return { words, setup, watch };
}

/**
 * Practice for the KV cache. The picture shows the text so far; the questions ask about the
 * tokens that follow. Every answer comes from running the model.
 */
export function kvPractice(def: () => Def): PracticeKind[] {
  const run = (settings: KvSettings, calls: OpCall[]) =>
    new Timeline(def(), settings, 1, calls).endState();

  function workQuestion(rng: Rng, cache: boolean) {
    const window = rng.int(0, 2) === 0 ? (['3', '4'] as const)[rng.int(0, 1)]! : 'all';
    const settings: KvSettings = { cache, window };
    const before = rng.int(2, MAX_TOKENS - 1);
    const { words, setup, watch } = text(rng, before, 1);
    const end = run(settings, [...setup, ...watch]);
    const cost = end.work.at(-1)!;
    const t = before + 1;
    const m = Math.min(t, windowOf(settings));
    const sees =
      window === 'all'
        ? ''
        : ` The window is ${window}: a token sees itself and the ${Number(window) - 1} tokens before it.`;
    return {
      prompt: `${cache ? 'With' : 'Without'} the cache, how many multiply-adds does the next token, **${words[before]}** (token ${t}), cost? ${COSTS}${sees}`,
      setup,
      settings,
      answer: { kind: 'number' as const, value: cost },
      explain: cache
        ? `Only the new token is projected: q, k and v cost 3 × ${ROW_COST} = ${QKV_COST}. Its query then sees the ${m} tokens in the cache, ${m} × ${SEEN_COST} = ${SEEN_COST * m}. In all ${cost}, whatever came before.`
        : `Nothing is cached, so K and V are computed again for all ${m} tokens it sees: ${m} × 2 × ${ROW_COST} = ${2 * ROW_COST * m}. Its own q costs ${ROW_COST}, and attending to the ${m} tokens ${SEEN_COST * m}. In all ${cost}; with the cache it would be ${QKV_COST + SEEN_COST * m}.`,
      watch,
    };
  }

  /** A window, a short text, and enough words after it that the window fills. */
  function windowQuestion(rng: Rng) {
    const window = (['2', '3', '4'] as const)[rng.int(0, 2)]!;
    const w = Number(window);
    const settings: KvSettings = { cache: true, window };
    const before = rng.int(1, w);
    const after = rng.int(Math.max(1, w + 1 - before), MAX_TOKENS - before);
    const t = text(rng, before, after);
    const end = run(settings, [...t.setup, ...t.watch]);
    return { ...t, w, window, settings, end, total: before + after, after };
  }

  return [
    {
      id: 'work-without',
      title: 'Work for a token, without the cache',
      make: (rng) => workQuestion(rng, false),
    },
    {
      id: 'work-with',
      title: 'Work for a token, with the cache',
      make: (rng) => workQuestion(rng, true),
    },
    {
      id: 'size',
      title: 'Cache size with a window',
      make(rng) {
        const { words, w, settings, setup, watch, end, total, after } = windowQuestion(rng);
        const rows = end.k.length;
        return {
          prompt: `The cache keeps the last ${w} tokens. After ${after === 1 ? 'one more token' : `${after} more tokens`} (${words.slice(total - after).join(' ')}), how many numbers does it hold? Each token has a row of K and a row of V, ${ROW_NUMBERS / 2} numbers each.`,
          setup,
          settings,
          answer: { kind: 'number', value: rows * ROW_NUMBERS },
          explain: `The text will have ${total} tokens. The window keeps the last min(${total}, ${w}) = ${rows}, and each costs ${ROW_NUMBERS} numbers: ${rows * ROW_NUMBERS}. Without the window it would hold ${total * ROW_NUMBERS}.`,
          watch,
        };
      },
    },
    {
      id: 'kept',
      title: 'Which tokens are left?',
      make(rng) {
        const { words, w, settings, setup, watch, end, total, after } = windowQuestion(rng);
        const kept = end.words.slice(end.from);
        const gone = end.words.slice(0, end.from);
        return {
          prompt: `The cache keeps the last ${w} tokens. After ${after === 1 ? 'one more token' : `${after} more tokens`} (${words.slice(total - after).join(' ')}), whose keys and values are in it? Type the words, oldest first.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: kept },
          explain: `A window of ${w} keeps the last ${w} tokens: ${kept.join(' ')}. ${gone.length ? `${gone.join(' ')} ${gone.length === 1 ? 'was' : 'were'} evicted, oldest first, and no later token can see ${gone.length === 1 ? 'it' : 'them'}.` : 'Nothing was evicted yet.'}`,
          watch,
        };
      },
    },
  ];
}
