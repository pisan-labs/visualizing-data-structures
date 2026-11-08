import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { consistentHashing } from '.';
import { loads, ownerOf, type RingExtra, type RingSettings, type RingState } from './model';

type T = Timeline<RingState, RingSettings, RingExtra>;
const run = (calls: OpCall[], vnodes = 1): T =>
  new Timeline(consistentHashing, { vnodes }, 1, calls);

/** The ring written separately: a plain scan for the smallest clockwise distance. */
function refOwner(servers: string[], v: number, k: number): string | null {
  const p = ((71 * k + 5) % 1009) % 360;
  let best: { d: number; pos: number; label: string; server: string } | null = null;
  for (const s of servers) {
    for (let r = 0; r < v; r++) {
      const token = 100 * ('ABCDEFGH'.indexOf(s) + 1) + r;
      const pos = ((113 * token + 17) % 1009) % 360;
      const label = v === 1 ? s : `${s}${r + 1}`;
      const d = (pos - p + 360) % 360;
      if (!best || d < best.d || (d === best.d && label < best.label))
        best = { d, pos, label, server: s };
    }
  }
  return best?.server ?? null;
}

describe('consistent hashing', () => {
  it('walks clockwise and wraps past 0', () => {
    const t = run([
      ['addServer', 'A'],
      ['addServer', 'B'],
      ['addServer', 'C'],
      ['lookup', 90],
    ]);
    const last = t.entries.at(-1)!.steps.at(-1)!;
    expect(last.say).toContain('going past 359 back to 0');
    expect(last.vars!.server).toBe('B');
  });

  it('moves far fewer keys than mod N when a server joins', () => {
    const ex = consistentHashing.examples.find((e) => e.id === 'add-a-server')!;
    const t = run(ex.ops);
    const v = t.entries.at(-1)!.steps.at(-1)!.vars!;
    expect(Number(v.moved)).toBeLessThan(Number(v['mod-N moved']));
  });

  it('matches a reference, and a membership change moves only the keys it must', () => {
    const server = fc.constantFrom(...'ABCDEFGH');
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      {
        weight: 4,
        arbitrary: fc.integer({ min: 0, max: 999 }).map((k) => ['addKey', k] as OpCall),
      },
      {
        weight: 2,
        arbitrary: fc.integer({ min: 0, max: 999 }).map((k) => ['lookup', k] as OpCall),
      },
      { weight: 2, arbitrary: server.map((s) => ['addServer', s] as OpCall) },
      { weight: 1, arbitrary: server.map((s) => ['removeServer', s] as OpCall) },
      {
        weight: 1,
        arbitrary: fc.constantFrom<OpCall>(['clear'], ['addServer', 'Z'], ['addKey', 'A']),
      },
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.array(call, { maxLength: 30 }), (v, calls) => {
        const t = run(calls, v);
        t.entries.forEach((e, i) => {
          const before = i ? t.entries[i - 1]!.end : { servers: [], keys: [], nextUid: 1, v };
          const after = e.end;
          for (const { key } of after.keys)
            expect(ownerOf(after, key)).toBe(refOwner(after.servers, v, key));
          const [op, x] = e.call;
          if (
            (op === 'addServer' || op === 'removeServer') &&
            after.servers.length !== before.servers.length
          ) {
            for (const { key } of before.keys) {
              const was = ownerOf(before, key);
              const now = ownerOf(after, key);
              if (was === now) continue;
              // A key moves only to the new server, or away from the one that left.
              if (op === 'addServer') expect(now).toBe(x);
              else expect(was).toBe(x);
            }
          }
          const total = Object.values(loads(after)).reduce((a, b) => a + b, 0);
          expect(total).toBe(after.servers.length ? after.keys.length : 0);
        });
      }),
      { numRuns: 200 },
    );
  });

  it('keeps its text readable on a laptop and a phone', () => {
    expect(smallestText(consistentHashing, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(consistentHashing, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
