import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { circularLinkedList } from '.';
import { values, type CExtra, type CSettings, type CState } from './model';

type T = Timeline<CState, CSettings, CExtra>;

const run = (calls: OpCall[]): T => new Timeline(circularLinkedList, {}, 1, calls);
const lastStep = (t: T, k: number) => t.entries[k]!.steps.at(-1)!;

/** The ring from tail.next: must come back to its start without dangling or looping early. */
function ring(s: CState): number[] {
  if (s.tail === null) return [];
  const by = new Map(s.nodes.map((n) => [n.uid, n]));
  const start = by.get(s.tail)!.next!;
  const out: number[] = [];
  let u: number | null = start;
  do {
    expect(u, 'no null inside the circle').not.toBeNull();
    expect(by.has(u!), `node ${u} exists`).toBe(true);
    expect(out, 'the circle closes at its start, not somewhere in the middle').not.toContain(u);
    out.push(u!);
    u = by.get(u!)!.next;
  } while (u !== start);
  expect(out, 'tail is on the circle').toContain(s.tail);
  return out;
}

function checkStep(s: CState, vars: Record<string, unknown> | undefined) {
  const uids = s.nodes.map((n) => n.uid);
  expect(new Set(uids).size).toBe(uids.length);
  for (const n of s.nodes) if (n.next !== null) expect(uids).toContain(n.next);
  if (s.tail !== null) expect(uids).toContain(s.tail);
  ring(s);
  expect(s.nodes.length - s.size).toBeGreaterThanOrEqual(0);
  expect(s.nodes.length - s.size).toBeLessThanOrEqual(1);
  expect(vars?.n).toBe(s.size);
}

/** Between operations: memory is the circle, drawn from the front, and tail is last. */
function checkEnd(s: CState) {
  const r = ring(s);
  expect(s.nodes.map((n) => n.uid)).toEqual(r);
  expect(s.size).toBe(r.length);
  if (r.length) expect(r.at(-1)).toBe(s.tail);
  else expect(s.tail).toBeNull();
}

function apply(ref: Value[], [op, x]: OpCall): string {
  switch (op) {
    case 'insertFront':
      ref.unshift(x!);
      return 'ok';
    case 'insertBack':
      ref.push(x!);
      return 'ok';
    case 'removeFront':
      return ref.length ? String(ref.shift()) : 'empty';
    case 'rotate':
      if (ref.length) ref.push(ref.shift()!);
      return 'ok';
    case 'traverse':
      return ref.join(' ') || 'empty';
    case 'search':
      return String(ref.indexOf(x!));
  }
  throw new Error(op);
}

function modelResult(t: T, k: number): string {
  const last = lastStep(t, k);
  switch (t.entries[k]!.call[0]) {
    case 'removeFront':
      return last.lines.includes('removeFront.error') ? 'empty' : String(last.vars?.returned);
    case 'traverse':
      return String(last.vars?.visited ?? '') || 'empty';
    case 'search':
      return String(last.vars?.returned);
    default:
      return 'ok';
  }
}

const value = fc.oneof(fc.integer({ min: 0, max: 9 }), fc.constantFrom('A', 'B'));
const call: fc.Arbitrary<OpCall> = fc.oneof(
  value.map((v) => ['insertFront', v] as OpCall),
  value.map((v) => ['insertBack', v] as OpCall),
  fc.constant(['removeFront'] as OpCall),
  fc.constant(['rotate'] as OpCall),
  fc.constant(['traverse'] as OpCall),
  value.map((v) => ['search', v] as OpCall),
);

describe('circular linked list', () => {
  it('matches an array for any sequence of operations, with invariants on every step', () => {
    fc.assert(
      fc.property(fc.array(call, { maxLength: 30 }), (calls) => {
        const t = run(calls);
        const ref: Value[] = [];
        calls.forEach((c, k) => {
          expect(modelResult(t, k), c.join(' ')).toBe(apply(ref, c));
          expect(values(t.entries[k]!.end)).toEqual(ref);
          checkEnd(t.entries[k]!.end);
        });
        for (let i = 0; i < t.length; i++) {
          const { step } = t.at(i);
          checkStep(step.state, step.vars);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('makes one node point at itself, and empties the list when it goes', () => {
    const t = run([['insertFront', 7], ['removeFront']]);
    const one = t.entries[0]!.end;
    expect(one.nodes[0]!.next).toBe(one.nodes[0]!.uid);
    expect(one.tail).toBe(one.nodes[0]!.uid);
    expect(t.entries[0]!.steps.some((s) => s.lines.includes('insertFront.self'))).toBe(true);
    expect(t.entries[1]!.steps.some((s) => s.lines.includes('removeFront.empty'))).toBe(true);
    expect(t.endState()).toMatchObject({ tail: null, size: 0, nodes: [] });
  });

  it('inserts at the back by inserting after tail and moving tail', () => {
    const t = run([
      ['insertBack', 1],
      ['insertBack', 2],
    ]);
    const lines = t.entries[1]!.steps.flatMap((s) => s.lines);
    expect(lines).toEqual([
      'insertBack.new',
      'insertBack.check',
      'insertBack.link',
      'insertBack.close',
      'insertBack.tail',
      'insertBack.size',
    ]);
    expect(values(t.endState())).toEqual([1, 2]);
  });

  it('rotates with one assignment and stops a traversal back at the start', () => {
    const t = run([
      ['insertBack', 1],
      ['insertBack', 2],
      ['insertBack', 3],
      ['rotate'],
      ['traverse'],
    ]);
    expect(values(t.entries[3]!.end)).toEqual([2, 3, 1]);
    expect(t.entries[3]!.steps.filter((s) => s.lines.includes('rotate.move'))).toHaveLength(2);
    const visits = t.entries[4]!.steps.filter((s) => s.lines.includes('traverse.visit'));
    expect(visits).toHaveLength(3);
    expect(lastStep(t, 4).vars?.visited).toBe('2 3 1');
  });
});
