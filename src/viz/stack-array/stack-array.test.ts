import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { parseStackValue, stackArray } from '.';
import { topOf, type StackSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const settings = (s: Partial<StackSettings> = {}): StackSettings =>
  ({ ...stackArray.defaults, ...s }) as StackSettings;

function contents(t: Timeline<ReturnType<typeof stackArray.init>, StackSettings, unknown>) {
  const s = t.endState();
  return s.slots.slice(0, s.size).map((x) => x!.value);
}

describe('stack (array)', () => {
  it('is last in, first out', () => {
    const t = new Timeline(stackArray, settings(), 1, [
      ['push', 10],
      ['push', 20],
      ['push', 30],
      ['pop'],
    ]);
    expect(contents(t)).toEqual([10, 20]);
    const pop = t.entries[3]!;
    expect(pop.steps.at(-1)!.vars?.returned).toBe(30);
  });

  it('reports overflow and leaves the stack alone', () => {
    const t = new Timeline(stackArray, settings({ capacity: 2 }), 1, [
      ['push', 1],
      ['push', 2],
      ['push', 3],
    ]);
    expect(contents(t)).toEqual([1, 2]);
    const last = t.entries[2]!.steps.at(-1)!;
    expect(last.lines).toEqual(['push.overflow']);
    expect(last.marks.some((m) => m.role === 'error')).toBe(true);
  });

  it('reports underflow on an empty stack', () => {
    const t = new Timeline(stackArray, settings(), 1, [['pop']]);
    expect(t.entries[0]!.steps.at(-1)!.lines).toEqual(['pop.underflow']);
  });

  it('keeps popped values in memory until overwritten', () => {
    const t = new Timeline(stackArray, settings(), 1, [['push', 1], ['push', 2], ['pop']]);
    const s = t.endState();
    expect(s.size).toBe(1);
    expect(s.slots[1]?.value).toBe(2);
  });

  it('orders the push steps by convention', () => {
    const count = new Timeline(stackArray, settings({ top: 'count' }), 1, [['push', 5]]);
    const index = new Timeline(stackArray, settings({ top: 'index' }), 1, [['push', 5]]);
    const lines = (t: typeof count) => t.entries[0]!.steps.flatMap((s) => s.lines);
    expect(lines(count)).toEqual(['push.check', 'push.store', 'push.inc']);
    expect(lines(index)).toEqual(['push.check', 'push.inc', 'push.store']);
    expect(index.initial.vars?.top).toBe(-1);
    expect(count.initial.vars?.top).toBe(0);
  });

  it('matches a reference stack for any sequence of operations', () => {
    const call = fc.oneof(
      fc.integer({ min: 0, max: 99 }).map((v) => ['push', v] as OpCall),
      fc.constant(['pop'] as OpCall),
      fc.constant(['peek'] as OpCall),
      fc.constant(['clear'] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 16 }),
        fc.constantFrom('count' as const, 'index' as const),
        fc.array(call, { maxLength: 40 }),
        (capacity, top, calls) => {
          const st = settings({ capacity, top });
          const t = new Timeline(stackArray, st, 1, calls);
          const ref: Value[] = [];
          calls.forEach(([op, x], k) => {
            const last = t.entries[k]!.steps.at(-1)!;
            if (op === 'push' && ref.length < capacity) ref.push(x!);
            if (op === 'pop' && ref.length) expect(last.vars?.returned).toBe(ref.pop());
            if (op === 'peek' && ref.length) expect(last.vars?.returned).toBe(ref.at(-1));
            if (op === 'clear') ref.length = 0;
          });
          expect(contents(t)).toEqual(ref);
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            expect(step.vars?.top).toBe(topOf(step.state, st));
            expect(step.state.size).toBeGreaterThanOrEqual(0);
            expect(step.state.size).toBeLessThanOrEqual(capacity);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('parses input values', () => {
    expect(parseStackValue('42')).toBe(42);
    expect(parseStackValue('-3')).toBe(-3);
    expect(parseStackValue('2.5')).toBe(2.5);
    expect(parseStackValue('cat')).toBe('cat');
    expect(parseStackValue('  ')).toBeInstanceOf(Error);
    expect(parseStackValue('toolongvalue')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  // Fit the screen (the default) draws the array across a laptop and up a phone: an upright\narray of 8 drew its indices at 9.8 px on a laptop, a row of 8 at 6.9 px on a phone.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(stackArray, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(14);
    expect(smallestText(stackArray, PHONE_STAGE).px).toBeGreaterThanOrEqual(10);
  });
});
