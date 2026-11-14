import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { short } from '../_lm/numbers';
import { attention, DESIGNED, parseSentence } from '../self-attention/model';
import { flashAttention as page } from '.';
import {
  allTiles,
  flashAttention,
  flashTraffic,
  init,
  plainTraffic,
  tileOrder,
  totalOf,
  type FlashSettings,
  type FlashState,
} from './model';

/** Attention written without tiles: exp without subtracting the max, whole rows at once. */
function reference(s: FlashState, causal: boolean) {
  const n = s.words.length;
  const sc = s.q.map((q, i) =>
    s.k.map((k, j) => (causal && j > i ? -Infinity : (q[0]! * k[0]! + q[1]! * k[1]!) / Math.SQRT2)),
  );
  const m = sc.map((row) => Math.max(...row));
  const l = sc.map((row, i) => row.reduce((t, x) => t + Math.exp(x - m[i]!), 0));
  const o = sc.map((row, i) =>
    [0, 1].map((c) => row.reduce((t, x, j) => t + (Math.exp(x - m[i]!) / l[i]!) * s.v[j]![c]!, 0)),
  );
  return { m, l, o, n };
}

/** HBM traffic counted loop by loop, the way the paper's algorithms read and write. */
function referenceTraffic(n: number, br: number, bc: number, causal: boolean, order: 'kv' | 'q') {
  const d = 2;
  let moved = 0;
  const hidden = (i0: number, i1: number, j0: number) => causal && i1 - 1 < j0;
  if (order === 'kv') {
    moved += n * d + 2 * n;
    for (let j0 = 0; j0 < n; j0 += bc) {
      const cols = Math.min(bc, n - j0);
      moved += 2 * cols * d;
      for (let i0 = 0; i0 < n; i0 += br) {
        const rows = Math.min(br, n - i0);
        if (hidden(i0, i0 + rows, j0)) continue;
        moved += rows * d + (rows * d + 2 * rows) * 2;
      }
    }
  } else {
    for (let i0 = 0; i0 < n; i0 += br) {
      const rows = Math.min(br, n - i0);
      moved += 2 * rows * d;
      for (let j0 = 0; j0 < n; j0 += bc) {
        const cols = Math.min(bc, n - j0);
        if (!hidden(i0, i0 + rows, j0)) moved += 2 * cols * d;
      }
    }
  }
  return moved;
}

const wordArb = fc.constantFrom(
  ...'the a cat dog fox sat ran saw on under mat ball it and zorp'.split(' '),
);
const sentenceArb = fc.array(wordArb, { minLength: 1, maxLength: 7 }).map((w) => w.join(' '));
const blockArb = fc.constantFrom('1' as const, '2' as const, '3' as const, '4' as const);
const settingsArb = fc.record({
  order: fc.constantFrom('kv' as const, 'q' as const),
  br: blockArb,
  bc: blockArb,
  causal: fc.boolean(),
});

const load = (text: string, settings: FlashSettings, more: OpCall[] = []) =>
  new Timeline(page, settings, 1, [['load', text], ...more]);

describe('flash-attention', () => {
  it('gives plain attention’s answer, and its m and ℓ, in every setting', () => {
    fc.assert(
      fc.property(sentenceArb, settingsArb, (text, settings) => {
        const s = load(text, settings).endState();
        const run = flashAttention(s, settings);
        const ref = reference(s, settings.causal);
        const plain = attention(s.x, DESIGNED, settings.causal, true);
        for (let i = 0; i < ref.n; i++) {
          expect(run.m[i]).toBeCloseTo(ref.m[i]!, 12);
          expect(run.l[i]).toBeCloseTo(ref.l[i]!, 12);
          for (let c = 0; c < 2; c++) {
            expect(run.o[i]![c]).toBeCloseTo(ref.o[i]![c]!, 12);
            expect(run.o[i]![c]).toBeCloseTo(plain.z[i]![c]!, 12);
          }
        }
        const br = Number(settings.br);
        const bc = Number(settings.bc);
        expect(totalOf(run.traffic)).toBe(
          referenceTraffic(ref.n, br, bc, settings.causal, settings.order),
        );
      }),
      { numRuns: 300 },
    );
  });

  it('keeps its invariants on every step, and Next tile adds up to All tiles', () => {
    fc.assert(
      fc.property(
        sentenceArb,
        settingsArb,
        fc.integer({ min: 0, max: 20 }),
        (text, settings, k) => {
          const n = (parseSentence(text) as string[]).length;
          const total = tileOrder(n, settings).length;
          const tiles = Math.min(k, total);
          const t = load(text, settings, [
            ...Array.from({ length: tiles }, (): OpCall => ['tile']),
            ['flash'],
          ]);
          let last: number[] | undefined;
          for (const e of t.entries)
            for (const step of e.steps) {
              const f = step.state.flash;
              if (!f) continue;
              expect(f.done).toBeLessThanOrEqual(total);
              // The running max never falls, and a row that has seen a key has ℓ ≥ 1.
              if (last) f.m.forEach((m, i) => expect(m).toBeGreaterThanOrEqual(last![i]!));
              f.m.forEach((m, i) => {
                if (m > -Infinity) expect(f.l[i]).toBeGreaterThanOrEqual(1 - 1e-12);
              });
              last = [...f.m];
              // At most one tile's scores are on chip.
              if (step.extra?.tile !== undefined) {
                const tile = tileOrder(n, settings)[step.extra.tile]!;
                expect((tile.r1 - tile.r0) * (tile.c1 - tile.c0)).toBeLessThanOrEqual(
                  Number(settings.br) * Number(settings.bc),
                );
              }
            }
          const end = t.endState().flash!;
          const once = flashAttention(t.endState(), settings);
          expect(end.done).toBe(total);
          expect(end.o).toEqual(once.o);
          expect(end.l).toEqual(once.l);
          expect(end.traffic).toEqual(flashTraffic(n, settings));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('skips exactly the tiles the mask hides', () => {
    const settings: FlashSettings = { order: 'kv', br: '2', bc: '2', causal: true };
    expect(allTiles(6, settings)).toHaveLength(9);
    expect(tileOrder(6, settings)).toHaveLength(6);
    expect(tileOrder(6, { ...settings, causal: false })).toHaveLength(9);
    expect(tileOrder(6, { ...settings, br: '1', bc: '1' })).toHaveLength(21);
    // K/V blocks outside: the first column of tiles comes first.
    expect(tileOrder(6, settings).map((t) => `${t.a}${t.b}`)).toEqual([
      '00',
      '10',
      '20',
      '11',
      '21',
      '22',
    ]);
    expect(tileOrder(6, { ...settings, order: 'q' }).map((t) => `${t.a}${t.b}`)).toEqual([
      '00',
      '10',
      '11',
      '20',
      '21',
      '22',
    ]);
  });

  it('tells the story the examples tell', () => {
    const end = (id: string) => {
      const ex = page.examples.find((x) => x.id === id)!;
      return new Timeline(page, ex.settings as FlashSettings, 1, ex.ops).endState();
    };
    expect(totalOf(end('cat-sat-tiles').flash!.traffic)).toBe(168);
    expect(totalOf(end('q-outside').flash!.traffic)).toBe(72);
    expect(totalOf(end('no-mask').flash!.traffic)).toBe(228);
    expect(totalOf(end('one-kv-block').flash!.traffic)).toBe(72);
    expect(totalOf(end('one-row-blocks').flash!.traffic)).toBe(258);
    expect(totalOf(end('plain-table').plain!.traffic)).toBe(192);
    expect(totalOf(plainTraffic(6))).toBe(192);
    const grows = end('max-grows').flash!;
    expect(short(grows.m[5]!)).toBe('2.83');
    expect(grows.o[5]!.map(short)).toEqual(['.85', '.14']);
    const three = end('tile-by-tile').flash!;
    expect(three.done).toBe(3);
    expect(three.m[6]).toBe(-Infinity);
    expect(three.m.slice(0, 6).every((m) => m > -Infinity)).toBe(true);
    expect(totalOf(three.traffic)).toBe(96);
    expect(short(end('no-mask').flash!.m[4]!)).toBe('1.41');
    expect(short(end('plain-table').plain!.m[2]!)).toBe('2.83');
    const cat = end('cat-sat-tiles').flash!;
    expect(short(cat.o[2]![0]!)).toBe('.93');
    expect(init().words).toHaveLength(6);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(page, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(page, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
