import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { CORPUS_TEXT, parseText } from '../_tokenize/text';
import { wordpiece } from '.';
import {
  buildTries,
  CONT,
  defaults,
  encodeWord,
  join,
  learn,
  loadState,
  score3,
  splitWord,
  UNK,
  vocabulary,
  type WpSettings,
  type WpState,
} from './model';

/** WordPiece training written independently: words as arrays, scores as exact fractions. */
function reference(text: string, k: number): string[] {
  let words = (parseText(text) as { word: string; count: number }[]).map(({ word, count }) => ({
    p: [...word].map((c, i) => (i ? `##${c}` : c)),
    count,
  }));
  const out: string[] = [];
  for (let r = 0; r < k; r++) {
    const pc = new Map<string, number>();
    const order: string[] = [];
    const pair = new Map<string, number>();
    for (const w of words) {
      for (const t of w.p) pc.set(t, (pc.get(t) ?? 0) + w.count);
      for (let i = 0; i + 1 < w.p.length; i++) {
        const key = `${w.p[i]} ${w.p[i + 1]}`;
        if (!pair.has(key)) order.push(key);
        pair.set(key, (pair.get(key) ?? 0) + w.count);
      }
    }
    if (order.length === 0) break;
    // Compare count1 / (a1 b1) with count2 / (a2 b2) by cross-multiplying: no rounding at all.
    let best = order[0]!;
    const frac = (key: string) => {
      const [a, b] = key.split(' ');
      return [pair.get(key)!, pc.get(a!)! * pc.get(b!)!] as const;
    };
    for (const key of order) {
      const [n1, d1] = frac(key);
      const [n2, d2] = frac(best);
      if (n1 * d2 > n2 * d1) best = key;
    }
    out.push(best);
    const [a, b] = best.split(' ') as [string, string];
    const ab = a + b.replace(/^##/, '');
    words = words.map((w) => {
      const p: string[] = [];
      for (let i = 0; i < w.p.length; i++) {
        if (i + 1 < w.p.length && w.p[i] === a && w.p[i + 1] === b) {
          p.push(ab);
          i++;
        } else p.push(w.p[i]!);
      }
      return { ...w, p };
    });
  }
  return out;
}

/** Greedy longest match by brute force over every split, for a check on the trie walk. */
function greedy(vocab: Set<string>, word: string): string[] {
  const c = [...word];
  const out: string[] = [];
  let i = 0;
  while (i < c.length) {
    let best = -1;
    for (let j = i + 1; j <= c.length; j++)
      if (vocab.has((i ? CONT : '') + c.slice(i, j).join(''))) best = j;
    if (best < 0) return [UNK];
    out.push((i ? CONT : '') + c.slice(i, best).join(''));
    i = best;
  }
  return out;
}

const wordArb = fc.constantFrom(
  ...'the cat sat on mat dog walked walking talked is a banana unable under undo able rabbit jump boat boxes café'.split(' '),
);
const textArb = fc
  .array(fc.tuple(wordArb, fc.integer({ min: 1, max: 6 })), { minLength: 1, maxLength: 8 })
  .map((ws) => ws.map(([w, c]) => (c > 1 ? `${w}*${c}` : w)).join(' '));
const settingsArb = fc.record({
  merges: fc.integer({ min: 1, max: 30 }),
  maxLen: fc.integer({ min: 3, max: 12 }),
  trie: fc.boolean(),
});

describe('wordpiece', () => {
  it('learns the same merges as an independent reference', () => {
    fc.assert(
      fc.property(textArb, fc.integer({ min: 1, max: 30 }), (text, k) => {
        const s = learn(loadState(text) as WpState, k);
        expect(s.merges.map((m) => `${m.a} ${m.b}`)).toEqual(reference(text, k));
      }),
      { numRuns: 300 },
    );
  });

  it('keeps its invariants on every step, and the trie walk and the loop agree', () => {
    fc.assert(
      fc.property(textArb, settingsArb, wordArb, (text, set: WpSettings, word) => {
        const t = new Timeline(wordpiece, set, 1, [['load', text], ['train'], ['merge'], ['encode', word]]);
        for (const e of t.entries)
          for (const step of e.steps)
            for (const r of step.state.rows) {
              // Pieces spell the word: the first as it is, the others after their ##.
              expect(r.pieces[0]!.t.startsWith(CONT)).toBe(false);
              for (const p of r.pieces.slice(1)) expect(p.t.startsWith(CONT)).toBe(true);
              expect(r.pieces.map((p) => p.t.replace(/^##/, '')).join('')).toBe(r.word);
            }
        const end = t.endState();
        const vocab = new Set(vocabulary(end));
        for (const m of end.merges) expect(vocab.has(join(m.a, m.b))).toBe(true);
        const got = end.encodings.at(-1)!.pieces;
        const want = [...word].length > set.maxLen ? [UNK] : greedy(vocab, word);
        expect(got).toEqual(want);
        expect(encodeWord(end, set, word)).toEqual(want);
        // The other way of finding the piece gives the same answer.
        const other = new Timeline(wordpiece, { ...set, trie: !set.trie }, 1, t.calls);
        expect(other.endState().encodings.at(-1)!.pieces).toEqual(want);
        // A word of the training text can always be encoded (its letters are in the vocabulary).
        for (const r of end.rows)
          if ([...r.word].length <= set.maxLen)
            expect(encodeWord(end, set, r.word)[0]).not.toBe(UNK);
      }),
      { numRuns: 120 },
    );
  });

  it('builds tries that hold exactly the vocabulary', () => {
    const s = learn(loadState(CORPUS_TEXT) as WpState, 20);
    const t = buildTries(vocabulary(s));
    const spelled: string[] = [];
    const walk = (u: number, prefix: string) => {
      const n = t.nodes[u]!;
      if (n.piece !== null) {
        expect(n.piece).toBe(prefix);
        spelled.push(prefix);
      }
      for (const k of n.kids) walk(k, prefix + t.nodes[k]!.ch);
    };
    walk(t.start, '');
    walk(t.inner, CONT);
    expect(spelled.sort()).toEqual(vocabulary(s).sort());
  });

  it('tells the story the examples tell', () => {
    const toy = learn(loadState(CORPUS_TEXT) as WpState, 20);
    expect(toy.alphabet).toHaveLength(30);
    expect(vocabulary(toy)).toHaveLength(50);
    const first = toy.merges[0]!;
    expect(`${first.a} ${first.b} ${first.count}/${first.ca}·${first.cb}`).toBe('r ##u 2/5·2');
    const enc = (s: WpState, w: string, set: Partial<WpSettings> = {}) =>
      encodeWord(s, { ...defaults, ...set }, w).join(' ');
    expect(enc(toy, 'walking')).toBe('w ##a ##lkin ##g');
    expect(enc(toy, 'birds')).toBe('bird ##s');
    expect(enc(toy, 'the')).toBe('t ##h ##e');
    expect(enc(toy, 'bird')).toBe('bird');
    expect(enc(toy, 'rabbit')).toBe(UNK);
    expect(enc(toy, 'jump')).toBe(UNK);
    expect(enc(toy, 'boat')).toBe('b ##o ##a ##t');
    expect(enc(toy, 'walking', { maxLen: 6 })).toBe(UNK);
    expect(enc(toy, 'walked', { maxLen: 6 })).toBe('w ##a ##lk ##e ##d');

    const hug = learn(loadState('the*12 then*2 hug*3 pug*2 hugs') as WpState, 5);
    expect(hug.merges.map((m) => m.ab)).toEqual(['hu', 'pu', 'hug', 'pug', 'hugs']);
    expect(enc(hug, 'the')).toBe('t ##h ##e');
    expect(score3(4 / (4 * 6))).toBe('.167');
    expect(score3(14 / (14 * 14))).toBe('.071');

    const suf = learn(loadState('low*5 lowest*2 newer*6 wider*3 new*2') as WpState, 10);
    expect(suf.merges[0]!.ab).toBe('##st');
    expect(enc(suf, 'lower')).toBe('low ##er');
    expect(enc(suf, 'widest')).toBe('wid ##est');

    // The walks the examples narrate: trie steps and lookups for walking.
    const tl = (trie: boolean) => {
      const t = new Timeline(wordpiece, { ...defaults, trie }, 1, [['train'], ['encode', 'walking']]);
      return t.at(t.length - 1).step.vars;
    };
    expect(tl(true)?.['trie steps']).toBe(10);
    expect(tl(false)?.lookups).toBe(16);
  });

  it('splits words with ##', () => {
    expect(splitWord('walk')).toEqual(['w', '##a', '##l', '##k']);
    expect(join('w', '##a')).toBe('wa');
    expect(join('##l', '##k')).toBe('##lk');
    expect(score3(0.0266)).toBe('.027');
    expect(score3(1)).toBe('1.000');
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(wordpiece, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(wordpiece, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
