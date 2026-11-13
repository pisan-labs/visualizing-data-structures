import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { embeddings } from '.';
import { WORDS, weaker, type EmbSettings, type Kept, type Pair, type Search } from './model';

const NAMES = WORDS.map((w) => w.w);

/** Nearest neighbours written independently of the page: score everything, sort, cut. */
function reference(
  target: readonly number[],
  set: EmbSettings,
  leaveOut: readonly string[],
): { w: string; s: number }[] {
  const vec = (v: readonly number[]) => {
    if (!set.normalize) return v;
    const n = Math.hypot(v[0]!, v[1]!);
    return v.map((x) => x / n);
  };
  const score = (a: readonly number[], b: readonly number[]) => {
    const d = a[0]! * b[0]! + a[1]! * b[1]!;
    return set.measure === 'dot' ? d : d / (Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!));
  };
  return WORDS.map((w, i) => ({ w: w.w, s: score(target, vec(w.v)), i }))
    .filter((x) => !leaveOut.includes(x.w))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, set.k)
    .map(({ w, s }) => ({ w, s }));
}

const wordArb = fc.constantFrom(...NAMES);
const settingsArb = fc.record({
  measure: fc.constantFrom('cosine' as const, 'dot' as const),
  normalize: fc.boolean(),
  k: fc.integer({ min: 1, max: 5 }),
});

/** Every parent in the heap is no stronger than its children: the weakest sits on top. */
function isHeap(h: readonly Kept[]): boolean {
  return h.every((e, p) => p === 0 || !weaker(e, h[(p - 1) >> 1]!));
}

describe('embeddings', () => {
  it('finds the same neighbours as sorting every score', () => {
    fc.assert(
      fc.property(wordArb, settingsArb, (w, set) => {
        const t = new Timeline(embeddings, set, 1, [['nearest', w]]);
        const q = t.endState().query as Search;
        const v = WORDS.find((x) => x.w === w)!.v;
        const target = set.normalize ? v.map((x) => x / Math.hypot(v[0], v[1])) : v;
        const ref = reference(target, set, [w]);
        expect(q.top.map((e) => NAMES[e.i])).toEqual(ref.map((r) => r.w));
        q.top.forEach((e, j) => expect(e.s).toBeCloseTo(ref[j]!.s, 12));
      }),
      { numRuns: 120 },
    );
  });

  it('solves analogies as a − b + c, leaving out the inputs', () => {
    fc.assert(
      fc.property(wordArb, wordArb, wordArb, settingsArb, (a, b, c, set) => {
        const t = new Timeline(embeddings, set, 1, [['analogy', a, b, c]]);
        const q = t.endState().query as Search;
        const vec = (w: string) => {
          const v = WORDS.find((x) => x.w === w)!.v;
          return set.normalize ? v.map((x) => x / Math.hypot(v[0], v[1])) : v;
        };
        const target = [0, 1].map((d) => vec(a)[d]! - vec(b)[d]! + vec(c)[d]!);
        expect(q.target[0]).toBeCloseTo(target[0]!, 12);
        expect(q.target[1]).toBeCloseTo(target[1]!, 12);
        const ref = reference(target, set, [a, b, c]);
        expect(q.top.map((e) => NAMES[e.i])).toEqual(ref.map((r) => r.w));
      }),
      { numRuns: 120 },
    );
  });

  it('keeps a valid heap of at most k on every step', () => {
    fc.assert(
      fc.property(wordArb, wordArb, wordArb, settingsArb, (a, b, c, set) => {
        const t = new Timeline(embeddings, set, 1, [
          ['nearest', a],
          ['analogy', a, b, c],
          ['similarity', a, b],
        ]);
        let scored = 0;
        for (const e of t.entries)
          for (const step of e.steps) {
            const w = step.extra?.search;
            if (!w) continue;
            expect(w.heap.length).toBeLessThanOrEqual(set.k);
            // A push or a replacement breaks the heap until its swaps finish; a word turned away
            // leaves a settled heap, and its top is the weakest kept.
            if (
              step.lines.includes('score') &&
              !step.lines.includes('push') &&
              !step.lines.includes('replace')
            ) {
              expect(isHeap(w.heap)).toBe(true);
              expect(w.heap.length).toBe(set.k);
            }
            scored = Math.max(scored, w.search.scores.filter((x) => x !== null).length);
          }
        expect(scored).toBeLessThanOrEqual(NAMES.length - 1);
        const p = t.endState().query as Pair;
        expect(p.cos).toBeGreaterThanOrEqual(-1 - 1e-12);
        expect(p.cos).toBeLessThanOrEqual(1 + 1e-12);
        // The cosine is the dot product of the vectors scaled to length 1.
        expect(p.cos).toBeCloseTo(p.dot / (p.la * p.lb), 12);
      }),
      { numRuns: 60 },
    );
  });

  it('tells the story the examples tell', () => {
    const near = (w: string, set: Partial<EmbSettings>) => {
      const t = new Timeline(embeddings, { ...embeddings.defaults, ...set } as EmbSettings, 1, [
        ['nearest', w],
      ]);
      return (t.endState().query as Search).top.map((e) => NAMES[e.i]);
    };
    expect(near('kitten', {})).toEqual(['cat', 'dog', 'fox']);
    expect(near('kitten', { measure: 'dot' })[0]).toBe('dog');
    expect(near('kitten', { measure: 'dot', normalize: true })).toEqual(['cat', 'dog', 'fox']);
    expect(near('man', {})).toEqual(['king', 'woman', 'queen']);
    const solve = (a: string, b: string, c: string, set: Partial<EmbSettings> = {}) => {
      const t = new Timeline(embeddings, { ...embeddings.defaults, ...set } as EmbSettings, 1, [
        ['analogy', a, b, c],
      ]);
      return (t.endState().query as Search).top.map((e) => NAMES[e.i])[0];
    };
    expect(solve('king', 'man', 'woman')).toBe('queen');
    expect(solve('puppy', 'dog', 'cat')).toBe('kitten');
    expect(solve('puppy', 'dog', 'cat', { measure: 'dot' })).toBe('fox');
    expect(solve('kitten', 'cat', 'fox')).toBe('dog');
  });

  it('turns away unknown words without changing anything', () => {
    const t = new Timeline(embeddings, embeddings.defaults, 1, [
      ['nearest', 'zebra'],
      ['analogy', 'king', 7, 'woman'],
    ]);
    expect(t.endState()).toBe(t.initial.state);
    expect(t.at(1).step.say).toContain('not one of the 12 words');
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(embeddings, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(embeddings, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
