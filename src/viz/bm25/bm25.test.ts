import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { bm25 } from '.';
import { idfOf, parseDocs, tokens, type BmSettings, type SearchDone } from './model';

/** BM25 written independently: no index, every document scanned for every query word. */
function reference(docs: string[][], query: string[], set: BmSettings) {
  const N = docs.length;
  const avg = docs.reduce((t, d) => t + d.length, 0) / N;
  const k1 = Number(set.k1);
  const b = Number(set.b);
  const scores = new Map<number, number>();
  for (const t of query) {
    const n = docs.filter((d) => d.includes(t)).length;
    if (!n) continue;
    const ratio = (N - n + 0.5) / (n + 0.5);
    const w = set.idf === 'rsj' ? Math.log(ratio) : Math.log(1 + ratio);
    docs.forEach((d, i) => {
      const tf = d.filter((x) => x === t).length;
      if (!tf) return;
      const B = 1 - b + (b * d.length) / avg;
      scores.set(i + 1, (scores.get(i + 1) ?? 0) + w * (tf / (tf + k1 * B)));
    });
  }
  return scores;
}

const wordArb = fc.constantFrom(...'the a cat dog sat mat ran on and it bird'.split(' '));
const docArb = fc.array(wordArb, { minLength: 1, maxLength: 8 });
const settingsArb = fc.record({
  k1: fc.constantFrom('0', '0.5', '1.2', '2', '5'),
  b: fc.constantFrom('0', '0.5', '0.75', '1'),
  idf: fc.constantFrom('rsj' as const, 'plus1' as const),
});

describe('bm25', () => {
  it('scores like an independent scan of every document', () => {
    fc.assert(
      fc.property(
        fc.array(docArb, { minLength: 1, maxLength: 6 }),
        fc.array(wordArb, { minLength: 1, maxLength: 4 }),
        settingsArb,
        (docs, query, set) => {
          const t = new Timeline(bm25, set, 1, [
            ['add', docs.map((d) => d.join(' ')).join('; ')],
            ['search', query.join(' ')],
          ]);
          const last = t.endState().last as SearchDone;
          const ref = reference(docs, query, set);
          expect(Object.keys(last.scores).map(Number).sort()).toEqual([...ref.keys()].sort());
          for (const [d, v] of ref) expect(last.scores[d]).toBeCloseTo(v, 12);
          // The top three are the three best, best first, ties to the lower document.
          const want = [...ref]
            .sort((x, y) => y[1] - x[1] || x[0] - y[0])
            .slice(0, 3)
            .map(([d]) => d);
          expect(last.top.map((e) => e.doc)).toEqual(want);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps its invariants on every step', () => {
    fc.assert(
      fc.property(fc.array(docArb, { minLength: 1, maxLength: 6 }), settingsArb, (docs, set) => {
        const t = new Timeline(bm25, set, 1, [
          ['add', docs.map((d) => d.join(' ')).join('; ')],
          ['search', 'cat the'],
        ]);
        for (const e of t.entries)
          for (const step of e.steps) {
            const s = step.state;
            // Every posting points at a document that has the term that many times, in order.
            for (const { term, postings } of s.index) {
              expect(postings.map((p) => p.doc)).toEqual(
                [...postings.map((p) => p.doc)].sort((a, b) => a - b),
              );
              for (const p of postings)
                expect(s.docs[p.doc - 1]!.words.filter((w) => w === term)).toHaveLength(p.tf);
            }
            const total = s.index.reduce((n, t) => n + t.postings.reduce((m, p) => m + p.tf, 0), 0);
            if (e.call[0] === 'search')
              expect(total).toBe(s.docs.reduce((n, d) => n + d.words.length, 0));
            expect(step.extra?.heap?.length ?? 0).toBeLessThanOrEqual(3);
          }
        // The tf share never exceeds 1, so a word never adds more than its IDF.
        const last = t.endState().last as SearchDone;
        const cap = Object.values(last.idf).reduce((n, w) => n + Math.abs(w), 0);
        for (const v of Object.values(last.scores))
          expect(Math.abs(v)).toBeLessThanOrEqual(cap + 1e-12);
      }),
      { numRuns: 100 },
    );
  });

  it('weighs rare words more, and the RSJ form goes negative past half', () => {
    expect(idfOf(6, 1, 'rsj')).toBeCloseTo(Math.log(5.5 / 1.5), 12);
    expect(idfOf(6, 3, 'rsj')).toBe(0);
    expect(idfOf(6, 6, 'rsj')).toBeLessThan(0);
    for (let n = 1; n <= 6; n++) expect(idfOf(6, n, 'plus1')).toBeGreaterThan(0);
    for (let n = 1; n < 6; n++) expect(idfOf(6, n, 'rsj')).toBeGreaterThan(idfOf(6, n + 1, 'rsj'));
  });

  it('reads documents and queries', () => {
    expect(tokens('The cat, sat!')).toEqual(['the', 'cat', 'sat']);
    expect(parseDocs('a b; c')).toEqual([['a', 'b'], ['c']]);
    expect(parseDocs(' ; ')).toBeInstanceOf(Error);
    expect(parseDocs('a b c d e f g h i')).toBeInstanceOf(Error);
    expect(parseDocs('a; b; c; d; e; f; g')).toBeInstanceOf(Error);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(bm25, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(bm25, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
