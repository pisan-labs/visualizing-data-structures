import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { intervalsText, overlaps, type Interval } from '../_intervals/kit';
import { intervalPartitioning, parseLectures } from '.';
import type { PartSettings } from './model';

/** The reference depth: sweep every moment from 0 to 24 (and the ends, for closed times). */
function depth(ls: Interval[], closed: boolean): number {
  let most = 0;
  for (let t2 = 0; t2 <= 48; t2++) {
    const t = t2 / 2;
    const on = ls.filter((l) => (closed ? l.s <= t && t <= l.f : l.s <= t && t < l.f)).length;
    most = Math.max(most, on);
  }
  return most;
}

const lectsArb = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 1, max: 4 })), {
    minLength: 1,
    maxLength: 10,
  })
  .map((ps) => ps.map(([s, len], k) => ({ id: k + 1, s, f: Math.min(24, s + len) })));

const run = (ls: Interval[], touch: PartSettings['touch']) =>
  new Timeline(intervalPartitioning, { touch }, 1, [['load', intervalsText(ls)], ['schedule']]);

describe('interval partitioning', { timeout: 60_000 }, () => {
  it('never puts overlapping lectures in one room, keeps a heap, and uses depth rooms', () => {
    fc.assert(
      fc.property(
        lectsArb,
        fc.constantFrom<PartSettings['touch']>('share', 'conflict'),
        (ls, touch) => {
          const closed = touch === 'conflict';
          const t = run(ls, touch);
          for (let k = 0; k < t.length; k++) {
            const { state } = t.at(k).step;
            const placed = state.lects.filter((l) => state.room[l.id - 1] !== null);
            for (const a of placed)
              for (const b of placed)
                if (a !== b && state.room[a.id - 1] === state.room[b.id - 1])
                  expect(overlaps(a, b, closed)).toBe(false);
            state.heap.forEach((e, i) => {
              if (i > 0) expect(state.heap[(i - 1) >> 1]!.end).toBeLessThanOrEqual(e.end);
            });
          }
          const end = t.entries.at(-1)!.end;
          expect(end.room.every((r) => r !== null)).toBe(true);
          expect(Math.max(...end.room.map(Number))).toBe(depth(ls, closed));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('puts ten lectures in three rooms', () => {
    const end = new Timeline(intervalPartitioning, { touch: 'share' }, 1, [['schedule']]).entries
      .at(-1)!
      .steps.at(-1)!;
    expect(end.vars).toMatchObject({ rooms: 3, depth: 3 });
  });

  it('reads lectures, and refuses what it cannot use', () => {
    expect(parseLectures('9-11, 9-13')).toBe('9-11 9-13');
    expect(parseLectures('9-9')).toBeInstanceOf(Error);
    expect(parseLectures(Array(11).fill('1-2').join(' '))).toBeInstanceOf(Error);
    const t = new Timeline(intervalPartitioning, { touch: 'share' }, 1, [['load', 'zebra']]);
    expect(t.entries[0]!.end).toBe(t.initial.state);
  });
});

describe('interval partitioning practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 20 && seed < 400; seed++)
      for (const item of practiceSet(intervalPartitioning, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(5);
    return out;
  }
  const lectsOf = (q: PracticeQuestion) =>
    String(q.setup[0]![1])
      .split(' ')
      .map((p, k) => {
        const [s, f] = p.split('-').map(Number);
        return { id: k + 1, s: s!, f: f! };
      });

  it('expects the reference depth', () => {
    for (const q of questions('rooms'))
      expect(q.answer).toEqual({ kind: 'number', value: depth(lectsOf(q), false) });
    for (const q of questions('closed'))
      expect(q.answer).toEqual({ kind: 'number', value: depth(lectsOf(q), true) });
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(intervalPartitioning, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(intervalPartitioning, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
