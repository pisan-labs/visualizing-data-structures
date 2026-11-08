import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Step } from '../../engine/types';
import { leftistHeap } from '.';
import {
  heightOf,
  MAX_KEYS,
  parseMeldInput,
  rightPath,
  type MeldExtra,
  type MeldState,
} from '../_meld/meld';
import type { LeftistSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

// ---------------------------------------------------------------------------------------------
// Reference: a plain recursive leftist heap (Weiss), written independently.

interface RNode {
  key: number;
  left: RNode | null;
  right: RNode | null;
  npl: number;
}

const npl = (x: RNode | null) => (x ? x.npl : -1);

class RefLeftist {
  root: RNode | null = null;
  swaps = 0;

  merge(a: RNode | null, b: RNode | null): RNode | null {
    if (!a) return b;
    if (!b) return a;
    if (b.key < a.key) [a, b] = [b, a];
    a.right = this.merge(a.right, b);
    if (npl(a.left) < npl(a.right)) {
      [a.left, a.right] = [a.right, a.left];
      this.swaps += 1;
    }
    a.npl = npl(a.right) + 1;
    return a;
  }

  insert(k: number): void {
    this.root = this.merge(this.root, { key: k, left: null, right: null, npl: 0 });
  }

  deleteMin(): number | undefined {
    if (!this.root) return undefined;
    const k = this.root.key;
    this.root = this.merge(this.root.left, this.root.right);
    return k;
  }

  mergeList(keys: number[]): void {
    const other = new RefLeftist();
    for (const k of keys) other.insert(k);
    this.root = this.merge(this.root, other.root);
  }

  size(x: RNode | null = this.root): number {
    return x ? 1 + this.size(x.left) + this.size(x.right) : 0;
  }

  shape(x: RNode | null = this.root): string {
    return x ? `(${x.key} ${this.shape(x.left)} ${this.shape(x.right)})` : '.';
  }
}

function modelShape(s: MeldState, u: number | null = s.root): string {
  if (u === null) return '.';
  const n = s.nodes[u]!;
  return `(${n.key} ${modelShape(s, n.left)} ${modelShape(s, n.right)})`;
}

const keysOf = (s: MeldState) =>
  Object.values(s.nodes)
    .map((n) => n.key)
    .sort((a, b) => a - b);

// ---------------------------------------------------------------------------------------------
// Invariants every step must keep.

function checkStep(step: Step<MeldState, MeldExtra>) {
  const s = step.state;
  const reached = new Set<number>();
  const walk = (u: number | null, above: number) => {
    if (u === null) return;
    expect(reached.has(u), `node ${u} reached once`).toBe(false);
    reached.add(u);
    const n = s.nodes[u]!;
    expect(n.uid).toBe(u);
    expect(u).toBeLessThan(s.nextUid);
    expect(n.key, `heap order under ${above}: ${step.say}`).toBeGreaterThanOrEqual(above);
    walk(n.left, n.key);
    walk(n.right, n.key);
  };
  walk(s.root, -Infinity);
  walk(s.other, -Infinity);
  expect(Object.keys(s.nodes).length, 'no node is lost').toBe(reached.size);
  // npl is right, and npl(left) ≥ npl(right), everywhere except at winners of the merge that
  // the way back up has not reached yet.
  const path = step.extra?.path ?? [];
  const pending = new Set(path.slice(0, path.length - (step.extra?.fixed ?? 0)));
  const np = (u: number | null) => (u === null ? -1 : s.nodes[u]!.npl);
  for (const u of reached) {
    if (pending.has(u)) continue;
    const n = s.nodes[u]!;
    expect(np(n.left), `leftist at ${n.key}: ${step.say}`).toBeGreaterThanOrEqual(np(n.right));
    expect(n.npl, `npl of ${n.key}`).toBe(1 + np(n.right));
  }
  expect(step.vars?.N).toBe(reached.size);
  expect(step.vars?.height).toBe(heightOf(s, s.root));
}

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 3, arbitrary: fc.constant(['deletemin'] as OpCall) },
  {
    weight: 2,
    arbitrary: fc
      .array(keyArb, { minLength: 1, maxLength: 6 })
      .map((ks) => ['merge', ks.join(' ')] as OpCall),
  },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('leftist heap', () => {
  it('matches a reference leftist heap, shape included, and keeps every invariant', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('-1' as const, '0' as const),
        fc.array(callArb, { maxLength: 40 }),
        (nil, calls) => {
          const settings: LeftistSettings = { npl: nil };
          const t = new Timeline(leftistHeap, settings, 1, calls);
          const ref = new RefLeftist();
          let before = keysOf(t.initial.state);
          calls.forEach((call, i) => {
            const [op, arg] = call;
            const entry = t.entries[i]!;
            const last = entry.steps.at(-1)!;
            const refused = last.marks.some((m) => m.id === 'arg-box');
            if (!refused) {
              if (op === 'insert') ref.insert(Number(arg));
              if (op === 'deletemin') expect(last.vars?.returned).toBe(ref.deleteMin());
              if (op === 'merge') ref.mergeList(String(arg).split(' ').map(Number));
              if (op === 'clear') ref.root = null;
            } else {
              expect(
                ref.size() + (op === 'insert' ? 1 : String(arg).split(' ').length),
              ).toBeGreaterThan(MAX_KEYS);
            }
            expect(modelShape(entry.end), `shape after ${call.join(' ')}`).toBe(ref.shape());
            expect(entry.end.other, 'no heap is left waiting').toBeNull();
            const after = keysOf(entry.end);
            for (const step of entry.steps) {
              checkStep(step);
              expect([before, after]).toContainEqual(keysOf(step.state));
            }
            // npl(root) is the length of the right path, less one, plus the convention's shift.
            const rp = rightPath(entry.end, entry.end.root).length;
            expect(last.vars?.['npl(root)']).toBe(rp - 1 + (nil === '0' ? 1 : 0));
            before = after;
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps the right path short: at most log2(n + 1) nodes', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 99 }), { maxLength: MAX_KEYS }), (keys) => {
        const t = new Timeline(
          leftistHeap,
          leftistHeap.defaults,
          1,
          keys.map((k) => ['insert', k] as OpCall),
        );
        const s = t.endState();
        expect(rightPath(s, s.root).length).toBeLessThanOrEqual(Math.log2(keys.length + 1));
      }),
      { numRuns: 200 },
    );
  });

  it('names each child swap and shows the calls of the recursion', () => {
    const t = new Timeline(leftistHeap, leftistHeap.defaults, 1, [
      ['insert', 10],
      ['insert', 20],
      ['insert', 15],
      ['insert', 30],
      ['insert', 25],
    ]);
    const steps = t.entries[4]!.steps;
    const says = steps.map((s) => s.say).join(' ');
    expect(says).toContain(
      'at 10, npl(left) = 0 < npl(right) = 1, which breaks the leftist property',
    );
    expect(
      steps.some(
        (s) => (s.extra?.frames ?? []).join(' ') === 'merge(10, 25) merge(15, 25) merge(nil, 25)',
      ),
    ).toBe(true);
    const scene = leftistHeap.view(steps[3]!, leftistHeap.defaults);
    expect(scene.shapes.filter((s) => s.id.startsWith('call-'))).toHaveLength(3);
    expect(scene.shapes.some((s) => s.id.startsWith('npl-'))).toBe(true);
  });

  it('shows npl in either convention', () => {
    const calls: OpCall[] = [
      ['insert', 5],
      ['insert', 9],
    ];
    const npls = (nil: '-1' | '0') => {
      const t = new Timeline(leftistHeap, { npl: nil }, 1, calls);
      return leftistHeap
        .view({ ...t.at(t.length - 1).step, extra: undefined }, { npl: nil })
        .shapes.filter((s) => s.id.startsWith('npl-'))
        .map((s) => (s.kind === 'text' ? s.text : ''));
    };
    expect(npls('-1')).toEqual(['0', '0']);
    expect(npls('0')).toEqual(['1', '1']);
  });

  it('refuses bad input without changing the heap', () => {
    const t = new Timeline(leftistHeap, leftistHeap.defaults, 1, [
      ['insert', 5],
      ['insert', 'cat'],
      ['merge', '1 2 x'],
      ['deletemin'],
      ['deletemin'],
    ]);
    expect(t.entries[1]!.end).toEqual(t.entries[0]!.end);
    expect(t.entries[2]!.end).toEqual(t.entries[0]!.end);
    expect(t.entries[4]!.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    expect(parseMeldInput('42')).toBe(42);
    expect(parseMeldInput('5, 3 8')).toBe('5 3 8');
    expect(parseMeldInput('x')).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------------------------

describe('leftist heap practice', () => {
  const kinds = leftistHeap.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'insert-swaps',
      'npl-after-merge',
      'right-path-after-delete',
      'left-child-after-delete',
    ]);
  });

  it('gets every answer right, checked against the reference heap', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const ref = new RefLeftist();
        for (const [, key] of q.setup) ref.insert(Number(key));
        const [op, arg] = q.watch![0]!;
        const a = q.answer;
        if (k.id === 'insert-swaps') {
          ref.swaps = 0;
          ref.insert(Number(arg));
          expect(a).toEqual({ kind: 'number', value: ref.swaps });
        } else if (k.id === 'npl-after-merge') {
          expect(op).toBe('merge');
          ref.mergeList(String(arg).split(' ').map(Number));
          expect(a).toEqual({ kind: 'number', value: ref.root!.npl });
        } else if (k.id === 'right-path-after-delete') {
          ref.deleteMin();
          const path: string[] = [];
          for (let x = ref.root; x; x = x.right) path.push(String(x.key));
          expect(a).toEqual({ kind: 'sequence', value: path });
        } else {
          ref.deleteMin();
          if (a.kind !== 'choice') throw new Error('left-child-after-delete is a choice');
          expect(a.options[a.correct]).toBe(String(ref.root!.left!.key));
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // The npl under each node was 12 units (8.5 px on a laptop for a chain of nine): now 13.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(leftistHeap, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(9);
    expect(smallestText(leftistHeap, PHONE_STAGE).px).toBeGreaterThanOrEqual(11);
  });
});
