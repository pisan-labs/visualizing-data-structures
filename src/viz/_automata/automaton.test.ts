import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EPS,
  accepts,
  closure,
  complete,
  isComplete,
  isDeterministic,
  makeAutomaton,
  minimize,
  subsetConstruction,
  type Automaton,
} from './automaton';
import {
  matches,
  parseRegex,
  readRegex,
  regexSize,
  showRegex,
  thompson,
  type Regex,
} from './regex';

const STATES = ['q0', 'q1', 'q2', 'q3', 'q4'];

/** A random NFA over {a, b} with up to five states and some ε-moves. */
const nfa = fc
  .record({
    n: fc.integer({ min: 1, max: 5 }),
    moves: fc.array(
      fc.record({
        from: fc.integer({ min: 0, max: 4 }),
        on: fc.constantFrom('a', 'b', EPS),
        to: fc.integer({ min: 0, max: 4 }),
      }),
      { maxLength: 12 },
    ),
    accept: fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 3 }),
  })
  .map(({ n, moves, accept }) =>
    makeAutomaton({
      states: STATES.slice(0, n),
      alphabet: ['a', 'b'],
      start: 'q0',
      accept: accept.filter((i) => i < n).map((i) => STATES[i]!),
      moves: moves
        .filter((m) => m.from < n && m.to < n)
        .map((m) => ({ from: STATES[m.from]!, on: m.on, to: STATES[m.to]! })),
    }),
  );

const words = fc.array(fc.stringMatching(/^[ab]{0,7}$/), { minLength: 1, maxLength: 20 });

/** Every word over {a, b} up to length n. */
function allWords(n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => [`${w}a`, `${w}b`]);
    out.push(...level);
  }
  return out;
}

describe('the automaton model', () => {
  it('follows ε-moves in the closure', () => {
    const a = makeAutomaton({
      states: ['q0', 'q1', 'q2'],
      alphabet: ['a'],
      start: 'q0',
      accept: ['q2'],
      moves: [
        { from: 'q0', on: EPS, to: 'q1' },
        { from: 'q1', on: EPS, to: 'q2' },
        { from: 'q2', on: 'a', to: 'q0' },
      ],
    });
    expect(closure(a, ['q0'])).toEqual(['q0', 'q1', 'q2']);
    expect(accepts(a, '')).toBe(true);
    expect(isDeterministic(a)).toBe(false);
  });

  it('builds a complete DFA that accepts the same words (subset construction)', () => {
    fc.assert(
      fc.property(nfa, words, (a, ws) => {
        const { dfa, sets } = subsetConstruction(a);
        expect(isComplete(dfa)).toBe(true);
        expect(Object.keys(sets).length).toBe(dfa.states.length);
        for (const w of ws) expect(accepts(dfa, w)).toBe(accepts(a, w));
      }),
    );
  });

  it('minimizes to the smallest DFA for the language, and minimizing again changes nothing', () => {
    fc.assert(
      fc.property(nfa, (a) => {
        const { dfa } = subsetConstruction(a);
        const { dfa: min, blocks } = minimize(dfa);
        expect(isComplete(min)).toBe(true);
        for (const w of allWords(7)) expect(accepts(min, w)).toBe(accepts(a, w));
        expect(min.states.length).toBeLessThanOrEqual(complete(dfa).states.length);
        expect(minimize(min).dfa.states.length).toBe(min.states.length);
        // Every block holds states that agree on every word (checked up to length 5).
        for (const members of Object.values(blocks))
          for (const q of members)
            for (const w of allWords(5)) {
              const from = (s: string): Automaton => ({ ...dfa, start: s });
              expect(accepts(complete(from(q)), w)).toBe(accepts(complete(from(members[0]!)), w));
            }
      }),
      { numRuns: 60 },
    );
  });
});

describe('regular expressions', () => {
  const regex = fc.letrec((tie) => ({
    r: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      fc.constantFrom<Regex>({ kind: 'sym', c: 'a' }, { kind: 'sym', c: 'b' }, { kind: 'eps' }),
      fc.record({ kind: fc.constant('union' as const), a: tie('r'), b: tie('r') }),
      fc.record({ kind: fc.constant('concat' as const), a: tie('r'), b: tie('r') }),
      fc.record({
        kind: fc.constantFrom('star' as const, 'plus' as const, 'opt' as const),
        a: tie('r'),
      }),
    ),
  })).r as fc.Arbitrary<Regex>;

  it('reads back what it shows', () => {
    fc.assert(
      fc.property(regex, (r) => {
        const back = parseRegex(showRegex(r));
        expect(back).not.toBeInstanceOf(Error);
        expect(showRegex(back as Regex)).toBe(showRegex(r));
      }),
    );
  });

  it("builds an NFA that matches the same words (Thompson's construction)", () => {
    fc.assert(
      fc.property(regex, (r) => {
        const { nfa, parts } = thompson(r);
        expect(parts.at(-1)!.start).toBe(nfa.start);
        // Two states per symbol and operator, ? included.
        expect(nfa.states).toHaveLength(2 * regexSize(r));
        for (const w of allWords(5)) expect(accepts(nfa, w)).toBe(matches(r, w));
      }),
      { numRuns: 150 },
    );
  });

  it('matches deeply nested concatenations quickly (the reference remembers its ends)', () => {
    // a*(a*(a*(…))) twenty deep: without memo each level tries every split, about 31²⁰ calls.
    const aStar = parseRegex('a*') as Regex;
    let r: Regex = aStar;
    for (let k = 0; k < 20; k++) r = { kind: 'concat', a: aStar, b: r };
    expect(matches(r, 'a'.repeat(30))).toBe(true);
    expect(matches(r, `${'a'.repeat(30)}b`)).toBe(false);
  });

  it('reads + as union when asked, gives each node its span, and eps only as a word', () => {
    expect(showRegex(parseRegex('(a+b)*a?', { union: '+' }) as Regex)).toBe('(a|b)*a?');
    expect((parseRegex('a|b', { union: '+' }) as Error).message).toMatch(/\+ stands for union/);
    expect(showRegex(parseRegex('steps') as Regex)).toBe('steps');
    expect(showRegex(parseRegex('a eps|(eps)') as Regex)).toBe('aε|ε');
    const p = readRegex('(ab)* c') as Exclude<ReturnType<typeof readRegex>, Error>;
    expect(p.text).toBe('(ab)*c');
    const spans: string[] = [];
    const walk = (t: typeof p.tree) => {
      t.kids.forEach(walk);
      spans.push(p.text.slice(...t.span));
    };
    walk(p.tree);
    // In build order, children before parents: the same order thompson() builds its parts.
    expect(spans).toEqual(['a', 'b', '(ab)', '(ab)*', 'c', '(ab)*c']);
    expect(thompson(p.tree.r).parts.map((f) => f.kind)).toEqual([
      'sym',
      'sym',
      'concat',
      'star',
      'sym',
      'concat',
    ]);
  });

  it('says where an expression goes wrong', () => {
    expect((parseRegex('(ab') as Error).message).toMatch(/never closed/);
    expect((parseRegex('a|*') as Error).message).toMatch(/needs something before it/);
    expect((parseRegex('a[b]') as Error).message).toMatch(/not allowed/);
    expect(showRegex(parseRegex('(a|b)*abb') as Regex)).toBe('(a|b)*abb');
  });

  it('takes 40 characters unless told otherwise', () => {
    const long = '(a|b)'.repeat(11);
    expect((parseRegex(long) as Error).message).toMatch(/40 characters or fewer/);
    expect((parseRegex(long, { max: 50 }) as Error).message).toMatch(/50 characters or fewer/);
    expect(showRegex(parseRegex(long, { max: Infinity }) as Regex)).toBe(long);
  });
});
