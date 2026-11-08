import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { balancedOrderOf, bst, parseKeyInput, zigzagOrderOf } from '.';
import { treeHeight, type BSTSettings, type BSTState } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import textSizeDef from './index';

// ---------------------------------------------------------------------------------------------
// Reference: a plain recursive BST with the same conventions, written independently.

interface RNode {
  key: number;
  value: string | null;
  count: number;
  left: RNode | null;
  right: RNode | null;
}

class RefBST {
  root: RNode | null = null;
  constructor(readonly settings: BSTSettings) {}

  insert(key: number, value: string | null): void {
    const pairs = this.settings.mode === 'pairs';
    const put = (x: RNode | null): RNode => {
      if (!x) return { key, value: pairs ? value : null, count: 1, left: null, right: null };
      if (key < x.key) x.left = put(x.left);
      else if (key > x.key) x.right = put(x.right);
      else if (pairs) x.value = value;
      else if (this.settings.dupes === 'count') x.count += 1;
      return x;
    };
    this.root = put(this.root);
  }

  /** CLRS delete, written recursively: the replacement node moves, its key is not copied. */
  delete(key: number): void {
    const counted = this.settings.mode === 'keys' && this.settings.dupes === 'count';
    const succ = this.settings.delete === 'successor';
    const del = (x: RNode | null): RNode | null => {
      if (!x) return null;
      if (key < x.key) x.left = del(x.left);
      else if (key > x.key) x.right = del(x.right);
      else {
        if (counted && x.count > 1) {
          x.count -= 1;
          return x;
        }
        if (!x.left) return x.right;
        if (!x.right) return x.left;
        if (succ) {
          // Detach the minimum of the right subtree and put it in x's place.
          let parent: RNode | null = null;
          let y = x.right;
          while (y.left) {
            parent = y;
            y = y.left;
          }
          if (parent) {
            parent.left = y.right;
            y.right = x.right;
          }
          y.left = x.left;
          return y;
        }
        let parent: RNode | null = null;
        let y = x.left;
        while (y.right) {
          parent = y;
          y = y.right;
        }
        if (parent) {
          parent.right = y.left;
          y.left = x.left;
        }
        y.right = x.right;
        return y;
      }
      return x;
    };
    this.root = del(this.root);
  }

  /** Sorted keys, one entry per copy. */
  keys(): number[] {
    const out: number[] = [];
    const walk = (x: RNode | null) => {
      if (!x) return;
      walk(x.left);
      for (let i = 0; i < x.count; i++) out.push(x.key);
      walk(x.right);
    };
    walk(this.root);
    return out;
  }

  find(key: number): RNode | null {
    let x = this.root;
    while (x && x.key !== key) x = key < x.key ? x.left : x.right;
    return x;
  }

  shape(): string {
    const s = (x: RNode | null): string =>
      x ? `(${x.key}x${x.count} ${s(x.left)} ${s(x.right)})` : '.';
    return s(this.root);
  }
}

function modelShape(st: BSTState): string {
  const s = (u: number | null): string => {
    if (u === null) return '.';
    const n = st.nodes[u]!;
    return `(${n.key}x${n.count} ${s(n.left)} ${s(n.right)})`;
  };
  return s(st.root);
}

// ---------------------------------------------------------------------------------------------
// Invariants every step must keep.

function checkStep(st: BSTState, held: number | undefined, vars: Record<string, unknown>) {
  const reached = new Set<number>();
  const walk = (u: number | null, parent: number | null, lo: number, hi: number): number => {
    if (u === null) return 0;
    expect(reached.has(u), `node ${u} reached once`).toBe(false);
    reached.add(u);
    const n = st.nodes[u]!;
    expect(n, `node ${u} exists`).toBeDefined();
    expect(n.uid).toBe(u);
    expect(u).toBeLessThan(st.nextUid);
    expect(n.parent, `parent of ${n.key}`).toBe(parent);
    expect(n.key, 'BST order').toBeGreaterThan(lo);
    expect(n.key, 'BST order').toBeLessThan(hi);
    expect(n.count).toBeGreaterThanOrEqual(1);
    const size = n.count + walk(n.left, u, lo, n.key) + walk(n.right, u, n.key, hi);
    expect(n.size, `size of ${n.key}`).toBe(size);
    return size;
  };
  const total = walk(st.root, null, -Infinity, Infinity);
  // The only node outside the tree is one lifted out during delete.
  const outside = Object.keys(st.nodes)
    .map(Number)
    .filter((u) => !reached.has(u));
  expect(outside).toEqual(held === undefined ? [] : [held]);
  expect(vars.N).toBe(total);
  expect(vars.height).toBe(treeHeight(st));
}

// ---------------------------------------------------------------------------------------------

const settingsArb = fc.record({
  delete: fc.constantFrom('successor' as const, 'predecessor' as const),
  dupes: fc.constantFrom('reject' as const, 'count' as const),
  mode: fc.constantFrom('keys' as const, 'pairs' as const),
});

const keyArb = fc.integer({ min: 1, max: 30 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  {
    weight: 2,
    arbitrary: fc
      .tuple(keyArb, fc.constantFrom('a', 'b', 'pear', 'kiwi'))
      .map(([k, v]) => ['insert', `${k}=${v}`] as OpCall),
  },
  { weight: 3, arbitrary: keyArb.map((k) => ['delete', k] as OpCall) },
  ...['search', 'predecessor', 'successor', 'rank', 'lowerbound'].map((op) => ({
    weight: 1,
    arbitrary: keyArb.map((k) => [op, k] as OpCall),
  })),
  { weight: 1, arbitrary: fc.integer({ min: -1, max: 25 }).map((i) => ['select', i] as OpCall) },
  ...['min', 'max', 'inorder'].map((op) => ({ weight: 1, arbitrary: fc.constant([op] as OpCall) })),
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('binary search tree', () => {
  it('matches a reference BST, shape included, and keeps every invariant on every step', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 45 }), (settings, calls) => {
        const st = settings as BSTSettings;
        const t = new Timeline(bst, st, 1, calls);
        const ref = new RefBST(st);
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const entry = t.entries[i]!;
          const last = entry.steps.at(-1)!;
          const v = last.vars ?? {};
          const [kText, valText] = String(raw ?? '').split('=');
          const k = Number(kText);
          const keys = ref.keys();
          const distinct = [...new Set(keys)];
          switch (op) {
            case 'insert':
              ref.insert(k, valText ?? null);
              break;
            case 'delete':
              ref.delete(k);
              break;
            case 'clear':
              ref.root = null;
              break;
            case 'search': {
              const hit = ref.find(k);
              expect(v.found).toBe(!!hit);
              if (st.mode === 'pairs' && hit) expect(v.returned).toBe(hit.value ?? 'no value');
              break;
            }
            case 'min':
              expect(v.returned).toBe(keys.length ? keys[0] : 'nil');
              break;
            case 'max':
              expect(v.returned).toBe(keys.length ? keys.at(-1) : 'nil');
              break;
            case 'successor':
            case 'predecessor': {
              const at = distinct.indexOf(k);
              const want =
                at < 0 ? 'nil' : (distinct[op === 'successor' ? at + 1 : at - 1] ?? 'nil');
              expect(v.returned, `${op}(${k}) of ${distinct}`).toBe(want);
              break;
            }
            case 'select':
              expect(v.returned, `select(${k}) of ${keys}`).toBe(
                k >= 1 && k <= keys.length ? keys[k - 1] : 'nil',
              );
              break;
            case 'rank':
              expect(v.returned, `rank(${k}) of ${keys}`).toBe(
                keys.includes(k) ? keys.filter((x) => x < k).length + 1 : 'nil',
              );
              break;
            case 'lowerbound':
              expect(v.returned).toBe(keys.find((x) => x >= k) ?? 'nil');
              break;
            case 'inorder':
              expect(v.output).toBe(keys.join(' '));
              break;
          }
          expect(modelShape(entry.end), `shape after ${op}(${raw ?? ''})`).toBe(ref.shape());
          for (const step of entry.steps) {
            checkStep(step.state, step.extra?.held, step.vars ?? {});
            const after = step.state;
            // Values follow the mode: keys-only trees never store one.
            if (st.mode === 'keys') {
              for (const n of Object.values(after.nodes)) expect(n.value).toBeNull();
            }
          }
          if (op === 'insert' || op === 'delete' || op === 'clear') return;
          expect(entry.end, `${op} does not change the tree`).toEqual(
            i === 0 ? t.initial.state : t.entries[i - 1]!.end,
          );
        });
      }),
      { numRuns: 250 },
    );
  });

  it('moves the successor into the deleted node, keeping its identity', () => {
    const t = new Timeline(bst, bst.defaults, 1, [
      ...[50, 30, 70, 20, 40, 60, 80, 55, 65, 57].map((k) => ['insert', k] as OpCall),
      ['delete', 50],
    ]);
    const before = t.entries[9]!.end;
    const after = t.entries[10]!.end;
    const uidOf = (s: BSTState, key: number) =>
      Object.values(s.nodes).find((n) => n.key === key)!.uid;
    // 55 keeps its uid and becomes the root; 57 moves up under 60.
    expect(after.root).toBe(uidOf(before, 55));
    expect(after.nodes[uidOf(before, 60)]!.left).toBe(uidOf(before, 57));
    const steps = t.entries[10]!.steps;
    expect(steps.some((s) => s.lines.includes('del.splice'))).toBe(true);
    expect(steps.some((s) => s.extra?.held === uidOf(before, 55))).toBe(true);
    expect(steps.some((s) => s.extra?.held === uidOf(before, 50))).toBe(true);
  });

  it('narrates each comparison on the way down', () => {
    const t = new Timeline(bst, bst.defaults, 1, [
      ...[50, 30, 70, 20, 40].map((k) => ['insert', k] as OpCall),
      ['search', 45],
    ]);
    const says = t.entries[5]!.steps.map((s) => s.say);
    expect(says).toContain('search(45): 45 < 50, so go left to 30.');
    expect(says).toContain('search(45): 45 > 30, so go right to 40.');
    expect(says).toContain('search(45): 45 > 40, but 40 has no right child, so x = nil.');
    expect(says.at(-1)).toContain('45 is not in the tree');
  });

  it('rejects, counts, or updates a key that is already there', () => {
    const run = (s: Partial<BSTSettings>, calls: OpCall[]) =>
      new Timeline(bst, { ...bst.defaults, ...s } as BSTSettings, 1, calls);
    const reject = run({}, [
      ['insert', 5],
      ['insert', 5],
    ]);
    expect(Object.keys(reject.endState().nodes)).toHaveLength(1);
    expect(reject.entries[1]!.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    const count = run({ dupes: 'count' }, [
      ['insert', 5],
      ['insert', 5],
      ['delete', 5],
    ]);
    expect(count.entries[1]!.end.nodes[1]!.count).toBe(2);
    expect(count.endState().nodes[1]!.count).toBe(1);
    const pairs = run({ mode: 'pairs' }, [
      ['insert', '5=pear'],
      ['insert', '5=kiwi'],
      ['search', 5],
    ]);
    expect(pairs.endState().nodes[1]!.value).toBe('kiwi');
    expect(pairs.entries[2]!.steps.at(-1)!.vars?.returned).toBe('kiwi');
  });

  it('turns bad arguments into a narrated error without changing the tree', () => {
    const t = new Timeline(bst, bst.defaults, 1, [
      ['insert', 5],
      ['insert', 'cat'],
      ['delete', 1234],
      ['search', '5=x=y'],
    ]);
    for (const e of t.entries.slice(1)) {
      expect(e.end).toEqual(t.entries[0]!.end);
      expect(e.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    }
  });

  it('parses keys and pairs from the input box', () => {
    expect(parseKeyInput('42')).toBe(42);
    expect(parseKeyInput('-7')).toBe(-7);
    expect(parseKeyInput('42=apple')).toBe('42=apple');
    expect(parseKeyInput(' 42 = apple ')).toBe('42=apple');
    expect(parseKeyInput('cat')).toBeInstanceOf(Error);
    expect(parseKeyInput('1000')).toBeInstanceOf(Error);
    expect(parseKeyInput('2.5')).toBeInstanceOf(Error);
    expect(parseKeyInput('42=toolongvalue')).toBeInstanceOf(Error);
    expect(parseKeyInput('42=two words')).toBeInstanceOf(Error);
  });

  it('builds the preset shapes it promises', () => {
    const presets = bst.controls.presets!;
    const heightOf = (label: string, n: number) => {
      const p = presets.find((x) => x.label.startsWith(label))!;
      return treeHeight(new Timeline(bst, bst.defaults, 1, p.make(makeRng(n), n)).endState());
    };
    for (const n of bst.controls.sizes!) {
      expect(heightOf('Sorted', n)).toBe(n - 1);
      expect(heightOf('Reverse', n)).toBe(n - 1);
      expect(heightOf('Zigzag', n)).toBe(n - 1);
      expect(heightOf('Balanced', n)).toBe(Math.floor(Math.log2(n)));
    }
    expect(balancedOrderOf([1, 2, 3, 4, 5, 6, 7])).toEqual([4, 2, 6, 1, 3, 5, 7]);
    expect(zigzagOrderOf([1, 2, 3, 4, 5])).toEqual([1, 5, 2, 4, 3]);
  });
});

describe('binary search tree practice', () => {
  const kinds = bst.practice!;
  const refHeight = (x: RNode | null): number =>
    x ? 1 + Math.max(refHeight(x.left), refHeight(x.right)) : -1;
  const keysOf = (calls: OpCall[]) => calls.map((c) => Number(c[1]));

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'height-after',
      'delete-replacement',
      'select-rank',
      'search-path',
    ]);
  });

  it('gets every answer right, checked against the reference BST', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const settings = { ...bst.defaults, ...q.settings } as BSTSettings;
        const ref = new RefBST(settings);
        for (const key of keysOf(q.setup)) ref.insert(key, null);
        const a = q.answer;
        const [op, arg] = q.watch![0]!;
        if (k.id === 'height-after') {
          for (const key of keysOf(q.watch!)) ref.insert(key, null);
          expect(a).toEqual({ kind: 'number', value: refHeight(ref.root) });
        } else if (k.id === 'delete-replacement') {
          if (a.kind !== 'choice') throw new Error('delete-replacement is a choice');
          const z = Number(arg);
          // Where z hangs before the delete: under which parent, on which side.
          let parent: RNode | null = null;
          for (let x = ref.root; x && x.key !== z; x = z < x.key ? x.left : x.right) parent = x;
          expect(ref.find(z)!.left && ref.find(z)!.right).toBeTruthy();
          ref.delete(z);
          const now = parent ? (z < parent.key ? parent.left : parent.right) : ref.root;
          expect(a.options[a.correct]).toBe(String(now!.key));
        } else if (k.id === 'select-rank') {
          const keys = ref.keys();
          const want = op === 'select' ? keys[Number(arg) - 1] : keys.indexOf(Number(arg)) + 1;
          expect(a).toEqual({ kind: 'number', value: want });
        } else {
          const path: string[] = [];
          const key = Number(arg);
          for (let x = ref.root; x; x = key < x.key ? x.left : x.right) {
            path.push(String(x.key));
            if (x.key === key) break;
          }
          expect(a).toEqual({ kind: 'sequence', value: path });
        }
      }
    }
  });

  it('shows the answer by playing the asked operations after the setup', () => {
    for (const k of kinds) {
      for (let seed = 1; seed <= 5; seed++) {
        const q = k.make(makeRng(seed));
        const settings = { ...bst.defaults, ...q.settings } as BSTSettings;
        const t = new Timeline(bst, settings, 1, [...q.setup, ...q.watch!]);
        expect(t.entries).toHaveLength(q.setup.length + q.watch!.length);
        expect(q.watch!.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('drawn text size', () => {
  // nil was 12, and deep trees kept 56 between levels when labelled (10.2 px on a laptop); nil at 13, deep trees closer.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(textSizeDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(textSizeDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
