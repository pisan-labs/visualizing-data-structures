import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { tokenTotal } from '../_tokenize/pieces';
import { CORPUS_TEXT, parseInput, parseText, readWord } from '../_tokenize/text';
import { bpe } from '.';
import {
  bytesOf,
  defaults,
  encodeWord,
  learn,
  loadState,
  longestFirst,
  show,
  splitWord,
  type BpeSettings,
  type BpeState,
} from './model';

/**
 * BPE written independently of the page, the way Sennrich et al.'s reference code does it: each
 * word a string of symbols separated by spaces, a merge a regular expression.
 */
function reference(text: string, k: number, set: BpeSettings): string[] {
  const words = parseText(text) as { word: string; count: number }[];
  let vocab = words.map(({ word, count }) => [splitWord(word, set).join(' '), count] as const);
  const merges: string[] = [];
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&');
  for (let i = 0; i < k; i++) {
    const pairs = new Map<string, number>();
    for (const [w, c] of vocab) {
      const s = w.split(' ');
      for (let j = 0; j + 1 < s.length; j++) {
        const key = `${s[j]} ${s[j + 1]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + c);
      }
    }
    if (pairs.size === 0) break;
    const top = Math.max(...pairs.values());
    const tied = [...pairs].filter(([, c]) => c === top).map(([p]) => p);
    const best =
      set.tie === 'alpha'
        ? tied.sort((p, q) => {
            const [a1, b1] = p.split(' ');
            const [a2, b2] = q.split(' ');
            return a1! < a2! ? -1 : a1! > a2! ? 1 : b1! < b2! ? -1 : b1! > b2! ? 1 : 0;
          })[0]!
        : tied[0]!;
    merges.push(best);
    const [a, b] = best.split(' ');
    const re = new RegExp(`(?<!\\S)${esc(a!)} ${esc(b!)}(?!\\S)`, 'g');
    vocab = vocab.map(([w, c]) => [w.replace(re, a! + b!), c] as const);
  }
  return merges;
}

const corpusWord = fc.constantFrom(
  ...'the cat sat on mat dog rug saw ran and walked walking talked is a banana aaaa café été'.split(
    ' ',
  ),
);
const textArb = fc
  .array(fc.tuple(corpusWord, fc.integer({ min: 1, max: 6 })), { minLength: 1, maxLength: 8 })
  .map((ws) => ws.map(([w, c]) => (c > 1 ? `${w}*${c}` : w)).join(' '));
const settingsArb = fc.record({
  merges: fc.integer({ min: 1, max: 30 }),
  eow: fc.boolean(),
  tie: fc.constantFrom('first' as const, 'alpha' as const),
  base: fc.constantFrom('chars' as const, 'bytes' as const),
});

const spell = (ps: readonly { t: string }[]) => ps.map((p) => p.t).join('');

describe('bpe-tokenizer', () => {
  it('learns the same merges as an independent reference', () => {
    fc.assert(
      fc.property(textArb, settingsArb, (text, set) => {
        const s = learn(loadState(text, set) as BpeState, set.merges, set.tie);
        expect(s.merges.map((m) => `${m.a} ${m.b}`)).toEqual(reference(text, set.merges, set));
      }),
      { numRuns: 300 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(textArb, settingsArb, corpusWord, (text, set, word) => {
        const t = new Timeline(bpe, set, 1, [
          ['load', text],
          ['train'],
          ['merge'],
          ['encode', word],
        ]);
        let lastTokens = Infinity;
        for (const e of t.entries)
          for (const step of e.steps) {
            const s = step.state;
            // Every word's tokens still spell the word.
            for (const r of s.rows) expect(spell(r.pieces)).toBe(splitWord(r.word, set).join(''));
            // Piece ids are unique, so the drawing can follow them.
            const ids = s.rows.flatMap((r) => r.pieces.map((p) => p.id));
            expect(new Set(ids).size).toBe(ids.length);
            if (e.call[0] !== 'load' && step.extra?.enc === undefined && e.call[0] !== 'train') {
              expect(tokenTotal(s.rows)).toBeLessThanOrEqual(lastTokens);
              lastTokens = tokenTotal(s.rows);
            }
          }
        const end = t.endState();
        // A merge never occurs more often than the one before it.
        end.merges.forEach((m, i) => {
          if (i > 0) expect(m.count).toBeLessThanOrEqual(end.merges[i - 1]!.count);
          expect(m.ab).toBe(m.a + m.b);
        });
        expect(t.at(t.length - 1).step.vars?.vocabulary).toBe(
          (set.base === 'bytes' ? 256 + (set.eow ? 1 : 0) : end.base.length) +
            new Set(end.merges.map((m) => m.ab)).size,
        );
        // Encoding a word of the training text gives back its training tokens.
        for (const r of end.rows)
          expect(encodeWord(end, set, r.word).map((p) => p.t)).toEqual(r.pieces.map((p) => p.t));
        const enc = end.encodings.at(-1)!;
        expect(enc.word).toBe(word);
        if (!enc.pieces.some((p) => p.t === '[UNK]'))
          expect(spell(enc.pieces)).toBe(splitWord(word, set).join(''));
      }),
      { numRuns: 120 },
    );
  });

  it('tells the story the examples tell', () => {
    const run = (text: string, k: number, set: Partial<BpeSettings> = {}) => {
      const s = { ...defaults, ...set } as BpeSettings;
      return learn(loadState(text, s) as BpeState, k, s.tie);
    };
    const toy = run(CORPUS_TEXT, 20);
    expect(toy.rows).toHaveLength(29);
    expect(toy.rows.reduce((n, r) => n + r.count, 0)).toBe(99);
    expect(toy.merges.slice(0, 3).map((m) => `${m.a}+${m.b} ${m.count}`)).toEqual([
      'e+_ 32',
      't+h 29',
      'th+e_ 29',
    ]);
    const enc = (s: BpeState, w: string, set: Partial<BpeSettings> = {}) =>
      encodeWord(s, { ...defaults, ...set } as BpeSettings, w)
        .map((p) => show(p.t))
        .join(' ');
    expect(enc(toy, 'walked')).toBe('w alked_');
    expect(enc(toy, 'walking')).toBe('w alk i n g_');
    expect(enc(toy, 'jumped')).toBe('[UNK] u m p ed_');
    expect(tokenTotal((loadState(CORPUS_TEXT, defaults) as BpeState).rows)).toBe(420);
    expect(tokenTotal(toy.rows)).toBe(193);

    const suf = run('low*5 lowest*2 newer*6 wider*3 new*2', 10);
    expect(suf.merges.slice(0, 2).map((m) => `${m.a}+${m.b} ${m.count}`)).toEqual([
      'e+r 9',
      'er+_ 9',
    ]);
    expect(enc(suf, 'lower')).toBe('low er_');
    expect(enc(suf, 'newest')).toBe('new e s t _');

    const tie = run(CORPUS_TEXT, 3, { tie: 'alpha' });
    expect(tie.merges.map((m) => m.ab)).toEqual(['e_', 'he_', 'the_']);
    expect(enc(tie, 'that', { tie: 'alpha' })).toBe('t h a t _');
    expect(enc(run(CORPUS_TEXT, 3), 'that')).toBe('th a t _');

    const order = run('newer*6 wider*3 the*4 he*2', 8);
    expect(enc(order, 'her')).toBe('h er_');
    expect(longestFirst(order, defaults, 'her').join(' ')).toBe('he r _');

    const bytes = run('café*3 thé*2 été*2 bébé crème*2 tête', 10, { base: 'bytes' });
    expect(
      `${show(bytes.merges[0]!.a)} ${show(bytes.merges[0]!.b)} ${bytes.merges[0]!.count}`,
    ).toBe('‹C3› ‹A9› 11');
    expect(enc(bytes, 'bébé', { base: 'bytes' })).toBe('b é b é_');
    expect(enc(bytes, 'fête', { base: 'bytes' })).toBe('f ‹C3› ‹AA› t e_');

    const plain = run(CORPUS_TEXT, 20, { eow: false });
    expect(plain.merges[2]!.ab).toBe('at');
    expect(plain.merges[2]!.count).toBe(17);
    expect(enc(plain, 'ate', { eow: false })).toBe('at e');
    expect(enc(plain, 'atone', { eow: false })).toBe('at on e');
    expect(enc(toy, 'ate')).toBe('a t e_');

    const aaaa = run('aaaa*3', 20);
    expect(aaaa.merges.map((m) => `${m.a}+${m.b} ${m.count}`)).toEqual([
      'a+a 9',
      'aa+aa 3',
      'aaaa+_ 3',
    ]);
    const a3 = loadState('aaaa*3', defaults) as BpeState;
    expect(tokenTotal(a3.rows)).toBe(15);
    expect(tokenTotal(learn(a3, 1, 'first').rows)).toBe(9);
    const a6 = loadState('aaaaaa', defaults) as BpeState;
    expect(learn(a6, 1, 'first').merges[0]!.count).toBe(5);
    expect(tokenTotal(a6.rows) - tokenTotal(learn(a6, 1, 'first').rows)).toBe(3);
    expect(enc(toy, 'talks')).toBe('t alk s _');
    expect(toy.base).toHaveLength(22);
  });

  it('reads texts and words, and refuses what does not fit', () => {
    expect(parseText('Low low, LOWER*2')).toEqual([
      { word: 'low', count: 2 },
      { word: 'lower', count: 2 },
    ]);
    expect(parseText('')).toBeInstanceOf(Error);
    expect(parseText('cat 42')).toBeInstanceOf(Error);
    expect(parseText('cat*0')).toBeInstanceOf(Error);
    expect(parseText('cat*100')).toBeInstanceOf(Error);
    expect(parseText('abcdefghijklm')).toBeInstanceOf(Error);
    const many = Array.from(
      { length: 31 },
      (_, i) => `w${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${'xy'[Math.floor(i / 26)]}`,
    );
    expect(parseText(many.join(' '))).toBeInstanceOf(Error);
    expect(parseText(many.slice(1).join(' '))).not.toBeInstanceOf(Error);
    expect(parseText('café')).toEqual([{ word: 'café', count: 1 }]);
    expect(readWord('Walking')).toBe('walking');
    expect(readWord('the cat')).toBeInstanceOf(Error);
    expect(parseInput('the CAT*2')).toBe('the cat*2');
    expect(bytesOf('café')).toEqual(['c', 'a', 'f', '<C3>', '<A9>']);
    expect(show('<C3><A9>t<C3>')).toBe('ét‹C3›');
    expect(show('<F0><9F>')).toBe('‹F0›‹9F›');
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(bpe, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bpe, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
