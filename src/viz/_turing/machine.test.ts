import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BLANK,
  cellAt,
  configParts,
  formatConfig,
  formatMachine,
  makeMachine,
  parseMachine,
  parseWord,
  run,
  startConfig,
  step,
  tapeText,
  written,
  type Config,
  type Machine,
  type Rule,
} from './machine';

const ZERO_ONE =
  'q0 0 -> q1 x R; q0 y -> q3 R; q0 _ -> accept R; q1 0,y -> q1 R; q1 1 -> q2 y L; q2 0,y -> q2 L; q2 x -> q0 R; q3 y -> q3 R; q3 _ -> accept R';
const INCREMENT = 'q0 0,1 -> q0 R; q0 _ -> q1 L; q1 0,_ -> accept 1 R; q1 1 -> q1 0 L';

const parse = (text: string, stay = false) => parseMachine(text, { stay }) as Machine;

describe('Turing machine text', () => {
  it('reads rules, the short form that keeps the symbol, and several symbols at once', () => {
    const m = parse(ZERO_ONE);
    expect(m.start).toBe('q0');
    expect(m.states).toEqual(['q0', 'q1', 'q2', 'q3']);
    expect(m.symbols).toEqual(['0', '1', 'x', 'y', BLANK]);
    expect(m.rules).toHaveLength(11);
    expect(m.rules).toContainEqual({ from: 'q1', read: 'y', to: 'q1', write: 'y', move: 'R' });
    expect(m.rules).toContainEqual({ from: 'q1', read: '1', to: 'q2', write: 'y', move: 'L' });
  });

  it('puts the start state first and the others in name order', () => {
    const m = parse('start q10; q2 a -> q10 R; q10 a -> q2 b L; q10 b -> accept R');
    expect(m.states).toEqual(['q10', 'q2']);
    expect(m.rules.map((r) => r.from)).toEqual(['q10', 'q10', 'q2']);
  });

  it('writes text that reads back the same', () => {
    for (const text of [
      ZERO_ONE,
      INCREMENT,
      'start s; t a,b -> s L',
      's a -> t b R; t a,b -> s L',
      'q0 0 -> q0 1 R; q0 1 -> q0 R',
    ]) {
      const m = parse(text);
      expect(formatMachine(m)).toBe(text);
      expect(parse(formatMachine(m))).toEqual(m);
    }
  });

  it('reads back any machine it writes', () => {
    const name = fc.constantFrom('q0', 'q1', 'q2', 'q10', 'a', 'b1');
    const sym = fc.constantFrom('0', '1', 'x', '#', BLANK);
    const rule = fc.record({
      from: name,
      read: sym,
      to: fc.oneof(name, fc.constantFrom('accept', 'reject')),
      write: sym,
      move: fc.constantFrom('L' as const, 'R' as const, 'S' as const),
    });
    fc.assert(
      fc.property(name, fc.array(rule, { maxLength: 14 }), (start, rs) => {
        const seen = new Set<string>();
        const rules = rs.filter((r) => {
          const k = `${r.from} ${r.read}`;
          return seen.has(k) ? false : (seen.add(k), true);
        });
        const m = makeMachine(start, rules as Rule[]);
        expect(parseMachine(formatMachine(m), { stay: true })).toEqual(m);
      }),
      { numRuns: 300 },
    );
  });

  it('names the item it cannot read', () => {
    const err = (text: string, stay = false) => (parseMachine(text, { stay }) as Error).message;
    expect(err('')).toMatch(/Type rules/);
    expect(err('q0 1 q1 0 R')).toMatch(/"q0 1 q1 0 R" is not a rule/);
    expect(err('q0 ab -> q1 R')).toMatch(/"ab" in "q0 ab -> q1 R" is not a tape symbol/);
    expect(err('q0 1 -> q1 0 X')).toMatch(/"X" in "q0 1 -> q1 0 X" is not a move/);
    expect(err('q0 1 -> q1 0 S')).toMatch(/"q0 1 -> q1 0 S" stays put/);
    expect(parseMachine('q0 1 -> q1 0 S', { stay: true })).not.toBeInstanceOf(Error);
    expect(err('q0 1 -> q1 R; q0 1 -> q2 R')).toMatch(/"q0 1 -> q2 R" gives q0 a second rule/);
    expect(err('accept 1 -> q1 R')).toMatch(/accept halts the machine/);
    expect(err('accept q3')).toMatch(/always called accept and reject/);
    expect(err('q0 1 -> q-1 R')).toMatch(/"q-1" in "q0 1 -> q-1 R" is not a state name/);
    expect(err('q0 1 -> R')).toMatch(/needs a state/);
  });

  it('accepts the same rule twice', () => {
    expect(parse('q0 1 -> q1 R; q0 1 -> q1 1 R').rules).toHaveLength(1);
  });

  it('reads input words', () => {
    expect(parseWord('0 0 1')).toBe('001');
    expect(parseWord('ε')).toBe('');
    expect(parseWord('eps')).toBe('');
    expect((parseWord('0_1') as Error).message).toMatch(/blank/);
    expect((parseWord('0?1') as Error).message).toMatch(/"\?" is not a tape symbol/);
    expect((parseWord('q0 1 -> q1 R') as Error).message).toMatch(/looks like rules/);
    expect((parseWord('0'.repeat(17)) as Error).message).toMatch(/16 symbols/);
  });
});

describe('Turing machine moves', () => {
  it('keeps the tape trimmed of blanks at both ends', () => {
    expect(written({ cells: ['a', 'b'], first: 0 }, 0, BLANK)).toEqual({ cells: ['b'], first: 1 });
    expect(written({ cells: [], first: 0 }, -2, 'x')).toEqual({ cells: ['x'], first: -2 });
    expect(written({ cells: ['a'], first: 0 }, 3, 'c')).toEqual({
      cells: ['a', BLANK, BLANK, 'c'],
      first: 0,
    });
    expect(written({ cells: ['a'], first: 0 }, 0, BLANK)).toEqual({ cells: [], first: 0 });
  });

  it('stays put at the left end of a one-way tape and goes on past it on a two-way tape', () => {
    const m = parse('q0 1 -> q1 0 L; q1 _ -> accept 1 R; q1 0 -> reject R');
    const c = startConfig(m, '1');
    const one = step(m, c, 'one-way');
    const two = step(m, c, 'two-way');
    expect(one).toMatchObject({ kind: 'moved', bumped: true, config: { head: 0, state: 'q1' } });
    expect(two).toMatchObject({ kind: 'moved', bumped: false, config: { head: -1, lo: -1 } });
    expect(run(m, '1', 'one-way').outcome).toBe('reject');
    const r = run(m, '1', 'two-way');
    expect(r.outcome).toBe('accept');
    expect(tapeText(r.config)).toBe('10');
    expect(r.config.first).toBe(-1);
  });

  it('rejects when no rule applies, without a move', () => {
    const m = parse(ZERO_ONE);
    const r = run(m, '001', 'one-way');
    expect(r.outcome).toBe('reject');
    expect(r.config.state).toBe('reject');
    expect(step(m, r.config, 'one-way')).toEqual({ kind: 'halted' });
    const stuck = step(m, startConfig(m, '10'), 'one-way');
    expect(stuck).toMatchObject({ kind: 'stuck', config: { state: 'reject', moves: 0 } });
  });

  it('decides 0ⁿ1ⁿ by crossing off', () => {
    const m = parse(ZERO_ONE);
    for (let n = 0; n <= 6; n++) {
      const w = '0'.repeat(n) + '1'.repeat(n);
      expect(run(m, w, 'one-way').outcome, w).toBe('accept');
    }
    for (const w of ['0', '1', '01', '001', '011', '0101', '10', '0110']) {
      const expected = /^(0*)(1*)$/.test(w) && w.split('0').length - 1 === w.split('1').length - 1;
      expect(run(m, w, 'one-way').outcome, w).toBe(expected ? 'accept' : 'reject');
    }
    // n rounds of about 2n moves each.
    expect(run(m, '000111', 'one-way').config.moves).toBe(25);
  });

  it('increments in binary on a two-way tape, and loses the carry on a one-way tape', () => {
    const m = parse(INCREMENT);
    expect(tapeText(run(m, '1011', 'two-way').config)).toBe('1100');
    expect(tapeText(run(m, '111', 'two-way').config)).toBe('1000');
    expect(tapeText(run(m, '111', 'one-way').config)).toBe('100');
    expect(tapeText(run(m, '', 'one-way').config)).toBe('1');
  });

  it('stops at the cap when the machine never halts', () => {
    const m = parse('q0 0,1,_ -> q0 R');
    const r = run(m, '01', 'one-way', 500);
    expect(r.outcome).toBe('running');
    expect(r.config.moves).toBe(500);
    expect(r.config.hi - r.config.lo + 1).toBe(501);
  });

  it("writes configurations in Sipser's u q v", () => {
    const m = parse(ZERO_ONE);
    let c: Config = startConfig(m, '0011');
    expect(formatConfig(c, 'one-way')).toBe('q0 0011');
    for (let i = 0; i < 3; i++) c = (step(m, c, 'one-way') as { config: Config }).config;
    expect(formatConfig(c, 'one-way')).toBe('x q2 0y1');
    const e = (step(m, startConfig(m, ''), 'one-way') as { config: Config }).config;
    expect(formatConfig(e, 'one-way')).toBe('␣ accept ␣');
    const far: Config = { ...startConfig(m, '0'.repeat(16)), head: 8 };
    expect(configParts(far, 'one-way', 3)).toEqual({ u: '…000', q: 'q0', v: '000…' });
    const two: Config = { ...startConfig(m, '01'), head: -2 };
    expect(formatConfig(two, 'two-way')).toBe('q0 ␣␣01');
    expect(cellAt(two, -1)).toBe(BLANK);
  });
});
