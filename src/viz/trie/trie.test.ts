import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { parseWordInput } from '../_trie/words';
import { trie } from '.';
import { heightOf, nodeCount, wordsOf, type TrieSettings, type TrieState } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: a plain set of words. A pruned trie has exactly one node per distinct prefix of the
// stored words (the empty prefix is the root).

const sorted = (words: Iterable<string>) => [...words].sort();

function prefixes(words: Iterable<string>): Set<string> {
  const out = new Set<string>(['']);
  for (const w of words) for (let i = 1; i <= w.length; i++) out.add(w.slice(0, i));
  return out;
}

/** Walk the letters of w from the root; the node reached, or null. */
function walk(s: TrieState, w: string): number | null {
  let x: number | null = s.root;
  for (const ch of w) {
    if (x === null) return null;
    x = s.nodes[x]!.kids.find((k) => s.nodes[k]!.ch === ch) ?? null;
  }
  return x;
}

/** Structure every step must keep, whatever the operation is doing. */
function checkShape(s: TrieState) {
  const root = s.nodes[s.root]!;
  expect(root.parent).toBeNull();
  expect(root.ch).toBe('');
  expect(root.end).toBe(false);
  const reached = new Set<number>();
  const visit = (u: number) => {
    expect(reached.has(u), `node ${u} reached once`).toBe(false);
    reached.add(u);
    expect(u).toBeLessThan(s.nextUid);
    const n = s.nodes[u]!;
    expect(n.uid).toBe(u);
    const letters = n.kids.map((k) => s.nodes[k]!.ch);
    expect(letters, 'children in alphabetical order, one per letter').toEqual(
      [...new Set(letters)].sort(),
    );
    for (const k of n.kids) {
      expect(s.nodes[k]!.parent).toBe(u);
      expect(s.nodes[k]!.ch).toMatch(/^[a-z]$/);
      visit(k);
    }
  };
  visit(s.root);
  expect(reached.size, 'every node hangs from the root').toBe(Object.keys(s.nodes).length);
}

const wordArb = fc
  .array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 4 })
  .map((xs) => xs.join(''));

const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 6, arbitrary: wordArb.map((w) => ['insert', w] as OpCall) },
  { weight: 4, arbitrary: wordArb.map((w) => ['delete', w] as OpCall) },
  { weight: 2, arbitrary: wordArb.map((w) => ['search', w] as OpCall) },
  { weight: 2, arbitrary: wordArb.map((w) => ['startsWith', w] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('trie', () => {
  it('matches a set of words, and keeps its shape on every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<TrieSettings['delete']>('prune', 'lazy'),
        fc.array(callArb, { maxLength: 40 }),
        (mode, calls) => {
          const settings: TrieSettings = { delete: mode };
          const t = new Timeline(trie, settings, 1, calls);
          const ref = new Set<string>();
          // Every node a lazy delete has left behind is still there.
          let allPrefixes = new Set<string>(['']);
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
              case 'delete': {
                const missing = last.lines.includes('del.miss') || last.lines.includes('del.miss2');
                expect(missing).toBe(!ref.has(w));
                ref.delete(w);
                break;
              }
              case 'search':
                expect(v.found).toBe(ref.has(w));
                break;
              case 'startsWith': {
                const want = sorted(ref).filter((x) => x.startsWith(w));
                expect(v.returned).toBe(want.join(' ') || 'none');
                break;
              }
              case 'clear':
                ref.clear();
                allPrefixes = new Set(['']);
                break;
            }
            const after = sorted(ref);
            for (const step of entry.steps) {
              checkShape(step.state);
              // Midway the trie holds the words from before the operation or from after it.
              const now = wordsOf(step.state);
              expect([before, after]).toContainEqual(now);
              expect(step.vars?.words).toBe(now.length);
              expect(step.vars?.nodes).toBe(nodeCount(step.state));
              expect(step.vars?.height).toBe(heightOf(step.state));
            }
            // Every stored word is found, and nothing else is stored.
            const end = entry.end;
            expect(wordsOf(end)).toEqual(after);
            for (const word of ref) expect(end.nodes[walk(end, word)!]?.end, word).toBe(true);
            for (const p of prefixes(ref)) expect(walk(end, p), p).not.toBeNull();
            for (const p of prefixes(ref)) allPrefixes.add(p);
            if (mode === 'prune') {
              // No node leads nowhere: one node per prefix, so every leaf ends a word.
              expect(nodeCount(end)).toBe(prefixes(ref).size);
            } else {
              // A lazy delete removes nothing.
              expect(nodeCount(end)).toBe(allPrefixes.size);
            }
            if (op === 'search' || op === 'startsWith') {
              expect(end).toEqual(i === 0 ? t.initial.state : t.entries[i - 1]!.end);
            }
          });
        },
      ),
      { numRuns: 250 },
    );
  });

  it('does not depend on the order of the inserts', () => {
    fc.assert(
      fc.property(fc.uniqueArray(wordArb, { maxLength: 12 }), (words) => {
        const shape = (ws: string[]) => {
          const s = new Timeline(
            trie,
            trie.defaults,
            1,
            ws.map((w) => ['insert', w] as OpCall),
          ).endState();
          const walkAll = (u: number): string =>
            `${s.nodes[u]!.ch}${s.nodes[u]!.end ? '*' : ''}(${s.nodes[u]!.kids.map(walkAll).join(',')})`;
          return walkAll(s.root);
        };
        expect(shape(words)).toBe(shape([...words].sort()));
        expect(shape(words)).toBe(shape([...words].reverse()));
      }),
      { numRuns: 100 },
    );
  });

  it('narrates each letter and how a search ends', () => {
    const t = new Timeline(trie, trie.defaults, 1, [
      ['insert', 'car'],
      ['insert', 'cart'],
      ['search', 'cow'],
      ['search', 'ca'],
      ['delete', 'cart'],
    ]);
    const says = (i: number) => t.entries[i]!.steps.map((s) => s.say);
    expect(says(1)).toContain(
      'Letter t: no edge t here. Add a new node on an edge labeled t and go down to it.',
    );
    expect(says(2).at(-1)).toContain('there is no edge o from the node for c');
    expect(says(3).at(-1)).toContain('ca is only a prefix of car and cart');
    expect(says(4).at(-1)).toContain('The node for car ends the word car, so stop.');
    expect(t.entries[4]!.steps.at(-1)!.vars?.removed).toBe(1);
  });

  it('turns bad words into a narrated error without changing the trie', () => {
    const t = new Timeline(trie, trie.defaults, 1, [
      ['insert', 'cat'],
      ['insert', 42],
      ['search', 'two words'],
      ['delete', 'abcdefghijk'],
      ['startsWith', ''],
    ]);
    for (const e of t.entries.slice(1)) {
      expect(e.end).toEqual(t.entries[0]!.end);
      expect(e.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    }
    // Capitals are read as lowercase letters.
    const caps = new Timeline(trie, trie.defaults, 1, [
      ['insert', 'Cat'],
      ['search', 'cAT'],
    ]);
    expect(caps.entries[1]!.steps.at(-1)!.vars?.found).toBe(true);
  });

  it('reads words from the input box', () => {
    expect(parseWordInput('cart')).toBe('cart');
    expect(parseWordInput(' Cart ')).toBe('cart');
    expect(parseWordInput('ca rt')).toBeInstanceOf(Error);
    expect(parseWordInput('42')).toBeInstanceOf(Error);
    expect(parseWordInput('abcdefghijk')).toBeInstanceOf(Error);
  });

  it('builds the preset shapes it promises', () => {
    const presets = trie.controls.presets!;
    const end = (label: string, n: number) => {
      const p = presets.find((x) => x.label.startsWith(label))!;
      return new Timeline(trie, trie.defaults, 1, p.make(makeRng(n), n)).endState();
    };
    for (const n of trie.controls.sizes!) {
      // No shared prefixes: one node per letter, plus the root.
      const loners = wordsOf(end('No shared', n));
      expect(nodeCount(end('No shared', n))).toBe(loners.join('').length + 1);
      // A chain: each word one letter longer than the last.
      expect(heightOf(end('Each word', n))).toBe(Math.min(n, 7));
      expect(nodeCount(end('Each word', n))).toBe(Math.min(n, 7) + 1);
    }
  });
});

describe('trie practice', () => {
  const kinds = trie.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'insert-adds',
      'prefix-words',
      'delete-removes',
      'search-result',
    ]);
  });

  it('gets every answer right, checked against a set of words', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const words = new Set(q.setup.map((c) => String(c[1])));
        const [, arg] = q.watch![0]!;
        const w = String(arg);
        const a = q.answer;
        if (k.id === 'insert-adds') {
          expect(words.has(w)).toBe(false);
          const more = prefixes([...words, w]).size - prefixes(words).size;
          expect(a).toEqual({ kind: 'number', value: more });
        } else if (k.id === 'prefix-words') {
          const want = sorted(words).filter((x) => x.startsWith(w));
          expect(want.length).toBeGreaterThan(0);
          expect(a).toEqual({ kind: 'sequence', value: want });
        } else if (k.id === 'delete-removes') {
          expect(words.has(w)).toBe(true);
          const rest = [...words].filter((x) => x !== w);
          expect(a).toEqual({ kind: 'number', value: prefixes(words).size - prefixes(rest).size });
        } else {
          if (a.kind !== 'choice') throw new Error('search-result is a choice');
          const want = words.has(w) ? 0 : [...words].some((x) => x.startsWith(w)) ? 2 : 1;
          expect(a.correct, `search(${w}) in ${sorted(words)}`).toBe(want);
        }
      }
    }
  });

  it('shows the answer by playing the asked operation after the setup', () => {
    for (const k of kinds) {
      for (let seed = 1; seed <= 5; seed++) {
        const q = k.make(makeRng(seed));
        const t = new Timeline(trie, trie.defaults, 1, [...q.setup, ...q.watch!]);
        expect(t.entries).toHaveLength(q.setup.length + q.watch!.length);
        expect(q.watch!.length).toBeGreaterThan(0);
      }
    }
  });
});
