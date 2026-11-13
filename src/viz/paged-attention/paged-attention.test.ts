import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { pagedAttention, stateLine } from '.';
import {
  blocksOf,
  MAX_LEN,
  MAX_SEQS,
  sizeOf,
  wasted,
  wastedContiguous,
  type BlockSetting,
  type PagedSettings,
  type PagedState,
} from './model';

/**
 * A second implementation, written from the rules rather than from the page: a block is a list
 * of token positions, a request a list of blocks, the free list an array whose end is the top.
 * Refusals follow the same rules. It returns the same line the code tabs print, or null.
 */
function reference(settings: PagedSettings) {
  const B = sizeOf(settings);
  const n = blocksOf(settings);
  const stack: number[] = Array.from({ length: n }, (_, i) => n - 1 - i);
  const held = new Map<number, number[]>(); // block -> positions, while some table uses it
  const tables = new Map<string, number[]>();
  const lens = new Map<string, number>();
  let named = 0;
  let copies = 0;
  const uses = (p: number) => [...tables.values()].filter((t) => t.includes(p)).length;
  const pop = () => {
    const p = stack.pop()!;
    held.set(p, []);
    return p;
  };
  const line = () =>
    `${tables.size ? [...tables].map(([k, t]) => `${k} ${t.join(' ')}`).join(' / ') : '-'} | free ${stack.length ? [...stack].reverse().join(' ') : '-'} | copies ${copies}`;
  return (call: OpCall): string | null => {
    const [op, arg] = call;
    if (op === 'add') {
      const k = Number(arg);
      if (!Number.isInteger(k) || k < 1 || k > MAX_LEN) return null;
      if (tables.size >= MAX_SEQS || named >= 26 || Math.ceil(k / B) > stack.length) return null;
      const t: number[] = [];
      for (let i = 1; i <= k; i++) {
        if ((i - 1) % B === 0) t.push(pop());
        held.get(t.at(-1)!)!.push(i);
      }
      const name = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[named++]!;
      tables.set(name, t);
      lens.set(name, k);
      return line();
    }
    if (op === 'step') {
      if (!tables.size) return null;
      let changed = false;
      for (const [name, t] of tables) {
        const len = lens.get(name)!;
        if (len >= MAX_LEN) continue;
        const last = t.at(-1)!;
        if (held.get(last)!.length === B) {
          if (!stack.length) continue;
          t.push(pop());
        } else if (uses(last) > 1) {
          if (!stack.length) continue;
          const p = pop();
          held.set(p, [...held.get(last)!]);
          t[t.length - 1] = p;
          copies++;
        }
        held.get(t.at(-1)!)!.push(len + 1);
        lens.set(name, len + 1);
        changed = true;
      }
      return changed ? line() : null;
    }
    const name = String(arg).toUpperCase();
    if (!tables.has(name)) return null;
    if (op === 'finish') {
      const t = tables.get(name)!;
      tables.delete(name);
      lens.delete(name);
      for (const p of [...t].reverse())
        if (uses(p) === 0) {
          held.delete(p);
          stack.push(p);
        }
      return line();
    }
    // fork
    if (tables.size >= MAX_SEQS || named >= 26) return null;
    const t = tables.get(name)!;
    if (!settings.sharing && t.length > stack.length) return null;
    const child = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[named++]!;
    if (settings.sharing) tables.set(child, [...t]);
    else
      tables.set(
        child,
        t.map((p) => {
          const q = pop();
          held.set(q, [...held.get(p)!]);
          copies++;
          return q;
        }),
      );
    lens.set(child, lens.get(name)!);
    return line();
  };
}

const settingsArb = fc.record({
  block: fc.constantFrom<BlockSetting>('2', '4', '8'),
  sharing: fc.boolean(),
});
const letter = fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H');
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 18 }).map((n): OpCall => ['add', n]) },
  { weight: 6, arbitrary: fc.constant<OpCall>(['step']) },
  { weight: 2, arbitrary: letter.map((x): OpCall => ['finish', x]) },
  { weight: 2, arbitrary: letter.map((x): OpCall => ['fork', x]) },
);

/** Every position a request has, read through its block table. */
const tokensOf = (s: PagedState, name: string) =>
  s.seqs.find((q) => q.name === name)!.table.flatMap((p) => s.blocks[p]!.tokens);

function checkState(s: PagedState, settings: PagedSettings, end = false) {
  const B = sizeOf(settings);
  const n = blocksOf(settings);
  expect(s.blocks).toHaveLength(n);
  // Reference counts are exactly the number of tables that point at a block.
  s.blocks.forEach((b, p) => {
    const uses = s.seqs.reduce((t, q) => t + q.table.filter((x) => x === p).length, 0);
    expect(b.ref).toBe(uses);
    expect(b.tokens.length).toBeLessThanOrEqual(B);
    if (b.ref === 0) expect(b.tokens).toEqual([]);
    if (!settings.sharing) expect(b.ref).toBeLessThanOrEqual(1);
  });
  // The free list holds every unused block once, and nothing else.
  expect(new Set(s.free).size).toBe(s.free.length);
  expect([...s.free].sort((a, b) => a - b)).toEqual(
    s.blocks.flatMap((b, p) => (b.ref === 0 ? [p] : [])),
  );
  for (const q of s.seqs) {
    // Read through its table, a request has tokens 1 to len, in order, with no gaps.
    expect(tokensOf(s, q.name)).toEqual(Array.from({ length: q.len }, (_, i) => i + 1));
    // Mid-step, a new block can be on the table before its first token is written.
    expect(q.table.length - Math.ceil(q.len / B)).toBeGreaterThanOrEqual(0);
    expect(q.table.length - Math.ceil(q.len / B)).toBeLessThanOrEqual(end ? 0 : 1);
    expect(q.len).toBeLessThanOrEqual(MAX_LEN);
  }
  expect(wasted(s, settings)).toBeGreaterThanOrEqual(0);
  expect(wasted(s, settings)).toBeLessThanOrEqual(s.seqs.length * (end ? B - 1 : B));
  expect(wastedContiguous(s)).toBeGreaterThanOrEqual(0);
}

describe('paged-attention', () => {
  it('matches an independent implementation, operation by operation', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 40 }), (settings, calls) => {
        const ref = reference(settings);
        const t = new Timeline(pagedAttention, settings, 1, calls);
        let before = t.initial.state;
        for (const e of t.entries) {
          const want = ref(e.call);
          if (want === null) expect(e.end).toBe(before);
          else expect(stateLine(e.end)).toBe(want);
          before = e.end;
        }
      }),
      { numRuns: 400 },
    );
  });

  it('keeps its invariants on every step', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 30 }), (settings, calls) => {
        const t = new Timeline(pagedAttention, settings, 1, calls);
        for (let i = 0; i < t.length; i++) checkState(t.at(i).step.state, settings);
        for (const e of t.entries) checkState(e.end, settings, true);
      }),
      { numRuns: 200 },
    );
  });

  it('copies a shared block only when a sample writes into it', () => {
    const run = (calls: OpCall[], sharing = true) =>
      new Timeline(pagedAttention, { block: '4', sharing }, 1, calls).endState();
    // A full last block is never copied: the forks just get new blocks.
    const full = run([['add', 8], ['fork', 'A'], ['step']]);
    expect(full.copies).toBe(0);
    expect(full.seqs.map((q) => q.table)).toEqual([
      [0, 1, 2],
      [0, 1, 3],
    ]);
    // A partly filled one is copied by every sample but the last to write.
    const part = run([['add', 6], ['fork', 'A'], ['fork', 'A'], ['step']]);
    expect(part.copies).toBe(2);
    expect(part.seqs.map((q) => q.table)).toEqual([
      [0, 2],
      [0, 3],
      [0, 1],
    ]);
    expect(part.blocks[0]!.ref).toBe(3);
    // Without sharing, the fork copies every block at once and never again.
    const off = run([['add', 6], ['fork', 'A'], ['fork', 'A'], ['step']], false);
    expect(off.copies).toBe(4);
    expect(off.blocks.filter((b) => b.ref > 0)).toHaveLength(6);
  });

  it('tells the story the examples and the concept page tell', () => {
    const end = (id: string) => {
      const ex = pagedAttention.examples.find((e) => e.id === id)!;
      return new Timeline(pagedAttention, ex.settings as PagedSettings, 1, ex.ops).endState();
    };
    expect(stateLine(end('on-demand'))).toBe('A 0 1 4 / B 2 3 | free 5 6 7 8 9 10 11 | copies 0');
    expect(stateLine(end('finish-frees'))).toBe(
      'B 2 5 / C 3 4 / D 0 1 6 | free 7 8 9 10 11 | copies 0',
    );
    const shares = end('fork-shares');
    expect(stateLine(shares)).toBe('A 0 2 4 / B 0 3 5 / C 0 1 6 | free 7 8 9 10 11 | copies 2');
    expect(end('fork-copies').free).toHaveLength(3);
    expect(wasted(end('big-blocks'), { block: '8', sharing: true })).toBe(9);
    const short = end('many-short');
    expect(short.seqs).toHaveLength(6);
    expect(wastedContiguous(short)).toBe(69);
    expect(stateLine(end('out-of-blocks'))).toBe(
      'A 0 1 10 2 / C 4 5 6 3 / D 7 8 9 11 | free - | copies 0',
    );
  });

  it('refuses what does not fit', () => {
    const say = (calls: OpCall[], settings: PagedSettings = { block: '4', sharing: true }) => {
      const t = new Timeline(pagedAttention, settings, 1, calls);
      return t.at(t.length - 1).step.say;
    };
    expect(say([['step']])).toMatch(/No request is running/);
    expect(say([['add', 17]])).toMatch(/1 to 16 tokens/);
    expect(say([['add', 'cat']])).toMatch(/prompt length/);
    expect(say([['finish', 'A']])).toMatch(/no running request A/);
    expect(say([['add', 3], ['fork', 5]])).toMatch(/letter/);
    expect(say(Array.from({ length: 7 }, (): OpCall => ['add', 1]))).toMatch(/at most 6/);
    expect(say([['add', 16], ['add', 16], ['add', 16], ['add', 1]])).toMatch(/none is free/);
    expect(
      say(
        [
          ['add', 16],
          ['add', 16],
          ['add', 9],
          ['fork', 'C'],
        ],
        { block: '4', sharing: false },
      ),
    ).toMatch(/only 1 is free/);
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(pagedAttention, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(pagedAttention, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
