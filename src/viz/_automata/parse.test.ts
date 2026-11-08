import { describe, expect, it } from 'vitest';
import { EPS, type Automaton } from './automaton';
import { formatAutomaton, parseAutomaton, parseAutomatonPair, parseWord } from './parse';

describe('automaton text', () => {
  it('reads moves, the start and the accept states', () => {
    const a = parseAutomaton('q0 a,b -> q0; q0 b -> q1; q1 eps -> q2; accept q2') as Automaton;
    expect(a.start).toBe('q0');
    expect(a.accept).toEqual(['q2']);
    expect(a.alphabet).toEqual(['a', 'b']);
    expect(a.moves).toContainEqual({ from: 'q1', on: EPS, to: 'q2' });
    expect(a.moves).toHaveLength(4);
  });

  it('writes text that reads back the same', () => {
    for (const text of [
      'start q1; accept q0 q2; q0 a -> q1; q1 a,b -> q2; q2 ε -> q0',
      'start s; accept t; states u; s 0 -> t; t 1 -> s',
    ]) {
      const a = parseAutomaton(text) as Automaton;
      expect(formatAutomaton(a)).toBe(text);
      expect(parseAutomaton(formatAutomaton(a))).toEqual(a);
    }
  });

  it('names the item it cannot read', () => {
    expect((parseAutomaton('q0 a q1') as Error).message).toMatch(/"q0 a q1" is not a move/);
    expect((parseAutomaton('q0 ab -> q1') as Error).message).toMatch(/"ab" .* is not a symbol/);
    expect((parseAutomaton('start') as Error).message).toMatch(/needs at least one state/);
    expect((parseAutomaton('') as Error).message).toMatch(/Type moves/);
  });

  it('keeps alphabet symbols no move uses', () => {
    const a = parseAutomaton('alphabet a b c; q0 a -> q1') as Automaton;
    expect(a.alphabet).toEqual(['a', 'b', 'c']);
    expect(formatAutomaton(a)).toBe('start q0; alphabet a b c; q0 a -> q1');
    expect(parseAutomaton(formatAutomaton(a))).toEqual(a);
    expect(formatAutomaton(parseAutomaton('q0 a,b -> q1') as Automaton)).not.toContain('alphabet');
    expect((parseAutomaton('alphabet ab; q0 a -> q1') as Error).message).toMatch(
      /"ab" .* is not a symbol/,
    );
    expect((parseAutomaton('alphabet eps; q0 a -> q1') as Error).message).toMatch(
      /ε is not a symbol/,
    );
    expect((parseWord('ac', parseAutomaton('q0 a,b -> q0') as Automaton) as Error).message).toMatch(
      /not in the alphabet \{a, b\}/,
    );
  });

  it('reads words over the alphabet, and ε for the empty word', () => {
    const a = parseAutomaton('q0 a -> q1; q1 b -> q0') as Automaton;
    expect(parseWord('a b a', a)).toBe('aba');
    expect(parseWord('ε', a)).toBe('');
    expect((parseWord('abc', a) as Error).message).toMatch(/"c" is not in the alphabet/);
  });
});

describe('two machines', () => {
  const pair = (t: string, check?: (m: Automaton, name: 'A' | 'B') => string | null) =>
    parseAutomatonPair(t, { example: '"q0 a -> q1 | p0 b -> p1"', need: 'Both, please.', check });

  it('reads A | B into two automata', () => {
    const [a, b] = pair('q0 a -> q1; accept q1 | p0 b -> p1') as [Automaton, Automaton];
    expect(a.accept).toEqual(['q1']);
    expect(b.start).toBe('p0');
  });

  it('names the machine an error is in, and checks A before reading B', () => {
    expect((pair('') as Error).message).toMatch(/^Type two machines separated by \|/);
    expect((pair('q0 a -> q1') as Error).message).toMatch(
      /with a \| between them.*Both, please\.$/,
    );
    expect((pair('q0 a -> q1 | | q0 a -> q1') as Error).message).toMatch(/there are 3 here/);
    expect((pair('q0 a -> q1 | ') as Error).message).toMatch(/^Machine B is empty/);
    expect((pair('q0 a -> q1 | q0 ab -> q1') as Error).message).toMatch(/^In machine B: "ab"/);
    expect((pair('q0 a -> q1 | q0 ab -> q1', (_m, n) => `${n} is wrong`) as Error).message).toBe(
      'A is wrong',
    );
  });
});
