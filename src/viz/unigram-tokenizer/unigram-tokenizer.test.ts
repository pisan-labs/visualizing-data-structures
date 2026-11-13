import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { CORPUS_TEXT, parseText, type WordCount } from '../_tokenize/text';
import { randomText, unigram } from '.';
import { defaults, readEncodeWord, readText, type UniSettings } from './model';
import {
  cheapestFirst,
  corpusLoss,
  countSplits,
  forward,
  isLetter,
  pieceLosses,
  pruneRound,
  sampleSplit,
  seedVocab,
  toRemove,
  UNK,
  unkLogp,
  viterbi,
  type Vocab,
} from './unigram';

/** Every split of a word into vocabulary pieces (and [UNK] for unknown letters), listed out. */
function allSplits(word: string, v: Vocab, skip?: string): { pieces: string[]; score: number }[] {
  const lp = new Map(v.pieces.filter((p) => p.t !== skip).map((p) => [p.t, p.logp]));
  const known = new Set(v.pieces.map((p) => p.t));
  const unk = unkLogp(v);
  const out: { pieces: string[]; score: number }[] = [];
  const go = (i: number, pieces: string[], score: number) => {
    if (i === word.length) return out.push({ pieces, score });
    for (let j = i + 1; j <= word.length; j++) {
      const t = word.slice(i, j);
      if (lp.has(t)) go(j, [...pieces, t], score + lp.get(t)!);
      else if (j === i + 1 && !known.has(t)) go(j, [...pieces, UNK], score + unk);
    }
  };
  go(0, [], 0);
  return out;
}

const textArb = fc
  .array(
    fc.record({
      word: fc.stringMatching(/^[a-e]{1,6}$/),
      count: fc.integer({ min: 1, max: 6 }),
    }),
    { minLength: 1, maxLength: 6 },
  )
  .map((ws) => ws.map((w) => (w.count > 1 ? `${w.word}*${w.count}` : w.word)).join(' '));
const wordArb = fc.stringMatching(/^[a-f]{1,7}$/);
const settingsArb = fc.record({
  seed: fc.integer({ min: 6, max: 24 }),
  target: fc.integer({ min: 2, max: 20 }),
  split: fc.constantFrom('best' as const, 'sample' as const),
  alpha: fc.constantFrom('1', '0.5', '0.2'),
});

describe('unigram tokenizer', () => {
  it('finds the most probable split, and counts and sums the splits, as listing them does', () => {
    fc.assert(
      fc.property(textArb, wordArb, fc.integer({ min: 2, max: 20 }), (text, word, size) => {
        const v = seedVocab(readText(text) as WordCount[], size);
        const all = allSplits(word, v);
        const top = Math.max(...all.map((s) => s.score));
        const b = viterbi(word, v);
        expect(b.score).toBeCloseTo(top, 9);
        expect(
          b.split
            .map((a) => a.t)
            .join('')
            .replaceAll(UNK, '?').length,
        ).toBe(word.length);
        expect(countSplits(word, v)).toBe(all.length);
        const total = Math.log(all.reduce((t, s) => t + Math.exp(s.score), 0));
        expect(forward(word, v, 1).a.at(-1)).toBeCloseTo(total, 9);
        // A sampled split is one of the splits, scored the same way.
        let k = 0;
        const us = [0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.8];
        const s = sampleSplit(word, v, 0.5, () => us[k++ % us.length]!);
        const listed = all.find((x) => x.pieces.join(' ') === s.split.map((a) => a.t).join(' '));
        expect(listed).toBeDefined();
        expect(s.score).toBeCloseTo(listed!.score, 9);
        for (const d of s.draws) expect(d.chance.reduce((t, c) => t + c, 0)).toBeCloseTo(1, 9);
      }),
      { numRuns: 200 },
    );
  });

  it('prices each piece by the text it explains, and prunes the cheapest', () => {
    fc.assert(
      fc.property(textArb, fc.integer({ min: 3, max: 16 }), (text, size) => {
        const words = readText(text) as WordCount[];
        const v = seedVocab(words, size);
        const best = (w: string, skip?: string) =>
          Math.max(...allSplits(w, v, skip).map((s) => s.score));
        const L = (skip?: string) => words.reduce((t, w) => t - w.count * best(w.word, skip), 0);
        expect(corpusLoss(words, v)).toBeCloseTo(L(), 6);
        const losses = pieceLosses(words, v);
        for (const l of losses) {
          expect(l.loss).toBeCloseTo(L(l.t) - L(), 6);
          expect(l.loss).toBeGreaterThanOrEqual(-1e-9);
        }
        const r = pruneRound(words, v);
        expect(r.removed).toHaveLength(toRemove(losses.length));
        const order = cheapestFirst(losses);
        const worstRemoved = Math.max(...order.slice(0, r.removed.length).map((l) => l.loss));
        for (const l of order.slice(r.removed.length))
          expect(l.loss).toBeGreaterThanOrEqual(worstRemoved - 1e-9);
        // Letters stay, and the probabilities add up to 1 again.
        expect(r.after.pieces.filter(isLetter)).toHaveLength(v.pieces.filter(isLetter).length);
        expect(r.after.pieces.reduce((t, p) => t + Math.exp(p.logp), 0)).toBeCloseTo(1, 9);
      }),
      { numRuns: 100 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(
        textArb,
        fc.array(wordArb, { minLength: 1, maxLength: 3 }),
        settingsArb,
        fc.integer({ min: 1, max: 1000 }),
        (text, encodes, set, seed) => {
          const settings: UniSettings = { ...defaults, ...set };
          const t = new Timeline(unigram, settings, seed, [
            ['load', text],
            ['prune'],
            ...encodes.map((w) => ['encode', w] as [string, string]),
            ['train'],
            ...encodes.map((w) => ['encode', w] as [string, string]),
          ]);
          for (const e of t.entries) {
            for (const step of e.steps) {
              const w = step.extra?.enc;
              if (w) {
                expect(w.vals).toHaveLength(w.word.length);
                // A split shown is a path (all of it, or its end while sampling draws from the
                // end): each piece starts where the last ended.
                let at = w.path.length ? w.arcs[w.path[0]!]!.from : 0;
                for (const k of w.path) {
                  expect(w.arcs[k]!.from).toBe(at);
                  at = w.arcs[k]!.to;
                }
              }
            }
            const s = e.end;
            const total = s.vocab.pieces.reduce((x, p) => x + Math.exp(p.logp), 0);
            expect(total).toBeCloseTo(1, 9);
            if (e.call[0] === 'train')
              expect(s.vocab.pieces.filter((p) => !isLetter(p)).length).toBeLessThanOrEqual(
                settings.target,
              );
            if (e.call[0] === 'encode' && s.encodings.length) {
              const enc = s.encodings.at(-1)!;
              expect(enc.pieces.join('').replaceAll(UNK, '?').length).toBe(enc.word.length);
              if (!enc.sampled) expect(enc.score).toBeCloseTo(viterbi(enc.word, s.vocab).score, 9);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('tells the story the examples tell', () => {
    const words = parseText(CORPUS_TEXT) as WordCount[];
    const v = seedVocab(words, 16);
    expect(v.pieces.filter((p) => !isLetter(p)).map((p) => p.t)).toEqual(
      'the th he at cat ca dog do og sa al alk ed an lk alked'.split(' '),
    );
    expect(v.total).toBe(514);
    const talked = viterbi('talked', v);
    expect(talked.split.map((a) => a.t)).toEqual(['t', 'alked']);
    expect(talked.score.toFixed(2)).toBe('-7.11');
    expect(countSplits('talked', v)).toBe(9);
    expect(viterbi('zebra', v).split.map((a) => a.t)).toEqual([UNK, 'e', 'b', 'r', 'a']);
    const r = pruneRound(words, v);
    expect(r.removed).toEqual(['lk', 'og', 'do', 'ca']);
    let st = v;
    for (let i = 0; i < 3; i++) st = pruneRound(words, st, 8).after;
    expect(st.pieces.filter((p) => !isLetter(p)).map((p) => p.t)).toEqual(
      'the at cat dog sa alk an alked'.split(' '),
    );
    expect(viterbi('walking', st).split.map((a) => a.t)).toEqual('w alk i n g'.split(' '));
    const suf = readText('low*5 lowest*2 newer*6 wider*3 new*2') as WordCount[];
    const r2 = pruneRound(suf, seedVocab(suf, 12));
    expect(r2.removed).toEqual(['ewe', 'ewer', 'newe']);
    expect(viterbi('lower', r2.after).split.map((a) => a.t)).toEqual(['low', 'er']);
  });

  it('reads texts and words, and refuses what does not fit', () => {
    expect(readText('Low*5 lower')).toEqual([
      { word: 'low', count: 5 },
      { word: 'lower', count: 1 },
    ]);
    expect(readText('café')).toBeInstanceOf(Error);
    expect(readText('')).toBeInstanceOf(Error);
    expect(readEncodeWord('Talked')).toBe('talked');
    expect(readEncodeWord('abcdefghijk')).toBeInstanceOf(Error);
    expect(readEncodeWord('two words')).toBeInstanceOf(Error);
    for (const size of [5, 10, 20])
      expect(readText(randomText(makeRng(size), size))).not.toBeInstanceOf(Error);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(unigram, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(unigram, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
