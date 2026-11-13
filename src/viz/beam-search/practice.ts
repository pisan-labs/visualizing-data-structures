import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind } from '../../engine/types';
import { two } from '../_lm/numbers';
import {
  BOS,
  defaults,
  EOS,
  runSearch,
  TABLE,
  words,
  type BeamSettings,
  type Eos,
  type Search,
} from './model';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The model's rows a search from `start` can use, written out; rows that only end are summed up. */
function rows(start: string, upTo = Infinity): string {
  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (w: string, depth: number) => {
    if (seen.has(w) || depth >= upTo || !TABLE[w]) return;
    seen.add(w);
    order.push(w);
    for (const [n] of TABLE[w]) if (n !== EOS) visit(n, depth + 1);
  };
  visit(start, 0);
  const full = order.filter((w) => TABLE[w]!.length > 1);
  const ends = order.filter((w) => TABLE[w]!.length === 1);
  const text = full
    .map((w) => `P(· | ${w}): ${TABLE[w]!.map(([n, p]) => `${n} ${two(p)}`).join(', ')}`)
    .join('; ');
  return `${text}${ends.length ? `; ${ends.join(', ')} ${ends.length === 1 ? 'is' : 'are'} always followed by </s>` : ''}.`;
}

const hyp = (s: Search, id: number) => words(s, id).join(' ');

const describeSettings = (s: BeamSettings) =>
  `B = ${s.width}, ${s.norm ? 'with' : 'without'} length normalization, ${s.eos === 'shrink' ? 'a beam that narrows when a hypothesis finishes' : 'a beam that is refilled until B have finished'}, at most ${s.maxLen} tokens`;

/**
 * Practice for beam search. The picture shows a greedy run from the start word (B = 1), and the
 * prompt gives the rows of the model the question needs; the questions ask about the beam
 * search that follows. Every answer comes from running the model.
 */
export function beamPractice(_def?: unknown): PracticeKind[] {
  return [
    {
      id: 'beam-after',
      title: 'The beam after a step',
      make(rng) {
        for (;;) {
          const start = pick(rng, [BOS, BOS, 'the', 'a', 'dog', 'cat']);
          const settings: BeamSettings = { ...defaults, width: rng.int(2, 3) };
          const { search, rounds } = runSearch(start, settings, false);
          if (rounds.length < 2) continue;
          const t = rng.int(1, Math.min(2, rounds.length));
          const r = rounds[t - 1]!;
          if (r.kept.length === 0) continue;
          const right = r.kept.map((c) => hyp(search, c)).join(', ');
          // Wrong answers: other sets of the same size from the ranked candidates.
          const live = r.ranked.filter((c) => !search.nodes[c]!.token.includes('/'));
          const wrong = new Set<string>();
          for (let k = 0; k < 12 && wrong.size < 3; k++) {
            const set = shuffle(rng, live)
              .slice(0, r.kept.length)
              .sort((a, b) => r.ranked.indexOf(a) - r.ranked.indexOf(b));
            const textSet = set.map((c) => hyp(search, c)).join(', ');
            if (textSet !== right && set.length === r.kept.length) wrong.add(textSet);
          }
          if (wrong.size === 0) continue;
          const options = shuffle(rng, [right, ...wrong]);
          return {
            prompt: `The picture shows greedy decoding after **${start}**. Now run beam search with B = ${settings.width}. The model: ${rows(start, t)} Which hypotheses are in the beam after step ${t}, best first?`,
            setup: [['greedy', start]] as OpCall[],
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(right) },
            explain: `Step ${t} ranks ${r.ranked.length} candidates: ${r.ranked
              .slice(0, 5)
              .map((c) => `${hyp(search, c)} ${two(search.nodes[c]!.score)}`)
              .join(
                ', ',
              )}${r.ranked.length > 5 ? ' and so on' : ''}. ${r.finishedNow.length ? `${r.finishedNow.map((c) => hyp(search, c)).join(', ')} ended with </s> and was set aside; ` : ''}the beam keeps ${right}.`,
            watch: [['search', start]] as OpCall[],
          };
        }
      },
    },
    {
      id: 'final',
      title: 'The sentence beam search returns',
      make(rng) {
        for (;;) {
          const start = pick(rng, ['cat', 'dog', 'fox', 'ran', 'sat', 'a']);
          const settings: BeamSettings = {
            ...defaults,
            width: rng.int(1, 3),
            norm: rng.int(0, 1) === 1,
            eos: pick(rng, ['shrink', 'refill'] as Eos[]),
          };
          const { search } = runSearch(start, settings, false);
          if (search.best === null) continue;
          const right = hyp(search, search.best);
          const others = new Set<string>(search.finished.map((f) => hyp(search, f)));
          for (const alt of [
            { ...settings, norm: !settings.norm },
            { ...settings, width: 1 },
            { ...settings, width: 3 },
          ]) {
            const s = runSearch(start, alt, false).search;
            s.finished.forEach((f) => others.add(hyp(s, f)));
          }
          others.delete(right);
          if (others.size === 0) continue;
          const options = shuffle(rng, [right, ...shuffle(rng, [...others]).slice(0, 3)]);
          const fin = search.finished
            .map((f) => {
              const h = search.nodes[f]!;
              return `${hyp(search, f)} ${two(h.score)}${settings.norm ? ` (÷ ${h.len} = ${two(h.score / h.len)})` : ''}`;
            })
            .join(', ');
          return {
            prompt: `Run beam search after **${start}** with ${describeSettings(settings)}. The model: ${rows(start)} Which output does it return?`,
            setup: [['greedy', start]] as OpCall[],
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(right) },
            explain: `It finishes ${fin}. ${settings.norm ? 'Per token' : 'By raw log-probability'}, ${right} is best.`,
            watch: [['search', start]] as OpCall[],
          };
        }
      },
    },
    {
      id: 'score',
      title: 'Add up the log-probabilities',
      make(rng) {
        for (;;) {
          const start = pick(rng, [BOS, 'the', 'a', 'dog', 'cat']);
          const { search } = runSearch(start, { ...defaults, width: 3, maxLen: 4 }, false);
          const id = pick(
            rng,
            search.nodes.filter((h) => h.len >= 2).map((h) => h.id),
          );
          if (id === undefined) continue;
          const path: number[] = [];
          for (let h: number | null = id; h !== null && h !== 0; h = search.nodes[h]!.parent)
            path.unshift(h);
          const steps = path.map((h) => {
            const n = search.nodes[h]!;
            const prev = search.nodes[n.parent!]!.token;
            return { text: `P(${n.token} | ${prev}) = ${two(n.p)}`, ln: Math.log(n.p) };
          });
          const value = search.nodes[id]!.score;
          return {
            prompt: `A hypothesis scores the natural log of its probability: the sum of ln P over its words. After **${start}**, ${steps.map((s) => s.text).join(', ')}. What is the score of "${hyp(search, id)}"? Two decimals (within 0.01).`,
            setup: [['greedy', start]] as OpCall[],
            settings: { ...defaults },
            answer: { kind: 'number', value, tolerance: 0.01 },
            explain: `${steps.map((s) => two(s.ln)).join(' + ')} = ${two(value)}. Multiplying the probabilities and taking one log gives the same: ln ${two(Math.exp(value))} = ${two(value)}.`,
            watch: [['search', start]] as OpCall[],
          };
        }
      },
    },
  ];
}
