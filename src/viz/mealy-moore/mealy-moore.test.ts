import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Step } from '../../engine/types';
import { stateId } from '../../layouts/automaton';
import { randomWord } from '../_automata/random';
import { mealyMoore as def, machineLines, showMachine } from '.';
import {
  MAX_RESULT,
  convert,
  formatMachine,
  machineKey,
  mealyToMoore,
  mooreToMealy,
  parseMachine,
  randomMachine,
  runMachine,
  sizeProblem,
  type First,
  type Kind,
  type Machine,
} from './machine';
import { MACHINES, machine, type MachineName } from './machines';
import {
  DST,
  SRC,
  outputId,
  type MmExtra,
  type MmSettings,
  type MmState,
  type Track,
} from './model';

// ---------------------------------------------------------------------------------------------
// Reference: runs written from the definitions, apart from the model.

const next = (m: Machine, q: string, c: string) =>
  m.fa.moves.find((mv) => mv.from === q && mv.on === c)!.to;

/** Moore: λ(q0), then λ of each state entered (Hopcroft and Ullman), or without λ(q0). */
function refMoore(m: Machine, w: string, first: First = 'write'): string {
  let q = m.fa.start;
  let out = first === 'write' ? m.out[q]! : '';
  for (const c of w) {
    q = next(m, q, c);
    out += m.out[q];
  }
  return out;
}

/** Mealy: λ(q, c) for each move followed. */
function refMealy(m: Machine, w: string): string {
  let q = m.fa.start;
  let out = '';
  for (const c of w) {
    out += m.out[`${q} ${c}`];
    q = next(m, q, c);
  }
  return out;
}

const refRun = (m: Machine, w: string, first: First = 'write') =>
  m.kind === 'moore' ? refMoore(m, w, first) : refMealy(m, w);

function allWords(symbols: readonly string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => symbols.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

/** What each named machine is meant to write, written directly. */
const ends101 = (w: string) =>
  [...w].map((_, i) => (w.slice(0, i + 1).endsWith('101') ? '1' : '0')).join('');
function once101(w: string): string {
  let out = '';
  let from = 0;
  for (let i = 0; i < w.length; i++) {
    const hit = i - from >= 2 && w.slice(i - 2, i + 1) === '101';
    out += hit ? '1' : '0';
    if (hit) from = i + 1;
  }
  return out;
}
const prefixes = (w: string) => Array.from({ length: w.length + 1 }, (_, i) => w.slice(0, i));
const MEANT: Record<MachineName, (w: string) => string> = {
  detect101: ends101,
  detect101Once: once101,
  detect101Moore: (w) => `0${ends101(w)}`,
  parity: (w) =>
    prefixes(w)
      .map((p) => String([...p].filter((c) => c === '1').length % 2))
      .join(''),
  mod3: (w) =>
    prefixes(w)
      .map((p) => String(p === '' ? 0 : parseInt(p, 2) % 3))
      .join(''),
  change: (w) => [...w].map((c, i) => (c === (i ? w[i - 1] : '0') ? '0' : '1')).join(''),
  vending: (w) => {
    let credit = 0;
    let out = '';
    for (const c of w) {
      credit += c === 'n' ? 5 : 10;
      out += credit >= 15 ? '1' : '0';
      if (credit >= 15) credit -= 15;
    }
    return out;
  },
  traffic: (w) =>
    prefixes(w)
      .map((p) => 'GYR'[[...p].filter((c) => c === '1').length % 3])
      .join(''),
};

const settings = (first: First = 'write'): MmSettings => ({ first });
type T = Timeline<MmState, MmSettings, MmExtra>;
const timeline = (calls: OpCall[], first: First = 'write'): T =>
  new Timeline(def, settings(first), 1, calls);
const load = (m: Machine): OpCall => ['load', formatMachine(m)];

/** Random machines from machine.ts: 1 to 5 states, inputs {0, 1} or {a, b, c}, 2 or 3 outputs. */
const machineArb = (kind?: Kind) =>
  fc
    .record({
      seed: fc.integer({ min: 1, max: 1_000_000 }),
      n: fc.integer({ min: 1, max: 5 }),
      kind: kind ? fc.constant(kind) : fc.constantFrom<Kind>('mealy', 'moore'),
      abc: fc.boolean(),
      outs: fc.integer({ min: 2, max: 3 }),
    })
    .map(({ seed, n, kind: k, abc, outs }) =>
      randomMachine(makeRng(seed), k, n, {
        inputs: abc ? ['a', 'b', 'c'] : ['0', '1'],
        outputs: ['0', '1', '2'].slice(0, outs),
      }),
    );

const WORD_LEN = (m: Machine) => (m.fa.alphabet.length > 2 ? 4 : 6);

describe('Mealy and Moore machines', () => {
  it('write what each named machine is meant to write', () => {
    for (const [name, text] of Object.entries(MACHINES)) {
      const m = parseMachine(text) as Machine;
      expect(m, name).not.toBeInstanceOf(Error);
      for (const w of allWords(m.fa.alphabet, 6)) {
        expect(refRun(m, w), `${name} on ${w}`).toBe(MEANT[name as MachineName](w));
        expect(runMachine(m, w).out).toBe(refRun(m, w));
      }
    }
  });

  it('read back what they write as text', () => {
    fc.assert(
      fc.property(machineArb(), (m) => {
        expect(parseMachine(formatMachine(m))).toEqual(m);
        const c = convert(m);
        if (c.fa.states.every((q) => /^[A-Za-z0-9_]{1,6}$/.test(q)))
          expect(parseMachine(formatMachine(c))).toEqual(c);
      }),
      { numRuns: 300 },
    );
  });

  it('accept the label form, a/1 on the arrow, as well', () => {
    const a = parseMachine('q0 0/0,1/1 -> q1; q1 0/1 -> q0; q1 1 -> q1 / 0') as Machine;
    const b = parseMachine('q0 0 -> q1 / 0; q0 1 -> q1 / 1; q1 0 -> q0 / 1; q1 1 -> q1 / 0');
    expect(a).toEqual(b);
  });

  it('explain what is wrong with bad machine text', () => {
    const err = (t: string) => (parseMachine(t) as Error).message;
    expect(err('q0 a -> q1 / 1; accept q1')).toContain('no accept states');
    expect(err('q0 a -> q0 / 1; q0 / 1')).toContain('Use one or the other');
    expect(err('q0 a -> q0')).toContain('Give the outputs');
    expect(err('q0 a -> q1 / 1; q1 a -> q0')).toContain('"q1 a -> q0" has no output');
    expect(err('q0 / 0; q0 a -> q1; q1 a -> q0')).toContain('q1 has no output');
    expect(err('q0 a -> q1 / 1')).toContain('q1 has no move on a');
    expect(err('q0 a -> q0 / 1; q0 a -> q1 / 0; q1 a -> q1 / 0')).toContain('2 moves on a');
    expect(err('q0 a -> q0 / 1; q0 a -> q0 / 0')).toContain('writes both 1 and 0');
    expect(err('q0 / 0; q0 / 1; q0 a -> q0')).toContain('two outputs, 0 and 1');
    expect(err('q0 a -> q0 / 10')).toContain('"10" in "q0 a -> q0 / 10" is not an output symbol');
    expect(err('q0 eps -> q0 / 1')).toContain('ε-move');
    expect(err('q0 ab -> q0 / 1')).toContain('"ab" in "q0 ab -> q0 / 1" is not a symbol');
    expect(err('hello')).toContain('is not a move or an output');
    expect(err('q0 / 1')).toContain('Add moves');
  });

  it('convert Moore to Mealy with the same states and the same output after the first symbol', () => {
    fc.assert(
      fc.property(machineArb('moore'), (m) => {
        const mealy = mooreToMealy(m);
        expect(mealy.kind).toBe('mealy');
        expect(mealy.fa.states).toEqual(m.fa.states);
        expect(mealy.fa.moves).toEqual(m.fa.moves);
        for (const w of allWords(m.fa.alphabet, WORD_LEN(m))) {
          expect(refMealy(mealy, w)).toBe(refMoore(m, w).slice(1));
          expect(refMealy(mealy, w)).toBe(refMoore(m, w, 'skip'));
        }
      }),
      { numRuns: 300 },
    );
  });

  it('convert Mealy to Moore with at most |Q|·|Δ| states and the same output after the first symbol', () => {
    fc.assert(
      fc.property(machineArb('mealy'), (m) => {
        const { machine: moore, copies, of } = mealyToMoore(m);
        expect(moore.kind).toBe('moore');
        const k = moore.fa.states.length;
        expect(k).toBeGreaterThanOrEqual(m.fa.states.length);
        expect(k).toBeLessThanOrEqual(m.fa.states.length * m.outputs.length);
        // Each state's copies write different outputs, and the start is a copy of q0.
        for (const q of m.fa.states) {
          const outs = copies[q]!.map((p) => moore.out[p]);
          expect(new Set(outs).size).toBe(outs.length);
          for (const p of copies[q]!) expect(of[p]).toBe(q);
        }
        expect(of[moore.fa.start]).toBe(m.fa.start);
        for (const w of allWords(m.fa.alphabet, WORD_LEN(m))) {
          expect(refMoore(moore, w).slice(1)).toBe(refMealy(m, w));
          expect(refMoore(moore, w, 'skip')).toBe(refMealy(m, w));
        }
      }),
      { numRuns: 300 },
    );
  });

  it('come back equivalent from a round trip, and Moore to Mealy to Moore changes nothing but unread outputs', () => {
    fc.assert(
      fc.property(machineArb(), (m) => {
        const there = convert(m);
        const back = convert(there);
        expect(back.kind).toBe(m.kind);
        for (const w of allWords(m.fa.alphabet, WORD_LEN(m)))
          expect(refRun(back, w, 'skip')).toBe(refRun(m, w, 'skip'));
        if (m.kind === 'moore') {
          // Same states and moves; only a state no move enters can change what it writes.
          expect(back.fa).toEqual(m.fa);
          for (const q of m.fa.states)
            if (m.fa.moves.some((mv) => mv.to === q)) expect(back.out[q]).toBe(m.out[q]);
        } else {
          // A Mealy machine from a Moore machine is entered with one output per state: no split.
          expect(convert(back).fa.states.length).toBe(back.fa.states.length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('refuse a Mealy machine whose Moore machine would be too big to draw', () => {
    // Every state entered with every output: q_i on symbol s goes to q_(i+s mod 4) writing s.
    const t = [0, 1, 2, 3]
      .flatMap((i) => [0, 1, 2, 3].map((k) => `q${i} ${'abcd'[k]} -> q${(i + k) % 4} / ${k}`))
      .join('; ');
    const m = parseMachine(t) as Machine;
    expect(convert(m).fa.states.length).toBeGreaterThan(MAX_RESULT);
    expect(sizeProblem(m)).toContain('too many to draw');
    const tl = timeline([['load', t]]);
    expect(tl.entries[0]!.steps[0]!.say).toContain('Nothing loaded.');
    expect(def.controls.input!.parse(t)).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------------------------
// The page, step by step

function checkRun(steps: Step<MmState, MmExtra>[], s: MmState, word: string, first: First) {
  const ms = [s.machine, ...(s.result ? [s.result] : [])];
  let read = 0;
  for (const step of steps) {
    const r = step.extra!.run!;
    expect(r.word).toBe(word);
    expect(r.read - read).toBeGreaterThanOrEqual(0);
    expect(r.read - read).toBeLessThanOrEqual(1);
    read = r.read;
    expect(r.tracks.length).toBe(ms.length);
    expect(r.tracks[0]!.kind === 'mealy' || r.tracks.length === 1).toBe(true);
    for (const t of r.tracks) {
      const m = t.prefix === SRC ? s.machine : s.result!;
      expect(t.kind).toBe(m.kind);
      // The state is where δ leads, and the output so far is the reference's, symbol by symbol.
      const prefix = word.slice(0, r.read);
      let q = m.fa.start;
      for (const c of prefix) q = next(m, q, c);
      expect(t.q).toBe(q);
      expect(t.out).toBe(refRun(m, prefix, first));
      expect(step.marks.some((mk) => mk.id === stateId(t.q, t.prefix))).toBe(true);
      if (t.kind === 'moore' && step.lines.includes('run.moore'))
        expect(step.marks).toContainEqual({ id: outputId(t.q, t.prefix), role: 'new' });
    }
    if (r.tracks.length === 1) {
      expect(step.vars?.state).toBe(r.tracks[0]!.q);
      expect(step.vars?.output).toBe(r.tracks[0]!.out || 'ε');
    } else {
      expect(step.vars?.['Mealy out']).toBe(r.tracks[0]!.out || 'ε');
      expect(step.vars?.['Moore out']).toBe(r.tracks[1]!.out || 'ε');
    }
  }
  const last = steps.at(-1)!.extra!.run!;
  expect(last.done).toBe(true);
  expect(last.read).toBe(word.length);
  if (last.tracks.length === 2) {
    const [mealy, moore] = last.tracks as [Track, Track];
    expect(first === 'write' ? moore.out.slice(1) : moore.out).toBe(mealy.out);
  }
}

function checkConvert(steps: Step<MmState, MmExtra>[], m: Machine) {
  const res = convert(m);
  let states = 0;
  let moves = 0;
  for (const step of steps) {
    const c = step.extra?.conv;
    if (!c) continue;
    // Each step adds one move, or the states for one Mealy state (or every state at once, for
    // Moore to Mealy), never taking anything away.
    expect(c.states.length).toBeGreaterThanOrEqual(states);
    expect(c.moves.length).toBeGreaterThanOrEqual(moves);
    expect(c.moves.length - moves).toBeLessThanOrEqual(1);
    if (m.kind === 'mealy') expect(c.states.length - states).toBeLessThanOrEqual(m.outputs.length);
    if (c.moves.length > moves) expect(c.states.length).toBe(states);
    states = c.states.length;
    moves = c.moves.length;
    for (const q of c.states) expect(res.fa.states).toContain(q);
    for (const k of c.moves) {
      const [from, on] = k.split(' ');
      expect(c.states).toContain(from);
      expect(res.fa.moves.some((mv) => mv.from === from && mv.on === on)).toBe(true);
    }
  }
  expect(states).toBe(res.fa.states.length);
  expect(moves).toBe(res.fa.moves.length);
  const end = steps.at(-1)!.state;
  expect(end.result).toEqual(res);
  for (const step of steps.slice(0, -1)) expect(step.state.result).toBeUndefined();
}

describe('Mealy and Moore page', () => {
  it('runs and converts random machines, step by step, as the reference does', () => {
    fc.assert(
      fc.property(
        machineArb(),
        fc.constantFrom<First>('write', 'skip'),
        fc.integer({ min: 0, max: 1_000 }),
        (m, first, salt) => {
          const rng = makeRng(salt + 1);
          const w1 = randomWord(rng, m.fa.alphabet, rng.int(0, 7));
          const w2 = randomWord(rng, m.fa.alphabet, rng.int(0, 7));
          const calls: OpCall[] = [
            load(m),
            ['run', w1 || 'eps'],
            ['convert'],
            ['run', w2 || 'eps'],
            ['back'],
            ['run', w1 || 'eps'],
          ];
          const t = timeline(calls, first);
          expect(t.entries[0]!.end.machine).toEqual(m);
          checkRun(t.entries[1]!.steps, t.entries[0]!.end, w1, first);
          checkConvert(t.entries[2]!.steps, m);
          checkRun(t.entries[3]!.steps, t.entries[2]!.end, w2, first);
          // Convert back: the converted machine becomes the machine, and is converted in turn.
          const back = t.entries[4]!;
          expect(back.end.machine).toEqual(convert(m));
          checkConvert(back.steps.slice(1), convert(m));
          checkRun(t.entries[5]!.steps, back.end, w1, first);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('splits the 101 detector, and says why', () => {
    const t = timeline([['load', MACHINES.detect101], ['convert']]);
    const says = t.entries[1]!.steps.map((s) => s.say);
    expect(says).toContainEqual(
      "The moves into q1 write 0 (q0 on 1 and q1 on 1) and 1 (q2 on 1). One Moore state writes only one output, so q1 splits into 2: q1 writes 0 and q1' writes 1.",
    );
    expect(says.at(-1)).toBe(
      "Done: a Moore machine with 4 states for the Mealy machine's 3: q1 is entered with different outputs, so it splits. It never needs more than |Q|·|Δ| = 3·2 = 6.",
    );
    // The Moore machine is the hand-made one, with q1' in place of q3.
    const moore = t.endState().result!;
    const hand = machine('detect101Moore');
    for (const w of allWords(['0', '1'], 6)) expect(refMoore(moore, w)).toBe(refMoore(hand, w));
  });

  it('shows the lag: Moore writes its start output first, then what Mealy wrote', () => {
    const t = timeline([['load', MACHINES.detect101], ['convert'], ['run', '110101']]);
    const end = t.entries[2]!.steps.at(-1)!;
    expect(end.extra!.run!.tracks.map((x) => x.out)).toEqual(['000101', '0000101']);
    expect(end.say).toContain('Mealy wrote 000101 and Moore wrote 0000101.');
    const skip = timeline([['load', MACHINES.detect101], ['convert'], ['run', '110101']], 'skip');
    expect(skip.entries[2]!.steps.at(-1)!.extra!.run!.tracks.map((x) => x.out)).toEqual([
      '000101',
      '000101',
    ]);
    expect(def.pseudocode(settings('skip'))[0]!.lines.map((l) => l.id)).not.toContain('run.first');
  });

  it('round-trips the 101 detector into a bigger Mealy machine, and the parity bit unchanged', () => {
    const t = timeline([['load', MACHINES.detect101], ['convert'], ['back']]);
    expect(t.endState().machine.fa.states).toHaveLength(4);
    expect(t.endState().machine.fa.states).toContain("q1'");
    expect(t.endState().result!.fa.states.length).toBe(4);
    expect(t.entries[2]!.steps.at(-1)!.say).toContain('converting does not minimize');
    const p = timeline([['load', MACHINES.parity], ['convert'], ['back']]);
    expect(machineKey(p.endState().result!)).toBe(machineKey(machine('parity')));
    expect(p.entries[2]!.steps.at(-1)!.say).toContain('gives back exactly the machine');
    expect(timeline([['back']]).entries[0]!.steps[0]!.say).toContain('Nothing to convert back');
  });

  it('draws every Moore state with its output, and both machines with distinct ids', () => {
    const t = timeline([['load', MACHINES.detect101], ['convert'], ['run', '1011']]);
    for (let i = 0; i < t.length; i++) {
      const scene = def.view(t.at(i).step, settings());
      const ids = scene.shapes.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      const st = t.at(i).step.state;
      const shown = t.at(i).step.extra?.conv?.states ?? (st.result ? st.result.fa.states : []);
      for (const q of shown) {
        const out = scene.shapes.find((s) => s.id === outputId(q, DST));
        expect(out && out.kind === 'text' && out.text).toBe(convert(st.machine).out[q]);
      }
    }
  });

  it('gives the code tabs the machine and the outputs the model computes', () => {
    const { input, expected } = def.code!.script(
      [['load', MACHINES.detect101], ['run', '1101'], ['convert'], ['run', '1101'], ['back']],
      settings('skip'),
    );
    expect(input.slice(0, 3)).toEqual(['mealy q0 q1 q2', 'alphabet 0 1', 'start q0']);
    expect(input).toContain('move q2 1 q1 1');
    expect(expected[0]).toBe('0001');
    // The drivers write the start state's output, whatever the setting.
    expect(expected[2]).toBe('0001 | 00001');
    expect(expected[1]).toBe(showMachine(mealyToMoore(machine('detect101')).machine));
    expect(expected[3]).toBe(showMachine(convert(convert(machine('detect101')))));
    expect(machineLines(machine('parity'))).toContain('out o 1');
  });
});
