import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { Approach } from '../_patterns/kit';
import { lfuCache as def } from '.';
import { node, sizeOf, UNITS, type LfuSettings, type LfuState } from './model';

/** The reference: a list of entries with a use count and a last-use time; evict the least. */
class Reference {
  entries: { key: number; value: number; uses: number; used: number }[] = [];
  clock = 0;
  constructor(readonly capacity: number) {}
  get(k: number): number {
    this.clock++;
    const e = this.entries.find((x) => x.key === k);
    if (!e) return -1;
    e.uses++;
    e.used = this.clock;
    return e.value;
  }
  put(k: number, v: number): number | null {
    this.clock++;
    const e = this.entries.find((x) => x.key === k);
    if (e) {
      e.value = v;
      e.uses++;
      e.used = this.clock;
      return null;
    }
    let evicted: number | null = null;
    if (this.entries.length === this.capacity) {
      const y = [...this.entries].sort((a, b) => a.uses - b.uses || a.used - b.used)[0]!;
      evicted = y.key;
      this.entries = this.entries.filter((x) => x !== y);
    }
    this.entries.push({ key: k, value: v, uses: 1, used: this.clock });
    return evicted;
  }
}

const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  fc.tuple(fc.constant('put'), fc.integer({ min: 1, max: 6 }), fc.integer({ min: 0, max: 99 })),
  fc.tuple(fc.constant('get'), fc.integer({ min: 1, max: 6 })),
  fc.constant(['clear'] as OpCall),
) as fc.Arbitrary<OpCall>;

/** Between operations: the map and the lists agree, and each list is in order of last use. */
function checkEnd(s: LfuState) {
  const mapped = s.map.filter((u): u is number => u !== null).sort((a, b) => a - b);
  expect(s.nodes.map((n) => n.uid).sort((a, b) => a - b)).toEqual(mapped);
  const listed = s.lists.flatMap((l) => l.uids).sort((a, b) => a - b);
  expect(listed).toEqual(mapped);
  for (const l of s.lists) {
    expect(l.uids.length).toBeGreaterThan(0);
    const used = l.uids.map((u) => node(s, u).used);
    expect(used).toEqual([...used].sort((a, b) => a - b));
    for (const u of l.uids) expect(node(s, u).freq).toBe(l.freq);
  }
  expect(s.lists.map((l) => l.freq)).toEqual([...s.lists.map((l) => l.freq)].sort((a, b) => a - b));
  expect(s.minFreq).toBe(s.lists.length ? s.lists[0]!.freq : 0);
  expect(sizeOf(s)).toBeLessThanOrEqual(s.capacity);
}

describe('lfu-cache', () => {
  it('matches the reference both ways, and the two designs end in the same cache', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.array(callArb, { maxLength: 30 }),
        (capacity, calls) => {
          const run = (approach: Approach) =>
            new Timeline(def, { approach, capacity } as LfuSettings, 1, calls);
          const pat = run('pattern');
          const nai = run('naive');
          let ref = new Reference(capacity);
          calls.forEach((c, i) => {
            const [op, a, b] = c;
            for (const t of [pat, nai]) checkEnd(t.entries[i]!.end);
            if (op === 'clear') {
              ref = new Reference(capacity);
              return;
            }
            if (op === 'get') {
              const want = ref.get(Number(a));
              for (const t of [pat, nai])
                expect(t.entries[i]!.steps.at(-1)!.vars!.returned).toBe(want);
            } else {
              const keysBefore = (t: typeof pat) =>
                (i ? t.entries[i - 1]!.end : t.initial.state).nodes.map((n) => n.key);
              const evicted = ref.put(Number(a), Number(b));
              for (const t of [pat, nai]) {
                const after = t.entries[i]!.end.nodes.map((n) => n.key);
                const gone = keysBefore(t).filter((k) => !after.includes(k));
                expect(gone).toEqual(evicted === null ? [] : [evicted]);
              }
            }
            const strip = (s: LfuState) => ({ ...s, work: null });
            expect(strip(pat.entries[i]!.end)).toEqual(strip(nai.entries[i]!.end));
            // Each design's live counters add up to its own total.
            for (const [t, which] of [
              [pat, 'pattern'],
              [nai, 'naive'],
            ] as const) {
              const v = t.entries[i]!.steps.at(-1)!.vars!;
              const sum = UNITS.reduce((acc, u) => acc + Number(v[u]), 0);
              expect(sum).toBe(v[`${which} total`]);
            }
          });
          const want = [...ref.entries]
            .sort((x, y) => x.uses - y.uses || x.used - y.used)
            .map((e) => `${e.key}=${e.value}x${e.uses}`);
          const end = pat.endState();
          expect(
            end.lists.flatMap((l) =>
              l.uids.map((u) => `${node(end, u).key}=${node(end, u).value}x${l.freq}`),
            ),
          ).toEqual(want);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('scans every key only when the cache is full', () => {
    const t = new Timeline(def, { approach: 'naive', capacity: 3 }, 1, [
      ['put', 1, 1],
      ['put', 2, 2],
      ['put', 3, 3],
      ['get', 1],
      ['put', 4, 4],
    ]);
    const v = t.entries.at(-1)!.steps.at(-1)!.vars!;
    expect(v.scans).toBe(3);
    expect(t.entries.at(-1)!.steps.filter((s) => s.lines.includes('put.scan'))).toHaveLength(3);
  });

  it('refuses keys and values it cannot read', () => {
    const t = new Timeline(def, { approach: 'pattern', capacity: 3 }, 1, [
      ['put', 'cat', 1],
      ['get', 1000],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/whole number from 0 to 999/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/between 0 and 999/);
    expect(t.endState().nodes).toEqual([]);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
