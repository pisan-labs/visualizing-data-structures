import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, StageSize } from '../../engine/types';
import type { Shape } from '../../render/scene';
import { parseMachine as parseOne, run as runOne } from '../_turing/machine';
import { PALINDROME as ONE_PALINDROME } from '../turing-machine/machines';
import { multitapeTm, parseInput, simText } from '.';
import {
  BLANK,
  CAP,
  SEP,
  SIM_CAP,
  formatMachine,
  formatTape,
  halting,
  readSweep,
  simMove,
  startConfig,
  step,
  parseMachine,
  parseWords,
  readBack,
  run,
  separators,
  simulate,
  type MtMachine,
} from './machine';
import { ADD, COPY_COMPARE, MULTIPLY, PALINDROME, WALK } from './machines';
import type { MtSettings, MtState } from './model';
import { LOOPY } from './practice';
import { ruleLine, view } from './view';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (s: Partial<MtSettings> = {}): MtSettings =>
  ({ ...multitapeTm.defaults, ...s }) as MtSettings;
const timeline = (calls: OpCall[], s: Partial<MtSettings> = {}) =>
  new Timeline(multitapeTm, settings(s), 1, calls);
const machine = (text: string) => parseMachine(text) as MtMachine;

interface RawRule {
  from: string;
  read: string[];
  to: string;
  write: string[];
  move: string[];
}

/**
 * A reference k-tape machine written from the definition, independent of the model: each tape
 * a map from cell to symbol, the rules a map from "state symbols" to an action.
 */
function reference(rules: RawRule[], start: string, k: number, words: string[], cap: number) {
  const delta = new Map(rules.map((r) => [`${r.from} ${r.read.join('')}`, r]));
  const tapes = Array.from({ length: k }, (_, i) => new Map([...(words[i] ?? '')].entries()));
  const heads = Array.from({ length: k }, () => 0);
  let q = start;
  let moves = 0;
  let outcome = 'running';
  for (;;) {
    if (q === 'accept' || q === 'reject') {
      outcome = q;
      break;
    }
    const read = tapes.map((t, i) => t.get(heads[i]!) ?? BLANK).join('');
    const rule = delta.get(`${q} ${read}`);
    if (!rule) {
      outcome = 'reject';
      break;
    }
    if (moves === cap) break;
    tapes.forEach((t, i) => {
      t.set(heads[i]!, rule.write[i]!);
      const d = rule.move[i];
      heads[i] = Math.max(0, heads[i]! + (d === 'R' ? 1 : d === 'L' ? -1 : 0));
    });
    q = rule.to;
    moves++;
  }
  const text = (t: Map<number, string>) => {
    const filled = [...t].filter(([, a]) => a !== BLANK).map(([i]) => i);
    const hi = filled.length ? Math.max(...filled) : -1;
    return Array.from({ length: hi + 1 }, (_, i) => t.get(i) ?? BLANK).join('');
  };
  return { outcome, moves, heads, tapes: tapes.map(text) };
}

const stateArb = fc.constantFrom('q0', 'q1', 'q2');
const symArb = fc.constantFrom('0', '1', 'x', BLANK);
const ruleArb = (k: number) =>
  fc.record({
    from: stateArb,
    read: fc.array(symArb, { minLength: k, maxLength: k }),
    to: fc.oneof(stateArb, stateArb, fc.constantFrom('accept', 'reject')),
    write: fc.array(symArb, { minLength: k, maxLength: k }),
    move: fc.array(fc.constantFrom('L', 'R', 'S'), { minLength: k, maxLength: k }),
    keep: fc.boolean(),
  });

/** The rules as text, the first of each state and symbols kept; `keep` writes - where it can. */
function machineText(rules: (RawRule & { keep: boolean })[]): { text: string; kept: RawRule[] } {
  const seen = new Set<string>();
  const kept = rules.filter((r) => {
    const key = `${r.from} ${r.read.join('')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const text = kept
    .map((r) => {
      const w = r.write.map((b, i) => (r.keep && b === r.read[i] ? '-' : b));
      return `${r.from} ${r.read.join(',')} -> ${r.to} ${w.join(',')} ${r.move.join(',')}`;
    })
    .join('; ');
  return { text, kept };
}

const wordsArb = (k: number) =>
  fc.array(fc.stringMatching(/^[01x]{0,5}$/), { minLength: 1, maxLength: k });

/** Random machines with 2 or 3 tapes, and an input for them. */
const caseArb = fc.integer({ min: 2, max: 3 }).chain((k) =>
  fc.record({
    k: fc.constant(k),
    rules: fc.array(ruleArb(k), { minLength: 1, maxLength: 14 }),
    words: wordsArb(k),
  }),
);

/** S's tape for a configuration, segment by segment: what the invariants compare against. */
function segments(cells: string[]): string[][] {
  const seps = separators({ cells });
  return seps.slice(0, -1).map((a, i) => cells.slice(a + 1, seps[i + 1]));
}

/** Checks every step of a simulation: the single tape's shape, and at rest, that it encodes M. */
function checkSimSteps(st: MtState[], k: number, inputs: string[]) {
  let prev = -1;
  for (const s of st) {
    const sim = s.sim!;
    const L = sim.cells.length;
    const seps = separators(sim);
    expect(seps).toHaveLength(k + 1);
    expect(seps[0]).toBe(0);
    expect(seps.at(-1)).toBe(L - 1);
    expect(sim.head).toBeGreaterThanOrEqual(0);
    expect(sim.head).toBeLessThan(L);
    expect(sim.moves).toBeGreaterThanOrEqual(prev);
    prev = sim.moves;
    sim.dots.forEach((d, i) => {
      expect(d).toBeGreaterThan(seps[i]!);
      expect(d).toBeLessThan(seps[i + 1]!);
    });
    for (const seg of segments(sim.cells)) expect(seg.length).toBeGreaterThanOrEqual(1);
  }
  // At rest (S on the first #, between moves), the single tape holds exactly M's tapes.
  for (const s of st.filter((x) => x.sim!.head === 0)) {
    const sim = s.sim!;
    const c = s.config!;
    const seps = separators(sim);
    expect(readBack(sim)).toEqual(c.tapes.map((t) => t.cells.join('')));
    c.tapes.forEach((t, i) => {
      expect(sim.dots[i]).toBe(seps[i]! + 1 + t.head);
      const len = seps[i + 1]! - seps[i]! - 1;
      expect(len).toBe(Math.max((inputs[i] ?? '').length, t.hi + 1, 1));
    });
  }
}

describe('the text format', () => {
  it('reads rules with | and -, and writes them back the same', () => {
    const m = machine('q0 0|1, _ -> q1 -,$ S,r; q1 0,0 -> accept R,R');
    expect(m.k).toBe(2);
    expect(m.rules).toHaveLength(3);
    expect(m.rules[0]).toMatchObject({ read: ['0', '_'], write: ['0', '$'], move: ['S', 'R'] });
    expect(m.rules[1]).toMatchObject({ read: ['1', '_'], write: ['1', '$'] });
    expect(m.rules[2]).toMatchObject({ read: ['0', '0'], write: ['0', '0'], line: 1 });
    expect(formatMachine(m)).toBe('q0 0|1,_ -> q1 -,$ S,R; q1 0,0 -> accept R,R');
    for (const text of [
      COPY_COMPARE,
      PALINDROME,
      ADD,
      MULTIPLY,
      WALK,
      LOOPY,
      'start q1; q0 0,0 -> q1 R,R; q1 _,_ -> q0 L,L',
    ]) {
      const a = machine(text);
      expect(parseMachine(formatMachine(a))).toEqual(a);
    }
    const started = machine('start q1; q0 0,0 -> q1 R,R; q1 _,_ -> q0 L,L');
    expect(started.start).toBe('q1');
    expect(started.rules[0]!.line).toBe(1);
  });

  it('names what is wrong', () => {
    const err = (t: string) => (parseMachine(t) as Error).message;
    expect(err('q0 1 -> q1 0 R')).toMatch(/2 or 3 tapes/);
    expect(err('q0 1,_ -> q1 1,1 R,R; q1 0,0,0 -> q1 R,R,R')).toMatch(/rules before it read 2/);
    expect(err('q0 1,# -> q1 1,1 R,R')).toMatch(/keeps to separate the tapes/);
    expect(err('q0 1,_ -> q1 1,1 R,X')).toMatch(/"X" in .* is not a move/);
    expect(err('q0 1,_ -> q1 1 R,R')).toMatch(/writes 1 symbol for 2 tapes/);
    expect(err('q0 1,_ -> q1 R')).toMatch(/1 moves for 2 tapes/);
    expect(err('q0 1,_ -> q1 R,R; q0 1,_ -> q2 R,R')).toMatch(/second rule for 1,_/);
    expect(err('q0 -,_ -> q1 R,R')).toMatch(/only means "leave it"/);
    expect(err('q0 1 _ -> q1 R,R')).toMatch(/put commas/);
    expect(parseMachine('q0 1,_ -> q1 R,R; q0 1,_ -> q1 R,R')).not.toBeInstanceOf(Error);
  });

  it('reads input words, one per tape', () => {
    expect(parseWords('01=01')).toEqual(['01=01']);
    expect(parseWords('101, 011')).toEqual(['101', '011']);
    expect(parseWords('ε')).toEqual(['']);
    expect(parseWords(',01')).toEqual(['', '01']);
    expect((parseWords('0#1') as Error).message).toMatch(/keeps to separate/);
    expect((parseWords('0,1,0,1') as Error).message).toMatch(/at most 3/);
    expect(parseInput('q0 1,_ -> q1 1,1 R,R')).toBe('q0 1,_ -> q1 1,1 R,R');
    expect(parseInput('q0 1 -> q1 R')).toBeInstanceOf(Error);
    expect(parseInput('0_1')).toBeInstanceOf(Error);
  });
});

describe('the classic machines', () => {
  const ends = (text: string, w: string) => {
    const m = machine(text);
    const words = parseWords(w) as string[];
    const r = run(m, words);
    return {
      outcome: r.outcome,
      moves: r.config.moves,
      tapes: r.config.tapes.map((t) => t.cells.join('')),
    };
  };

  it('copy, then compare: w=w in linear time', () => {
    expect(ends(COPY_COMPARE, '0110=0110')).toEqual({
      outcome: 'accept',
      moves: 16,
      tapes: ['0110=0110', '$0110'],
    });
    expect(ends(COPY_COMPARE, '01=10').outcome).toBe('reject');
    expect(ends(COPY_COMPARE, '01=011').outcome).toBe('reject');
    expect(ends(COPY_COMPARE, '=').outcome).toBe('accept');
    expect(ends(COPY_COMPARE, '0101').outcome).toBe('reject');
  });

  it('palindromes in about 3n moves', () => {
    for (const w of ['', '0', '11', '010', '0110', '0110110']) {
      const r = ends(PALINDROME, w || 'ε');
      expect(r.outcome).toBe('accept');
      if (w) expect(r.moves).toBe(3 * w.length + 4);
    }
    expect(ends(PALINDROME, '011100').outcome).toBe('reject');
    expect(ends(PALINDROME, '01').outcome).toBe('reject');
  });

  it('adds two binary numbers of the same length', () => {
    for (const [a, b] of [
      ['1011', '0110'],
      ['1', '1'],
      ['0', '0'],
      ['111', '111'],
    ] as const) {
      const r = ends(ADD, `${a},${b}`);
      expect(r.outcome).toBe('accept');
      expect(parseInt(r.tapes[2]!, 2)).toBe(parseInt(a, 2) + parseInt(b, 2));
      expect(r.tapes[2]).toHaveLength(a.length + 1);
    }
    expect(ends(ADD, '101,11').outcome).toBe('reject');
  });

  it('multiplies in unary', () => {
    for (const [a, b] of [
      [2, 3],
      [0, 2],
      [3, 0],
      [1, 1],
    ]) {
      const r = ends(MULTIPLY, `${'1'.repeat(a!)}*${'1'.repeat(b!)}`);
      expect(r.outcome).toBe('accept');
      expect(r.tapes[2]).toBe('1'.repeat(a! * b!));
    }
    expect(ends(MULTIPLY, '111').outcome).toBe('reject');
  });

  it('the walker never halts, and its simulation shifts twice a move', () => {
    expect(ends(WALK, '0')).toMatchObject({ outcome: 'running', moves: CAP });
    const m = machine(WALK);
    const s = simulate(m, ['0']);
    expect(s.outcome).toBe('running');
    expect(s.config.moves).toBe(SIM_CAP);
    expect(s.sim.cells).toHaveLength(5 + 2 * SIM_CAP);
  });

  it('the one-tape count grows like the square of the input on palindromes', () => {
    const cost = (n: number) => {
      const w = '01'.repeat(n / 4) + '10'.repeat(n / 4);
      return simulate(machine(PALINDROME), [w]).sim.moves;
    };
    const ratio = cost(16) / cost(8);
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
  });

  it('gives the numbers the concept page quotes', () => {
    const both = (text: string, w: string) => {
      const m = machine(text);
      const words = parseWords(w) as string[];
      return [run(m, words).config.moves, simulate(m, words).sim.moves];
    };
    expect(both(COPY_COMPARE, '01=01')).toEqual([10, 266]);
    expect(both(COPY_COMPARE, '0110=0110')[0]).toBe(16);
    const f = formatTape(machine(COPY_COMPARE), ['01=01']);
    expect([f.cells.length, f.moves]).toEqual([9, 16]);
    expect(both(PALINDROME, '0110')).toEqual([16, 444]);
    expect(both(PALINDROME, '01100110')).toEqual([28, 1184]);
    expect(both(PALINDROME, '0110011001100110')).toEqual([52, 3720]);
    expect(both(PALINDROME, '011100')[0]).toBe(16);
    expect(both(ADD, '1011,0110')[0]).toBe(10);
    expect(both(MULTIPLY, '11*111')[0]).toBe(13);
    expect(simulate(machine(WALK), ['0']).sim.moves).toBe(31908);
    const one = parseOne(ONE_PALINDROME);
    if (one instanceof Error) throw one;
    expect(runOne(one, '0110011001100110', 'one-way').config.moves).toBe(153);
  });
});

describe('Multi-tape Turing machine page', () => {
  it('runs like a reference machine, and the simulation ends the same way, within O(t²)', () => {
    fc.assert(
      fc.property(caseArb, ({ k, rules, words }) => {
        const { text, kept } = machineText(rules);
        const m = machine(text);
        expect(m.k).toBe(k);
        const input = words.join(',') || 'ε';
        const t = timeline([
          ['load', text],
          ['run', input],
          ['simulate', input],
        ]);
        const [, runE, simE] = t.entries;
        const ref = reference(kept, kept[0]!.from, k, words, CAP);
        const end = runE!.end.config!;
        const capped = !!runE!.steps.at(-1)!.extra?.capped;
        expect(capped ? 'running' : end.state).toBe(ref.outcome);
        expect(end.moves).toBe(ref.moves);
        expect(end.tapes.map((x) => x.head)).toEqual(ref.heads);
        expect(end.tapes.map((x) => x.cells.join(''))).toEqual(ref.tapes);
        // The run keeps the single tape in step with M after every move.
        for (const s of runE!.steps.slice(1, -1)) {
          expect(readBack(s.state.sim!)).toEqual(
            s.state.config!.tapes.map((x) => x.cells.join('')),
          );
          expect(s.state.sim!.head).toBe(0);
        }
        // The simulation: same verdict and tapes as M with the simulation's cap.
        const refSim = reference(kept, kept[0]!.from, k, words, SIM_CAP);
        const simEnd = simE!.end;
        const simCapped = !!simE!.steps.at(-1)!.extra?.capped;
        expect(simCapped ? 'running' : simEnd.config!.state).toBe(refSim.outcome);
        expect(simEnd.config!.moves).toBe(refSim.moves);
        expect(readBack(simEnd.sim!)).toEqual(refSim.tapes);
        expect(simEnd.sim).toEqual(simulate(m, words).sim);
        checkSimSteps(
          simE!.steps.map((s) => s.state),
          k,
          words,
        );
        // S's moves: at least two scans of the starting tape a move, at most a constant times
        // (t + n)², however the heads move.
        const tMoves = simEnd.config!.moves;
        const n = words.join('').length;
        const L0 = simE!.steps[0]!.state.sim!.cells.length;
        const sMoves = simEnd.sim!.moves;
        expect(sMoves).toBeGreaterThanOrEqual(2 * (L0 - 1) * (tMoves + 1));
        expect(sMoves).toBeLessThanOrEqual(
          2 * (k + 1) * (tMoves + 1) * (n + 2 * k + 1 + k * tMoves),
        );
        expect(sMoves).toBeLessThanOrEqual(8 * k * (tMoves + n + 2) ** 2);
        // Vars agree with the state on every step.
        for (const s of simE!.steps) {
          const st = s.state;
          expect(s.vars).toEqual({
            state: st.config!.state,
            'M moves': st.config!.moves,
            'S moves': st.sim!.moves,
            heads: st.config!.tapes.map((x) => x.head).join(', '),
            'S cells': st.sim!.cells.length,
          });
        }
      }),
      { numRuns: 250 },
    );
  });

  it('Step simulates one move at a time and lands where Simulate does', () => {
    fc.assert(
      fc.property(caseArb, fc.integer({ min: 1, max: 12 }), ({ rules, words }, j) => {
        const { text } = machineText(rules);
        const input = words.join(',') || 'ε';
        const steps: OpCall[] = Array.from({ length: j }, () => ['step']);
        const t = timeline([['load', text], ['start', input], ...steps]);
        const m = machine(text);
        // The same moves straight from the model's functions.
        let c = startConfig(m, words);
        let sim = formatTape(m, words);
        for (let i = 0; i < j && !halting(c.state); i++) {
          const r = step(m, c);
          if (r.kind === 'stuck') {
            c = r.config;
            sim = readSweep(sim).end;
          } else if (r.kind === 'moved') {
            c = r.config;
            sim = simMove(sim, r.rule);
          }
        }
        const end = t.endState();
        expect(end.config).toEqual(c);
        expect(end.sim).toEqual(sim);
      }),
      { numRuns: 150 },
    );
  });

  it('says how a run ended, with both counts', () => {
    const t = timeline([['run', '01=01']]);
    const last = t.entries[0]!.steps.at(-1)!;
    expect(last.say).toContain(
      'The machine accepts 01=01 after 10 moves. On one tape, the same run takes 266 moves.',
    );
    const s = timeline([['simulate', '01=01']]).entries[0]!;
    expect(s.steps.at(-1)!.say).toContain('S accepts after 266');
    // Each move of M at level 2: the scan right, any shifts, and the scan back.
    const levels = s.steps.filter((x) => x.level <= 2).map((x) => x.extra?.phase);
    expect(levels.filter((p) => p === 'found')).toHaveLength(10);
    expect(levels.filter((p) => p === 'shift').length).toBeGreaterThan(0);
    expect(s.steps.filter((x) => x.extra?.phase === 'read')).toHaveLength(20);
  });

  it('refuses words with more parts than tapes, and words that are not input', () => {
    const t = timeline([['run', '0,1,0']]);
    expect(t.entries[0]!.steps[0]!.say).toContain('this machine has 2 tapes');
    const u = timeline([['load', 'cat']]);
    expect(u.entries[0]!.steps[0]!.say).toContain('"cat" is not a machine');
    const v = timeline([['step']]);
    expect(v.entries[0]!.steps[0]!.say).toContain('no word on the tapes');
  });

  it('stops a simulation at the cap and says so', () => {
    const t = timeline([
      ['load', WALK],
      ['simulate', '0'],
    ]);
    const last = t.entries[1]!.steps.at(-1)!;
    expect(last.extra?.capped).toBe(true);
    expect(last.say).toContain(`Still running after ${SIM_CAP} moves of M`);
  });
});

describe('the drawing', () => {
  const wide: StageSize = LAPTOP_STAGE;
  const phone: StageSize = PHONE_STAGE;
  const shapesOf = (calls: OpCall[], s: Partial<MtSettings> = {}, stage?: StageSize) => {
    const t = timeline(calls, s);
    return view(t.at(t.length - 1).step, settings(s), stage).shapes;
  };
  const byId = (shapes: Shape[], id: string) => shapes.find((s) => s.id === id);

  it('draws each tape with its head, and the single tape with a mark per tape', () => {
    const shapes = shapesOf([['start', '01=01']]);
    expect(byId(shapes, 't1-head')?.role).toBe('g2');
    expect(byId(shapes, 't2-head')?.role).toBe('g4');
    expect(byId(shapes, 'sim-head')).toBeDefined();
    expect(byId(shapes, 'sim-dot-1')).toMatchObject({ kind: 'circle', role: 'g2' });
    expect(byId(shapes, 'sim-dot-2')).toMatchObject({ kind: 'circle', role: 'g4' });
    const under = shapesOf([['start', '01=01']], { mark: 'underline' });
    expect(byId(under, 'sim-dot-1')).toMatchObject({ kind: 'rect' });
    // The single tape: # 0 1 = 0 1 # ␣ #.
    const texts = (shapes.filter((s) => /^sim-\d+-t$/.test(s.id)) as { text: string }[]).map(
      (s) => s.text,
    );
    expect(texts.slice(0, 9).join('')).toBe('#01=01#␣#');
  });

  it('puts the rules beside on a wide stage and under on a phone', () => {
    const at = (stage: StageSize) => {
      const shapes = shapesOf([['run', '01=01']], {}, stage);
      const title = byId(shapes, 'rule-title') as { x: number; y: number };
      const sim = byId(shapes, 'sim-status') as { x: number; y: number };
      return title.x > 300 ? 'beside' : title.y > sim.y ? 'under' : 'neither';
    };
    expect(at(wide)).toBe('beside');
    expect(at(phone)).toBe('under');
  });

  it('keeps the single tape the same size through a run', () => {
    const t = timeline([['simulate', '0110=0110']]);
    const boxes = new Set<string>();
    for (let i = 1; i < t.length; i++)
      boxes.add(JSON.stringify(view(t.at(i).step, settings(), wide).bounds));
    expect(boxes.size).toBe(1);
  });

  it('writes rules with arrows and blanks', () => {
    expect(ruleLine('copy 0,_ -> copy 0,0 R,R')).toBe('copy 0,␣ → copy 0,0 R,R');
    expect(ruleLine('mark 0|1,_ -> copy -,$ S,R')).toBe('mark 0|1,␣ → copy -,$ S,R');
    expect(ruleLine('start q_1')).toBe('start q_1');
    expect(ruleLine('q_1 _,_ -> q_2 L,L')).toBe('q_1 ␣,␣ → q_2 L,L');
  });

  it('prints the single tape for the code tabs', () => {
    const s = simulate(machine(COPY_COMPARE), ['01=01']);
    expect(simText(s.sim)).toBe('#01=01[_]#$01[_]#');
    expect(s.sim.cells.filter((a) => a === SEP)).toHaveLength(3);
  });
});

describe('drawn text size', () => {
  // On a phone, 3 tapes, the single tape and 13 rules one under another reach 8.75 px.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(multitapeTm, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(multitapeTm, PHONE_STAGE).px).toBeGreaterThanOrEqual(8.7);
  });
});
