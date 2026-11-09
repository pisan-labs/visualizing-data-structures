import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { heightOf, nodeCount, type BState } from '../_multiway/btree';
import { bPlusTree, parseKeyInput } from '.';
import { keysOf, leafKeys, minInner, minLeaf, orderOf, type BPSettings } from './model';
import { copiedUp, firstFix, rangeOutput } from './practice';

// ---------------------------------------------------------------------------------------------
// Reference: a recursive B+ tree written independently from the model, with the same choices
// (leaves keep ceil(m/2) keys on a split; internal splits push up key m/2; borrow from the left
// sibling first; merge with the right sibling when there is one).

interface RNode {
  leaf: boolean;
  keys: number[];
  kids: RNode[];
  next: RNode | null;
}

const upper = (keys: number[], k: number) => keys.filter((x) => x <= k).length;

class Ref {
  root: RNode = { leaf: true, keys: [], kids: [], next: null };
  copies: number[] = [];
  fixes: ('borrow' | 'merge')[] = [];
  constructor(readonly m: number) {}

  min(x: RNode) {
    return x.leaf ? Math.floor(this.m / 2) : Math.ceil(this.m / 2) - 1;
  }

  leafFor(k: number): RNode {
    let x = this.root;
    while (!x.leaf) x = x.kids[upper(x.keys, k)]!;
    return x;
  }

  has(k: number) {
    return this.leafFor(k).keys.includes(k);
  }

  /** The keys from a to b, and how many leaves the walk read. */
  range(a: number, b: number): { out: number[]; leaves: number } {
    const out: number[] = [];
    let leaves = 0;
    for (let x: RNode | null = this.leafFor(a); x; x = x.next) {
      leaves++;
      for (const k of x.keys) {
        if (k > b) return { out, leaves };
        if (k >= a) out.push(k);
      }
    }
    return { out, leaves };
  }

  insert(k: number): void {
    this.copies = [];
    if (this.has(k)) return;
    const up = (x: RNode): [number, RNode] | null => {
      if (x.leaf) {
        x.keys.splice(upper(x.keys, k), 0, k);
        if (x.keys.length < this.m) return null;
        const half = Math.ceil(this.m / 2);
        const r: RNode = { leaf: true, keys: x.keys.slice(half), kids: [], next: x.next };
        x.keys = x.keys.slice(0, half);
        x.next = r;
        this.copies.push(r.keys[0]!);
        return [r.keys[0]!, r];
      }
      const i = upper(x.keys, k);
      const s = up(x.kids[i]!);
      if (!s) return null;
      x.keys.splice(i, 0, s[0]);
      x.kids.splice(i + 1, 0, s[1]);
      if (x.keys.length < this.m) return null;
      const mid = Math.floor(this.m / 2);
      const r: RNode = {
        leaf: false,
        keys: x.keys.slice(mid + 1),
        kids: x.kids.slice(mid + 1),
        next: null,
      };
      const key = x.keys[mid]!;
      x.keys = x.keys.slice(0, mid);
      x.kids = x.kids.slice(0, mid + 1);
      return [key, r];
    };
    const s = up(this.root);
    if (s) this.root = { leaf: false, keys: [s[0]], kids: [this.root, s[1]], next: null };
  }

  delete(k: number): void {
    this.fixes = [];
    if (!this.has(k)) return;
    const del = (x: RNode) => {
      if (x.leaf) {
        x.keys.splice(x.keys.indexOf(k), 1);
        return;
      }
      const i = upper(x.keys, k);
      del(x.kids[i]!);
      if (x.kids[i]!.keys.length < this.min(x.kids[i]!)) this.fix(x, i);
    };
    del(this.root);
    if (!this.root.leaf && this.root.keys.length === 0) this.root = this.root.kids[0]!;
  }

  private fix(x: RNode, i: number) {
    const c = x.kids[i]!;
    const l = i > 0 ? x.kids[i - 1] : undefined;
    const r = i + 1 < x.kids.length ? x.kids[i + 1] : undefined;
    const least = this.min(c);
    if (l && l.keys.length > least) {
      this.fixes.push('borrow');
      if (c.leaf) {
        c.keys.unshift(l.keys.pop()!);
        x.keys[i - 1] = c.keys[0]!;
      } else {
        c.keys.unshift(x.keys[i - 1]!);
        x.keys[i - 1] = l.keys.pop()!;
        c.kids.unshift(l.kids.pop()!);
      }
    } else if (r && r.keys.length > least) {
      this.fixes.push('borrow');
      if (c.leaf) {
        c.keys.push(r.keys.shift()!);
        x.keys[i] = r.keys[0]!;
      } else {
        c.keys.push(x.keys[i]!);
        x.keys[i] = r.keys.shift()!;
        c.kids.push(r.kids.shift()!);
      }
    } else {
      this.fixes.push('merge');
      const j = r ? i : i - 1;
      const a = x.kids[j]!;
      const b = x.kids[j + 1]!;
      const sep = x.keys[j]!;
      x.keys.splice(j, 1);
      x.kids.splice(j + 1, 1);
      if (a.leaf) {
        a.keys.push(...b.keys);
        a.next = b.next;
      } else {
        a.keys.push(sep, ...b.keys);
        a.kids.push(...b.kids);
      }
    }
  }

  shape(): string {
    const s = (x: RNode): string =>
      x.leaf ? `[${x.keys.join(' ')}]` : `(${x.keys.join(' ')}: ${x.kids.map(s).join(' ')})`;
    return this.root.leaf && this.root.keys.length === 0 ? '.' : s(this.root);
  }
}

function modelShape(st: BState): string {
  const s = (u: number): string => {
    const n = st.nodes[u]!;
    const keys = n.keys.map((k) => k.key).join(' ');
    return n.kids.length ? `(${keys}: ${n.kids.map(s).join(' ')})` : `[${keys}]`;
  };
  return st.root === null ? '.' : s(st.root);
}

// ---------------------------------------------------------------------------------------------
// Invariants every step must keep. One node may be short (an underflow being fixed) and one may
// hold m keys (an overflow about to split).

function checkStep(st: BState, m: number, lines: string[], vars: Record<string, unknown>) {
  const reached = new Set<number>();
  const leaves: number[] = [];
  const depths = new Set<number>();
  let short = 0;
  let over = 0;
  const walk = (u: number, depth: number, lo: number, hi: number) => {
    expect(reached.has(u)).toBe(false);
    reached.add(u);
    const n = st.nodes[u]!;
    const keys = n.keys.map((k) => k.key);
    keys.forEach((k, i) => {
      // A key equal to a separator is in the separator's right subtree.
      expect(k, 'key at or above its lower separator').toBeGreaterThanOrEqual(lo);
      expect(k, 'key below its upper separator').toBeLessThan(hi);
      if (i > 0) expect(k, 'keys in a node are sorted').toBeGreaterThan(keys[i - 1]!);
    });
    if (keys.length === m) over++;
    else expect(keys.length, 'at most m - 1 keys').toBeLessThan(m);
    const leaf = n.kids.length === 0;
    if (u !== st.root && keys.length < (leaf ? minLeaf(m) : minInner(m))) short++;
    if (leaf) {
      leaves.push(u);
      depths.add(depth);
      expect(n.next, 'a leaf has a next link (or null)').not.toBeUndefined();
    } else {
      expect(n.next ?? null, 'only leaves are linked').toBeNull();
      expect(n.kids.length, 'one more child than keys').toBe(keys.length + 1);
      n.kids.forEach((c, i) =>
        walk(c, depth + 1, i === 0 ? lo : keys[i - 1]!, i < keys.length ? keys[i]! : hi),
      );
    }
  };
  if (st.root !== null) walk(st.root, 0, -Infinity, Infinity);
  expect(short, 'at most one node short of keys, while it is fixed').toBeLessThanOrEqual(1);
  expect(over, 'only an overflowing node holds m keys').toBeLessThanOrEqual(
    ['ins.over', 'ins.copy', 'ins.push'].some((l) => lines.includes(l)) ? 1 : 0,
  );
  expect(depths.size, 'all leaves at the same depth').toBeLessThanOrEqual(1);
  // The links visit the leaves in order, left to right, and the last one points nowhere.
  if (leaves.length) {
    const chain: number[] = [];
    for (let x: number | null = leaves[0]!; x !== null; x = st.nodes[x]!.next ?? null) {
      chain.push(x);
      expect(chain.length).toBeLessThanOrEqual(leaves.length);
    }
    expect(chain, 'linked leaves in order').toEqual(leaves);
    const chained = chain.flatMap((u) => st.nodes[u]!.keys.map((k) => k.key));
    expect(chained, 'keys along the links are sorted').toEqual([...chained].sort((a, b) => a - b));
  }
  expect(Object.keys(st.nodes).map(Number).sort()).toEqual([...reached].sort());
  expect(vars.N).toBe(leafKeys(st).length);
  expect(vars.height).toBe(heightOf(st));
  expect(vars.nodes).toBe(nodeCount(st));
  expect(vars.leaves).toBe(leaves.length);
  expect(vars.splits).toBe(st.splits);
  expect(vars.merges).toBe(st.merges);
  expect(vars.borrows).toBe(st.borrows);
}

const settingsArb = fc.record({ order: fc.constantFrom('3' as const, '4' as const, '5' as const) });
const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 4, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 2, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  { weight: 2, arbitrary: fc.tuple(keyArb, keyArb).map(([a, b]) => ['range', a, b] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);
const ins = (ks: number[]): OpCall[] => ks.map((k) => ['insert', k]);
const example = (id: string) => {
  const ex = bPlusTree.examples.find((e) => e.id === id)!;
  return new Timeline(bPlusTree, ex.settings as BPSettings, 1, ex.ops);
};

describe('B+ tree', () => {
  it('matches a reference B+ tree, shape included, and keeps every invariant on every step', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(callArb, { maxLength: 80, size: 'large' }),
        (settings, calls) => {
          const m = orderOf(settings as BPSettings);
          const tl = new Timeline(bPlusTree, settings as BPSettings, 1, calls);
          let ref = new Ref(m);
          calls.forEach(([op, x, y], i) => {
            const entry = tl.entries[i]!;
            const last = entry.steps.at(-1)!;
            if (op === 'search') expect(last.vars?.found).toBe(ref.has(Number(x)));
            if (op === 'range') {
              const r = ref.range(Number(x), Number(y));
              const want = Number(x) > Number(y) ? [] : r.out;
              expect(rangeOutput(entry.steps), `range ${x} ${y}`).toEqual(want);
              if (Number(x) <= Number(y) && ref.root.keys.length + ref.root.kids.length > 0)
                expect(last.vars?.visited, `leaves read by range ${x} ${y}`).toBe(r.leaves);
            }
            if (op === 'insert') ref.insert(Number(x));
            if (op === 'delete') ref.delete(Number(x));
            if (op === 'clear') ref = new Ref(m);
            expect(modelShape(entry.end), `after ${op} ${x ?? ''}`).toBe(ref.shape());
            for (const step of entry.steps) checkStep(step.state, m, step.lines, step.vars ?? {});
          });
        },
      ),
      { numRuns: 250 },
    );
  });

  it('holds the same keys as a sorted set', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(callArb, { maxLength: 120, size: 'large' }),
        (settings, calls) => {
          const tl = new Timeline(bPlusTree, settings as BPSettings, 1, calls);
          const ref = new Set<number>();
          for (const [op, x] of calls) {
            if (op === 'insert') ref.add(Number(x));
            if (op === 'delete') ref.delete(Number(x));
            if (op === 'clear') ref.clear();
          }
          expect(keysOf(tl.endState())).toEqual([...ref].sort((a, b) => a - b));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('copies up from a leaf split and pushes up from an internal split', () => {
    const leaf = example('leaf-split');
    expect(modelShape(leaf.endState())).toBe('(30: [10 20] [30 40])');
    expect(copiedUp(leaf.entries.at(-1)!.steps)).toBe(30);
    const push = example('push-up');
    expect(modelShape(push.endState())).toBe(
      '(70: (30 50: [10 20] [30 40] [50 60]) (90: [70 80] [90 100]))',
    );
    const says = push.entries
      .at(-1)!
      .steps.map((s) => s.say)
      .join(' ');
    expect(says).toContain('is copied up');
    expect(says).toContain('is pushed up into a new root');
  });

  it('walks the leaves for a range query', () => {
    const tl = example('range-walk');
    const steps = tl.entries.at(-1)!.steps;
    expect(rangeOutput(steps)).toEqual([30, 40, 50, 60]);
    expect(steps.at(-1)!.vars?.visited).toBe(4);
    expect(steps.filter((s) => s.lines.includes('rng.next'))).toHaveLength(3);
  });

  it('borrows, merges and shrinks the way each curated example says', () => {
    expect(firstFix(example('delete-leaf').entries.at(-1)!.steps)).toBeNull();
    expect(firstFix(example('borrow').entries.at(-1)!.steps)).toBe('borrow');
    expect(firstFix(example('merge').entries.at(-1)!.steps)).toBe('merge');
    const cascade = example('merge-cascade');
    const steps = cascade.entries.at(-1)!.steps;
    expect(steps.filter((s) => s.lines.includes('del.merge') && s.level === 1)).toHaveLength(2);
    expect(steps.some((s) => s.lines.includes('del.root'))).toBe(true);
    expect(cascade.entries.at(-2)!.steps.at(-1)!.vars?.height).toBe(2);
    expect(steps.at(-1)!.vars?.height).toBe(1);
    // A deleted key can stay above as a signpost.
    const stale = example('delete-leaf');
    expect(modelShape(stale.endState())).toContain('(30 50 70:');
    expect(keysOf(stale.endState())).not.toContain(70);
  });

  // The merge example's leaf has two siblings but one neighbour; it was "its only sibling".
  it('calls a lone neighbour "the sibling next to it" unless it is the only sibling', () => {
    const says = example('merge')
      .entries.at(-1)!
      .steps.map((s) => s.say)
      .join(' ');
    expect(says).toContain('The sibling next to it, [30 40], has no key to spare.');
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const block of bPlusTree.pseudocode({ order: '4' }))
      for (const l of block.lines)
        expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });

  it('refuses bad input and an empty range', () => {
    const tl = new Timeline(bPlusTree, { order: '4' }, 1, [
      ...ins([10, 20]),
      ['range', 30, 5],
      ['range', 'x', 5],
    ]);
    expect(tl.entries[2]!.steps.at(-1)!.say).toContain('30 > 5');
    expect(tl.entries[3]!.steps.at(-1)!.say).toContain('whole numbers');
    expect(parseKeyInput('7')).toBe(7);
    expect(parseKeyInput('7.5')).toBeInstanceOf(Error);
  });
});

describe('B+ tree practice', () => {
  it('has answers that agree with the reference B+ tree', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of bPlusTree.practice!) {
        const q = kind.make(makeRng(seed));
        const ref = new Ref(orderOf({ ...bPlusTree.defaults, ...q.settings } as BPSettings));
        for (const [op, x] of q.setup) {
          if (op === 'insert') ref.insert(Number(x));
          if (op === 'delete') ref.delete(Number(x));
        }
        const a = q.answer;
        const [op, x, y] = q.watch![0]!;
        const where = `${kind.id} seed ${seed}`;
        if (kind.id === 'copy-up') {
          ref.insert(Number(x));
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(String(ref.copies[0]));
        } else if (kind.id === 'range-output') {
          expect(op).toBe('range');
          expect(a.kind === 'sequence' && a.value, where).toEqual(
            ref.range(Number(x), Number(y)).out.map(String),
          );
        } else if (kind.id === 'range-leaves') {
          expect(a.kind === 'number' && a.value, where).toBe(
            ref.range(Number(x), Number(y)).leaves,
          );
        } else if (kind.id === 'underflow-fix') {
          ref.delete(Number(x));
          const names = { borrow: 'Borrow a key from a sibling', merge: 'Merge with a sibling' };
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(names[ref.fixes[0]!]);
        }
      }
    }
  });
});
