import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { corpusWords } from '../_lm/corpus';
import { countPairs, mergeRow, tokenTotal } from '../_tokenize/pieces';
import {
  defaults,
  encodeWord,
  learn,
  loadState,
  pairName,
  rankPairs,
  show,
  splitWord,
  type BpeExtra,
  type BpeSettings,
  type BpeState,
} from './model';

type Def = VizDef<BpeState, BpeSettings, BpeExtra>;

const WORDS = [...new Set(corpusWords())];
/** Words the corpus does not have, made of its pieces. */
const NEW_WORDS = 'cats dogs mats rats hat bat sit tin bits tab dots rods sand band talks walks walker bird birds tree trees sat tan nod'.split(' ');

/** A small training text: four to six words of the corpus, each one to six times. */
function smallText(rng: Rng): string {
  const pool = [...WORDS];
  const n = rng.int(4, 6);
  return Array.from({ length: n }, () => {
    const w = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    const c = rng.int(1, 6);
    return c > 1 ? `${w}*${c}` : w;
  }).join(' ');
}

/** The first k merges each won outright, with no tie to settle. */
function clearWinners(s: BpeState, k: number): boolean {
  let st = s;
  for (let i = 0; i < k; i++) {
    const ranked = rankPairs(countPairs(st.rows), 'first');
    if (ranked.length === 0) return false;
    if (ranked.length > 1 && ranked[1]!.count === ranked[0]!.count) return false;
    st = learn(st, 1, 'first');
  }
  return true;
}

const tokens = (ps: readonly { t: string }[]) => ps.map((p) => show(p.t));

/**
 * Practice for BPE with the default settings (end-of-word marker, characters, ties to the pair
 * met first). Training texts are small, and chosen so that no merge asked about is a tie.
 */
export function bpePractice(def: () => Def): PracticeKind[] {
  const end = (ops: OpCall[], settings: BpeSettings) =>
    new Timeline(def(), settings, 1, ops).endState();

  return [
    {
      id: 'next-merge',
      title: 'The next merge',
      make(rng) {
        for (;;) {
          const text = smallText(rng);
          const settings = { ...defaults, merges: rng.int(1, 4) };
          const ops: OpCall[] = [['load', text], ['train']];
          const s = end(ops, settings);
          if (s.merges.length < settings.merges || !clearWinners(s, 1)) continue;
          const ranked = rankPairs(countPairs(s.rows), 'first');
          if (ranked.length < 3) continue;
          const shown = ranked.slice(0, 4);
          // The options in an order shuffled by the seeded RNG.
          const order = shown.map((_, i) => i);
          for (let i = order.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            [order[i], order[j]] = [order[j]!, order[i]!];
          }
          const options = order.map((i) => pairName(shown[i]!));
          const best = ranked[0]!;
          const runner = ranked[1]!;
          return {
            prompt: `BPE has learned ${s.merges.length} merge${s.merges.length === 1 ? '' : 's'} from these words. Which pair of neighbours does it merge next? Count each word as often as it occurs (the number in front of it).`,
            setup: ops,
            settings,
            answer: { kind: 'choice', options, correct: order.indexOf(0) },
            explain: `${pairName(best)} occurs ${best.count} times, counting every word it is in as often as the word occurs. The next most frequent, ${pairName(runner)}, occurs ${runner.count} times.`,
            watch: [['merge']],
          };
        }
      },
    },
    {
      id: 'tokens-after',
      title: 'Tokens after k merges',
      make(rng) {
        for (;;) {
          const text = smallText(rng);
          const k = rng.int(1, 3);
          const s0 = loadState(text, defaults);
          if (s0 instanceof Error || !clearWinners(s0, k)) continue;
          const settings = { ...defaults, merges: k };
          let st = s0;
          const parts: string[] = [];
          for (let i = 0; i < k; i++) {
            const next = learn(st, 1, 'first');
            const m = next.merges.at(-1)!;
            parts.push(`merge ${i + 1} joins ${pairName(m)} and saves ${tokenTotal(st.rows) - tokenTotal(next.rows)}`);
            st = next;
          }
          return {
            prompt: `Each word is split into characters, with _ at its end. How many tokens does the whole training text take after **${k}** merge${k === 1 ? '' : 's'}? Count each word as often as it occurs.`,
            setup: [['load', text]],
            settings,
            answer: { kind: 'number', value: tokenTotal(st.rows) },
            explain: `It starts at ${tokenTotal(s0.rows)} tokens; ${parts.join(', ')}. That leaves ${tokenTotal(st.rows)}. A merge saves one token for every place it joins a pair.`,
            watch: [['train']],
          };
        }
      },
    },
    {
      id: 'encode',
      title: 'Encode a new word',
      make(rng) {
        for (;;) {
          const text = smallText(rng);
          const settings = { ...defaults, merges: rng.int(4, 8) };
          const first = text.split(' ')[0]!.replace(/\*\d+$/, '');
          const ops: OpCall[] = [['load', text], ['train'], ['encode', first]];
          const s = end(ops, settings);
          const fresh = NEW_WORDS.filter(
            (w) =>
              !s.rows.some((r) => r.word === w) &&
              splitWord(w, settings).every((t) => s.base.includes(t)),
          );
          const useful = fresh.filter((w) => {
            const n = encodeWord(s, settings, w).length;
            return n < splitWord(w, settings).length && n > 1;
          });
          if (useful.length === 0) continue;
          const w = useful[rng.int(0, useful.length - 1)]!;
          const pieces = encodeWord(s, settings, w);
          // The merges that change the word, replayed in order.
          let ps = splitWord(w, settings).map((t, id) => ({ id, t }));
          const used: { m: (typeof s.merges)[number]; i: number }[] = [];
          s.merges.forEach((m, i) => {
            const after = mergeRow({ word: w, count: 1, pieces: ps }, m.a, m.b, m.ab).pieces;
            if (after !== ps) used.push({ m, i });
            ps = after;
          });
          return {
            prompt: `BPE learned the merges shown from a small text. Encode the new word **${w}**: split it into characters and _, then replay the merges in order. Type the tokens separated by spaces.`,
            setup: ops,
            settings,
            answer: { kind: 'sequence', value: tokens(pieces) },
            explain: `${w} starts as ${splitWord(w, settings).map(show).join(' ')}.${used.length ? ` The merges that apply, in order: ${used.map(({ m, i }) => `${i + 1} (${pairName(m)})`).join(', ')}.` : ''} That leaves ${tokens(pieces).join(' ')}.`,
            watch: [['encode', w]],
          };
        }
      },
    },
  ];
}
