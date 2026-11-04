import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { compressedTrie } from '.';
import { heightOf, nodeCount, wordsOf, type RadixState } from './model';
import { mergeText, NO_MERGE, splitText } from './practice';

// ---------------------------------------------------------------------------------------------
// Reference: a set of words, and the compressed trie it must give, built straight from the set.
// A node sits at the root and at every prefix that is a word or where the words branch.

const sorted = (words: Iterable<string>) => [...words].sort();

interface CNode {
  end: boolean;
  /** Prefixes of the child nodes, in order. */
  kids: string[];
}

function canon(words: Set<string>): Map<string, CNode> {
  const out = new Map<string, CNode>();
  const nextLetters = (p: string) =>
    sorted(
      new Set(
        [...words].filter((w) => w.length > p.length && w.startsWith(p)).map((w) => w[p.length]!),
      ),
    );
  const build = (p: string) => {
    const kids: string[] = [];
    for (const ch of nextLetters(p)) {
      let q = p + ch;
      while (!words.has(q) && nextLetters(q).length === 1) q += nextLetters(q)[0]!;
      kids.push(q);
      build(q);
    }
    out.set(p, { end: words.has(p), kids });
  };
  build('');
  return out;
}

/** The same shape as a string: each node's edge, a * if a word ends, then its children. */
function canonShape(words: Set<string>): string {
  const c = canon(words);
  const walk = (p: string, parent: string): string =>
    `${p.slice(parent.length)}${c.get(p)!.end ? '*' : ''}(${c
      .get(p)!
      .kids.map((k) => walk(k, p))
      .join(',')})`;
  return walk('', '');
}

function modelShape(s: RadixState): string {
  const walk = (u: number): string =>
    `${s.nodes[u]!.label}${s.nodes[u]!.end ? '*' : ''}(${s.nodes[u]!.kids.map(walk).join(',')})`;
  return walk(s.root);
}

/** Structure every step must keep. */
function checkShape(s: RadixState) {
  const root = s.nodes[s.root]!;
  expect(root.parent).toBeNull();
  expect(root.label).toBe('');
  expect(root.end).toBe(false);
  const reached = new Set<number>();
  const visit = (u: number) => {
    expect(reached.has(u)).toBe(false);
    reached.add(u);
    expect(u).toBeLessThan(s.nextUid);
    const n = s.nodes[u]!;
    expect(n.uid).toBe(u);
    if (u !== s.root) expect(n.label).toMatch(/^[a-z]+$/);
    const firsts = n.kids.map((k) => s.nodes[k]!.label[0]!);
    expect(firsts, 'children by first letter, one per letter').toEqual([...new Set(firsts)].sort());
    for (const k of n.kids) {
      expect(s.nodes[k]!.parent).toBe(u);
      visit(k);
    }
  };
  visit(s.root);
  expect(reached.size).toBe(Object.keys(s.nodes).length);
}

const wordArb = fc
  .array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 5 })
  .map((xs) => xs.join(''));

const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: wordArb.map((w) => ['insert', w] as OpCall) },
  { weight: 4, arbitrary: wordArb.map((w) => ['delete', w] as OpCall) },
  { weight: 2, arbitrary: wordArb.map((w) => ['search', w] as OpCall) },
  { weight: 2, arbitrary: wordArb.map((w) => ['startsWith', w] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('compressed trie', () => {
  it('matches a set of words and its canonical shape, keeping the rules on every step', () => {
    fc.assert(
      fc.property(fc.array(callArb, { maxLength: 40 }), (calls) => {
        const t = new Timeline(compressedTrie, compressedTrie.defaults, 1, calls);
        const ref = new Set<string>();
        calls.forEach((call, i) => {
          const [op, raw] = call;
          const w = String(raw ?? '');
          const entry = t.entries[i]!;
          const last = entry.steps.at(-1)!;
          const v = last.vars ?? {};
          const before = sorted(ref);
          switch (op) {
            case 'insert':
              expect(last.lines.includes('ins.dup')).toBe(ref.has(w));
              ref.add(w);
              break;
            case 'delete':
              expect(last.lines.includes('del.miss')).toBe(!ref.has(w));
              ref.delete(w);
              break;
            case 'search':
              expect(v.found).toBe(ref.has(w));
              break;
            case 'startsWith':
              expect(v.returned).toBe(
                sorted(ref)
                  .filter((x) => x.startsWith(w))
                  .join(' ') || 'none',
              );
              break;
            case 'clear':
              ref.clear();
              break;
          }
          const after = sorted(ref);
          for (const step of entry.steps) {
            checkShape(step.state);
            const now = wordsOf(step.state);
            expect([before, after]).toContainEqual(now);
            expect(step.vars?.words).toBe(now.length);
            expect(step.vars?.nodes).toBe(nodeCount(step.state));
            expect(step.vars?.height).toBe(heightOf(step.state));
            // Splits and merges are named in the narration.
            if (step.lines.includes('ins.split')) expect(step.say).toMatch(/^Split: /);
            if (step.lines.includes('merge.join')) expect(step.say).toContain('Merge: ');
          }
          const end = entry.end;
          expect(wordsOf(end)).toEqual(after);
          // No node but the root has exactly one child unless it ends a word; leaves end words.
          for (const n of Object.values(end.nodes)) {
            if (n.uid === end.root) continue;
            if (n.kids.length === 1) expect(n.end, `node ${n.label} with one child`).toBe(true);
            if (n.kids.length === 0) expect(n.end, `leaf ${n.label}`).toBe(true);
          }
          expect(modelShape(end)).toBe(canonShape(ref));
          if (op === 'search' || op === 'startsWith') {
            expect(end).toEqual(i === 0 ? t.initial.state : t.entries[i - 1]!.end);
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it('has the same shape whatever the order of the inserts', () => {
    fc.assert(
      fc.property(fc.uniqueArray(wordArb, { maxLength: 12 }), (words) => {
        const shape = (ws: string[]) =>
          modelShape(
            new Timeline(
              compressedTrie,
              compressedTrie.defaults,
              1,
              ws.map((w) => ['insert', w] as OpCall),
            ).endState(),
          );
        expect(shape(words)).toBe(shape([...words].sort()));
        expect(shape(words)).toBe(shape([...words].reverse()));
      }),
      { numRuns: 100 },
    );
  });

  it('names each split and merge', () => {
    const t = new Timeline(compressedTrie, compressedTrie.defaults, 1, [
      ['insert', 'card'],
      ['insert', 'care'],
      ['insert', 'car'],
      ['delete', 'card'],
      ['delete', 'car'],
    ]);
    const says = (i: number) => t.entries[i]!.steps.map((s) => s.say);
    expect(says(1)).toContain(
      'Split: the edge "card" becomes "car" and "d", with a new node between them. Go down to the new node. Left to place: e.',
    );
    expect(t.entries[1]!.steps.find((s) => s.extra?.split)?.extra?.split).toMatchObject({
      was: 'card',
      top: 'car',
      bottom: 'd',
    });
    // car ends at an existing node: no split, only a mark.
    expect(says(2).at(-1)).toContain('no split is needed');
    // Deleting card leaves car with one child, e, but car ends a word: no merge.
    expect(says(3).at(-1)).toContain('Its parent ends the word car, so it stays.');
    // Deleting car then merges car and e.
    expect(says(4).join(' ')).toContain(
      'Merge: the edge "car" and the edge "e" below it become one edge, "care".',
    );
    expect(modelShape(t.endState())).toBe('(care*())');
  });

  it('turns bad words into a narrated error without changing the trie', () => {
    const t = new Timeline(compressedTrie, compressedTrie.defaults, 1, [
      ['insert', 'cat'],
      ['insert', 7],
      ['delete', 'no way'],
      ['startsWith', 'toolongforit'],
    ]);
    for (const e of t.entries.slice(1)) {
      expect(e.end).toEqual(t.entries[0]!.end);
      expect(e.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Practice, checked against the canonical shapes.

/** The edge an insert of w splits, from the canonical trie of `words`, or null. */
function splitOf(words: Set<string>, w: string): string | null {
  const c = canon(words);
  for (const [a, node] of c) {
    for (const b of node.kids) {
      if (!w.startsWith(a)) continue;
      let k = 0;
      while (k < Math.min(b.length, w.length) && b[k] === w[k]) k++;
      if (k > a.length && k < b.length)
        return splitText(b.slice(a.length), b.slice(a.length, k), b.slice(k));
    }
  }
  return null;
}

/** The two edges a delete of w merges, from the canonical tries before and after, or null. */
function mergeOf(words: Set<string>, w: string): string | null {
  const before = canon(words);
  const after = canon(new Set([...words].filter((x) => x !== w)));
  const gone = [...before.keys()].filter((p) => !after.has(p));
  // The node that merged away: not w's own leaf (that one is just removed).
  const r = gone.find((p) => p !== w || before.get(w)!.kids.length > 0);
  if (r === undefined) return null;
  const parent = [...before.keys()]
    .filter((p) => p.length < r.length && r.startsWith(p))
    .sort((a, b) => b.length - a.length)[0]!;
  const child = after.get(parent)!.kids.find((k) => k.startsWith(r))!;
  return mergeText(r.slice(parent.length), child.slice(r.length));
}

describe('compressed trie practice', () => {
  const kinds = compressedTrie.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'split-pieces',
      'node-count',
      'prefix-words',
      'delete-merge',
    ]);
  });

  it('gets every answer right, checked against the canonical compressed trie', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const words = new Set(q.setup.map((c) => String(c[1])));
        const asked = q.watch!.map((c) => String(c[1]));
        const a = q.answer;
        if (k.id === 'split-pieces') {
          if (a.kind !== 'choice') throw new Error('split-pieces is a choice');
          expect(a.options[a.correct]).toBe(splitOf(words, asked[0]!));
        } else if (k.id === 'node-count') {
          expect(a).toEqual({ kind: 'number', value: canon(new Set([...words, ...asked])).size });
        } else if (k.id === 'prefix-words') {
          const want = sorted(words).filter((x) => x.startsWith(asked[0]!));
          expect(want.length).toBeGreaterThan(0);
          expect(a).toEqual({ kind: 'sequence', value: want });
        } else {
          if (a.kind !== 'choice') throw new Error('delete-merge is a choice');
          expect(words.has(asked[0]!)).toBe(true);
          expect(a.options[a.correct], `delete ${asked[0]} from ${sorted(words)}`).toBe(
            mergeOf(words, asked[0]!) ?? NO_MERGE,
          );
        }
      }
    }
  });

  it('shows the answer by playing the asked operations after the setup', () => {
    for (const k of kinds) {
      for (let seed = 1; seed <= 5; seed++) {
        const q = k.make(makeRng(seed));
        const t = new Timeline(compressedTrie, compressedTrie.defaults, 1, [
          ...q.setup,
          ...q.watch!,
        ]);
        expect(t.entries).toHaveLength(q.setup.length + q.watch!.length);
      }
    }
  });
});
