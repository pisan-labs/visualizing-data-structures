import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { rateLimiter as def } from '.';
import {
  busiestKey,
  KINDS,
  MAX_SAME,
  memory,
  params,
  passedIn,
  reqById,
  WINDOWS,
  type Kind,
  type RLSettings,
} from './model';

/**
 * The reference: each design worked out from the history of verdicts, not from the limiter's
 * own memory. Returns the verdicts in order.
 */
function reference(kind: Kind, L: number, W: number, times: number[]): boolean[] {
  const ok: boolean[] = [];
  const passedBetween = (lo: number, hi: number) =>
    times.filter((t, i) => i < ok.length && ok[i] && t >= lo && t < hi).length;
  let tokens = L * W; // in units of 1/W
  let last = 0;
  for (const t of times) {
    let pass: boolean;
    const w = Math.floor(t / W) * W;
    if (kind === 'fixed') pass = passedBetween(w, w + W) < L;
    else if (kind === 'log') pass = passedBetween(t - W + 1, t + 1) < L;
    else if (kind === 'counter') {
      const curr = passedBetween(w, w + W);
      const prev = passedBetween(w - W, w);
      // curr + prev × (W − (t − w)) / W < L, times W
      pass = curr * W + prev * (W - (t - w)) < L * W;
    } else {
      tokens = Math.min(L * W, tokens + (t - last) * L);
      last = t;
      pass = tokens >= W;
      if (pass) tokens -= W;
    }
    ok.push(pass);
  }
  return ok;
}

const settingsArb = fc.record({
  limiter: fc.constantFrom(...KINDS),
  limit: fc.integer({ min: 1, max: 6 }),
  window: fc.constantFrom(...WINDOWS),
});

/** Request times in order, at most MAX_SAME at one second. */
const timesArb = fc
  .array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 24 })
  .map((gaps) => {
    const out: number[] = [];
    let t = 0;
    for (const g of gaps) {
      t = Math.min(39, t + g);
      if (out.filter((x) => x === t).length < MAX_SAME) out.push(t);
    }
    return out;
  });

describe('rate-limiter', () => {
  it('lets the same requests through as the reference, with consistent memory on every step', () => {
    fc.assert(
      fc.property(settingsArb, timesArb, (raw, times) => {
        const settings = raw as RLSettings;
        const { kind, L, W } = params(settings);
        const t = new Timeline(
          def,
          settings,
          1,
          times.map((x): OpCall => ['request', x]),
        );
        const end = t.endState();
        expect(end.reqs.map((r) => r.t)).toEqual(times);
        expect(end.reqs.map((r) => r.ok)).toEqual(reference(kind, L, W, times));
        for (let i = 0; i < t.length; i++) {
          const step = t.at(i).step;
          const s = step.state;
          const v = step.vars!;
          expect(v['memory kept']).toBe(memory(s, kind));
          expect(v.passed).toBe(s.reqs.filter((r) => r.ok === true).length);
          expect(v.refused).toBe(s.reqs.filter((r) => r.ok === false).length);
          // At most the request being checked is undecided.
          expect(s.reqs.filter((r) => r.ok === null).length).toBeLessThanOrEqual(1);
          if (kind === 'log') {
            expect(s.log.length).toBeLessThanOrEqual(L);
            const ts = s.log.map((u) => reqById(s, u).t);
            expect(ts).toEqual([...ts].sort((a, b) => a - b));
            for (const u of s.log) expect(reqById(s, u).ok).toBe(true);
          }
          if (kind === 'fixed' || kind === 'counter') expect(s.count).toBeLessThanOrEqual(L);
          if (kind === 'bucket') {
            expect(s.units).toBeGreaterThanOrEqual(0);
            expect(s.units).toBeLessThanOrEqual(L * W);
          }
        }
        // The log never lets more than L through in any W seconds; a fixed window, 2L.
        const most = Number(t.entries.at(-1)!.steps.at(-1)!.vars![busiestKey(W)]);
        if (kind === 'log') expect(most).toBeLessThanOrEqual(L);
        if (kind === 'fixed') expect(most).toBeLessThanOrEqual(2 * L);
        for (const r of end.reqs)
          if (kind === 'log' && r.ok) expect(passedIn(end, r.t - W, r.t)).toBeLessThanOrEqual(L);
      }),
      { numRuns: 300 },
    );
  });

  it('lets 2L through across a window edge with a fixed window, and L with a log', () => {
    const times = [7, 8, 9, 10, 11, 12];
    const run = (limiter: Kind) =>
      new Timeline(
        def,
        { limiter, limit: 3, window: '10' },
        1,
        times.map((x): OpCall => ['request', x]),
      ).endState();
    expect(run('fixed').reqs.every((r) => r.ok)).toBe(true);
    expect(run('log').reqs.map((r) => r.ok)).toEqual([true, true, true, false, false, false]);
  });

  it('refuses bad times, times out of order and a seventh request at one second', () => {
    const t = new Timeline(def, { limiter: 'log', limit: 3, window: '10' }, 1, [
      ['request', 'cat'],
      ['request', 40],
      ['request', 9],
      ['request', 5],
      ...Array.from({ length: 7 }, (): OpCall => ['request', 12]),
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/whole number of seconds/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/between 0 and 39/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/in time order/);
    expect(t.entries.at(-1)!.steps[0]!.say).toMatch(/At most 6 requests/);
    expect(t.endState().reqs.map((r) => r.t)).toEqual([9, 12, 12, 12, 12, 12, 12]);
  });

  it('reads the input box', () => {
    const parse = def.controls.input!.parse;
    expect(parse('12')).toBe(12);
    expect(parse('40')).toBeInstanceOf(Error);
    expect(parse('-1')).toBeInstanceOf(Error);
    expect(parse('')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
