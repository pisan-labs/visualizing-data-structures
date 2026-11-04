import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { parseQueueValue, queueArray } from '.';
import { items, type QueueSettings, type QueueState } from './model';
import { view } from './view';

const settings = (s: Partial<QueueSettings> = {}): QueueSettings =>
  ({ ...queueArray.defaults, ...s }) as QueueSettings;

const run = (st: QueueSettings, calls: OpCall[]) => new Timeline(queueArray, st, 1, calls);
const lastStep = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.at(-1)!;

describe('queue (circular array)', () => {
  it('is first in, first out', () => {
    const t = run(settings(), [['enqueue', 10], ['enqueue', 20], ['enqueue', 30], ['dequeue']]);
    expect(items(t.endState())).toEqual([20, 30]);
    expect(lastStep(t, 3).vars?.returned).toBe(10);
  });

  it('wraps rear around to index 0 and says so', () => {
    const t = run(settings({ capacity: 4 }), [
      ['enqueue', 1],
      ['enqueue', 2],
      ['enqueue', 3],
      ['dequeue'],
      ['enqueue', 4],
    ]);
    const s = t.endState();
    expect(s.rear).toBe(0);
    expect(items(s)).toEqual([2, 3, 4]);
    const steps = t.entries[4]!.steps;
    expect(steps.some((x) => x.marks.some((m) => m.id === 'wrap'))).toBe(true);
    expect(steps.at(-1)!.say).toContain('wraps around');
  });

  it('leaves one slot empty by default, and uses every slot with a count', () => {
    const calls: OpCall[] = [1, 2, 3, 4, 5].map((v) => ['enqueue', v]);
    const gap = run(settings({ capacity: 5 }), calls);
    expect(items(gap.endState())).toEqual([1, 2, 3, 4]);
    expect(lastStep(gap, 4).lines).toEqual(['enqueue.overflow']);
    const count = run(settings({ capacity: 5, full: 'count' }), calls);
    expect(items(count.endState())).toEqual([1, 2, 3, 4, 5]);
    expect(count.endState().front).toBe(count.endState().rear);
  });

  it('reports underflow when front catches up with rear', () => {
    const t = run(settings(), [['enqueue', 7], ['dequeue'], ['dequeue']]);
    expect(t.endState().front).toBe(1);
    expect(lastStep(t, 2).lines).toEqual(['dequeue.underflow']);
    expect(lastStep(t, 2).marks.some((m) => m.role === 'error')).toBe(true);
  });

  it('follows the pseudocode of the chosen convention', () => {
    const lines = (st: QueueSettings) =>
      run(st, [['enqueue', 5], ['dequeue']]).entries.flatMap((e) =>
        e.steps.flatMap((s) => s.lines),
      );
    expect(lines(settings())).toEqual([
      'enqueue.check',
      'enqueue.store',
      'enqueue.advance',
      'dequeue.check',
      'dequeue.read',
      'dequeue.advance',
      'dequeue.return',
    ]);
    expect(lines(settings({ full: 'count' }))).toEqual([
      'enqueue.check',
      'enqueue.store',
      'enqueue.advance',
      'enqueue.count',
      'dequeue.check',
      'dequeue.read',
      'dequeue.advance',
      'dequeue.count',
      'dequeue.return',
    ]);
  });

  it('matches a reference queue, with invariants on every step', () => {
    const call = fc.oneof(
      fc.integer({ min: 0, max: 99 }).map((v) => ['enqueue', v] as OpCall),
      fc.constant(['dequeue'] as OpCall),
      fc.constant(['peek'] as OpCall),
      fc.constant(['clear'] as OpCall),
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
            if (op === 'enqueue') {
              if (ref.length < max) ref.push(x!);
              else expect(last.lines).toEqual(['enqueue.overflow']);
            }
            if (op === 'dequeue') {
              if (ref.length) expect(last.vars?.returned).toBe(ref.shift());
              else expect(last.lines).toEqual(['dequeue.underflow']);
            }
            if (op === 'peek') {
              if (ref.length) expect(last.vars?.returned).toBe(ref[0]);
              else expect(last.lines).toEqual(['peek.empty']);
            }
            if (op === 'clear') ref.length = 0;
            expect(items(t.entries[k]!.end)).toEqual(ref);
            if (full === 'count') expect(last.vars?.count).toBe(ref.length);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s: QueueState = step.state;
            expect(s.front).toBeGreaterThanOrEqual(0);
            expect(s.front).toBeLessThan(capacity);
            expect(s.rear).toBe((s.front + s.count) % capacity);
            expect(s.count).toBeGreaterThanOrEqual(0);
            expect(s.count).toBeLessThanOrEqual(max);
            for (let k = 0; k < s.count; k++)
              expect(s.slots[(s.front + k) % capacity]).not.toBeNull();
            expect(step.vars?.front).toBe(s.front);
            expect(step.vars?.rear).toBe(s.rear);
            if (full === 'count') {
              expect(Math.abs(Number(step.vars?.count) - s.count)).toBeLessThanOrEqual(1);
            } else {
              expect(step.vars).not.toHaveProperty('count');
            }
            const scene = view(step, st);
            expect(scene.shapes.filter((sh) => sh.id.startsWith('cell-'))).toHaveLength(capacity);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('gives count-mode scripts one more slot in the code tabs', () => {
    const calls: OpCall[] = [['enqueue', 1]];
    expect(queueArray.code!.script(calls, settings({ capacity: 4 })).input[0]).toBe('new 4');
    expect(queueArray.code!.script(calls, settings({ capacity: 4, full: 'count' })).input[0]).toBe(
      'new 5',
    );
  });

  it('parses input values', () => {
    expect(parseQueueValue('42')).toBe(42);
    expect(parseQueueValue('-3')).toBe(-3);
    expect(parseQueueValue('cat')).toBe('cat');
    expect(parseQueueValue(' ')).toBeInstanceOf(Error);
    expect(parseQueueValue('toolongvalue')).toBeInstanceOf(Error);
  });
});
