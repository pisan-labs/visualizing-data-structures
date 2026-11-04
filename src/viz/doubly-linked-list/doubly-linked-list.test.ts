import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { doublyLinkedList } from '.';
import { values, type DExtra, type DSettings, type DState } from './model';

type T = Timeline<DState, DSettings, DExtra>;

const settings = (s: Partial<DSettings> = {}): DSettings =>
  ({ ...doublyLinkedList.defaults, ...s }) as DSettings;
const run = (calls: OpCall[], s: Partial<DSettings> = {}): T =>
  new Timeline(doublyLinkedList, settings(s), 1, calls);
const lastStep = (t: T, k: number) => t.entries[k]!.steps.at(-1)!;
const linesOf = (t: T, k: number) => t.entries[k]!.steps.flatMap((s) => s.lines);

/** Follow one direction from the start until the end marker; fails on a dangling pointer or a loop. */
function walk(s: DState, dir: 'next' | 'prev'): number[] {
  const by = new Map(s.nodes.map((n) => [n.uid, n]));
  const endMark = s.nil;
  let u = s.nil !== null ? by.get(s.nil)![dir] : dir === 'next' ? s.head : s.tail;
  const seen: number[] = [];
  while (u !== endMark && u !== null) {
    expect(by.has(u), `node ${u} exists`).toBe(true);
    expect(seen, `no stray cycle going ${dir}`).not.toContain(u);
    seen.push(u);
    u = by.get(u)![dir];
  }
  return seen;
}

function checkStep(
  s: DState,
  st: DSettings,
  vars: Record<string, unknown> | undefined,
  reversing: boolean,
) {
  const uids = s.nodes.map((n) => n.uid);
  expect(new Set(uids).size).toBe(uids.length);
  for (const n of s.nodes) {
    if (n.next !== null) expect(uids).toContain(n.next);
    if (n.prev !== null) expect(uids).toContain(n.prev);
  }
  if (st.sentinel === 'on') {
    expect(s.nil).not.toBeNull();
    expect(s.nodes[0]!.sentinel).toBe(true);
    expect(s.head).toBeNull();
    expect(s.tail).toBeNull();
  } else {
    expect(s.nil).toBeNull();
  }
  walk(s, 'next');
  // Halfway through a reversal the prev pointers are mixed up on purpose.
  if (!reversing) walk(s, 'prev');
  const real = s.nodes.length - (s.nil !== null ? 1 : 0);
  expect(real - s.size).toBeGreaterThanOrEqual(0);
  expect(real - s.size).toBeLessThanOrEqual(1);
  expect(vars?.n).toBe(s.size);
}

/** Between operations: memory is exactly the list, and next and prev agree everywhere. */
function checkEnd(s: DState) {
  const fwd = walk(s, 'next');
  const back = walk(s, 'prev');
  expect(back).toEqual([...fwd].reverse());
  expect(s.size).toBe(fwd.length);
  const keep = s.nil !== null ? [s.nil, ...fwd] : fwd;
  expect(s.nodes.map((n) => n.uid)).toEqual(keep);
  const by = new Map(s.nodes.map((n) => [n.uid, n]));
  for (const n of s.nodes) {
    if (n.next !== null) expect(by.get(n.next)!.prev).toBe(n.uid);
    if (n.prev !== null) expect(by.get(n.prev)!.next).toBe(n.uid);
  }
  if (s.nil === null) {
    expect(s.head).toBe(fwd[0] ?? null);
    expect(s.tail).toBe(fwd.at(-1) ?? null);
  }
}

function apply(ref: Value[], [op, a, b]: OpCall): string {
  const isIndex = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
  switch (op) {
    case 'insertHead':
      ref.unshift(a!);
      return 'ok';
    case 'insertTail':
      ref.push(a!);
      return 'ok';
    case 'insertAt':
      if (!isIndex(a, ref.length)) return 'index error';
      ref.splice(a as number, 0, b!);
      return 'ok';
    case 'removeHead':
      return ref.length ? String(ref.shift()) : 'empty';
    case 'removeTail':
      return ref.length ? String(ref.pop()) : 'empty';
    case 'removeAt':
      return isIndex(a, ref.length - 1) ? String(ref.splice(a as number, 1)[0]) : 'index error';
    case 'removeValue': {
      const i = ref.indexOf(a!);
      if (i >= 0) ref.splice(i, 1);
      return String(i >= 0);
    }
    case 'search':
      return String(ref.indexOf(a!));
    case 'get':
      return isIndex(a, ref.length - 1) ? String(ref[a as number]) : 'index error';
    case 'reverse':
      ref.reverse();
      return 'ok';
  }
  throw new Error(op);
}

function modelResult(t: T, k: number): string {
  const last = lastStep(t, k);
  const failed = last.lines.some((l) => l.endsWith('.error'));
  const op = t.entries[k]!.call[0];
  if (op === 'insertHead' || op === 'insertTail' || op === 'reverse') return 'ok';
  if (op === 'insertAt') return failed ? 'index error' : 'ok';
  if (failed) return op === 'removeHead' || op === 'removeTail' ? 'empty' : 'index error';
  return String(last.vars?.returned);
}

const value = fc.oneof(fc.integer({ min: 0, max: 9 }), fc.constantFrom('A', 'B'));
const index = fc.oneof(fc.integer({ min: -1, max: 7 }), fc.constant(2.5), fc.constant('A'));
const call: fc.Arbitrary<OpCall> = fc.oneof(
  value.map((v) => ['insertHead', v] as OpCall),
  value.map((v) => ['insertTail', v] as OpCall),
  fc.tuple(index, value).map(([i, v]) => ['insertAt', i, v] as OpCall),
  fc.constant(['removeHead'] as OpCall),
  fc.constant(['removeTail'] as OpCall),
  index.map((i) => ['removeAt', i] as OpCall),
  value.map((v) => ['removeValue', v] as OpCall),
  value.map((v) => ['search', v] as OpCall),
  index.map((i) => ['get', i] as OpCall),
  fc.constant(['reverse'] as OpCall),
);

describe('doubly linked list', () => {
  it('cites only lines its pseudocode has, inserting at the end with or without a sentinel', () => {
    // insertAt(0, x) on an empty list is the end case; it once cited a sentinel-only line.
    for (const sentinel of ['on', 'off'] as const) {
      const settings: DSettings = { sentinel };
      const t = new Timeline(doublyLinkedList, settings, 1, [
        ['insertAt', 0, 'A'],
        ['insertAt', 1, 'B'],
        ['insertAt', 1, 'C'],
      ]);
      const ids = new Set(
        doublyLinkedList
          .pseudocode(settings)
          .flatMap((b) => b.lines)
          .map((l) => l.id),
      );
      for (const e of t.entries)
        for (const step of e.steps) for (const id of step.lines) expect(ids).toContain(id);
    }
  });

  it('matches an array for any sequence of operations, with invariants on every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('on' as const, 'off' as const),
        fc.array(call, { maxLength: 30 }),
        (sentinel, calls) => {
          const st = settings({ sentinel });
          const t = run(calls, st);
          const ref: Value[] = [];
          calls.forEach((c, k) => {
            expect(modelResult(t, k), c.join(' ')).toBe(apply(ref, c));
            expect(values(t.entries[k]!.end)).toEqual(ref);
            checkEnd(t.entries[k]!.end);
          });
          for (let i = 0; i < t.length; i++) {
            const { step, op } = t.at(i);
            checkStep(step.state, st, step.vars, op >= 0 && t.entries[op]!.call[0] === 'reverse');
          }
        },
      ),
      { numRuns: 400 },
    );
    // Generous: the whole suite runs in parallel and this test runs 400 sequences.
  }, 60_000);

  it('shows four pointer updates on insert, the neighbours last', () => {
    const t = run([
      ['insertTail', 1],
      ['insertTail', 3],
      ['insertAt', 1, 2],
    ]);
    const updates = linesOf(t, 2).filter((l) =>
      ['setNext', 'setPrev', 'predLink', 'succPrev'].some((u) => l.endsWith(u)),
    );
    expect(updates).toEqual([
      'insertAt.setNext',
      'insertAt.setPrev',
      'insertAt.predLink',
      'insertAt.succPrev',
    ]);
    expect(linesOf(t, 0)).toEqual([
      'insertTail.new',
      'insertTail.setNext',
      'insertTail.setPrev',
      'insertTail.fixPred',
      'insertTail.fixSucc',
      'insertTail.size',
    ]);
  });

  it('shows four pointer updates on remove, and no if statements with a sentinel', () => {
    const calls: OpCall[] = [['insertTail', 1], ['insertTail', 2], ['removeHead']];
    const on = linesOf(run(calls, { sentinel: 'on' }), 2);
    expect(on.filter((l) => /(plink|nlink|clearNext|clearPrev)$/.test(l))).toHaveLength(4);
    expect(on.some((l) => /(pnull|nnull)$/.test(l))).toBe(false);
    const off = linesOf(run(calls, { sentinel: 'off' }), 2);
    expect(off).toContain('removeHead.pnull');
    expect(off).toContain('removeHead.phead');
  });

  it('removes the tail without walking', () => {
    const t = run([1, 2, 3, 4, 5].map((v) => ['insertTail', v] as OpCall).concat([['removeTail']]));
    expect(lastStep(t, 5).vars?.returned).toBe(5);
    expect(t.entries[5]!.steps.some((s) => s.vars?.hops !== undefined)).toBe(false);
  });

  it('walks from the nearer end', () => {
    const calls: OpCall[] = [10, 20, 30, 40, 50, 60, 70, 80].map((v) => ['insertTail', v]);
    const t = run([...calls, ['get', 1], ['get', 6]]);
    expect(lastStep(t, 8).vars?.returned).toBe(20);
    expect(lastStep(t, 9).vars?.returned).toBe(70);
    expect(linesOf(t, 8)).toContain('get.front');
    expect(linesOf(t, 9)).toContain('get.back');
    const hops = (k: number) =>
      Math.max(...t.entries[k]!.steps.map((s) => Number(s.vars?.hops ?? 0)));
    expect([hops(8), hops(9)]).toEqual([1, 1]);
  });

  it('starts as a sentinel pointing at itself', () => {
    const s = doublyLinkedList.init(settings());
    expect(s.nodes).toHaveLength(1);
    expect(s.nodes[0]).toMatchObject({ next: s.nil, prev: s.nil, sentinel: true });
  });
});
