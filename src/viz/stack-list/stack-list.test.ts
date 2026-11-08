import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { parseListValue, stackList } from '.';
import { items } from './model';
import { view } from './view';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

const run = (calls: OpCall[]) => new Timeline(stackList, {}, 1, calls);
const lastStep = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.at(-1)!;

describe('stack (linked list)', () => {
  it('pushes and pops at the front', () => {
    const t = run([['push', 10], ['push', 20], ['push', 30], ['pop']]);
    expect(items(t.endState())).toEqual([20, 10]);
    expect(lastStep(t, 3).vars?.returned).toBe(30);
  });

  it('links a new node before moving top, and shows the unlinked node as garbage', () => {
    const t = run([['push', 1], ['push', 2], ['pop']]);
    expect(t.entries[1]!.steps.map((s) => s.lines[0])).toEqual([
      'push.new',
      'push.link',
      'push.top',
    ]);
    const link = t.entries[1]!.steps[1]!;
    expect(link.extra?.fresh?.linked).toBe(true);
    expect(link.state.nodes).toHaveLength(1);
    const moved = t.entries[2]!.steps.find((s) => s.lines.includes('pop.next'))!;
    expect(moved.extra?.garbage?.value).toBe(2);
    const scene = view(moved);
    expect(scene.shapes.find((sh) => sh.id === `n${moved.extra!.garbage!.uid}-gc`)).toBeDefined();
  });

  it('reports underflow on an empty stack', () => {
    const t = run([['pop'], ['peek']]);
    expect(lastStep(t, 0).lines).toEqual(['pop.underflow']);
    expect(lastStep(t, 1).lines).toEqual(['peek.empty']);
  });

  it('matches a reference stack, with invariants on every step', () => {
    const call = fc.oneof(
      fc
        .oneof(fc.integer({ min: 0, max: 99 }), fc.constantFrom('A', 'cat'))
        .map((v) => ['push', v] as OpCall),
      fc.constant(['pop'] as OpCall),
      fc.constant(['peek'] as OpCall),
    );
    fc.assert(
      fc.property(fc.array(call, { maxLength: 40 }), (calls) => {
        const t = run(calls);
        const ref: Value[] = [];
        calls.forEach(([op, x], k) => {
          const last = lastStep(t, k);
          if (op === 'push') ref.unshift(x!);
          else if (ref.length === 0) expect(last.vars?.returned).toBeUndefined();
          else expect(last.vars?.returned).toBe(op === 'pop' ? ref.shift() : ref[0]);
          expect(items(t.entries[k]!.end)).toEqual(ref);
        });
        const uids = new Set<number>();
        for (let i = 0; i < t.length; i++) {
          const { step } = t.at(i);
          expect(step.vars?.n).toBe(step.state.nodes.length);
          for (const node of step.state.nodes) expect(node.uid).toBeLessThan(step.state.nextUid);
          // At most one node is drawn outside the stack, and never one that is in it.
          const extra = step.extra?.fresh ?? step.extra?.garbage;
          if (extra) expect(step.state.nodes.some((nd) => nd.uid === extra.uid)).toBe(false);
          const scene = view(step);
          const boxes = scene.shapes.filter((sh) => /^n\d+$/.test(sh.id));
          expect(boxes).toHaveLength(step.state.nodes.length + (extra ? 1 : 0));
          step.state.nodes.forEach((nd) => uids.add(nd.uid));
        }
        expect(uids.size).toBeLessThanOrEqual(calls.length);
      }),
      { numRuns: 300 },
    );
  });

  it('parses input values', () => {
    expect(parseListValue('42')).toBe(42);
    expect(parseListValue('cat')).toBe('cat');
    expect(parseListValue(' ')).toBeInstanceOf(Error);
    expect(parseListValue('toolongvalue')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  // Four nodes to a row made a tall stack three rows tall (10.6 px on a laptop); a laptop now draws six to a row, a phone three.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
