import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  blocksInUse,
  blocksOf,
  list,
  MAX_LEN,
  seqOf,
  sizeOf,
  wasted,
  type BlockSetting,
  type PagedExtra,
  type PagedSettings,
  type PagedState,
} from './model';

type Def = VizDef<PagedState, PagedSettings, PagedExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const steps = (k: number): OpCall[] => Array.from({ length: k }, (): OpCall => ['step']);

const RULES =
  'A request gets a new block only when its last block is full; blocks come off the top of the free list.';

/**
 * Practice for the paged KV cache. The picture shows the pool after `setup`; the questions ask
 * about the operations that follow. Every answer comes from running the model.
 */
export function pagedPractice(def: () => Def): PracticeKind[] {
  const run = (settings: PagedSettings, calls: OpCall[]) =>
    new Timeline(def(), settings, 1, calls).endState();

  /** Two or three requests, sometimes with one finished, so the free list is out of order. */
  function scene(rng: Rng, settings: PagedSettings): OpCall[] {
    const B = sizeOf(settings);
    const short = Math.max(2, Math.floor(MAX_LEN / 2) - B);
    const calls: OpCall[] = [
      ['add', rng.int(1, short)],
      ['add', rng.int(1, short)],
    ];
    if (rng.int(0, 1)) calls.push(...steps(rng.int(1, 2)), ['finish', 'A'], ['add', rng.int(1, short)]);
    else calls.push(['add', rng.int(1, short)]);
    return calls;
  }

  const settingsOf = (rng: Rng, sharing = true): PagedSettings => ({
    block: pick<BlockSetting>(rng, ['2', '4', '4', '8']),
    sharing,
  });

  return [
    {
      id: 'blocks-in-use',
      title: 'Blocks in use after some steps',
      make(rng) {
        const settings = settingsOf(rng);
        const setup = scene(rng, settings);
        const k = rng.int(2, 4);
        const watch = steps(k);
        const before = run(settings, setup);
        const after = run(settings, [...setup, ...watch]);
        const B = sizeOf(settings);
        const lines = after.seqs.map((q) => {
          const was = seqOf(before, q.name)!.len;
          return `${q.name} goes from ${was} to ${q.len} tokens: ⌈${q.len} / ${B}⌉ = ${Math.ceil(q.len / B)}`;
        });
        return {
          prompt: `Blocks hold ${B} tokens. After ${k} more steps (each request writes one token per step), how many of the ${blocksOf(settings)} blocks are in use? ${RULES}`,
          setup,
          settings,
          answer: { kind: 'number', value: blocksInUse(after) },
          explain: `A request with t tokens uses ⌈t / ${B}⌉ blocks. ${lines.join('; ')}. In all ${blocksInUse(after)}.`,
          watch,
        };
      },
    },
    {
      id: 'table',
      title: 'The block table after a step',
      make(rng) {
        const settings = settingsOf(rng);
        let setup = scene(rng, settings);
        const B = sizeOf(settings);
        // Step until some request's last block is full, so the next step hands out a block.
        for (let i = 0; i < B; i++) {
          const s = run(settings, setup);
          if (s.seqs.some((q) => q.len % B === 0 && q.len < MAX_LEN)) break;
          setup = [...setup, ['step']];
        }
        const before = run(settings, setup);
        const after = run(settings, [...setup, ['step']]);
        const grew = after.seqs.filter((q) => q.table.length > seqOf(before, q.name)!.table.length);
        const q = grew.length ? pick(rng, grew) : pick(rng, after.seqs);
        const old = seqOf(before, q.name)!;
        const newBlocks = grew.map((g) => `${g.name} gets ${g.table.at(-1)}`);
        return {
          prompt: `After one more step, what is request **${q.name}**'s block table? Type the physical block numbers in logical order. ${RULES} Requests go oldest first.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: q.table.map(String) },
          explain: grew.length
            ? `The free list's top was ${list(before.free.slice(0, grew.length))}. Oldest first, the requests whose last block was full take blocks from it: ${list(newBlocks)}. So ${q.name}'s table is [${q.table.join(', ')}]${q.table.length === old.table.length ? ', unchanged: its last block had room' : ''}.`
            : `No last block was full, so no block is handed out and ${q.name}'s table stays [${q.table.join(', ')}].`,
          watch: [['step']],
        };
      },
    },
    {
      id: 'freed',
      title: 'Blocks freed when a request finishes',
      make(rng) {
        const settings: PagedSettings = { block: pick<BlockSetting>(rng, ['2', '4']), sharing: true };
        const B = sizeOf(settings);
        const setup: OpCall[] = [['add', rng.int(B + 1, 3 * B)], ['fork', 'A']];
        if (rng.int(0, 1)) setup.push(['add', rng.int(2, 6)]);
        setup.push(...steps(rng.int(1, B + 1)));
        const who = pick(rng, ['A', 'B']);
        const before = run(settings, setup);
        const after = run(settings, [...setup, ['finish', who]]);
        const q = seqOf(before, who)!;
        const freed = after.free.length - before.free.length;
        const shared = q.table.filter((p) => before.blocks[p]!.ref > 1);
        return {
          prompt: `B was forked from A (parallel sampling, with sharing on). If **${who}** finishes now, how many blocks go back on the free list?`,
          setup,
          settings,
          answer: { kind: 'number', value: freed },
          explain: `${who}'s table is [${q.table.join(', ')}]. Finishing lowers each block's reference count by one, and only a block that drops to 0 is freed. ${shared.length ? `${list(shared)} ${shared.length === 1 ? 'is' : 'are'} shared with the other sample, so ${shared.length === 1 ? 'it stays' : 'they stay'}` : 'None of them is shared any more'}: ${freed} ${freed === 1 ? 'block goes' : 'blocks go'} back.`,
          watch: [['finish', who]],
        };
      },
    },
    {
      id: 'wasted',
      title: 'Wasted slots',
      make(rng) {
        const settings = settingsOf(rng, rng.int(0, 1) === 0);
        const setup = scene(rng, settings);
        const k = rng.int(1, 3);
        const watch = steps(k);
        const after = run(settings, [...setup, ...watch]);
        const B = sizeOf(settings);
        const per = after.seqs.map((q) => `${q.name}: ${q.table.length} × ${B} − ${q.len} = ${q.table.length * B - q.len}`);
        return {
          prompt: `Blocks hold ${B} tokens. After ${k === 1 ? 'one more step' : `${k} more steps`}, how many slots are handed out but empty (wasted)? ${RULES}`,
          setup,
          settings,
          answer: { kind: 'number', value: wasted(after, settings) },
          explain: `Only a request's last block can have empty slots. ${per.join('; ')}. In all ${wasted(after, settings)}. Reserving ${MAX_LEN} slots per request would waste ${after.seqs.length * MAX_LEN - after.seqs.reduce((t, q) => t + q.len, 0)}.`,
          watch,
        };
      },
    },
  ];
}
