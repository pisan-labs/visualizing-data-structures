import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { CORPUS } from '../_lm/corpus';
import { randomPrompt, speculative } from '.';
import { defaults, finished, MAX_NEW, readPrompt, readUs, words, type SpecSettings } from './model';
import {
  added,
  chance,
  draftDist,
  draftWords,
  leftover,
  targetDist,
  verifyDrafts,
  type Round,
} from './spec';

/** The models counted again from the corpus, independently of the n-gram page. */
function counts(n: number) {
  const table = new Map<string, Map<string, number>>();
  for (const s of CORPUS) {
    const t = [...Array<string>(n - 1).fill('<s>'), ...s.split(' '), '</s>'];
    for (let i = n - 1; i < t.length; i++) {
      const ctx = t.slice(i - n + 1, i).join(' ');
      const row = table.get(ctx) ?? new Map<string, number>();
      row.set(t[i]!, (row.get(t[i]!) ?? 0) + 1);
      table.set(ctx, row);
    }
  }
  return (prefix: readonly string[]) => {
    const ctx = [...Array<string>(n - 1).fill('<s>'), ...prefix].slice(-(n - 1)).join(' ');
    const row = table.get(ctx);
    if (!row) return null;
    const total = [...row.values()].reduce((a, b) => a + b, 0);
    return new Map([...row].map(([w, c]) => [w, c / total]));
  };
}
const bi = counts(2);
const tri = counts(3);
const ref = (prefix: readonly string[]) => tri(prefix) ?? bi(prefix)!;

/** Plain greedy decoding with the large model alone. */
function greedyText(prompt: string[]): string[] {
  const out = [...prompt];
  for (let i = 0; i < MAX_NEW; i++) {
    const p = ref(out);
    const best = [...p].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]![0];
    out.push(best);
    if (best === '</s>') break;
  }
  return out;
}

const PROMPTS = ['the', 'a', 'the cat', 'the dog', 'the bird sat', 'a dog', 'the fox ran'];
const promptArb = fc.constantFrom(...PROMPTS);
const settingsArb = fc.record({
  k: fc.integer({ min: 1, max: 5 }),
  accept: fc.constantFrom('sample' as const, 'greedy' as const),
});

const roundsOf = (t: Timeline<unknown, SpecSettings, unknown>) => {
  const seen = new Set<Round>();
  const out: Round[] = [];
  for (const e of t.entries)
    for (const st of e.steps.map((x) => x.state as { last?: Round })) {
      if (st.last && !seen.has(st.last)) {
        seen.add(st.last);
        out.push(st.last);
      }
    }
  return out;
};

describe('speculative decoding', () => {
  it('uses the same two models as counting the corpus does', () => {
    for (const p of PROMPTS) {
      const ws = p.split(' ');
      for (const [w, v] of bi(ws)!) expect(chance(draftDist(ws), w)).toBe(v);
      for (const [w, v] of ref(ws)) expect(chance(targetDist(ws), w)).toBe(v);
    }
  });

  it('gives the first word exactly the large model’s distribution (Leviathan et al.)', () => {
    // P(w) = q(w) · min(1, p(w)/q(w)) + P(reject) · leftover(w), which must equal p(w).
    for (const p of PROMPTS) {
      const ws = p.split(' ');
      const q = draftDist(ws);
      const t = targetDist(ws);
      let reject = 0;
      for (const w of q.words)
        reject += chance(q, w) * (1 - Math.min(1, chance(t, w) / chance(q, w)));
      const left = reject > 1e-12 ? leftover(t, q) : null;
      const all = new Set([...q.words, ...t.words]);
      for (const w of all) {
        const qw = chance(q, w);
        const got =
          (qw > 0 ? qw * Math.min(1, chance(t, w) / qw) : 0) +
          reject * (left ? chance(left, w) : 0);
        expect(got).toBeCloseTo(chance(t, w), 12);
      }
    }
  });

  it('with greedy acceptance, writes exactly the large model’s greedy text', () => {
    fc.assert(
      fc.property(promptArb, fc.integer({ min: 1, max: 5 }), (prompt, k) => {
        const t = new Timeline(speculative, { k, accept: 'greedy' }, 1, [
          ['start', prompt],
          ['generate'],
        ]);
        expect(words(t.endState())).toEqual(greedyText(prompt.split(' ')));
      }),
      { numRuns: 40 },
    );
  });

  it('keeps its invariants on every round of random runs', () => {
    fc.assert(
      fc.property(
        promptArb,
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        fc.array(fc.constantFrom('step', 'draft', 'verify', 'generate'), { maxLength: 6 }),
        (prompt, set, seed, more) => {
          const settings: SpecSettings = { ...defaults, ...set };
          const t = new Timeline(speculative, settings, seed, [
            ['start', prompt],
            ...more.map((op) => [op] as [string]),
            ['generate'],
          ]);
          for (const r of roundsOf(t)) {
            expect(r.drafts.length).toBeLessThanOrEqual(settings.k);
            expect(r.accepted).toBeLessThanOrEqual(r.drafts.length);
            expect(added(r).length).toBe(r.accepted + (r.extra === null ? 0 : 1));
            // Every word the round adds is one the large model allows there.
            added(r).forEach((w, i) => {
              expect(ref([...r.prefix, ...added(r).slice(0, i)]).get(w) ?? 0).toBeGreaterThan(0);
            });
            if (r.kind === 'none') expect(r.drafts.at(-1)).toBe('</s>');
          }
          const end = t.endState();
          expect(finished(end)).toBe(true);
          expect(end.out.length).toBeLessThanOrEqual(MAX_NEW);
          expect(end.rounds.reduce((a, b) => a + b, 0)).toBe(end.out.length);
          expect(end.stats.large).toBe(end.rounds.length);
          expect(end.stats.accepted).toBeLessThanOrEqual(end.stats.drafted);
        },
      ),
      { numRuns: 80 },
    );
  });

  it('accepts by u < p/q and stops at the first rejection', () => {
    const prefix = ['the', 'cat'];
    const d = draftWords(prefix, 1, false, () => 0.21);
    expect(d.drafts).toEqual(['</s>']);
    // p(</s> | the cat) = 2/9, q(</s> | cat) = 3/10: p/q = 0.74.
    const keep = verifyDrafts(prefix, d, false, () => 0.7);
    expect(keep.accepted).toBe(1);
    expect(keep.kind).toBe('none');
    let k = 0;
    const us = [0.8, 0.4];
    const drop = verifyDrafts(prefix, d, false, () => us[k++]!);
    expect(drop.accepted).toBe(0);
    expect(drop.extra).toBe('is');
    expect(drop.extraDist!.words[0]).toBe('sat');
  });

  it('tells the story the examples tell', () => {
    const end = (prompt: string, seed: number, settings: Partial<SpecSettings> = {}) =>
      new Timeline(speculative, { ...defaults, ...settings }, seed, [
        ['start', prompt],
        ['generate'],
      ]).endState();
    const g = end('the', 1);
    expect(words(g).join(' ')).toBe('the dog saw the cat sat on the mat </s>');
    expect(g.stats.large).toBe(4);
    expect(g.rounds).toEqual([2, 2, 4, 1]);
    expect(words(end('a', 1, { accept: 'greedy' })).join(' ')).toBe('a bird saw a cat </s>');
    expect(end('the fox', 1, { accept: 'greedy' }).stats.large).toBe(1);
    const bad = end('a bird', 1, { accept: 'greedy' });
    expect(bad.out.length - bad.stats.large).toBe(0);
  });

  it('reads prompts and u values, and refuses what does not fit', () => {
    expect(readPrompt('The cat')).toEqual(['the', 'cat']);
    expect(readPrompt('the zebra')).toBeInstanceOf(Error);
    expect(readPrompt('the cat sat on the')).toBeInstanceOf(Error);
    expect(readUs('0.3 .9, 0')).toEqual([0.3, 0.9, 0]);
    expect(readUs('1')).toBeInstanceOf(Error);
    expect(readUs('0.1 0.2 0.3 0.4 0.5 0.6 0.7')).toBeInstanceOf(Error);
    for (let i = 1; i <= 3; i++)
      expect(readPrompt(randomPrompt(makeRng(i), i))).not.toBeInstanceOf(Error);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(speculative, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(speculative, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
