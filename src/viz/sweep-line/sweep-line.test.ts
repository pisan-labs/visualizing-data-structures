import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { sweepLine as def } from '.';
import { bldInput, type Goal, type SLSettings, type Ties } from './model';

type Raw = { s: number; f: number; h: number };

/** The reference for the most open: try every half unit of time. */
function mostRef(bs: Raw[], ties: Ties): number {
  let best = 0;
  for (let p = 0; p <= 50; p++) {
    const t = p / 2;
    const c = bs.filter((b) =>
      ties === 'ends' ? b.s <= t && t < b.f : b.s <= t && t <= b.f,
    ).length;
    best = Math.max(best, c);
  }
  return best;
}

/** The reference skyline: the tallest height over each unit of x, and where it changes. */
function skylineRef(bs: Raw[]): { x: number; h: number }[] {
  const out: { x: number; h: number }[] = [];
  let prev = 0;
  for (let x = 0; x <= 25; x++) {
    const h = Math.max(0, ...bs.filter((b) => b.s <= x && x < b.f).map((b) => b.h));
    if (h !== prev) out.push({ x, h });
    prev = h;
  }
  return out;
}

const building = fc
  .tuple(
    fc.integer({ min: 0, max: 18 }),
    fc.integer({ min: 1, max: 5 }),
    fc.integer({ min: 1, max: 9 }),
  )
  .map(([s, len, h]) => ({ s, f: s + len, h }));
const lists = fc.array(building, { minLength: 1, maxLength: 8 });
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);
const tieses = fc.constantFrom<Ties>('ends', 'starts');
const text = (bs: Raw[]) => bs.map((b) => bldInput({ id: 0, ...b })).join(' ');

function run(bs: Raw[], settings: SLSettings) {
  const t = new Timeline(def, settings, 1, [['load', text(bs)], ['sweep']]);
  return t.entries[1]!.steps;
}

describe('sweep-line', () => {
  it('finds the most open at once both ways, and keeps every step consistent', () => {
    fc.assert(
      fc.property(lists, approaches, tieses, (bs, approach, ties) => {
        const settings: SLSettings = { approach, goal: 'overlap', ties };
        const steps = run(bs, settings);
        const last = steps.at(-1)!;
        expect(last.vars?.most).toBe(mostRef(bs, ties));
        // The first time it is reached is the same both ways.
        const t = last.extra!.best!.t;
        expect(
          bs.filter((b) => (ties === 'ends' ? b.s <= t && t < b.f : b.s <= t && t <= b.f)).length,
        ).toBe(mostRef(bs, ties));
        const n = bs.length;
        expect(last.vars?.['naive total']).toBe(n * n);
        if (approach === 'naive') expect(last.vars?.checks).toBe(n * n);
        else expect(last.vars?.updates).toBe(2 * n);
        for (const s of steps) {
          const e = s.extra!;
          if (approach === 'pattern' && !s.lines.includes('ret')) {
            // open counts what has started and not ended among the events done.
            expect(e.open.length).toBe(s.vars?.open);
            const evs = e.events!.slice(0, e.done);
            const started = evs.filter((v) => v.kind === 'start').length;
            const ended = evs.filter((v) => v.kind === 'end').length;
            expect(started - ended).toBe(s.vars?.open);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('traces the reference skyline both ways, with a sound heap', () => {
    fc.assert(
      fc.property(lists, approaches, tieses, (bs, approach, ties) => {
        const settings: SLSettings = { approach, goal: 'skyline' as Goal, ties };
        const steps = run(bs, settings);
        const last = steps.at(-1)!;
        expect(last.extra!.keys).toEqual(skylineRef(bs));
        for (const s of steps) {
          const heap = s.extra!.heap;
          if (!heap) continue;
          for (let k = 1; k < heap.length; k++)
            expect(heap[(k - 1) >> 1]!.h).toBeGreaterThanOrEqual(heap[k]!.h);
          // After the pops at x, the top is still standing.
          if (s.lines.includes('top') && heap.length)
            expect(heap[0]!.r).toBeGreaterThan(s.extra!.at!);
        }
        if (approach === 'naive') {
          const xs = new Set(bs.flatMap((b) => [b.s, b.f])).size;
          expect(last.vars?.checks).toBe(xs * bs.length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('counts touching intervals only when starts go first', () => {
    const bs = [
      { s: 1, f: 3, h: 1 },
      { s: 3, f: 5, h: 1 },
    ];
    expect(run(bs, { approach: 'pattern', goal: 'overlap', ties: 'ends' }).at(-1)!.vars?.most).toBe(
      1,
    );
    expect(
      run(bs, { approach: 'pattern', goal: 'overlap', ties: 'starts' }).at(-1)!.vars?.most,
    ).toBe(2);
  });

  it('reads intervals with and without heights, and refuses bad ones', () => {
    const parse = def.controls.input!.parse;
    expect(parse('2-5')).toBe('2-5');
    expect(parse('2-5:7 1-3')).toBe('2-5:7 1-3:1');
    expect(parse('2-5:13')).toBeInstanceOf(Error);
    expect(parse('5-2')).toBeInstanceOf(Error);
    expect(parse('dog')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
