import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { suffixTree } from '.';
import { bracket, full, parseText, preorder, spell, type StSettings, type StState } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (method: StSettings['method'] = 'naive'): StSettings => ({ method });

/** References written separately from the model: look at every substring directly. */
function refFind(t: string, p: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + p.length <= t.length; i++) if (t.startsWith(p, i)) out.push(i);
  return out;
}
function refRepeat(t: string): string {
  let best = '';
  for (let len = t.length - 1; len >= 1 && !best; len--) {
    const seen: string[] = [];
    for (let i = 0; i + len <= t.length; i++) {
      const x = t.slice(i, i + len);
      if (refFind(t, x).length > 1) seen.push(x);
    }
    best = seen.sort()[0] ?? '';
  }
  return best || 'none';
}

/** The tree is a suffix tree of T$ (or, mid-Ukkonen, an implicit one of a prefix). */
function checkTree(s: StState, prefix: string, final: boolean) {
  const tr = s.tree!;
  const leaves: number[] = [];
  for (const u of preorder(tr)) {
    const n = tr.nodes[u]!;
    const firsts = n.kids.map((k) => full(s.text)[tr.nodes[k]!.start]!);
    expect([...firsts].sort(), 'children sorted').toEqual(firsts);
    expect(new Set(firsts).size, 'children start with different characters').toBe(firsts.length);
    for (const k of n.kids) expect(tr.nodes[k]!.parent).toBe(u);
    const path = u === tr.root ? '' : spell(s, u);
    expect(prefix.includes(path), `path ${path} is a substring`).toBe(true);
    if (u !== tr.root) expect(tr.nodes[u]!.end).toBeGreaterThan(tr.nodes[u]!.start);
    if (n.leaf !== null) {
      leaves.push(n.leaf);
      expect(n.kids).toEqual([]);
      expect(path, 'a leaf spells its suffix').toBe(prefix.slice(n.leaf));
    } else if (u !== tr.root) {
      expect(n.kids.length, 'internal nodes branch').toBeGreaterThanOrEqual(2);
    }
  }
  if (final)
    expect(leaves.sort((a, b) => a - b)).toEqual(
      Array.from({ length: prefix.length }, (_, i) => i),
    );
}

const textArb = fc
  .tuple(fc.constantFrom('AB', 'ABC', 'A', 'ACGT', 'abN0'), fc.integer({ min: 1, max: 12 }))
  .chain(([letters, n]) =>
    fc
      .array(fc.integer({ min: 0, max: letters.length - 1 }), { minLength: n, maxLength: n })
      .map((xs) => xs.map((x) => letters[x]).join('')),
  );

describe('suffix tree', () => {
  it('builds BANANA both ways', () => {
    for (const m of ['naive', 'ukkonen'] as const) {
      const t = new Timeline(suffixTree, settings(m), 1, [['load', 'BANANA'], ['build']]);
      expect(bracket(t.endState())).toBe('($ A($ NA($ NA$)) BANANA$ NA($ NA$))');
    }
  });

  it('checks its input', () => {
    expect(parseText('BANANA', 'text')).toBe('BANANA');
    expect(parseText('', 'text')).toBeInstanceOf(Error);
    expect(parseText('A B', 'text')).toBeInstanceOf(Error);
    expect(parseText('A$', 'text')).toBeInstanceOf(Error);
    expect(parseText('A'.repeat(13), 'text')).toBeInstanceOf(Error);
  });

  it('matches brute force for any text, with either build', () => {
    fc.assert(
      fc.property(
        textArb,
        fc.constantFrom('naive' as const, 'ukkonen' as const),
        fc.integer({ min: 1, max: 3 }),
        fc.nat(),
        (text, method, m, at) => {
          const from = at % text.length;
          const p = text.slice(from, from + m);
          const t = new Timeline(suffixTree, settings(method), 1, [
            ['load', text],
            ['build'],
            ['search', p],
            ['count', p],
            ['search', `${p}Z`],
            ['count', `Z${p}`],
            ['repeat'],
          ]);
          const s = t.endState();
          checkTree(s, full(text), true);
          const other = new Timeline(
            suffixTree,
            settings(method === 'naive' ? 'ukkonen' : 'naive'),
            1,
            [['load', text], ['build']],
          );
          expect(bracket(other.endState()), 'both builds agree').toBe(bracket(s));
          const last = (i: number) => t.entries[i]!.steps.at(-1)!.vars!;
          expect(String(last(2).found)).toBe(refFind(text, p).join(' '));
          expect(last(3).count).toBe(refFind(text, p).length);
          const none = refFind(text, `${p}Z`);
          expect(String(last(4).found)).toBe(none.length ? none.join(' ') : 'none');
          expect(last(5).count).toBe(refFind(text, `Z${p}`).length);
          expect(String(last(6).repeat)).toBe(refRepeat(text));
          // Every step of the build shows a valid tree: for Ukkonen, an implicit suffix tree
          // of the characters read so far.
          for (const step of t.entries[1]!.steps) {
            if (!step.state.tree) continue;
            const i = step.extra?.phase?.i;
            checkTree(step.state, i === undefined ? full(text) : full(text).slice(0, i + 1), false);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('builds without being asked when a search comes first', () => {
    const t = new Timeline(suffixTree, settings(), 1, [['search', 'NA']]);
    expect(t.endState().tree).not.toBeNull();
    expect(t.entries[0]!.steps.at(-1)!.vars!.found).toBe('2 4');
  });
});

describe('drawn text size', () => {
  // mississippi's leaf numbers drew at 5.2 px on a phone. Smaller edge labels there narrow the tree.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(suffixTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(12);
    expect(smallestText(suffixTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(7);
  });
});

describe('drawn text size', () => {
  // mississippi's leaves in one row drew its labels at 7.3 px on a phone; growing right, 10.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(suffixTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(12);
    expect(smallestText(suffixTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(10);
  });
});
