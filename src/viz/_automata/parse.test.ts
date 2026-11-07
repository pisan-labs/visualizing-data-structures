import { describe, expect, it } from 'vitest';
import { EPS, type Automaton } from './automaton';
import { formatAutomaton, parseAutomaton, parseWord } from './parse';

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

  it('reads words over the alphabet, and ε for the empty word', () => {
    const a = parseAutomaton('q0 a -> q1; q1 b -> q0') as Automaton;
    expect(parseWord('a b a', a)).toBe('aba');
    expect(parseWord('ε', a)).toBe('');
    expect((parseWord('abc', a) as Error).message).toMatch(/"c" is not in the alphabet/);
  });
});
