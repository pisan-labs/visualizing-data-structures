import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import type { ArrowShape } from '../../render/scene';
import { dequeList, parseListValue } from '.';
import { items } from './model';
import { view } from './view';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

const run = (calls: OpCall[]) => new Timeline(dequeList, {}, 1, calls);
const lastStep = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.at(-1)!;
const lines = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.flatMap((s) => s.lines);

describe('deque (linked list)', () => {
  it('adds and removes at both ends', () => {
    const t = run([
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

  it('takes the empty-deque branch on the first add and the one-node branch on the last remove', () => {
    const t = run([['addFirst', 7], ['addFirst', 6], ['removeLast'], ['removeLast']]);
    expect(lines(t, 0)).toContain('addFirst.tail');
    expect(lines(t, 1)).toContain('addFirst.prev');
    expect(lines(t, 2)).toContain('removeLast.next');
    expect(lines(t, 3)).toContain('removeLast.head');
    expect(lines(t, 3)).not.toContain('removeLast.next');
  });

  it('keeps the removed node alive until its last incoming link is cut', () => {
    const t = run([['addLast', 4], ['addLast', 5], ['addLast', 6], ['removeFirst']]);
    const steps = t.entries[3]!.steps;
    const moved = steps.find((s) => s.lines.includes('removeFirst.next'))!;
    expect(moved.extra?.old).toMatchObject({ back: true, garbage: false });
    const cut = steps.find((s) => s.lines.includes('removeFirst.prev'))!;
    expect(cut.extra?.old).toMatchObject({ back: false, garbage: true });
    const scene = view(cut);
    const newHead = t.entries[3]!.end.nodes[0]!;
    expect(scene.shapes.some((sh) => sh.id === `n${newHead.uid}-prev-null`)).toBe(true);
  });

  it('matches a reference deque, with consistent links on every step', () => {
    const value = fc.oneof(fc.integer({ min: 0, max: 99 }), fc.constantFrom('A', 'cat'));
    const call = fc.oneof(
      value.map((v) => ['addFirst', v] as OpCall),
      value.map((v) => ['addLast', v] as OpCall),
      fc.constant(['removeFirst'] as OpCall),
      fc.constant(['removeLast'] as OpCall),
      fc.constant(['peekFirst'] as OpCall),
      fc.constant(['peekLast'] as OpCall),
    );
    fc.assert(
      fc.property(fc.array(call, { maxLength: 40 }), (calls) => {
        const t = run(calls);
        const ref: Value[] = [];
        calls.forEach(([op, x], k) => {
          const ret = lastStep(t, k).vars?.returned;
          if (op === 'addFirst') ref.unshift(x!);
          else if (op === 'addLast') ref.push(x!);
          else if (ref.length === 0) expect(ret).toBeUndefined();
          else if (op === 'removeFirst') expect(ret).toBe(ref.shift());
          else if (op === 'removeLast') expect(ret).toBe(ref.pop());
          else if (op === 'peekFirst') expect(ret).toBe(ref[0]);
          else expect(ret).toBe(ref.at(-1));
          expect(items(t.entries[k]!.end)).toEqual(ref);
        });
        for (let i = 0; i < t.length; i++) {
          const { step } = t.at(i);
          expect(step.vars?.n).toBe(step.state.nodes.length);
          const scene = view(step);
          const ids = new Set(scene.shapes.map((sh) => sh.id));
          expect(ids.size).toBe(scene.shapes.length);
          const extras = (step.extra?.fresh ? 1 : 0) + (step.extra?.old ? 1 : 0);
          expect(scene.shapes.filter((sh) => /^n\d+$/.test(sh.id))).toHaveLength(
            step.state.nodes.length + extras,
          );
          // Between two nodes of the deque proper, both directions are always linked.
          const { nodes } = step.state;
          for (let k = 0; k + 1 < nodes.length; k++) {
            expect(ids.has(`n${nodes[k]!.uid}-next`)).toBe(true);
            expect(ids.has(`n${nodes[k + 1]!.uid}-prev`)).toBe(true);
          }
          if (i > 0 && t.at(i).index === t.entries[t.at(i).op]!.steps.length - 1 && nodes.length) {
            // After every operation the ends point outward at null.
            expect(ids.has(`n${nodes[0]!.uid}-prev-null`)).toBe(true);
            expect(ids.has(`n${nodes.at(-1)!.uid}-next-null`)).toBe(true);
          }
          for (const sh of scene.shapes)
            if (sh.kind === 'arrow') {
              const a = sh as ArrowShape;
              expect(Number.isFinite(a.x1 + a.y1 + a.x2 + a.y2)).toBe(true);
            }
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

describe('drawn text size', () => {
  // Four nodes to a row were 568 units wide (8.2 px on a phone); a phone now draws three, a laptop six.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
