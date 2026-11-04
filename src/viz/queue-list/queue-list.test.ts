import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { parseListValue, queueList } from '.';
import { items } from './model';
import { view } from './view';

const run = (calls: OpCall[]) => new Timeline(queueList, {}, 1, calls);
const lastStep = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.at(-1)!;
const lines = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.flatMap((s) => s.lines);
/** Where a named pointer's arrow ends, from the drawing. */
const arrowTip = (scene: ReturnType<typeof view>, name: string) => {
  const a = scene.shapes.find((sh) => sh.id === `${name}-arrow`);
  return a && a.kind === 'arrow' ? a.x2 : undefined;
};

describe('queue (linked list)', () => {
  it('is first in, first out', () => {
    const t = run([['enqueue', 10], ['enqueue', 20], ['enqueue', 30], ['dequeue']]);
    expect(items(t.endState())).toEqual([20, 30]);
    expect(lastStep(t, 3).vars?.returned).toBe(10);
  });

  it('sets head on the first enqueue and clears tail on the last dequeue', () => {
    const t = run([['enqueue', 5], ['enqueue', 6], ['dequeue'], ['dequeue']]);
    expect(lines(t, 0)).toContain('enqueue.head');
    expect(lines(t, 0)).not.toContain('enqueue.link');
    expect(lines(t, 1)).toContain('enqueue.link');
    expect(lines(t, 2)).not.toContain('dequeue.tail');
    expect(lines(t, 3)).toContain('dequeue.tail');
    // Halfway through the last dequeue, head is null but tail still points at the old node.
    const half = t.entries[3]!.steps.find((s) => s.lines.includes('dequeue.next'))!;
    expect(half.extra?.old?.garbage).toBe(false);
    const scene = view(half);
    expect(scene.shapes.some((sh) => sh.id === 'head-null')).toBe(true);
    expect(scene.shapes.some((sh) => sh.id === 'tail-null')).toBe(false);
  });

  it('reports underflow on an empty queue', () => {
    const t = run([['dequeue'], ['peek']]);
    expect(lastStep(t, 0).lines).toEqual(['dequeue.underflow']);
    expect(lastStep(t, 1).lines).toEqual(['peek.empty']);
  });

  it('matches a reference queue, with invariants on every step', () => {
    const call = fc.oneof(
      fc
        .oneof(fc.integer({ min: 0, max: 99 }), fc.constantFrom('A', 'cat'))
        .map((v) => ['enqueue', v] as OpCall),
      fc.constant(['dequeue'] as OpCall),
      fc.constant(['peek'] as OpCall),
    );
    fc.assert(
      fc.property(fc.array(call, { maxLength: 40 }), (calls) => {
        const t = run(calls);
        const ref: Value[] = [];
        calls.forEach(([op, x], k) => {
          const last = lastStep(t, k);
          if (op === 'enqueue') ref.push(x!);
          else if (ref.length === 0) expect(last.vars?.returned).toBeUndefined();
          else expect(last.vars?.returned).toBe(op === 'dequeue' ? ref.shift() : ref[0]);
          expect(items(t.entries[k]!.end)).toEqual(ref);
          // At the end of every operation, head and tail are null exactly when it is empty.
          const scene = view(last);
          expect(scene.shapes.some((sh) => sh.id === 'head-null')).toBe(ref.length === 0);
          expect(scene.shapes.some((sh) => sh.id === 'tail-null')).toBe(ref.length === 0);
          if (ref.length === 1) expect(arrowTip(scene, 'head')).toBe(arrowTip(scene, 'tail'));
        });
        for (let i = 0; i < t.length; i++) {
          const { step } = t.at(i);
          expect(step.vars?.n).toBe(step.state.nodes.length);
          const extras = (step.extra?.fresh ? 1 : 0) + (step.extra?.old ? 1 : 0);
          const scene = view(step);
          const boxes = scene.shapes.filter((sh) => /^n\d+$/.test(sh.id));
          expect(boxes).toHaveLength(step.state.nodes.length + extras);
          expect(new Set(scene.shapes.map((sh) => sh.id)).size).toBe(scene.shapes.length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('parses input values', () => {
    expect(parseListValue('42')).toBe(42);
    expect(parseListValue('cat')).toBe('cat');
    expect(parseListValue('')).toBeInstanceOf(Error);
  });
});
