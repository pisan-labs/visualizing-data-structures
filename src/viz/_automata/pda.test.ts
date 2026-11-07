import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { MACHINES } from '../pda/machines';
import {
  CAP,
  EPS,
  accepting,
  apply,
  configKey,
  configText,
  describeMove,
  formatPda,
  furthest,
  isDeterministicPda,
  levels,
  moveLabel,
  parsePda,
  parsePdaWord,
  pathTo,
  search,
  startConfig,
  successors,
  type AcceptBy,
  type Config,
  type Pda,
} from './pda';
import { randomPda } from './pda-random';

const pda = (text: string) => {
  const p = parsePda(text);
  if (p instanceof Error) throw p;
  return p;
};

function allWords(alphabet: readonly string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => alphabet.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

const count = (w: string, c: string) => [...w].filter((x) => x === c).length;

function balanced(w: string): boolean {
  let depth = 0;
  for (const c of w) {
    depth += c === '(' ? 1 : -1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

const anbn = (w: string) => /^a*b*$/.test(w) && count(w, 'a') === count(w, 'b');

/** What each named machine accepts, written directly, and how it accepts. */
const LANGUAGES: Record<keyof typeof MACHINES, { by: AcceptBy; is: (w: string) => boolean }> = {
  anbn: { by: 'state', is: anbn },
  palindromes: {
    by: 'state',
    is: (w) => w.length % 2 === 0 && w === [...w].reverse().join(''),
  },
  parens: { by: 'state', is: balanced },
  grammar: { by: 'state', is: anbn },
  emptyStack: { by: 'stack', is: anbn },
  leftRecursion: { by: 'state', is: (w) => /^ba*$/.test(w) },
  equal: { by: 'state', is: (w) => count(w, 'a') === count(w, 'b') },
};

/**
 * The reference: the set of configurations exactly d moves from the start, by the definition
 * of a move, without the search's queue or its seen set. The fewest moves to accept is the
 * first d whose set holds an accepting configuration.
 */
function fewestMoves(p: Pda, word: string, by: AcceptBy, maxDepth: number): number | null {
  let set = new Map<string, Config>([[configKey(startConfig(p)), startConfig(p)]]);
  for (let d = 0; d <= maxDepth; d++) {
    if ([...set.values()].some((c) => accepting(p, word, c, by))) return d;
    const next = new Map<string, Config>();
    for (const c of set.values())
      for (const m of p.moves) {
        const fitsRead = m.read === EPS || word[c.pos] === m.read;
        const fitsPop = m.pop === EPS || c.stack[0] === m.pop;
        if (m.from !== c.state || !fitsRead || !fitsPop) continue;
        const pos = c.pos + (m.read === EPS ? 0 : 1);
        const stack = m.push + (m.pop === EPS ? c.stack : c.stack.slice(1));
        const nc = { state: m.to, pos, stack };
        next.set(configKey(nc), nc);
      }
    if (!next.size) return null;
    set = next;
  }
  return null;
}

describe('the pushdown automaton text', () => {
  it('reads moves, the start, accept states and a starting stack', () => {
    const p = pda('start q0; stack Z; accept q1; q0 a, Z -> q0 AZ; q0 a,A->q0 AA; q0 b, A → q1 ε');
    expect(p.start).toBe('q0');
    expect(p.initial).toBe('Z');
    expect(p.inputs).toEqual(['a', 'b']);
    expect(p.stackSymbols).toEqual(['A', 'Z']);
    expect(p.moves).toEqual([
      { from: 'q0', read: 'a', pop: 'A', to: 'q0', push: 'AA' },
      { from: 'q0', read: 'a', pop: 'Z', to: 'q0', push: 'AZ' },
      { from: 'q0', read: 'b', pop: 'A', to: 'q1', push: '' },
    ]);
    expect(moveLabel(p.moves[1]!)).toBe('a, Z → AZ');
    expect(moveLabel(p.moves[2]!)).toBe('b, A → ε');
    expect(pda('q1 (, eps -> q1 (; q1 ), ( -> q1 eps').moves.map(moveLabel)).toEqual([
      '(, ε → (',
      '), ( → ε',
    ]);
  });

  it('names the bad item in every error', () => {
    const error = (t: string) => (parsePda(t) as Error).message;
    expect(error('q0 ab, Z -> q1 AZ')).toBe(
      '"ab" in "q0 ab, Z -> q1 AZ" is not a symbol to read: use one letter, digit or bracket, or eps to read nothing.',
    );
    expect(error('q0 a, ZZ -> q1 AZ')).toContain('"ZZ" in "q0 a, ZZ -> q1 AZ" cannot be popped');
    expect(error('q0 a, Z -> q1')).toContain('"q0 a, Z -> q1" needs what to push after q1');
    expect(error('q0 a, Z -> q1 A%')).toContain('"%" in "q0 a, Z -> q1 A%" is not a stack symbol');
    expect(error('q0 a -> q1')).toContain('"q0 a -> q1" is not a move');
    expect(error('q0 $, Z -> q1 Z')).toContain('"$" in "q0 $, Z -> q1 Z" is not a symbol to read');
    expect(error('q0 a, Z -> q1 ABCDE')).toBe(
      '"q0 a, Z -> q1 ABCDE" pushes 5 symbols; use at most 4.',
    );
    expect(error('stack')).toContain('"stack" needs the symbols the stack starts with');
    expect(error('q-0 a, Z -> q1 Z')).toContain('"q-0" in "q-0 a, Z -> q1 Z" is not a state name');
  });

  it('writes a machine back as text that reads the same', () => {
    for (const text of Object.values(MACHINES))
      expect(pda(formatPda(pda(text)))).toEqual(pda(text));
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), fc.integer({ min: 2, max: 6 }), (seed, n) => {
        const p = randomPda(makeRng(seed), n, { grow: seed % 2 === 0 });
        expect(pda(formatPda(p))).toEqual(p);
      }),
      { numRuns: 200 },
    );
  });

  it('reads words over the input alphabet', () => {
    const p = pda(MACHINES.parens);
    expect(parsePdaWord('(( ))', p)).toBe('(())');
    expect(parsePdaWord('eps', p)).toBe('');
    expect((parsePdaWord('(a)', p) as Error).message).toContain('"a" is not in the input alphabet');
  });
});

describe('the step relation', () => {
  it('reads, pops and pushes, the first pushed symbol on top', () => {
    const p = pda(MACHINES.anbn);
    const c = { state: 'q1', pos: 1, stack: 'a$' };
    expect(configText(c, 'aabb')).toBe('(q1, abb, a$)');
    expect(successors(p, 'aabb', c)).toEqual([
      { move: 1, config: { state: 'q1', pos: 2, stack: 'aa$' } },
    ]);
    expect(describeMove(p.moves[1]!)).toBe('read a and push a');
    expect(describeMove(p.moves[0]!)).toBe('push $ without reading');
    expect(describeMove(p.moves[3]!)).toBe('pop $ without reading');
    expect(configText({ state: 'q3', pos: 4, stack: '' }, 'aabb')).toBe('(q3, ε, ε)');
  });

  it('tells deterministic machines from the others', () => {
    const det = Object.fromEntries(
      Object.entries(MACHINES).map(([k, t]) => [k, isDeterministicPda(pda(t))]),
    );
    expect(det).toEqual({
      anbn: true,
      palindromes: false,
      parens: true,
      grammar: false,
      emptyStack: false,
      leftRecursion: false,
      equal: true,
    });
  });
});

describe('the search', () => {
  it('accepts exactly the language of each named machine', () => {
    for (const [name, text] of Object.entries(MACHINES)) {
      const p = pda(text);
      const lang = LANGUAGES[name as keyof typeof MACHINES];
      for (const w of allWords(p.inputs, 8)) {
        const s = search(p, w, lang.by);
        const want = lang.is(w);
        // Left recursion never runs out of configurations on a word outside the language.
        const no = name === 'leftRecursion' ? 'stopped' : 'reject';
        expect(s.outcome, `${name} on "${w}"`).toBe(want ? 'accept' : no);
      }
    }
  });

  it('finds the computation with the fewest moves, as the reference does', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[ab]{0,6}$/),
        fc.constantFrom<AcceptBy>('state', 'stack'),
        (seed, n, word, by) => {
          const p = randomPda(makeRng(seed), n, { grow: seed % 3 === 0 });
          const s = search(p, word, by);
          const deepest = s.nodes.at(-1)!.depth;
          const max =
            s.outcome === 'accept'
              ? s.nodes[s.found!]!.depth
              : s.outcome === 'stopped'
                ? deepest - 1
                : 60;
          const ref = fewestMoves(p, word, by, max);
          const where = `${formatPda(p)} on "${word}" by ${by}`;
          if (s.outcome === 'accept') {
            expect(ref, where).toBe(s.nodes[s.found!]!.depth);
          } else if (s.outcome === 'reject') {
            expect(ref, where).toBeNull();
          } else {
            // Stopped: every configuration with fewer moves than the last one made was tried.
            expect(s.nodes.length, where).toBe(CAP);
            expect(ref, where).toBeNull();
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it('keeps a path of real moves to every configuration, breadth first', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.stringMatching(/^[ab]{0,6}$/),
        (seed, word) => {
          const p = randomPda(makeRng(seed), 4, { grow: true });
          const s = search(p, word, 'state');
          const seen = new Set<string>();
          s.nodes.forEach((n, i) => {
            expect(seen.has(configKey(n.config))).toBe(false);
            seen.add(configKey(n.config));
            if (i > 0) expect(n.depth).toBeGreaterThanOrEqual(s.nodes[i - 1]!.depth);
          });
          const end = s.found ?? furthest(s);
          const path = pathTo(s, end);
          expect(path[0]).toBe(0);
          for (let k = 1; k < path.length; k++) {
            const n = s.nodes[path[k]!]!;
            const parent = s.nodes[path[k - 1]!]!;
            expect(n.parent).toBe(parent.id);
            expect(apply(p.moves[n.move!]!, parent.config)).toEqual(n.config);
            expect(n.depth).toBe(k);
          }
          expect(levels(s).flat()).toEqual(s.nodes.map((n) => n.id));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('stops at the cap when ε-moves push forever', () => {
    const p = pda(MACHINES.leftRecursion);
    const s = search(p, 'ab', 'state');
    expect(s.outcome).toBe('stopped');
    expect(s.nodes).toHaveLength(CAP);
    expect(search(p, 'baa', 'state').outcome).toBe('accept');
  });

  it('accepts by empty stack only when the stack is empty at the end', () => {
    const p = pda(MACHINES.anbn);
    // Sipser's machine pops $ at the end, so it empties its stack on the words it accepts.
    for (const w of allWords(p.inputs, 6))
      expect(search(p, w, 'stack').outcome, w).toBe(anbn(w) ? 'accept' : 'reject');
    // The parentheses machine keeps $ on the stack: by empty stack it accepts only ε, before
    // its first move.
    const q = pda(MACHINES.parens);
    expect(search(q, '', 'stack').outcome).toBe('accept');
    expect(search(q, '()', 'stack').outcome).toBe('reject');
  });
});
