import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { linkedList } from '.';
import { parseListValue, values, type ListExtra, type ListSettings, type ListState } from './model';

type T = Timeline<ListState, ListSettings, ListExtra>;

const settings = (s: Partial<ListSettings> = {}): ListSettings =>
  ({ ...linkedList.defaults, ...s }) as ListSettings;

const run = (calls: OpCall[], s: Partial<ListSettings> = {}): T =>
  new Timeline(linkedList, settings(s), 1, calls);

const lastStep = (t: T, k: number) => t.entries[k]!.steps.at(-1)!;
const linesOf = (t: T, k: number) => t.entries[k]!.steps.flatMap((s) => s.lines);

/** Follow next from head, failing on a dangling pointer or a cycle. */
function walk(s: ListState): number[] {
  const byUid = new Map(s.nodes.map((n) => [n.uid, n]));
  const seen: number[] = [];
  for (let u = s.head; u !== null; u = byUid.get(u)!.next) {
    expect(byUid.has(u), `node ${u} exists`).toBe(true);
    expect(seen, 'no cycle').not.toContain(u);
    seen.push(u);
  }
  return seen;
}

/** Invariants that hold on every step, in the middle of an operation too. */
function checkStep(s: ListState, st: ListSettings, vars: Record<string, unknown> | undefined) {
  const uids = s.nodes.map((n) => n.uid);
  expect(new Set(uids).size, 'uids are unique').toBe(uids.length);
  for (const n of s.nodes) if (n.next !== null) expect(uids).toContain(n.next);
  if (s.head !== null) expect(uids).toContain(s.head);
  if (st.tail === 'off') expect(s.tail).toBeNull();
  else if (s.tail !== null) expect(uids).toContain(s.tail);
  walk(s);
  // At most one node beyond the count: one being made, or one being removed.
  expect(s.nodes.length - s.size).toBeGreaterThanOrEqual(0);
  expect(s.nodes.length - s.size).toBeLessThanOrEqual(1);
  expect(vars?.n).toBe(s.size);
}

/** Invariants between operations: memory is exactly the list, and tail is its last node. */
function checkEnd(s: ListState, st: ListSettings) {
  const order = walk(s);
  expect(
    s.nodes.map((n) => n.uid),
    'no garbage, drawn in list order',
  ).toEqual(order);
  expect(s.size).toBe(order.length);
  if (st.tail === 'on') expect(s.tail).toBe(order.length ? order.at(-1) : null);
}

/** The reference: a plain array, with the same results the driver prints. */
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

/** What the model returned for operation k, in the driver's words. */
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
const index = fc.oneof(fc.integer({ min: -1, max: 7 }), fc.constant(1.5), fc.constant('A'));
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

describe('singly linked list', () => {
  it('matches an array for any sequence of operations, with invariants on every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('on' as const, 'off' as const),
        fc.array(call, { maxLength: 30 }),
        (tail, calls) => {
          const st = settings({ tail });
          const t = run(calls, st);
          const ref: Value[] = [];
          calls.forEach((c, k) => {
            expect(modelResult(t, k), `${c.join(' ')}`).toBe(apply(ref, c));
            expect(values(t.entries[k]!.end)).toEqual(ref);
            checkEnd(t.entries[k]!.end, st);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            checkStep(step.state, st, step.vars);
          }
        },
      ),
      { numRuns: 400 },
    );
    // Generous: the whole suite runs in parallel and this test runs 400 sequences.
  }, 60_000);

  it('links the new node in before moving head', () => {
    const t = run([
      ['insertHead', 2],
      ['insertHead', 1],
    ]);
    expect(linesOf(t, 1)).toEqual([
      'insertHead.new',
      'insertHead.link',
      'insertHead.head',
      'insertHead.check',
      'insertHead.size',
    ]);
    // At the link step the new node already points at the old head, and head has not moved.
    const link = t.entries[1]!.steps[1]!;
    const fresh = link.state.nodes[0]!;
    expect(fresh.next).toBe(link.state.head);
    expect(link.say).toMatch(/First new\.next = head/);
    expect(t.entries[1]!.steps[2]!.say).toMatch(/would lose the only pointer to 2/);
    expect(values(t.endState())).toEqual([1, 2]);
  });

  it('walks n - 1 hops to insert at the tail without a tail pointer, and none with one', () => {
    const calls: OpCall[] = [1, 2, 3, 4, 5].map((v) => ['insertTail', v]);
    const off = run(calls, { tail: 'off' });
    const hops = (t: T, k: number) =>
      Math.max(0, ...t.entries[k]!.steps.map((s) => Number(s.vars?.hops ?? 0)));
    expect([0, 1, 2, 3, 4].map((k) => hops(off, k))).toEqual([0, 0, 1, 2, 3]);
    const on = run(calls, { tail: 'on' });
    expect([0, 1, 2, 3, 4].map((k) => hops(on, k))).toEqual([0, 0, 0, 0, 0]);
    expect(linesOf(on, 4)).not.toContain('insertTail.move');
  });

  it('walks to the node before the tail even with a tail pointer', () => {
    const t = run([['insertTail', 1], ['insertTail', 2], ['insertTail', 3], ['removeTail']]);
    const last = lastStep(t, 3);
    expect(last.vars?.returned).toBe(3);
    expect(last.vars?.hops).toBe(1);
    expect(linesOf(t, 3)).toContain('removeTail.move');
    expect(t.endState().tail).toBe(t.endState().nodes[1]!.uid);
  });

  it('reverses with prev, cur and next, turning one pointer per pass', () => {
    const t = run([['insertTail', 1], ['insertTail', 2], ['insertTail', 3], ['reverse']]);
    expect(values(t.endState())).toEqual([3, 2, 1]);
    const steps = t.entries[3]!.steps;
    const flips = steps.filter((s) => s.lines.includes('reverse.flip'));
    expect(flips).toHaveLength(3);
    // Every step keeps all three nodes in memory; the pointers only change direction.
    for (const s of steps) expect(s.state.nodes).toHaveLength(3);
    expect(steps.find((s) => s.lines.includes('reverse.save'))!.extra?.ptrs).toHaveProperty('next');
    expect(t.endState().tail).toBe(t.entries[2]!.end.head);
  });

  it('shows an unlinked node as garbage before it is collected', () => {
    const t = run([['insertTail', 1], ['insertTail', 2], ['removeHead']]);
    const steps = t.entries[2]!.steps;
    const moved = steps.find((s) => s.lines.includes('removeHead.move'))!;
    const scene = linkedList.view(moved, settings());
    expect(scene.shapes.some((s) => s.id === 'n1.gc')).toBe(true);
    // The last step has collected it.
    expect(steps.at(-1)!.state.nodes.map((n) => n.value)).toEqual([2]);
  });

  it('keeps a removed node alive while a local pointer still holds it', () => {
    const t = run([
      ['insertTail', 1],
      ['insertTail', 2],
      ['insertTail', 3],
      ['removeAt', 1],
    ]);
    const steps = t.entries[3]!.steps;
    const unlinked = steps.find((s) => s.lines.includes('removeAt.unlink'))!;
    const before = linkedList.view(unlinked, settings());
    expect(before.shapes.some((s) => s.id === 'n2.gc')).toBe(false);
    const garbage = steps.at(-2)!;
    expect(linkedList.view(garbage, settings()).shapes.some((s) => s.id === 'n2.gc')).toBe(true);
  });

  it('reports bad indexes without changing the list', () => {
    const t = run([
      ['insertTail', 1],
      ['get', 1],
      ['insertAt', 3, 9],
      ['removeAt', 'A'],
      ['get', 0.5],
    ]);
    for (const k of [1, 2, 3, 4]) {
      expect(lastStep(t, k).marks.some((m) => m.role === 'error')).toBe(true);
      expect(values(t.entries[k]!.end)).toEqual([1]);
    }
  });

  it('parses input values', () => {
    expect(parseListValue('42')).toBe(42);
    expect(parseListValue('-3')).toBe(-3);
    expect(parseListValue('cat')).toBe('cat');
    expect(parseListValue('  ')).toBeInstanceOf(Error);
    expect(parseListValue('toolong')).toBeInstanceOf(Error);
    expect(parseListValue('a b')).toBeInstanceOf(Error);
  });
});
