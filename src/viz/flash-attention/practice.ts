import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS } from '../_lm/vocab';
import {
  allTiles,
  D_K,
  flashTraffic,
  plainTraffic,
  tileOrder,
  totalOf,
  updateRow,
  type BlockSetting,
  type FlashExtra,
  type FlashSettings,
  type FlashState,
  type Order,
} from './model';

type Def = VizDef<FlashState, FlashSettings, FlashExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Sentences where a verb or a small word finds its best key in a later block now and then. */
function sentence(rng: Rng): string {
  const a = pick(rng, ANIMALS);
  const t = pick(rng, THINGS);
  const v = pick(rng, ACTIONS);
  return pick(rng, [
    `the ${t} and the ${a} ${v}`,
    `the ${a} ${v} on the ${t}`,
    `a ${t} and a ${a} ${v}`,
    `the ${a} saw the ${t} and it`,
    `the ${t} the ${a} ${v}`,
  ]);
}

const RULES: Record<Order, string> = {
  kv: 'With K/V blocks outside: O, m and ℓ start in HBM (2 + 1 + 1 numbers per row, written once); each K/V block is read once (K and V, 2 + 2 numbers per row); each tile reads its Q block and the block’s O, m and ℓ, and writes O, m and ℓ back.',
  q: 'With Q blocks outside: each Q block is read once (2 numbers per row) and its O written once (2 per row); each tile reads its K and V blocks (2 + 2 numbers per key).',
};

/**
 * Practice for FlashAttention. The picture shows the state after `setup` (some tiles done); the
 * questions ask about the next tile or the whole run. Every answer comes from running the model.
 */
export function flashPractice(def: () => Def): PracticeKind[] {
  const run = (settings: FlashSettings, calls: OpCall[]) =>
    new Timeline(def(), settings, 1, calls).endState();

  /** A run stopped before a tile in which some row already has a running max. */
  function midway(rng: Rng) {
    for (;;) {
      const settings: FlashSettings = {
        order: pick<Order>(rng, ['kv', 'kv', 'q']),
        br: pick<BlockSetting>(rng, ['1', '2', '2', '3']),
        bc: pick<BlockSetting>(rng, ['1', '2', '2', '3']),
        causal: rng.int(0, 3) > 0,
      };
      const text = sentence(rng);
      const before0 = run(settings, [['load', text]]);
      const n = before0.words.length;
      const order = tileOrder(n, settings);
      if (order.length < 2) continue;
      const k = rng.int(1, order.length - 1);
      const setup: OpCall[] = [
        ['load', text],
        ...Array.from({ length: k }, (): OpCall => ['tile']),
      ];
      const s = run(settings, setup);
      const t = order[k]!;
      const rows = Array.from({ length: t.r1 - t.r0 }, (_, i) => t.r0 + i).filter(
        (i) => s.flash!.m[i]! > -Infinity && updateRow(s, i, t, settings.causal, s.flash!),
      );
      if (!rows.length) continue;
      // Mostly a row whose max grows, so the old sum has to be rescaled.
      const grows = rows.filter(
        (i) => updateRow(s, i, t, settings.causal, s.flash!)!.m > s.flash!.m[i]!,
      );
      if (!grows.length && rng.int(0, 3) > 0) continue;
      const i = pick(rng, grows.length ? grows : rows);
      const u = updateRow(s, i, t, settings.causal, s.flash!)!;
      return { settings, setup, s, k, t, i, u, order };
    }
  }

  const scoresText = (u: NonNullable<ReturnType<typeof updateRow>>) =>
    u.s.length === 1 ? `the score ${two(u.s[0]!)}` : `the scores ${u.s.map(two).join(', ')}`;

  return [
    {
      id: 'max',
      title: 'The running max after a tile',
      make(rng) {
        const { settings, setup, s, k, i, u, order } = midway(rng);
        const w = s.words[i]!;
        return {
          prompt: `${k} of the ${order.length} tiles are done. In the next tile, row ${i + 1} (**${w}**) gets ${scoresText(u)}. Its running max is now ${two(u.before.m)}. What is m after this tile? Two decimals.`,
          setup,
          settings,
          answer: { kind: 'number', value: u.m, tolerance: 0.005 },
          explain: `m is the largest score the row has seen: max(${two(u.before.m)}, ${u.s.map(two).join(', ')}) = ${two(u.m)}.${u.m > u.before.m ? ` It grew, so the old ℓ and O are scaled by e^(${two(u.before.m)} − ${two(u.m)}) = ${two(u.a)}.` : ' It did not grow, so nothing old is rescaled.'}`,
          watch: [['tile']],
        };
      },
    },
    {
      id: 'sum',
      title: 'The running sum after a tile',
      make(rng) {
        const { settings, setup, s, k, i, u, order } = midway(rng);
        const w = s.words[i]!;
        const terms = u.s.map((x) => `e^(${two(x)} − ${two(u.m)})`).join(' + ');
        return {
          prompt: `${k} of the ${order.length} tiles are done. Row ${i + 1} (**${w}**) has m = ${two(u.before.m)} and ℓ = ${two(u.before.l)}. In the next tile it gets ${scoresText(u)}. What is ℓ after this tile? Two decimals.`,
          setup,
          settings,
          answer: { kind: 'number', value: u.l, tolerance: 0.005 },
          explain: `The new max is m′ = ${two(u.m)}. Rescale the old sum and add the new terms: ℓ = e^(${two(u.before.m)} − ${two(u.m)}) × ${two(u.before.l)} + ${terms} = ${two(u.l)}.`,
          watch: [['tile']],
        };
      },
    },
    {
      id: 'saved',
      title: 'Numbers saved against plain attention',
      make(rng) {
        for (;;) {
          const settings: FlashSettings = {
            order: pick<Order>(rng, ['kv', 'q']),
            br: pick<BlockSetting>(rng, ['2', '3', '4']),
            bc: pick<BlockSetting>(rng, ['2', '3', '4']),
            causal: false,
          };
          const text = sentence(rng);
          const s = run(settings, [['load', text]]);
          const n = s.words.length;
          const f = flashTraffic(n, settings);
          const p = plainTraffic(n);
          const saved = totalOf(p) - totalOf(f);
          if (saved <= 0) continue;
          const tiles = tileOrder(n, settings).length;
          return {
            prompt: `No mask, ${n} words, Q blocks of ${settings.br} rows and K/V blocks of ${settings.bc}: ${tiles} tiles. Plain attention moves 4n² + 4nd numbers to and from HBM (here d = ${D_K}). ${RULES[settings.order]} How many fewer numbers does FlashAttention move?`,
            setup: [['load', text]],
            settings,
            answer: { kind: 'number', value: saved },
            explain: `Plain: 4 × ${n}² + 4 × ${n} × ${D_K} = ${totalOf(p)}. FlashAttention: Q ${f.q}, K and V ${f.kv}, O, m and ℓ ${f.oml}, in all ${totalOf(f)}. Saved: ${totalOf(p)} − ${totalOf(f)} = ${saved}.`,
            watch: [['flash']],
          };
        }
      },
    },
    {
      id: 'skipped',
      title: 'Tiles the mask skips',
      make(rng) {
        for (;;) {
          const settings: FlashSettings = {
            order: pick<Order>(rng, ['kv', 'q']),
            br: pick<BlockSetting>(rng, ['1', '2', '3']),
            bc: pick<BlockSetting>(rng, ['1', '2', '3']),
            causal: true,
          };
          const text = sentence(rng);
          const s = run(settings, [['load', text]]);
          const n = s.words.length;
          const all = allTiles(n, settings).length;
          const kept = tileOrder(n, settings).length;
          if (all - kept === 0 && rng.int(0, 2) > 0) continue;
          const rowsB = Math.ceil(n / Number(settings.br));
          const colsB = Math.ceil(n / Number(settings.bc));
          return {
            prompt: `${n} words, Q blocks of ${settings.br} ${settings.br === '1' ? 'row' : 'rows'} and K/V blocks of ${settings.bc}: ${rowsB} × ${colsB} = ${all} tiles. With the causal mask, how many tiles are skipped because every score in them is masked?`,
            setup: [['load', text]],
            settings,
            answer: { kind: 'number', value: all - kept },
            explain: `A tile is skipped when its last row comes before its first key. ${all - kept === 0 ? 'No tile is like that here' : `${all - kept} ${all - kept === 1 ? 'tile is' : 'tiles are'} like that, all above the diagonal`}, so FlashAttention runs ${kept} of the ${all}.`,
            watch: [['flash']],
          };
        }
      },
    },
  ];
}
