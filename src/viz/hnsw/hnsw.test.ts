import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { writePoints, type Vec } from '../../layouts/plane';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { hnsw } from '.';
import { bruteForce, EF_C, K, levelFor, maxLinks, TOP, type HnswSettings, type SearchDone } from './model';

/**
 * The paper's Algorithms 1, 2, 3 and 5 written independently: plain arrays sorted after every
 * change, keys compared as (squared distance, id).
 */
class Reference {
  pts: Vec[] = [];
  links: number[][][] = [];
  entry = -1;
  count = 0;
  constructor(readonly m: number) {}
  key(q: Vec, i: number): [number, number] {
    const p = this.pts[i]!;
    return [(q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y), i];
  }
  less = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  sort = (xs: [number, number][]) => xs.sort((a, b) => (this.less(a, b) ? -1 : 1));
  layer(q: Vec, eps: [number, number][], ef: number, l: number): [number, number][] {
    const seen = new Set(eps.map((e) => e[1]));
    const c = this.sort([...eps]);
    const w = this.sort([...eps]);
    while (c.length) {
      const x = c.shift()!;
      if (this.less(w[w.length - 1]!, x)) break;
      for (const e of this.links[x[1]]![l]!) {
        if (seen.has(e)) continue;
        seen.add(e);
        this.count++;
        const k = this.key(q, e);
        if (w.length < ef || this.less(k, w[w.length - 1]!)) {
          c.push(k);
          this.sort(c);
          w.push(k);
          this.sort(w);
          if (w.length > ef) w.pop();
        }
      }
    }
    return w;
  }
  insert(q: Vec, level: number) {
    const id = this.pts.length;
    this.pts.push(q);
    this.links.push(Array.from({ length: level + 1 }, () => []));
    this.count = 0;
    if (this.entry < 0) {
      this.entry = id;
      return;
    }
    const top = this.links[this.entry]!.length - 1;
    this.count++;
    let eps = [this.key(q, this.entry)];
    for (let l = top; l > level; l--) eps = this.layer(q, eps, 1, l).slice(0, 1);
    for (let l = Math.min(top, level); l >= 0; l--) {
      const w = this.layer(q, eps, EF_C, l);
      const nb = w.slice(0, this.m).map((x) => x[1]);
      this.links[id]![l] = nb;
      for (const e of nb) {
        const list = [...this.links[e]![l]!, id];
        // Over the limit: keep the nearest, nearest first; otherwise the order links were made.
        this.links[e]![l] =
          list.length > maxLinks(this.m, l)
            ? this.sort(list.map((j) => this.key(this.pts[e]!, j)))
                .slice(0, maxLinks(this.m, l))
                .map((x) => x[1])
            : list;
      }
      eps = w;
    }
    if (level > top) this.entry = id;
  }
  search(q: Vec, ef: number) {
    this.count = 1;
    let eps = [this.key(q, this.entry)];
    for (let l = this.links[this.entry]!.length - 1; l > 0; l--) eps = this.layer(q, eps, 1, l).slice(0, 1);
    return this.layer(q, eps, ef, 0).slice(0, K).map((x) => x[1]);
  }
}

const ptArb = fc.record({ x: fc.integer({ min: 0, max: 10 }), y: fc.integer({ min: 0, max: 10 }) });
const ptsArb = fc.uniqueArray(ptArb, { minLength: 1, maxLength: 12, selector: (p) => `${p.x},${p.y}` });
const settingsArb = fc.record({ M: fc.integer({ min: 2, max: 4 }), ef: fc.integer({ min: 1, max: 8 }) });

describe('hnsw', () => {
  it('builds the same graph and finds the same points as an independent reference', () => {
    fc.assert(
      fc.property(ptsArb, fc.array(ptArb, { minLength: 1, maxLength: 4 }), settingsArb, fc.integer({ min: 1, max: 1000 }), (pts, qs, set, seed) => {
        const settings: HnswSettings = { ...set };
        const t = new Timeline(hnsw, settings, seed, [
          ['insert', writePoints(pts)],
          ...qs.map((q) => ['search', `${q.x},${q.y}`] as [string, string]),
        ]);
        const built = t.entries[0]!.end;
        const ref = new Reference(set.M);
        for (const n of built.nodes) ref.insert(n, n.level);
        expect(built.nodes.map((n) => n.links)).toEqual(ref.links);
        expect(built.entry).toBe(ref.entry);
        t.entries.slice(1).forEach((e, i) => {
          const last = e.end.last as SearchDone;
          expect(last.found).toEqual(ref.search(qs[i]!, set.ef));
          expect(last.dists).toBe(ref.count);
          expect(last.truth).toEqual(bruteForce(built.nodes, qs[i]!));
        });
      }),
      { numRuns: 150 },
    );
  });

  it('keeps its invariants on every step of random runs', () => {
    fc.assert(
      fc.property(ptsArb, settingsArb, fc.integer({ min: 1, max: 1000 }), (pts, set, seed) => {
        const t = new Timeline(hnsw, { ...set }, seed, [['insert', writePoints(pts)], ['search', '5,5']]);
        for (const e of t.entries)
          for (const step of e.steps) {
            const s = step.state;
            // Mid-insert a neighbour may hold one link too many until it drops one.
            const between = step.extra?.newId !== undefined && !step.extra.done;
            for (const n of s.nodes) {
              expect(n.links).toHaveLength(n.level + 1);
              expect(n.level).toBeLessThanOrEqual(TOP);
              n.links.forEach((l, layer) => {
                // At most M links (2M on layer 0), each to a different node on that layer.
                expect(l.length).toBeLessThanOrEqual(maxLinks(set.M, layer) + (between ? 1 : 0));
                expect(new Set(l).size).toBe(l.length);
                for (const j of l) {
                  expect(j).not.toBe(n.id);
                  expect(s.nodes[j]!.level).toBeGreaterThanOrEqual(layer);
                }
              });
            }
            // The entry point is on the top layer (the point being inserted not counted yet).
            const settled = s.nodes.filter((n) => n.id !== step.extra?.newId || step.extra?.done);
            if (s.entry !== null)
              expect(s.nodes[s.entry]!.level).toBe(Math.max(...settled.map((n) => n.level)));
            // The search's list never holds more than ef.
            const w = step.extra?.found;
            if (w && step.extra?.newId === undefined && step.extra.layer === 0) expect(w.length).toBeLessThanOrEqual(set.ef);
          }
        const last = t.endState().last as SearchDone;
        expect(last.found.length).toBeLessThanOrEqual(Math.min(K, set.ef, pts.length));
        expect(last.found.length).toBeGreaterThan(0);
      }),
      { numRuns: 80 },
    );
  });

  it('draws levels as a skip list flips coins', () => {
    expect(levelFor(1, 2).level).toBe(0);
    expect(levelFor(0.6, 2).level).toBe(0);
    expect(levelFor(0.4, 2).level).toBe(1);
    expect(levelFor(0.2, 2).level).toBe(2);
    expect(levelFor(0.2, 4).level).toBe(1);
    expect(levelFor(0.01, 2)).toMatchObject({ level: 3, capped: true });
    // Over many draws, about 1/M of the points reach layer 1.
    const rng = makeRng(5);
    for (const m of [2, 3, 4]) {
      let up = 0;
      for (let i = 0; i < 4000; i++) if (levelFor(1 - rng.next(), m).level >= 1) up++;
      expect(up / 4000).toBeCloseTo(1 / m, 1);
    }
  });

  it('tells the story the examples tell', () => {
    const run = (id: string) => {
      const ex = hnsw.examples.find((e) => e.id === id)!;
      return new Timeline(hnsw, { ...hnsw.defaults, ...ex.settings } as HnswSettings, ex.seed, ex.ops);
    };
    const miss = run('greedy-misses').endState().last as SearchDone;
    const beam = run('beam-finds').endState().last as SearchDone;
    expect(miss.found[0]).not.toBe(miss.truth[0]);
    expect(beam.found).toEqual(beam.truth);
    expect(beam.dists).toBeGreaterThan(miss.dists);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(hnsw, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(hnsw, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
