import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { heightOf, inorder, keysOf, nodeCount, type BState } from '../_multiway/btree';
import { twoFourTree, parseKeyInput } from '.';
import type { TwoFourSettings } from './model';
import { firstFix, swappedIn } from './practice';

// ---------------------------------------------------------------------------------------------
// Reference: a recursive 2-4 tree written independently from the model, as Goodrich and
// Tamassia describe it, with the same choices (transfer from the left sibling first; fuse with
// the right sibling when there is one). It records what the practice questions ask about.

interface RNode {
  keys: number[];
  kids: RNode[];
}

class Ref {
  root: RNode | null = null;
  splits = 0;
  medians: number[] = [];
  fixes: ('transfer' | 'fusion')[] = [];
  swapped: number | null = null;
  constructor(readonly succ: boolean) {}

  has(k: number): boolean {
    for (let x = this.root; x;) {
      let i = 0;
      while (i < x.keys.length && k > x.keys[i]!) i++;
      if (x.keys[i] === k) return true;
      x = x.kids[i] ?? null;
    }
    return false;
  }

  insert(k: number): void {
    this.medians = [];
    if (this.has(k)) return;
    if (!this.root) {
      this.root = { keys: [k], kids: [] };
      return;
    }
    const up = (x: RNode): [number, RNode] | null => {
      let i = 0;
      while (i < x.keys.length && k > x.keys[i]!) i++;
      if (!x.kids.length) x.keys.splice(i, 0, k);
      else {
        const s = up(x.kids[i]!);
        if (s) {
          x.keys.splice(i, 0, s[0]);
          x.kids.splice(i + 1, 0, s[1]);
        }
      }
      if (x.keys.length < 4) return null;
      const right: RNode = { keys: [x.keys[3]!], kids: x.kids.slice(3) };
      const m = x.keys[2]!;
      x.keys = x.keys.slice(0, 2);
      x.kids = x.kids.slice(0, x.kids.length ? 3 : 0);
      this.splits++;
      this.medians.push(m);
      return [m, right];
    };
    const s = up(this.root);
    if (s) this.root = { keys: [s[0]], kids: [this.root, s[1]] };
  }

  delete(k: number): void {
    this.fixes = [];
    this.swapped = null;
    if (!this.has(k)) return;
    const del = (x: RNode): void => {
      let i = 0;
      while (i < x.keys.length && k > x.keys[i]!) i++;
      let into = i;
      if (x.keys[i] === k) {
        if (!x.kids.length) {
          x.keys.splice(i, 1);
          return;
        }
        // Swap with the predecessor (or successor), which sits in a leaf.
        into = this.succ ? i + 1 : i;
        let leaf = x.kids[into]!;
        while (leaf.kids.length)
          leaf = this.succ ? leaf.kids[0]! : leaf.kids[leaf.kids.length - 1]!;
        const j = this.succ ? 0 : leaf.keys.length - 1;
        this.swapped = leaf.keys[j]!;
        x.keys[i] = leaf.keys[j]!;
        leaf.keys[j] = k;
      }
      del(x.kids[into]!);
      if (x.kids[into]!.keys.length === 0) this.fix(x, into);
    };
    del(this.root!);
    if (this.root!.keys.length === 0) this.root = this.root!.kids[0] ?? null;
  }

  private fix(x: RNode, i: number): void {
    const c = x.kids[i]!;
    const l = i > 0 ? x.kids[i - 1] : undefined;
    const r = i + 1 < x.kids.length ? x.kids[i + 1] : undefined;
    if (l && l.keys.length > 1) {
      this.fixes.push('transfer');
      c.keys.unshift(x.keys[i - 1]!);
      x.keys[i - 1] = l.keys.pop()!;
      if (l.kids.length) c.kids.unshift(l.kids.pop()!);
    } else if (r && r.keys.length > 1) {
      this.fixes.push('transfer');
      c.keys.push(x.keys[i]!);
      x.keys[i] = r.keys.shift()!;
      if (r.kids.length) c.kids.push(r.kids.shift()!);
    } else if (r) {
      this.fixes.push('fusion');
      c.keys = [x.keys[i]!, ...r.keys];
      c.kids = [...c.kids, ...r.kids];
      x.keys.splice(i, 1);
      x.kids.splice(i + 1, 1);
    } else {
      this.fixes.push('fusion');
      l!.keys.push(x.keys[i - 1]!);
      l!.kids.push(...c.kids);
      x.keys.splice(i - 1, 1);
      x.kids.splice(i, 1);
    }
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
// Invariants every step must keep. `moving` is a key a delete has swapped down into a leaf; it
// is out of order until it comes out. One node may be empty (an underflow being fixed) and one
// may hold 4 keys (an overflow about to split).

function checkStep(
  st: BState,
  moving: number | null,
  lines: string[],
  vars: Record<string, unknown>,
) {
  const reached = new Set<number>();
  const depths = new Set<number>();
  let empty = 0;
  let over = 0;
  const walk = (u: number, depth: number, lo: number, hi: number) => {
    expect(reached.has(u)).toBe(false);
    reached.add(u);
    const n = st.nodes[u]!;
    const keys = n.keys.filter((k) => k.key !== moving).map((k) => k.key);
    keys.forEach((k, i) => {
      expect(k, 'key above its lower separator').toBeGreaterThan(lo);
      expect(k, 'key below its upper separator').toBeLessThan(hi);
      if (i > 0) expect(k, 'keys in a node are sorted').toBeGreaterThan(keys[i - 1]!);
    });
    if (n.keys.length === 0) empty++;
    if (n.keys.length === 4) over++;
    expect(n.keys.length).toBeLessThanOrEqual(4);
    if (n.kids.length === 0) depths.add(depth);
    else {
      expect(n.kids.length, 'one more child than keys').toBe(n.keys.length + 1);
      const sep = n.keys.map((k) => k.key);
      n.kids.forEach((c, i) =>
        walk(
          c,
          depth + 1,
          i === 0 ? lo : sep[i - 1] === moving ? -Infinity : sep[i - 1]!,
          i < sep.length && sep[i] !== moving ? sep[i]! : i < sep.length ? Infinity : hi,
        ),
      );
    }
  };
  if (st.root !== null) walk(st.root, 0, -Infinity, Infinity);
  expect(empty, 'at most one empty node, while an underflow is fixed').toBeLessThanOrEqual(1);
  expect(over, 'only an overflowing node holds 4 keys').toBeLessThanOrEqual(
    lines.includes('up.over') ? 1 : 0,
  );
  if (st.root !== null && empty === 0) {
    // Outside an underflow, every node holds 1 to 3 keys.
    for (const u of reached) expect(st.nodes[u]!.keys.length).toBeGreaterThanOrEqual(1);
  }
  expect(depths.size, 'all leaves at the same depth').toBeLessThanOrEqual(1);
  expect(Object.keys(st.nodes).map(Number).sort()).toEqual([...reached].sort());
  expect(vars.N).toBe(inorder(st).length);
  expect(vars.height).toBe(heightOf(st));
  expect(vars.nodes).toBe(nodeCount(st));
  expect(vars.splits).toBe(st.splits);
  expect(vars.fusions).toBe(st.merges);
  expect(vars.transfers).toBe(st.borrows);
}

const settingsArb = fc.record({ swap: fc.constantFrom('pred' as const, 'succ' as const) });
const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 4, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  { weight: 2, arbitrary: keyArb.map((k) => ['search', k] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);
const ins = (ks: number[]): OpCall[] => ks.map((k) => ['insert', k]);
const example = (id: string) => {
  const ex = twoFourTree.examples.find((e) => e.id === id)!;
  return new Timeline(twoFourTree, ex.settings as TwoFourSettings, 1, ex.ops);
};

describe('2-4 tree', () => {
  it('matches a reference 2-4 tree, shape included, and keeps every invariant on every step', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(callArb, { maxLength: 80, size: 'large' }),
        (settings, calls) => {
          const tl = new Timeline(twoFourTree, settings as TwoFourSettings, 1, calls);
          let ref = new Ref(settings.swap === 'succ');
          calls.forEach(([op, raw], i) => {
            const k = Number(raw);
            const entry = tl.entries[i]!;
            if (op === 'search') expect(entry.steps.at(-1)!.vars?.found).toBe(ref.has(k));
            if (op === 'insert') ref.insert(k);
            if (op === 'delete') ref.delete(k);
            if (op === 'clear') ref = new Ref(settings.swap === 'succ');
            expect(modelShape(entry.end), `after ${op} ${raw ?? ''}`).toBe(ref.shape());
            for (const step of entry.steps)
              checkStep(step.state, op === 'delete' ? k : null, step.lines, step.vars ?? {});
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
          const tl = new Timeline(twoFourTree, settings as TwoFourSettings, 1, calls);
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

  it('splits a 5-node around its third key', () => {
    const tl = example('overflow-split');
    expect(modelShape(tl.endState())).toBe('(30: [10 20] [40])');
    expect(
      tl.entries
        .at(-1)!
        .steps.map((s) => s.say)
        .join(' '),
    ).toContain('Now it holds 4 keys (a 5-node)');
  });

  it('cascades splits up to a new root', () => {
    const steps = example('split-cascade').entries.at(-1)!.steps;
    expect(steps.filter((s) => s.lines.includes('up.split'))).toHaveLength(2);
    expect(steps.at(-1)!.vars?.height).toBe(2);
  });

  it('fixes underflows the way each curated example says', () => {
    const fix = (id: string) => firstFix(example(id).entries.at(-1)!.steps);
    expect(fix('transfer-left')).toBe('transfer');
    expect(fix('transfer-right')).toBe('transfer');
    expect(fix('fusion')).toBe('fusion');
    expect(fix('swap-predecessor')).toBeNull();
    expect(swappedIn(example('swap-predecessor').entries.at(-1)!.steps)).toBe(50);
    const cascade = example('fusion-cascade');
    const steps = cascade.entries.at(-1)!.steps;
    expect(steps.filter((s) => s.lines.includes('del.up'))).toHaveLength(2);
    expect(steps.some((s) => s.lines.includes('del.drop'))).toBe(true);
    expect(cascade.entries.at(-2)!.steps.at(-1)!.vars?.height).toBe(2);
    expect(steps.at(-1)!.vars?.height).toBe(1);
    const before = Number(cascade.entries.at(-2)!.steps.at(-1)!.vars?.fusions);
    expect(Number(steps.at(-1)!.vars?.fusions) - before).toBe(2);
  });

  it('swaps with the successor when asked to', () => {
    const calls: OpCall[] = [...ins([10, 20, 30, 40, 50, 60, 70, 80, 90]), ['delete', 60]];
    const tl = new Timeline(twoFourTree, { swap: 'succ' }, 1, calls);
    expect(swappedIn(tl.entries.at(-1)!.steps)).toBe(70);
    expect(modelShape(tl.endState())).toBe('(30 70: [10 20] [40 50] [80 90])');
  });

  it('keeps pseudocode lines short enough for a phone', () => {
    for (const swap of ['pred', 'succ'] as const)
      for (const block of twoFourTree.pseudocode({ swap }))
        for (const l of block.lines)
          expect(2 * l.indent + l.text.length, `${l.id}: ${l.text}`).toBeLessThanOrEqual(33);
  });

  it('parses keys', () => {
    expect(parseKeyInput('42')).toBe(42);
    expect(parseKeyInput('x')).toBeInstanceOf(Error);
  });
});

describe('2-4 tree practice', () => {
  it('has answers that agree with the reference 2-4 tree', () => {
    const kinds = twoFourTree.practice!;
    for (let seed = 1; seed <= 150; seed++) {
      for (const kind of kinds) {
        const q = kind.make(makeRng(seed));
        const ref = new Ref(q.settings?.swap === 'succ');
        for (const [op, raw] of q.setup) {
          if (op === 'insert') ref.insert(Number(raw));
          if (op === 'delete') ref.delete(Number(raw));
        }
        const a = q.answer;
        const k = Number(q.watch![0]![1]);
        const where = `${kind.id} seed ${seed}`;
        if (kind.id === 'overflow-up') {
          ref.insert(k);
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(String(ref.medians[0]));
        } else if (kind.id === 'split-count') {
          expect(q.watch!.length, where).toBeGreaterThanOrEqual(3);
          const before = ref.splits;
          for (const [, x] of q.watch!) ref.insert(Number(x));
          expect(a.kind === 'number' && a.value, where).toBe(ref.splits - before);
        } else if (kind.id === 'underflow-fix') {
          ref.delete(k);
          const names = {
            transfer: 'A transfer from a sibling',
            fusion: 'A fusion with a sibling',
          };
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(names[ref.fixes[0]!]);
        } else if (kind.id === 'swap-key') {
          ref.delete(k);
          expect(a.kind === 'choice' && a.options[a.correct], where).toBe(String(ref.swapped));
        }
      }
    }
  });
});
