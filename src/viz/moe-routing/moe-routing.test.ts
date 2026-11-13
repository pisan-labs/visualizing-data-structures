import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { embed } from '../_lm/vocab';
import { moeRouting, randomSentence } from '.';
import { capacity, E, parseTokens, route, topIndices, W_R, type MoeSettings } from './model';

/** Routing written independently of the page: sorts instead of repeated maxima, exp of raw scores. */
function reference(x: number[][], set: MoeSettings) {
  const T = x.length;
  const k = Number(set.k);
  const logits = x.map((row) =>
    [0, 1, 2, 3].map((e) => row.reduce((s, v, f) => s + v * W_R[f]![e]!, 0)),
  );
  const p = logits.map((row) => {
    const ex = row.map(Math.exp);
    const z = ex.reduce((s, v) => s + v, 0);
    return ex.map((v) => v / z);
  });
  const cap = Math.ceil((Number(set.cf) * k * T) / E);
  const kept = new Map<string, number>();
  const asked = Array<number>(E).fill(0);
  if (set.routing === 'token') {
    const order = logits.map((row) =>
      [0, 1, 2, 3].sort((a, b) => row[b]! - row[a]! || a - b).slice(0, k),
    );
    const fill = Array<number>(E).fill(0);
    for (let r = 0; r < k; r++)
      for (let t = 0; t < T; t++) {
        const e = order[t]![r]!;
        asked[e]!++;
        if (fill[e]! < cap) {
          fill[e]!++;
          const chosen = order[t]!.map((c) => Math.exp(logits[t]![c]!));
          kept.set(`${t}-${e}`, chosen[r]! / chosen.reduce((s, v) => s + v, 0));
        }
      }
  } else {
    for (let e = 0; e < E; e++) {
      const ranked = Array.from({ length: T }, (_, t) => t).sort(
        (a, b) => p[b]![e]! - p[a]![e]! || a - b,
      );
      for (const t of ranked.slice(0, cap)) kept.set(`${t}-${e}`, p[t]![e]!);
      asked[e] = cap;
    }
  }
  const total = asked.reduce((s, v) => s + v, 0);
  const loss =
    E * asked.reduce((s, c, e) => s + (c / total) * (p.reduce((q, row) => q + row[e]!, 0) / T), 0);
  return { kept, loss, cap };
}

const wordArb = fc.constantFrom(
  ...'the a cat dog fox bird sat ran saw on under mat ball box it and zorp'.split(' '),
);
const sentenceArb = fc.array(wordArb, { minLength: 1, maxLength: 8 }).map((w) => w.join(' '));
const settingsArb: fc.Arbitrary<MoeSettings> = fc.record({
  k: fc.constantFrom('1' as const, '2' as const),
  cf: fc.constantFrom('1' as const, '1.25' as const, '1.5' as const, '2' as const),
  routing: fc.constantFrom('token' as const, 'expert' as const),
});

describe('moe-routing', () => {
  it('matches an independent reference on random sentences and settings', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, (text, set) => {
        const x = (parseTokens(text) as string[]).map(embed);
        const r = route(x, set);
        const ref = reference(x, set);
        expect(r.cap).toBe(ref.cap);
        const kept = r.assignments.filter((a) => a.kept);
        expect(kept.length).toBe(ref.kept.size);
        for (const a of kept)
          expect(a.weight).toBeCloseTo(ref.kept.get(`${a.token}-${a.expert}`)!, 9);
        expect(r.loss).toBeCloseTo(ref.loss, 9);
      }),
      { numRuns: 300 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, (text, set) => {
        const t = new Timeline(moeRouting, set, 1, [['load', text], ['route']]);
        let placed = 0;
        for (const e of t.entries)
          for (const step of e.steps) {
            const w = step.extra?.work;
            if (!w) continue;
            // Dispatch only moves forward.
            expect(w.placed).toBeGreaterThanOrEqual(placed);
            placed = w.placed;
          }
        const end = t.endState();
        const r = end.result!;
        const T = end.words.length;
        const k = Number(set.k);
        // No expert ever takes more than its capacity.
        for (let e = 0; e < E; e++)
          expect(r.assignments.filter((a) => a.expert === e && a.kept).length).toBeLessThanOrEqual(
            r.cap,
          );
        if (set.routing === 'token') {
          expect(r.assignments).toHaveLength(k * T);
          for (let tok = 0; tok < T; tok++) {
            const mine = r.assignments.filter((a) => a.token === tok);
            expect(mine).toHaveLength(k);
            expect(mine.reduce((s, a) => s + a.weight, 0)).toBeCloseTo(1, 12);
          }
          // A drop happens only when the expert is already full.
          for (const a of r.assignments.filter((q) => !q.kept))
            expect(a.slot).toBeGreaterThanOrEqual(r.cap);
        } else {
          // Expert choice: every expert exactly full, so the load is even and the loss is 1.
          for (let e = 0; e < E; e++)
            expect(r.assignments.filter((a) => a.expert === e)).toHaveLength(r.cap);
          expect(r.dropped).toBe(0);
          expect(r.loss).toBeCloseTo(1, 12);
        }
        expect(r.loss).toBeLessThanOrEqual(E + 1e-9);
        expect(r.f.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
        expect(r.P.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
        expect(t.at(t.length - 1).step.vars?.capacity).toBe(capacity(T, set));
      }),
      { numRuns: 150 },
    );
  });

  it('breaks ties toward the lower index', () => {
    expect(topIndices([1, 3, 3, 2], 2)).toEqual([1, 2]);
    expect(topIndices([0, 0, 0], 2)).toEqual([0, 1]);
    expect(topIndices([1, 2], 5)).toEqual([1, 0]);
  });

  it('tells the story the examples tell', () => {
    const run = (text: string, set: MoeSettings) => route(text.split(' ').map(embed), set);
    const small = run('the cat and the dog and the fox', { k: '2', cf: '1', routing: 'token' });
    expect(small.cap).toBe(4);
    expect(small.wanted).toEqual([3, 5, 3, 5]);
    expect(small.orphans).toEqual([6]);
    expect(
      run('the cat and the dog and the fox', { k: '2', cf: '2', routing: 'token' }).dropped,
    ).toBe(0);
    const collapse = run('cat dog fox bird cat dog', { k: '1', cf: '1.25', routing: 'token' });
    expect(collapse.orphans).toHaveLength(4);
    expect(collapse.loss).toBeGreaterThan(2.4);
    const tight = run('the cat and the dog and the fox', { k: '1', cf: '1', routing: 'expert' });
    expect(tight.orphans).toEqual([6]);
    for (let size = 1; size <= 8; size++)
      expect((parseTokens(randomSentence(makeRng(size), size)) as string[]).length).toBe(size);
  });

  it('parses sentences and refuses what does not fit', () => {
    expect(parseTokens('The cat, sat!')).toEqual(['the', 'cat', 'sat']);
    expect(parseTokens('')).toBeInstanceOf(Error);
    expect(parseTokens('a b c d e f g h i')).toBeInstanceOf(Error);
    expect(parseTokens('the elephant')).toBeInstanceOf(Error);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(moeRouting, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(moeRouting, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
