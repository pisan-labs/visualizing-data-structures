import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { disjointSets, parseElement } from '.';
import { depth, height, rootOf, type DSSettings, type DSState } from './model';

// A reference written independently of the page: arrays and loops, no steps.
class Ref {
  p = new Map<number, number>();
  rank = new Map<number, number>();
  size = new Map<number, number>();
  constructor(readonly settings: DSSettings) {
    for (let i = 0; i < 8; i++) this.make(i);
  }
  make(x: number) {
    if (this.p.has(x) || this.p.size >= 16) return;
    this.p.set(x, x);
    this.rank.set(x, 0);
    this.size.set(x, 1);
  }
  find(x: number): number {
    const path: number[] = [];
    let r = x;
    while (this.p.get(r) !== r) {
      path.push(r);
      r = this.p.get(r)!;
    }
    if (this.settings.path === 'compress') for (const y of path) this.p.set(y, r);
    if (this.settings.path === 'halve') {
      let y = x;
      while (this.p.get(y) !== y) {
        this.p.set(y, this.p.get(this.p.get(y)!)!);
        y = this.p.get(y)!;
      }
    }
    return r;
  }
  union(x: number, y: number) {
    const a = this.find(x);
    const b = this.find(y);
    if (a === b) return;
    let child = a;
    let parent = b;
    if (this.settings.union === 'rank' && this.rank.get(a)! > this.rank.get(b)!) {
      child = b;
      parent = a;
    }
    if (this.settings.union === 'size' && this.size.get(a)! > this.size.get(b)!) {
      child = b;
      parent = a;
    }
    this.p.set(child, parent);
    this.size.set(parent, this.size.get(parent)! + this.size.get(child)!);
    if (this.settings.union === 'rank' && this.rank.get(a) === this.rank.get(b))
      this.rank.set(parent, this.rank.get(parent)! + 1);
  }
}

const settingsArb = fc.record({
  union: fc.constantFrom('rank' as const, 'size' as const, 'naive' as const),
  path: fc.constantFrom('compress' as const, 'halve' as const, 'none' as const),
});
const el = fc.integer({ min: 0, max: 11 });
const callArb = fc.oneof(
  { weight: 4, arbitrary: fc.tuple(el, el).map(([x, y]) => ['union', x, y] as OpCall) },
  { weight: 2, arbitrary: el.map((x) => ['find', x] as OpCall) },
  { weight: 1, arbitrary: el.map((x) => ['makeset', x] as OpCall) },
);

function check(s: DSState, settings: DSSettings) {
  for (const x of s.elems) {
    expect(depth(s, x)).toBeLessThan(s.elems.length);
    const r = rootOf(s, x);
    if (settings.union === 'rank' && s.p[x] !== x)
      expect(s.rank[s.p[x]!]).toBeGreaterThan(s.rank[x]!);
    if (s.p[x] === x) expect(s.size[x]).toBe(s.elems.filter((y) => rootOf(s, y) === r).length);
  }
  if (settings.union !== 'naive')
    expect(height(s)).toBeLessThanOrEqual(Math.floor(Math.log2(Math.max(1, s.elems.length))));
}

describe('disjoint sets', () => {
  it('matches a reference union-find in every setting, step by step', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 30 }), (settings, calls) => {
        const t = new Timeline(disjointSets, settings, 1, calls);
        const ref = new Ref(settings);
        calls.forEach(([op, a, b], k) => {
          const last = t.entries[k]!.steps.at(-1)!;
          const x = Number(a);
          if (op === 'makeset') ref.make(x);
          if (op === 'find' && ref.p.has(x)) expect(last.vars?.root).toBe(ref.find(x));
          if (op === 'union' && ref.p.has(x) && ref.p.has(Number(b))) ref.union(x, Number(b));
          const s = t.entries[k]!.end;
          expect(Object.fromEntries(ref.p)).toEqual(
            Object.fromEntries(s.elems.map((e) => [e, s.p[e]])),
          );
          for (const st of t.entries[k]!.steps) check(st.state, settings);
        });
      }),
      { numRuns: 300 },
    );
  });

  it('counts finds and pointer steps', () => {
    const t = new Timeline(disjointSets, { union: 'naive', path: 'none' }, 1, [
      ['union', 0, 1],
      ['union', 0, 2],
      ['find', 0],
    ]);
    const end = t.entries.at(-1)!.steps.at(-1)!;
    // union(0, 1): two finds, no steps. union(0, 2): 0 -> 1, one step. find(0): 0 -> 1 -> 2.
    expect(end.vars).toMatchObject({ finds: 5, steps: 3, links: 2, height: 2, sets: 6 });
  });

  it('compresses the whole path, or halves it', () => {
    const build: OpCall[] = [
      ['union', 0, 1],
      ['union', 2, 3],
      ['union', 1, 3],
      ['union', 4, 5],
      ['union', 6, 7],
      ['union', 5, 7],
      ['union', 3, 7],
      ['find', 0],
    ];
    const full = new Timeline(disjointSets, { union: 'rank', path: 'compress' }, 1, build);
    expect(full.endState().p).toMatchObject({ 0: 7, 1: 7, 3: 7 });
    const half = new Timeline(disjointSets, { union: 'rank', path: 'halve' }, 1, build);
    expect(half.endState().p).toMatchObject({ 0: 3, 1: 3, 3: 7 });
  });

  it('refuses elements that are not there, and duplicates', () => {
    const t = new Timeline(disjointSets, disjointSets.defaults, 1, [
      ['find', 9],
      ['makeset', 3],
      ['union', 'cat', 1],
    ]);
    expect(t.entries[0]!.steps.at(-1)!.say).toContain('9 is not in any set yet');
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('3 is already in a set');
    expect(t.entries[2]!.steps.at(-1)!.say).toContain('"cat" is not an element');
  });

  it('parses elements', () => {
    expect(parseElement('7')).toBe(7);
    expect(parseElement('100')).toBeInstanceOf(Error);
    expect(parseElement('a')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  // A long chain drew the arrays at 9.6 px on a laptop: now they sit beside a flatter forest there. Badges were 12 units (8.1 px on a phone): now 14.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(disjointSets, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(disjointSets, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
