import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { dequeArray, parseDequeValue } from '.';
import { items, type DequeSettings, type DequeState } from './model';
import { view } from './view';

const settings = (s: Partial<DequeSettings> = {}): DequeSettings =>
  ({ ...dequeArray.defaults, ...s }) as DequeSettings;

const run = (st: DequeSettings, calls: OpCall[]) => new Timeline(dequeArray, st, 1, calls);
const lastStep = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.at(-1)!;

describe('deque (circular array)', () => {
  it('adds and removes at both ends', () => {
    const t = run(settings(), [
      ['addLast', 10],
      ['addLast', 20],
      ['addFirst', 5],
      ['removeLast'],
      ['removeFirst'],
    ]);
    expect(items(t.endState())).toEqual([10]);
    expect(lastStep(t, 3).vars?.returned).toBe(20);
    expect(lastStep(t, 4).vars?.returned).toBe(5);
  });

  it('wraps front backward from 0 to the last index', () => {
    const t = run(settings({ capacity: 6 }), [['addFirst', 9]]);
    expect(t.endState().front).toBe(5);
    expect(t.endState().slots[5]?.value).toBe(9);
    const back = t.entries[0]!.steps.find((s) => s.lines.includes('addFirst.back'))!;
    expect(back.say).toContain('(0 - 1) mod 6 = 5');
    expect(back.marks.some((m) => m.id === 'wrap')).toBe(true);
    // The slot front moves to is not written until the next step.
    expect(back.extra?.pending).toBe(5);
  });

  it('reads the last item just before rear', () => {
    const t = run(settings(), [['addLast', 1], ['addLast', 2], ['peekLast'], ['removeLast']]);
    expect(lastStep(t, 2).vars?.returned).toBe(2);
    expect(lastStep(t, 3).vars?.returned).toBe(2);
    expect(t.entries[3]!.steps.map((s) => s.lines[0])).toEqual([
      'removeLast.check',
      'removeLast.back',
      'removeLast.read',
    ]);
  });

  it('reports overflow and underflow at either end', () => {
    const full = run(settings({ capacity: 3 }), [
      ['addFirst', 1],
      ['addLast', 2],
      ['addFirst', 3],
      ['addLast', 4],
    ]);
    expect(lastStep(full, 2).lines).toEqual(['addFirst.overflow']);
    expect(lastStep(full, 3).lines).toEqual(['addLast.overflow']);
    const empty = run(settings(), [['removeFirst'], ['removeLast'], ['peekFirst'], ['peekLast']]);
    expect(empty.entries.map((e) => e.steps.at(-1)!.lines[0])).toEqual([
      'removeFirst.underflow',
      'removeLast.underflow',
      'peekFirst.empty',
      'peekLast.empty',
    ]);
  });

  // Capacity 2 with one slot left empty used to say "holds at most 1 items".
  it('says "1 item" when two slots hold one', () => {
    const t = run(settings({ capacity: 2 }), [
      ['addFirst', 1],
      ['addLast', 2],
    ]);
    expect(t.at(0).step.say).toContain('holds at most 1 item.');
    expect(lastStep(t, 1).say).toContain('it holds 1 item,');
  });

  it('matches a reference deque, with invariants on every step', () => {
    const value = fc.integer({ min: 0, max: 99 });
    const call = fc.oneof(
      value.map((v) => ['addFirst', v] as OpCall),
      value.map((v) => ['addLast', v] as OpCall),
      fc.constant(['removeFirst'] as OpCall),
      fc.constant(['removeLast'] as OpCall),
      fc.constant(['peekFirst'] as OpCall),
      fc.constant(['peekLast'] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 12 }),
        fc.constantFrom('gap' as const, 'count' as const),
        fc.constantFrom('ring' as const, 'row' as const),
        fc.array(call, { maxLength: 50 }),
        (capacity, full, layout, calls) => {
          const st = settings({ capacity, full, layout });
          const max = full === 'gap' ? capacity - 1 : capacity;
          const t = run(st, calls);
          const ref: Value[] = [];
          calls.forEach(([op, x], k) => {
            const last = lastStep(t, k);
            const ret = last.vars?.returned;
            if (op === 'addFirst' || op === 'addLast') {
              if (ref.length === max) expect(last.lines).toEqual([`${op}.overflow`]);
              else if (op === 'addFirst') ref.unshift(x!);
              else ref.push(x!);
            } else if (ref.length === 0) {
              expect(ret).toBeUndefined();
              expect(last.marks.some((m) => m.role === 'error')).toBe(true);
            } else if (op === 'removeFirst') expect(ret).toBe(ref.shift());
            else if (op === 'removeLast') expect(ret).toBe(ref.pop());
            else if (op === 'peekFirst') expect(ret).toBe(ref[0]);
            else expect(ret).toBe(ref.at(-1));
            expect(items(t.entries[k]!.end)).toEqual(ref);
            if (full === 'count') expect(last.vars?.count).toBe(ref.length);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s: DequeState = step.state;
            expect(s.front).toBeGreaterThanOrEqual(0);
            expect(s.front).toBeLessThan(capacity);
            expect(s.rear).toBe((s.front + s.count) % capacity);
            expect(s.count).toBeGreaterThanOrEqual(0);
            expect(s.count).toBeLessThanOrEqual(max);
            for (let k = 0; k < s.count; k++) {
              const at = (s.front + k) % capacity;
              if (at !== step.extra?.pending) expect(s.slots[at]).not.toBeNull();
            }
            expect(step.vars?.front).toBe(s.front);
            expect(step.vars?.rear).toBe(s.rear);
            if (full === 'count')
              expect(Math.abs(Number(step.vars?.count) - s.count)).toBeLessThanOrEqual(1);
            else expect(step.vars).not.toHaveProperty('count');
            const scene = view(step, st);
            expect(scene.shapes.filter((sh) => sh.id.startsWith('cell-'))).toHaveLength(capacity);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('parses input values', () => {
    expect(parseDequeValue('42')).toBe(42);
    expect(parseDequeValue('A')).toBe('A');
    expect(parseDequeValue('')).toBeInstanceOf(Error);
    expect(parseDequeValue('1234567')).toBeInstanceOf(Error);
  });
});
