import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { binaryTree, parseList } from '.';
import {
  height as modelHeight,
  parseLevelOrder,
  toLevelOrder,
  type BTSettings,
  type BTState,
  type Order,
} from './model';

// A plain reference tree, independent of the model's representation.
interface Ref {
  value: Value;
  left: Ref | null;
  right: Ref | null;
}

const refPre = (x: Ref | null): Value[] =>
  x ? [x.value, ...refPre(x.left), ...refPre(x.right)] : [];
const refIn = (x: Ref | null): Value[] => (x ? [...refIn(x.left), x.value, ...refIn(x.right)] : []);
const refPost = (x: Ref | null): Value[] =>
  x ? [...refPost(x.left), ...refPost(x.right), x.value] : [];
function refLevel(x: Ref | null): Value[] {
  const out: Value[] = [];
  const q = x ? [x] : [];
  while (q.length) {
    const n = q.shift()!;
    out.push(n.value);
    if (n.left) q.push(n.left);
    if (n.right) q.push(n.right);
  }
  return out;
}
const refHeight = (x: Ref | null): number =>
  x ? 1 + Math.max(refHeight(x.left), refHeight(x.right)) : -1;
const refSize = (x: Ref | null): number => (x ? 1 + refSize(x.left) + refSize(x.right) : 0);
const REF: Record<Order | 'levelorder', (x: Ref | null) => Value[]> = {
  preorder: refPre,
  inorder: refIn,
  postorder: refPost,
  levelorder: refLevel,
};

/** Level-order text with _ for gaps, written by the test itself. */
function refList(root: Ref | null): string {
  if (!root) return '_';
  const out: string[] = [];
  const q: (Ref | null)[] = [root];
  while (q.length) {
    const n = q.shift()!;
    out.push(n ? String(n.value) : '_');
    if (n) q.push(n.left, n.right);
  }
  while (out[out.length - 1] === '_') out.pop();
  return out.join(' ');
}

/** Random trees: each new node takes a free child spot chosen by the generator. */
const treeArb: fc.Arbitrary<Ref | null> = fc
  .array(fc.tuple(fc.integer({ min: -99, max: 999 }), fc.nat()), { maxLength: 31 })
  .map((items) => {
    if (items.length === 0) return null;
    const root: Ref = { value: items[0]![0], left: null, right: null };
    const spots: [Ref, 'left' | 'right'][] = [
      [root, 'left'],
      [root, 'right'],
    ];
    for (const [value, pick] of items.slice(1)) {
      const [parent, side] = spots.splice(pick % spots.length, 1)[0]!;
      const child: Ref = { value, left: null, right: null };
      parent[side] = child;
      spots.push([child, 'left'], [child, 'right']);
    }
    return root;
  });

const settings = (s: Partial<BTSettings> = {}): BTSettings =>
  ({ ...binaryTree.defaults, ...s }) as BTSettings;

/** The tree is well formed: every node reachable once, children exist, uids are fresh. */
function checkTree(s: BTState) {
  const seen = new Set<number>();
  const walk = (u: number | null) => {
    if (u === null) return;
    expect(seen.has(u), `node ${u} is reached once`).toBe(false);
    seen.add(u);
    const n = s.nodes[u];
    expect(n, `node ${u} exists`).toBeDefined();
    expect(n!.uid).toBe(u);
    expect(u).toBeLessThan(s.nextUid);
    walk(n!.left);
    walk(n!.right);
  };
  walk(s.root);
  expect(seen.size, 'no unreachable nodes').toBe(Object.keys(s.nodes).length);
}

function isChild(s: BTState, parent: number, child: number) {
  const n = s.nodes[parent]!;
  return n.left === child || n.right === child;
}

describe('binary tree', () => {
  it('builds the tree a level-order list describes', () => {
    fc.assert(
      fc.property(treeArb, (ref) => {
        const t = new Timeline(binaryTree, settings(), 1, [['build', refList(ref)]]);
        const s = t.endState();
        checkTree(s);
        expect(toLevelOrder(s)).toBe(refList(ref));
        expect(modelHeight(s)).toBe(refHeight(ref));
        const last = t.entries[0]!.steps.at(-1)!;
        expect(last.vars?.size).toBe(refSize(ref));
        expect(last.vars?.height).toBe(refHeight(ref));
        for (let i = 0; i < t.length; i++) checkTree(t.at(i).step.state);
      }),
      { numRuns: 200 },
    );
  });

  it('walks every order like the reference, in both modes, with sound bookkeeping', () => {
    const orders = ['preorder', 'inorder', 'postorder', 'levelorder'] as const;
    fc.assert(
      fc.property(
        treeArb,
        fc.constantFrom('recursive' as const, 'iterative' as const),
        fc.constantFrom(...orders),
        (ref, mode, order) => {
          const t = new Timeline(binaryTree, settings({ mode }), 1, [
            ['build', refList(ref)],
            [order],
          ]);
          const built = t.entries[0]!.end;
          const expected = REF[order](ref).map(String);
          const walk = t.entries[1]!;
          const final = walk.steps.at(-1)!;
          expect(String(final.vars?.output ?? '')).toBe(expected.join(' '));
          let longest = 0;
          let previous: string[] = [];
          for (const step of walk.steps) {
            expect(step.state, 'a traversal never changes the tree').toEqual(built);
            expect(step.vars?.size).toBe(refSize(ref));
            expect(step.vars?.height).toBe(refHeight(ref));
            const x = step.extra ?? {};
            // The output only grows, and is always a prefix of the right answer.
            const out = (x.output ?? []).map((u) => String(built.nodes[u]!.value));
            expect(out).toEqual(expected.slice(0, out.length));
            expect(out.slice(0, previous.length)).toEqual(previous);
            previous = out;
            // A node is visited at most once.
            expect(new Set(x.output ?? []).size).toBe((x.output ?? []).length);
            if (x.frames) {
              // The call stack is a path down from the root (plus at most one nil call on top).
              expect(step.vars?.depth).toBe(x.frames.length);
              const real = x.frames.filter((f) => f.uid !== null);
              x.frames.forEach((f, i) => {
                if (i === 0) expect(f.uid).toBe(built.root);
                else if (f.uid === null) {
                  expect(i).toBe(x.frames!.length - 1);
                  expect(f.parent).toBe(x.frames![i - 1]!.uid);
                } else expect(isChild(built, x.frames![i - 1]!.uid!, f.uid)).toBe(true);
              });
              longest = Math.max(longest, real.length);
            }
            if (x.stack) {
              expect(new Set(x.stack).size).toBe(x.stack.length);
              for (const u of x.stack) expect(built.nodes[u]).toBeDefined();
              longest = Math.max(longest, x.stack.length);
            }
            if (x.queue && order === 'levelorder') {
              // Output then queue is always a prefix of the level order.
              const all = [...(x.output ?? []), ...x.queue].map((u) =>
                String(built.nodes[u]!.value),
              );
              expect(all).toEqual(expected.slice(0, all.length));
            }
          }
          if (order !== 'levelorder' && mode === 'recursive' && ref) {
            // The deepest the call stack gets is one frame per level of the tallest path.
            expect(longest).toBe(refHeight(ref) + 1);
          }
          if (order !== 'levelorder' && mode === 'iterative' && ref) {
            expect(longest).toBeLessThanOrEqual(refHeight(ref) + 1);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps the tree and says why when a list is not a tree', () => {
    const t = new Timeline(binaryTree, settings(), 1, [
      ['build', '1 2 3'],
      ['build', '1 _ _ 4'],
      ['build', 'toolong'],
      ['build', '_ 1'],
    ]);
    const before = t.entries[0]!.end;
    for (const e of t.entries.slice(1)) {
      expect(e.end).toEqual(before);
      const last = e.steps.at(-1)!;
      expect(last.lines).toEqual(['build.bad']);
      expect(last.marks.some((m) => m.role === 'error')).toBe(true);
    }
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('"4" has no node above it');
  });

  it('reads level-order lists in several spellings', () => {
    expect(parseList('1 2 3 _ 5')).toBe('1 2 3 _ 5');
    expect(parseList('[1,2,3,null,5]')).toBe('1 2 3 _ 5');
    expect(parseList('1, 2, 3, #, 5, _, _')).toBe('1 2 3 _ 5');
    expect(parseList('A b C')).toBe('A b C');
    expect(parseList('007')).toBe('7');
    expect(parseList('_')).toBe('_');
    expect(parseList('')).toBeInstanceOf(Error);
    expect(parseList('_ 1')).toBeInstanceOf(Error);
    expect(parseList('1 _ _ 4')).toBeInstanceOf(Error);
    expect(parseList('abcd')).toBeInstanceOf(Error);
    expect(parseList('1 2.5')).toBeInstanceOf(Error);
    const big = Array.from({ length: 32 }, (_, i) => i + 1).join(' ');
    expect(parseList(big)).toBeInstanceOf(Error);
    expect(parseLevelOrder(5)).toEqual([5]);
  });

  it('builds an empty tree from a lone gap and walks it', () => {
    for (const mode of ['recursive', 'iterative'] as const) {
      const calls: OpCall[] = [
        ['build', '1 2'],
        ['build', '_'],
        ['preorder'],
        ['inorder'],
        ['postorder'],
        ['levelorder'],
      ];
      const t = new Timeline(binaryTree, settings({ mode }), 1, calls);
      expect(t.endState().root).toBeNull();
      for (const e of t.entries.slice(2)) expect(e.steps.at(-1)!.vars?.output).toBe('');
    }
  });

  it('runs every preset at every size', () => {
    for (const p of binaryTree.controls.presets!) {
      for (const n of binaryTree.controls.sizes!) {
        const calls = p.make(makeRng(n), n);
        const t = new Timeline(binaryTree, settings(), 1, calls);
        const s = t.endState();
        checkTree(s);
        expect(Object.keys(s.nodes).length, `${p.label} ${n}`).toBe(p.label === 'Full' ? n | 1 : n);
        if (p.label === 'Complete') expect(modelHeight(s)).toBe(Math.floor(Math.log2(n)));
        if (p.label === 'Skewed') expect(modelHeight(s)).toBe(n - 1);
        if (p.label === 'Full') {
          for (const node of Object.values(s.nodes))
            expect((node.left === null) === (node.right === null)).toBe(true);
        }
      }
    }
  });
});

/** Read a level-order list the LeetCode way, written independently of the model. */
function refFromList(text: string): Ref | null {
  const words = text.split(' ');
  if (words[0] === '_') return null;
  const node = (w: string): Ref => ({ value: Number(w), left: null, right: null });
  const root = node(words[0]!);
  const queue = [root];
  for (let i = 1; i < words.length && queue.length; i += 2) {
    const x = queue.shift()!;
    for (const [side, w] of [
      ['left', words[i]],
      ['right', words[i + 1]],
    ] as const) {
      if (w === undefined || w === '_') continue;
      x[side] = node(w);
      queue.push(x[side]!);
    }
  }
  return root;
}

describe('binary tree practice', () => {
  const kinds = binaryTree.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'traversal',
      'which-list',
      'stack-depth',
      'queue-peak',
    ]);
  });

  it('gets every answer right, checked against the reference tree', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const ref = refFromList(String(q.setup[0]![1]));
        const a = q.answer;
        if (k.id === 'traversal') {
          const walk = q.watch![0]![0] as Order | 'levelorder';
          expect(a).toEqual({ kind: 'sequence', value: REF[walk](ref).map(String) });
        } else if (k.id === 'which-list') {
          if (a.kind !== 'choice') throw new Error('which-list is a choice');
          expect(a.options[a.correct]).toBe(refList(ref));
          a.options.forEach((o, i) => {
            if (i !== a.correct) expect(refList(refFromList(o))).not.toBe(refList(ref));
          });
        } else if (k.id === 'stack-depth') {
          expect(a).toEqual({ kind: 'number', value: refHeight(ref) + 1 });
        } else {
          // The most nodes ever waiting: the root at first, then after each enqueue.
          let peak = 1;
          const queue = [ref!];
          while (queue.length) {
            const x = queue.shift()!;
            for (const c of [x.left, x.right]) {
              if (!c) continue;
              queue.push(c);
              peak = Math.max(peak, queue.length);
            }
          }
          expect(a).toEqual({ kind: 'number', value: peak });
        }
      }
    }
  });

  it('shows the answer by playing the asked operation after the setup', () => {
    for (const k of kinds) {
      const q = k.make(makeRng(7));
      const t = new Timeline(
        binaryTree,
        { ...binaryTree.defaults, ...q.settings } as BTSettings,
        1,
        [...q.setup, ...q.watch!],
      );
      expect(t.entries.map((e) => e.call[0])).toEqual([
        ...q.setup.map((c) => c[0]),
        ...q.watch!.map((c) => c[0]),
      ]);
    }
  });
});
