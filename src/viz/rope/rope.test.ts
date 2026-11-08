import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { rope } from '.';
import { textOf, type RNode, type RopeSettings } from './model';

const settings = (s: Partial<RopeSettings> = {}): RopeSettings =>
  ({ ...rope.defaults, ...s }) as RopeSettings;

/** Every internal node has two children, and every len is the sum below it. */
function wellFormed(nodes: Record<number, RNode>, u: number | null): boolean {
  if (u === null) return true;
  const v = nodes[u]!;
  if (v.text !== null) return v.len === v.text.length && v.text.length > 0;
  if (v.left === null || v.right === null) return false;
  return (
    v.len === nodes[v.left]!.len + nodes[v.right]!.len &&
    wellFormed(nodes, v.left) &&
    wellFormed(nodes, v.right)
  );
}

describe('rope', () => {
  it('indexes, inserts and deletes like a string', () => {
    const t = new Timeline(rope, settings(), 1, [
      ['load', 'keep this not this part'],
      ['delete', 10, 9],
      ['insert', 4, '!'],
      ['index', 4],
    ]);
    const end = t.endState();
    expect(textOf(end.nodes, end.root)).toBe('keep! this part');
    expect(t.entries[3]!.steps.at(-1)!.vars?.returned).toBe('!');
  });

  it('matches a reference string for any sequence of edits', () => {
    const word = fc.stringMatching(/^[a-z]{1,5}$/);
    const call = fc.oneof(
      word.map((w) => ['load', w + 'xyz' + w] as OpCall),
      word.map((w) => ['append', w] as OpCall),
      fc.tuple(fc.integer({ min: -1, max: 30 }), word).map(([i, w]) => ['insert', i, w] as OpCall),
      fc
        .tuple(fc.integer({ min: -1, max: 30 }), fc.integer({ min: 0, max: 6 }))
        .map(([i, n]) => ['delete', i, n] as OpCall),
      fc.integer({ min: -1, max: 30 }).map((i) => ['index', i] as OpCall),
      fc.integer({ min: 0, max: 30 }).map((i) => ['split', i] as OpCall),
      fc.constant(['join'] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.constantFrom('left' as const, 'total' as const),
        fc.array(call, { maxLength: 30 }),
        (leaf, weight, calls) => {
          const t = new Timeline(rope, settings({ leaf, weight }), 1, calls);
          let ref = '';
          let other: string | null = null;
          calls.forEach((c, k) => {
            const last = t.entries[k]!.steps.at(-1)!;
            const [op, a, b] = c;
            if (op === 'load') {
              ref = String(a);
              other = null;
            } else if (op === 'append' && ref.length + String(a).length <= 40) ref += String(a);
            else if (op === 'insert') {
              const i = Number(a);
              const w = String(b);
              if (other === null && i >= 0 && i <= ref.length && ref.length + w.length <= 40)
                ref = ref.slice(0, i) + w + ref.slice(i);
            } else if (op === 'delete') {
              const i = Number(a);
              const n = Number(b);
              if (other === null && n >= 1 && i >= 0 && i + n <= ref.length)
                ref = ref.slice(0, i) + ref.slice(i + n);
            } else if (op === 'index') {
              const i = Number(a);
              if (i >= 0 && i < ref.length) expect(last.vars?.returned).toBe(ref[i]);
            } else if (op === 'split') {
              const i = Number(a);
              if (other === null && i > 0 && i < ref.length) {
                other = ref.slice(i);
                ref = ref.slice(0, i);
              }
            } else if (op === 'join' && other !== null) {
              ref += other;
              other = null;
            }
            const end = t.entries[k]!.end;
            expect(textOf(end.nodes, end.root)).toBe(ref);
            expect(end.other === null ? null : textOf(end.nodes, end.other)).toBe(other);
            expect(wellFormed(end.nodes, end.root)).toBe(true);
            expect(wellFormed(end.nodes, end.other)).toBe(true);
          });
          for (let i = 0; i < t.length; i++) {
            const st = t.at(i).step.state;
            expect(wellFormed(st.nodes, st.root)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('drawn text size', () => {
  // The string's indices are the smallest text. The path that appends build was 9.5 px tall on a
  // laptop with the string under it; beside it, 15. On a phone, 11.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(rope, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(13);
    expect(smallestText(rope, PHONE_STAGE).px).toBeGreaterThanOrEqual(10);
  });
});
