import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { beamSearch } from '.';
import {
  EOS,
  exhaustive,
  finalScore,
  parseStart,
  runSearch,
  STARTS,
  TABLE,
  words,
  type BeamSettings,
  type Eos,
} from './model';

/** Every path of up to `max` words after `start`, with its log-probability. */
function paths(start: string, max: number) {
  const out: { ws: string[]; score: number }[] = [];
  const walk = (tok: string, ws: string[], score: number) => {
    if (ws.length) out.push({ ws, score });
    if (tok === EOS || ws.length === max) return;
    for (const [w, p] of TABLE[tok] ?? []) walk(w, [...ws, w], score + Math.log(p));
  };
  walk(start, [], 0);
  return out;
}

/** Beam search written independently: whole beams as sorted arrays of word lists. */
function reference(start: string, s: BeamSettings, greedy: boolean) {
  const B = greedy ? 1 : s.width;
  type H = { ws: string[]; score: number; order: number };
  const last = (h: H) => (h.ws.length ? h.ws[h.ws.length - 1]! : start);
  let beam: H[] = [{ ws: [], score: 0, order: 0 }];
  const done: H[] = [];
  let room = B;
  for (let t = 0; t < s.maxLen && beam.length; t++) {
    let k = 0;
    const cands = beam.flatMap((h) =>
      TABLE[last(h)]!.map(([w, p]) => ({
        ws: [...h.ws, w],
        score: h.score + Math.log(p),
        order: k++,
      })),
    );
    cands.sort((a, b) => b.score - a.score || a.order - b.order);
    if (s.eos === 'shrink') {
      const top = cands.slice(0, room);
      done.push(...top.filter((h) => last(h) === EOS));
      room -= top.filter((h) => last(h) === EOS).length;
      beam = top.filter((h) => last(h) !== EOS);
      if (room === 0) beam = [];
    } else {
      done.push(...cands.slice(0, B).filter((h) => last(h) === EOS));
      beam = cands.filter((h) => last(h) !== EOS).slice(0, B);
      if (done.length >= B) beam = [];
    }
  }
  done.push(...beam);
  const key = (h: H) => (s.norm ? h.score / h.ws.length : h.score);
  const best = done.reduce<H | null>((a, h) => (a === null || key(h) > key(a) ? h : a), null);
  return { finished: done.map((h) => h.ws.join(' ')), best: best?.ws.join(' ') ?? null };
}

const settingsArb = fc.record({
  width: fc.integer({ min: 1, max: 3 }),
  norm: fc.boolean(),
  eos: fc.constantFrom<Eos>('shrink', 'refill'),
  maxLen: fc.integer({ min: 2, max: 6 }),
});

describe('beam search', () => {
  it('has a table whose rows add up to 1', () => {
    for (const row of Object.values(TABLE)) {
      expect(row.reduce((a, [, p]) => a + p, 0)).toBeCloseTo(1, 12);
      for (const [w] of row) expect(w === EOS || Object.hasOwn(TABLE, w)).toBe(true);
    }
  });

  it('never ranks on a near tie, so the code tabs order the same way', () => {
    for (const start of STARTS)
      for (let max = 2; max <= 6; max++) {
        const all = paths(start, max);
        // Candidates of one step are paths of one length.
        for (let len = 1; len <= max; len++) {
          const xs = all.filter((p) => p.ws.length === len).map((p) => p.score);
          xs.sort((a, b) => a - b);
          for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(1e-9);
        }
        // Outputs, raw and per token.
        const outs = all.filter((p) => p.ws.at(-1) === EOS || p.ws.length === max);
        for (const norm of [false, true]) {
          const xs = outs
            .map((p) => (norm ? p.score / p.ws.length : p.score))
            .sort((a, b) => a - b);
          for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(1e-9);
        }
      }
  });

  it('matches an independent reference for every start and setting', () => {
    fc.assert(
      fc.property(settingsArb, fc.constantFrom(...STARTS), fc.boolean(), (s, start, greedy) => {
        const { search } = runSearch(start, s, greedy);
        const ref = reference(start, s, greedy);
        expect(search.finished.map((f) => words(search, f).join(' '))).toEqual(ref.finished);
        expect(search.best === null ? null : words(search, search.best).join(' ')).toBe(ref.best);
      }),
      { numRuns: 400 },
    );
  });

  it('keeps its invariants on every step, and never beats brute force', () => {
    fc.assert(
      fc.property(settingsArb, fc.constantFrom(...STARTS), (s, start) => {
        const t = new Timeline(beamSearch, s, 1, [
          ['greedy', start],
          ['search', start],
        ]);
        for (const e of t.entries) {
          const B = e.call[0] === 'greedy' ? 1 : s.width;
          for (const step of e.steps) {
            const w = step.extra?.work;
            if (!w) continue;
            // The beam never holds more than B, and narrows only when one finishes.
            expect(w.status.filter((x) => x === 'live').length).toBeLessThanOrEqual(B);
            expect(w.room).toBeLessThanOrEqual(B);
            if (s.eos === 'shrink') expect(w.room + w.finished.length).toBe(B);
            expect(w.shown).toBeLessThanOrEqual(w.search.nodes.length);
          }
          const sr = e.end.search!;
          expect(sr.finished.length).toBeGreaterThan(0);
          for (const f of sr.finished) {
            const h = sr.nodes[f]!;
            expect(h.token === EOS || h.len === s.maxLen).toBe(true);
          }
          const brute = exhaustive(start, s.maxLen, s.norm)!;
          const got = finalScore(sr.nodes[sr.best!]!, s.norm);
          expect(got).toBeLessThanOrEqual((s.norm ? brute.score / brute.len : brute.score) + 1e-12);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('tells the story the examples tell', () => {
    const at = (start: string, s: Partial<BeamSettings>, greedy = false) => {
      const { search } = runSearch(start, { ...beamSearch.defaults, ...s } as BeamSettings, greedy);
      return words(search, search.best!).join(' ');
    };
    expect(at('<s>', {}, true)).toBe('the cat sat </s>');
    expect(at('<s>', {})).toBe('a dog </s>');
    expect(at('<s>', { norm: true })).toBe('a dog ran away </s>');
    expect(at('<s>', { norm: true, eos: 'refill' })).toBe('the cat sat </s>');
    expect(at('dog', {})).toBe('</s>');
    expect(at('<s>', { maxLen: 3 })).toBe('a dog ran');
  });

  it('reads a start word', () => {
    expect(parseStart('<s>')).toBe('<s>');
    expect(parseStart('Dog')).toBe('dog');
    expect(parseStart('zebra')).toBeInstanceOf(Error);
    expect(parseStart('</s>')).toBeInstanceOf(Error);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(beamSearch, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(beamSearch, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
