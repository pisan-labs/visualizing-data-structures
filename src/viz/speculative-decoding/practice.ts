import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import { defaults, words, type SpecExtra, type SpecSettings, type SpecState } from './model';
import { added, chance, leftover, targetDist, verifyDrafts } from './spec';

type Def = VizDef<SpecState, SpecSettings, SpecExtra>;

const PROMPTS = [
  'the',
  'a',
  'the cat',
  'the dog',
  'the bird',
  'the fox',
  'a dog',
  'the cat sat',
  'the dog ran',
  'the dog saw',
];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const list = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
/** A u with two decimals, from the seeded RNG. */
const uOf = (rng: Rng) => rng.int(1, 99) / 100;

/**
 * Practice on one round. The picture shows the drafts after Draft (with q); the prompt gives the
 * large model's numbers, which Verify would compute. Every answer comes from running the model.
 */
export function speculativePractice(def: () => Def): PracticeKind[] {
  function drafted(rng: Rng, settings: SpecSettings) {
    const ops: OpCall[] = [['start', pick(rng, PROMPTS)], ['draft']];
    const s = new Timeline(def(), settings, 1, ops).endState();
    const d = s.pending!;
    const prefix = words(s);
    const ps = d.drafts.map((_, i) => targetDist([...prefix, ...d.drafts.slice(0, i)]));
    return { ops, s, d, prefix, ps };
  }
  const sample = (k: number): SpecSettings => ({ ...defaults, k, accept: 'sample' });

  return [
    {
      id: 'accepted',
      title: 'How many drafts are accepted?',
      make(rng) {
        for (;;) {
          const settings = sample(rng.int(2, 4));
          const { ops, d, prefix, ps } = drafted(rng, settings);
          if (d.drafts.length < 2) continue;
          const ratios = d.drafts.map((x, i) => chance(ps[i]!, x) / chance(d.qs[i]!, x));
          const us = d.drafts.map(() => uOf(rng));
          // No u right at its ratio, so the answer does not hang on rounding.
          if (us.some((u, i) => Math.abs(u - ratios[i]!) < 0.03)) continue;
          let k = 0;
          const r = verifyDrafts(prefix, d, false, () => us[k++] ?? 0.5);
          const rows = d.drafts.map(
            (x, i) =>
              `${x}: q = ${two(chance(d.qs[i]!, x))}, p = ${two(chance(ps[i]!, x))}, u = ${two(us[i]!)}`,
          );
          return {
            prompt: `The small model drafted ${d.drafts.join(' ')}. The large model's pass gives, in order: ${rows.join('; ')}. A draft is accepted when u < p/q, and checking stops at the first one rejected. How many drafts are accepted?`,
            setup: ops,
            settings,
            answer: { kind: 'number', value: r.accepted },
            explain: `${d.drafts
              .slice(0, Math.min(d.drafts.length, r.accepted + 1))
              .map(
                (x, i) =>
                  `${x}: p/q = ${two(ratios[i]!)}, u = ${two(us[i]!)}, ${i < r.accepted ? 'accept' : 'reject'}`,
              )
              .join(
                '; ',
              )}. ${r.accepted < d.drafts.length ? 'The drafts after a rejection are thrown away, even if they would have passed.' : 'All of them pass.'}`,
            watch: [['check', us.join(' ')]],
          };
        }
      },
    },
    {
      id: 'chance',
      title: 'The chance of acceptance',
      make(rng) {
        for (let tries = 0; ; tries++) {
          const settings = sample(rng.int(1, 3));
          const { ops, d, ps } = drafted(rng, settings);
          const x = d.drafts[0]!;
          const p = chance(ps[0]!, x);
          const q = chance(d.qs[0]!, x);
          // Mostly drafts the large model likes less, where the chance is below 1.
          if (p >= q && tries < 8) continue;
          const a = Math.min(1, p / q);
          return {
            prompt: `The small model drafted **${x}** first, with q(${x}) = ${two(q)}. The large model gives it p(${x}) = ${two(p)}. What is the chance it is accepted? Two decimals.`,
            setup: ops,
            settings,
            answer: { kind: 'number', value: a, tolerance: 0.005 },
            explain:
              p >= q
                ? `p ≥ q: the large model likes ${x} at least as much as the small one, so it is always accepted. min(1, ${two(p)}/${two(q)}) = 1.`
                : `min(1, p/q) = ${two(p)}/${two(q)} = ${two(a)}. The small model was too keen on ${x}; accepting it only that often trims its share back to what the large model gives it.`,
            watch: [['verify']],
          };
        }
      },
    },
    {
      id: 'leftover',
      title: 'Resampling after a rejection',
      make(rng) {
        for (;;) {
          const settings = sample(rng.int(1, 3));
          const { ops, d, ps } = drafted(rng, settings);
          const x = d.drafts[0]!;
          const p = ps[0]!;
          const q = d.qs[0]!;
          if (chance(p, x) / chance(q, x) >= 0.99) continue;
          const left = leftover(p, q);
          if (left.words.length < 2) continue;
          const w = pick(rng, left.words);
          const pq = p.words.map((v) => `${v} ${two(chance(p, v))}/${two(chance(q, v))}`);
          return {
            prompt: `The first draft, **${x}**, is rejected. The next word is drawn from norm(max(0, p − q)). Here p/q for each word the large model allows: ${pq.join(', ')}. What probability does the draw give **${w}**? Two decimals.`,
            setup: ops,
            settings,
            answer: { kind: 'number', value: chance(left, w), tolerance: 0.005 },
            explain: `max(0, p − q) keeps ${list(left.words.map((v) => `${v} ${two(chance(p, v) - chance(q, v))}`))}; everything else is 0. Divide by their total to make them add up to 1: ${w} gets ${two(chance(left, w))}.`,
            watch: [['check', '0.99 0.5']],
          };
        }
      },
    },
    {
      id: 'saved',
      title: 'Passes saved in a round',
      make(rng) {
        for (;;) {
          const settings: SpecSettings = { ...defaults, k: rng.int(2, 4), accept: 'greedy' };
          const { ops, d, prefix } = drafted(rng, settings);
          const r = verifyDrafts(prefix, d, true, () => 0);
          const tops = r.ps.map((p) => p.words[0]!);
          const gain = added(r).length - 1;
          const after = r.ps.length > d.drafts.length;
          return {
            prompt: `Greedy acceptance. The small model drafted ${d.drafts.join(' ')}. In one pass, the large model's top words at those positions are ${tops.slice(0, d.drafts.length).join(', ')}${after ? `, and ${tops.at(-1)} after the last draft` : ''}. How many large-model passes does this round save, against plain decoding with one pass per word?`,
            setup: ops,
            settings,
            answer: { kind: 'number', value: gain },
            explain: `${r.accepted} draft${r.accepted === 1 ? '' : 's'} match${r.accepted === 1 ? 'es' : ''} the large model's top word${r.extra === null ? '' : `, and the round adds ${r.extra} too`}: ${added(r).length} word${added(r).length === 1 ? '' : 's'} (${added(r).join(' ')}) for 1 pass, where plain decoding needs ${added(r).length}. Saved ${gain}.`,
            watch: [['verify']],
          };
        }
      },
    },
  ];
}
