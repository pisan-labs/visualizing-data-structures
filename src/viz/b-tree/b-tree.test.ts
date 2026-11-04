import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { heightOf, inorder, keysOf, nodeCount, type BState } from '../_multiway/btree';
import { bTree, parseKeyInput } from '.';
import { degree, type BTreeSettings } from './model';
import { deleteCases, firstMedian } from './practice';

// ---------------------------------------------------------------------------------------------
// Reference: a plain recursive B-tree written independently from the model, with the same
// conventions (CLRS cases; borrow from the left sibling first; merge with the right one when
// there is one). It records the events the practice questions ask about.

interface RNode {
  keys: number[];
  kids: RNode[];
}

class RefBTree {
  root: RNode | null = null;
  splits = 0;
  medians: number[] = [];
  cases: string[] = [];
  constructor(
    readonly t: number,
    readonly mode: 'down' | 'up',
  ) {}

  has(k: number): boolean {
    for (let x = this.root; x;) {
      let i = 0;
      while (i < x.keys.length && k > x.keys[i]!) i++;
      if (x.keys[i] === k) return true;
      if (!x.kids.length) return false;
      x = x.kids[i]!;
    }
    return false;
  }

  /** Nodes a search reads. */
  reads(k: number): number {
    let n = 0;
    for (let x = this.root; x;) {
      n++;
      let i = 0;
      while (i < x.keys.length && k > x.keys[i]!) i++;
      if (x.keys[i] === k || !x.kids.length) return n;
      x = x.kids[i]!;
    }
    return n;
  }

  private split(x: RNode, i: number): void {
    const t = this.t;
    const y = x.kids[i]!;
    const z: RNode = { keys: y.keys.slice(t), kids: y.kids.slice(t) };
    this.medians.push(y.keys[t - 1]!);
    x.keys.splice(i, 0, y.keys[t - 1]!);
    x.kids.splice(i + 1, 0, z);
    y.keys = y.keys.slice(0, t - 1);
    y.kids = y.kids.slice(0, t);
    this.splits++;
  }

  insert(k: number): void {
    this.medians = [];
    const t = this.t;
    if (!this.root) this.root = { keys: [], kids: [] };
    if (this.mode === 'up') {
      if (this.has(k)) return;
      const grow = (x: RNode): void => {
        let i = 0;
        while (i < x.keys.length && k > x.keys[i]!) i++;
        if (!x.kids.length) x.keys.splice(i, 0, k);
        else {
          const c = x.kids[i]!;
          grow(c);
          if (c.keys.length === 2 * t) {
            const z: RNode = { keys: c.keys.slice(t + 1), kids: c.kids.slice(t + 1) };
            this.medians.push(c.keys[t]!);
            x.keys.splice(i, 0, c.keys[t]!);
            x.kids.splice(i + 1, 0, z);
            c.keys = c.keys.slice(0, t);
            c.kids = c.kids.slice(0, c.kids.length ? t + 1 : 0);
            this.splits++;
          }
        }
      };
      grow(this.root);
      if (this.root.keys.length === 2 * t) {
        const r = this.root;
        this.medians.push(r.keys[t]!);
        this.root = {
          keys: [r.keys[t]!],
          kids: [
            { keys: r.keys.slice(0, t), kids: r.kids.slice(0, r.kids.length ? t + 1 : 0) },
            { keys: r.keys.slice(t + 1), kids: r.kids.slice(t + 1) },
          ],
        };
        this.splits++;
      }
      return;
    }
    // CLRS: split full nodes on the way down. A key that is already there stops the descent,
    // but splits made before that point stay.
    if (this.root.keys.length === 2 * t - 1) {
      this.root = { keys: [], kids: [this.root] };
      this.split(this.root, 0);
    }
    for (let x = this.root; ;) {
      let i = x.keys.length;
      while (i >= 1 && k < x.keys[i - 1]!) i--;
      if (i >= 1 && x.keys[i - 1] === k) return;
      if (!x.kids.length) {
        x.keys.splice(i, 0, k);
        return;
      }
      if (x.kids[i]!.keys.length === 2 * t - 1) {
        this.split(x, i);
        if (k === x.keys[i]) return;
        if (k > x.keys[i]!) i++;
      }
      x = x.kids[i]!;
    }
  }

  delete(k: number): void {
    this.cases = [];
    if (!this.root) return;
    const t = this.t;
    const merge = (x: RNode, i: number) => {
      const y = x.kids[i]!;
      const z = x.kids[i + 1]!;
      y.keys = [...y.keys, x.keys[i]!, ...z.keys];
      y.kids = [...y.kids, ...z.kids];
      x.keys.splice(i, 1);
      x.kids.splice(i + 1, 1);
      if (x === this.root && x.keys.length === 0) this.root = y;
    };
    const del = (x: RNode, k: number): void => {
      let i = 0;
      while (i < x.keys.length && k > x.keys[i]!) i++;
      const here = x.keys[i] === k;
      if (!x.kids.length) {
        if (here) {
          this.cases.push('1');
          x.keys.splice(i, 1);
        }
        return;
      }
      if (here) {
        const y = x.kids[i]!;
        const z = x.kids[i + 1]!;
        if (y.keys.length >= t) {
          this.cases.push('2a');
          let p = y;
          while (p.kids.length) p = p.kids[p.kids.length - 1]!;
          x.keys[i] = p.keys[p.keys.length - 1]!;
          return del(y, x.keys[i]!);
        }
        if (z.keys.length >= t) {
          this.cases.push('2b');
          let p = z;
          while (p.kids.length) p = p.kids[0]!;
          x.keys[i] = p.keys[0]!;
          return del(z, x.keys[i]!);
        }
        this.cases.push('2c');
        merge(x, i);
        return del(y, k);
      }
      let c = x.kids[i]!;
      if (c.keys.length === t - 1) {
        const l = i > 0 ? x.kids[i - 1] : undefined;
        const r = i < x.keys.length ? x.kids[i + 1] : undefined;
        if (l && l.keys.length >= t) {
          this.cases.push('3a');
          c.keys.unshift(x.keys[i - 1]!);
          x.keys[i - 1] = l.keys.pop()!;
          if (l.kids.length) c.kids.unshift(l.kids.pop()!);
        } else if (r && r.keys.length >= t) {
          this.cases.push('3a');
          c.keys.push(x.keys[i]!);
          x.keys[i] = r.keys.shift()!;
          if (r.kids.length) c.kids.push(r.kids.shift()!);
        } else if (r) {
          this.cases.push('3b');
          merge(x, i);
        } else {
          this.cases.push('3b');
          merge(x, i - 1);
          c = l!;
        }
      }
      return del(c, k);
    };
    del(this.root, k);
    if (this.root.keys.length === 0 && !this.root.kids.length) this.root = null;
  }

  shape(): string {
    const s = (x: RNode): string =>
      x.kids.length ? `(${x.keys.join(' ')}: ${x.kids.map(s).join(' ')})` : `[${x.keys.join(' ')}]`;
    return this.root ? s(this.root) : '.';
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
// Invariants every step must keep.

function checkStep(
  st: BState,
  t: number,
  ghost: number | undefined,
  overflowing: boolean,
  vars: Record<string, unknown>,
) {
  const reached = new Set<number>();
  const leafDepths = new Set<number>();
  let over = 0;
  const walk = (u: number, depth: number, lo: number, hi: number) => {
    expect(reached.has(u), `node ${u} reached once`).toBe(false);
    reached.add(u);
    const n = st.nodes[u]!;
    expect(n.uid).toBe(u);
    const keys = n.keys;
    // Order within the node, and between it and its parent's keys. A leftover copy of a key
    // (during cases 2a and 2b) may equal the key that replaced it above.
    keys.forEach((k, i) => {
      const g = k.uid === ghost;
      expect(g ? k.key >= lo : k.key > lo, 'key above its lower separator').toBe(true);
      expect(g ? k.key <= hi : k.key < hi, 'key below its upper separator').toBe(true);
      if (i > 0) expect(k.key, 'keys in a node are sorted').toBeGreaterThan(keys[i - 1]!.key);
    });
    // Key-count bounds, except at the root. In up mode one node may hold 2t keys for a moment.
    if (keys.length === 2 * t) over++;
    else expect(keys.length, 'at most 2t - 1 keys').toBeLessThanOrEqual(2 * t - 1);
    if (u !== st.root) expect(keys.length, 'at least t - 1 keys').toBeGreaterThanOrEqual(t - 1);
    if (n.kids.length === 0) leafDepths.add(depth);
    else {
      expect(n.kids.length, 'one more child than keys').toBe(keys.length + 1);
      n.kids.forEach((c, i) =>
        walk(c, depth + 1, i === 0 ? lo : keys[i - 1]!.key, i < keys.length ? keys[i]!.key : hi),
      );
    }
  };
  if (st.root !== null) walk(st.root, 0, -Infinity, Infinity);
  expect(over, 'only an overflowing node holds 2t keys').toBeLessThanOrEqual(overflowing ? 1 : 0);
  expect(leafDepths.size, 'all leaves at the same depth').toBeLessThanOrEqual(1);
  expect(Object.keys(st.nodes).map(Number).sort(), 'no node outside the tree').toEqual(
    [...reached].sort(),
  );
  expect(vars.N).toBe(inorder(st, ghost).length);
  expect(vars.height).toBe(heightOf(st));
  expect(vars.nodes).toBe(nodeCount(st));
  expect(vars.splits).toBe(st.splits);
  expect(vars.merges).toBe(st.merges);
  expect(vars.borrows).toBe(st.borrows);
}

const settingsArb = fc.record({
  t: fc.constantFrom('2' as const, '3' as const, '4' as const),
  split: fc.constantFrom('down' as const, 'up' as const),
});

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 4, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 2, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (settings: Partial<BTreeSettings>, calls: OpCall[]) =>
  new Timeline(bTree, { ...bTree.defaults, ...settings } as BTreeSettings, 1, calls);
const ins = (ks: number[]): OpCall[] => ks.map((k) => ['insert', k]);

describe('B-tree', () => {
  it('matches a reference B-tree, shape included, and keeps every invariant on every step', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(callArb, { maxLength: 80, size: 'large' }),
        (settings, calls) => {
          const st = settings as BTreeSettings;
          const t = degree(st);
          const tl = new Timeline(bTree, st, 1, calls);
          let ref = new RefBTree(t, st.split);
          calls.forEach(([op, raw], i) => {
            const k = Number(raw);
            const entry = tl.entries[i]!;
            const last = entry.steps.at(-1)!;
            if (op === 'search') expect(last.vars?.found, `search ${k}`).toBe(ref.has(k));
            if (op === 'insert') ref.insert(k);
            if (op === 'delete') ref.delete(k);
            if (op === 'clear') ref = new RefBTree(t, st.split);
            expect(modelShape(entry.end), `after ${op} ${raw ?? ''}`).toBe(ref.shape());
            for (const step of entry.steps)
              checkStep(
                step.state,
                t,
                step.extra?.ghost,
                step.lines.includes('up.over'),
                step.vars ?? {},
              );
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
          const tl = new Timeline(bTree, settings as BTreeSettings, 1, calls);
          const ref = new Set<number>();
          for (const [op, raw] of calls) {
            if (op === 'insert') ref.add(Number(raw));
            if (op === 'delete') ref.delete(Number(raw));
            if (op === 'clear') ref.clear();
          }
          expect(keysOf(tl.endState())).toEqual([...ref].sort((a, b) => a - b));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('splits the full root first and grows at the top', () => {
    const tl = run({}, ins([10, 20, 30, 40, 50, 60]));
    expect(modelShape(tl.endState())).toBe('(30: [10 20] [40 50 60])');
    const says = tl.entries[5]!.steps.map((s) => s.say).join(' ');
    expect(says).toContain('2t - 1 = 5 keys');
    expect(says).toContain('its middle key 30 moves up');
  });

  it('splits only overflowing nodes when splitting on the way back up', () => {
    const keys = ins([10, 20, 30, 40, 50, 60, 70, 80, 5]);
    expect(modelShape(run({ t: '2' }, keys).endState())).toBe(
      '(40: (20: [5 10] [30]) (60: [50] [70 80]))',
    );
    expect(modelShape(run({ t: '2', split: 'up' }, keys).endState())).toBe(
      '(30 60: [5 10 20] [40 50] [70 80])',
    );
  });

  it('names every delete case in its curated example', () => {
    const expected: Record<string, string[]> = {
      'delete-leaf': ['1'],
      predecessor: ['2a', '1'],
      successor: ['2b', '1'],
      'merge-around': ['2c', '1'],
      'borrow-left': ['3a', '1'],
      'borrow-right': ['3a', '1'],
      'merge-down': ['3b', '1'],
      'merge-shrinks': ['3b', '3b', '1'],
    };
    for (const [id, cases] of Object.entries(expected)) {
      const ex = bTree.examples.find((e) => e.id === id)!;
      const tl = new Timeline(bTree, ex.settings as BTreeSettings, 1, ex.ops);
      expect(deleteCases(tl.entries.at(-1)!.steps), id).toEqual(cases);
    }
    const shrink = bTree.examples.find((e) => e.id === 'merge-shrinks')!;
    const tl = new Timeline(bTree, shrink.settings as BTreeSettings, 1, shrink.ops);
    expect(tl.entries.at(-2)!.steps.at(-1)!.vars?.height).toBe(2);
    expect(tl.entries.at(-1)!.steps.at(-1)!.vars?.height).toBe(1);
    expect(tl.entries.at(-1)!.steps.some((s) => s.lines.includes('del.root'))).toBe(true);
  });

  it('shows the cascade of splits in its curated example', () => {
    const ex = bTree.examples.find((e) => e.id === 'split-cascade')!;
    const tl = new Timeline(bTree, ex.settings as BTreeSettings, 1, ex.ops);
    const last = tl.entries.at(-1)!.steps;
    expect(last.filter((s) => s.lines.includes('up.split'))).toHaveLength(2);
    expect(last.some((s) => s.lines.includes('up.root'))).toBe(true);
  });

  it('leaves a dashed copy of the predecessor until the recursion removes it', () => {
    const ex = bTree.examples.find((e) => e.id === 'predecessor')!;
    const tl = new Timeline(bTree, ex.settings as BTreeSettings, 1, ex.ops);
    const steps = tl.entries.at(-1)!.steps;
    const moved = steps.findIndex((s) => s.extra?.ghost !== undefined);
    expect(moved).toBeGreaterThan(0);
    expect(steps[moved]!.vars?.N).toBe(9);
    expect(steps.at(-1)!.extra?.ghost).toBeUndefined();
    expect(keysOf(steps.at(-1)!.state)).not.toContain(30);
  });

  it('reports a duplicate or a missing key and keeps the tree valid', () => {
    const tl = run({}, [...ins([10, 20, 30]), ['insert', 20], ['delete', 99], ['delete', 'x']]);
    expect(tl.entries[3]!.steps.at(-1)!.say).toContain('already in');
    expect(tl.entries[4]!.steps.at(-1)!.say).toContain('not in the tree');
    expect(tl.entries[5]!.steps.at(-1)!.say).toContain('whole numbers');
    expect(keysOf(tl.endState())).toEqual([10, 20, 30]);
  });

  it('counts nodes read on a search', () => {
    const tl = run({}, [...ins(Array.from({ length: 20 }, (_, i) => 10 * (i + 1)))]);
    const deep = run({}, [...tl.calls, ['search', 75]]);
    expect(deep.entries.at(-1)!.steps.at(-1)!.vars?.reads).toBe(3);
    const top = run({}, [...tl.calls, ['search', 90]]);
    expect(top.entries.at(-1)!.steps.at(-1)!.vars?.reads).toBe(1);
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const t of ['2', '3', '4'] as const)
      for (const split of ['down', 'up'] as const)
        for (const block of bTree.pseudocode({ t, split }))
          for (const l of block.lines)
            expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });

  it('parses keys', () => {
    expect(parseKeyInput('42')).toBe(42);
    expect(parseKeyInput('-5')).toBe(-5);
    expect(parseKeyInput('cat')).toBeInstanceOf(Error);
    expect(parseKeyInput('1000')).toBeInstanceOf(Error);
  });
});

describe('B-tree practice', () => {
  const kinds = new Map(bTree.practice!.map((k) => [k.id, k]));

  function reference(settings: Partial<BTreeSettings>, setup: OpCall[]): RefBTree {
    const s = { ...bTree.defaults, ...settings } as BTreeSettings;
    const ref = new RefBTree(degree(s), s.split);
    for (const [op, raw] of setup) {
      if (op === 'insert') ref.insert(Number(raw));
      if (op === 'delete') ref.delete(Number(raw));
    }
    return ref;
  }

  it('has answers that agree with the reference B-tree', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const [id, kind] of kinds) {
        const q = kind.make(makeRng(seed));
        const ref = reference(q.settings ?? {}, q.setup);
        const a = q.answer;
        const [op, raw] = q.watch![0]!;
        const k = Number(raw);
        const where = `${id} seed ${seed}`;
        if (id === 'median-up') {
          ref.insert(k);
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(String(ref.medians[0]));
        } else if (id === 'split-count') {
          const before = ref.splits;
          for (const [, x] of q.watch!) ref.insert(Number(x));
          expect(a.kind === 'number' && a.value, where).toBe(ref.splits - before);
        } else if (id === 'delete-cases') {
          expect(op).toBe('delete');
          ref.delete(k);
          expect(a.kind === 'sequence' && a.value, where).toEqual(ref.cases);
        } else if (id === 'search-reads') {
          expect(a.kind === 'number' && a.value, where).toBe(ref.reads(k));
        }
      }
    }
  });

  it('reads the first split from the steps', () => {
    const tl = run({}, ins([10, 20, 30, 40, 50, 60]));
    expect(firstMedian(tl.entries.at(-1)!.steps)).toBe(30);
    expect(firstMedian(tl.entries[0]!.steps)).toBeNull();
  });
});
