import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Shape } from '../../render/scene';
import def, { parseProgram } from './index';
import {
  cellLabel,
  dOutcome,
  dWords,
  reducedLabel,
  type Framing,
  type HaltSettings,
  type HaltState,
} from './model';
import {
  CAP,
  MAX_SIZE,
  MIN_SIZE,
  PROGRAMS,
  acceptOnHalt,
  cell,
  codeOf,
  halts,
  parseCode,
  primeCell,
  runProgram,
  type Instr,
} from './toy';

type Simple = 'accept' | 'reject' | 'loop';

/**
 * The reference: run with no cycle check at all, for one step more than there are
 * configurations. A program that has not halted by then has repeated one (pigeonhole), so it
 * loops forever.
 */
function reference(prog: readonly Instr[], input: string): { outcome: Simple; steps: number } {
  const m = input.length;
  const configs = (prog.length + 1) * (m + 1);
  let line = 1;
  let head = 0;
  for (let step = 1; step <= configs + 1; step++) {
    if (line > prog.length) return { outcome: 'reject', steps: step - 1 };
    const ins = prog[line - 1]!;
    if (ins.op === 'accept' || ins.op === 'reject') return { outcome: ins.op, steps: step };
    let next = line + 1;
    if (ins.op === 'right') head = Math.min(m, head + 1);
    else if (ins.op === 'left') head = Math.max(0, head - 1);
    else if (ins.op === 'goto') next = ins.to;
    else if (ins.op === 'end' && head === m) next = ins.to;
    else if (ins.op === 'if' && head < m && input[head] === ins.sym) next = ins.to;
    line = next;
  }
  return { outcome: 'loop', steps: configs + 1 };
}

const SYMS = [...'ARGE?<>123456789'];

/** Random programs of 1 to 9 lines, with jumps to any line. */
const programArb: fc.Arbitrary<Instr[]> = fc.integer({ min: 1, max: 9 }).chain((len) =>
  fc.array(
    fc.oneof(
      fc.constant<Instr>({ op: 'accept' }),
      fc.constant<Instr>({ op: 'reject' }),
      fc.constant<Instr>({ op: 'right' }),
      fc.constant<Instr>({ op: 'left' }),
      fc.integer({ min: 1, max: len }).map((to): Instr => ({ op: 'goto', to })),
      fc.integer({ min: 1, max: len }).map((to): Instr => ({ op: 'end', to })),
      fc
        .tuple(fc.constantFrom(...SYMS), fc.integer({ min: 1, max: len }))
        .map(([sym, to]): Instr => ({ op: 'if', sym, to })),
    ),
    { minLength: len, maxLength: len },
  ),
);

const wordArb = fc.array(fc.constantFrom(...SYMS), { maxLength: 14 }).map((cs) => cs.join(''));

const framings: Framing[] = ['atm', 'halt'];
const sizes = Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, k) => MIN_SIZE + k);

const settings = (framing: Framing, size: number): HaltSettings => ({ framing, size });

function textOf(shapes: Shape[], id: string): string | undefined {
  const s = shapes.find((x) => x.id === id);
  return s && s.kind === 'text' ? s.text : undefined;
}

/** What D does on ⟨Mi⟩ differs from what Mi does, in the sense the framing asks about. */
function differs(i: number, framing: Framing): boolean {
  const mine = cell(i, i).outcome;
  const d = dOutcome(mine, framing);
  return framing === 'halt' ? halts(d) !== halts(mine) : (d === 'accept') !== (mine === 'accept');
}

describe('the toy interpreter', () => {
  it('agrees with a run that has no cycle check, on random programs and words', () => {
    fc.assert(
      fc.property(programArb, wordArb, (prog, word) => {
        const r = runProgram(prog, word);
        const ref = reference(prog, word);
        expect(r.outcome).toBe(ref.outcome);
        if (r.outcome !== 'loop') expect(r.steps).toBe(ref.steps);
        else {
          // The repeat is real: the configurations before `first` and `again` are the same.
          expect(r.trace[r.first! - 1]).toEqual(r.trace[r.again! - 1]);
          expect(r.again!).toBeGreaterThan(r.first!);
          expect(r.again!).toBeLessThanOrEqual(prog.length * (word.length + 1) + 1);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('writes codes back as it reads them', () => {
    fc.assert(
      fc.property(programArb, (prog) => {
        const code = codeOf(prog);
        expect(parseCode(code)).toEqual(prog);
      }),
    );
    for (const p of PROGRAMS) expect(codeOf(p.prog)).toBe(p.code);
    expect(parseCode('A?x3')).toBeInstanceOf(Error);
    expect(parseCode('G')).toBeInstanceOf(Error);
    expect(parseCode('Z')).toBeInstanceOf(Error);
    expect(parseCode('G2')).toBeInstanceOf(Error);
    expect(parseCode('>G3')).toBeInstanceOf(Error);
  });

  it('M′ accepts exactly where M halts', () => {
    fc.assert(
      fc.property(programArb, wordArb, (prog, word) => {
        const m = runProgram(prog, word).outcome;
        const prime = runProgram(acceptOnHalt(prog), word).outcome;
        expect(prime === 'accept').toBe(halts(m));
        expect(prime).not.toBe('reject');
      }),
      { numRuns: 1000 },
    );
  });

  it('settles every cell of the family well inside the cap', () => {
    for (let i = 0; i < MAX_SIZE; i++)
      for (let j = 0; j < MAX_SIZE; j++) {
        const r = cell(i, j);
        expect(r.outcome, `M${i + 1} on ⟨M${j + 1}⟩`).not.toBe('unknown');
        expect(r.trace.length).toBeLessThan(CAP / 10);
      }
  });
});

describe('the table', () => {
  it('matches a direct run of the toy program in every cell, for every size and setting', () => {
    for (const framing of framings)
      for (const size of sizes) {
        const t = new Timeline(def, settings(framing, size), 1, [['build']]);
        const end = t.endState();
        expect(end.n).toBe(size);
        const shapes = def.view(t.at(t.length - 1).step, settings(framing, size)).shapes;
        for (let i = 0; i < size; i++)
          for (let j = 0; j < size; j++) {
            expect(end.shown[i]![j]).toBe(true);
            const ref = reference(PROGRAMS[i]!.prog, PROGRAMS[j]!.code);
            expect(cell(i, j).outcome).toBe(ref.outcome);
            expect(textOf(shapes, `val-${i}-${j}`)).toBe(cellLabel(ref.outcome, framing));
          }
      }
  });

  it('gives D a row that differs from every row on the diagonal, for every size and setting', () => {
    for (const framing of framings)
      for (const size of sizes) {
        const s = settings(framing, size);
        const t = new Timeline(def, s, 1, [['build'], ['diagonalize'], ['contradict']]);
        const end = t.endState();
        expect(end.d.every(Boolean)).toBe(true);
        expect(end.dd).toBe('done');
        const shapes = def.view(t.at(t.length - 1).step, s).shapes;
        const row = dWords(size, framing);
        for (let i = 0; i < size; i++) {
          expect(differs(i, framing), `D against M${i + 1}`).toBe(true);
          // D's row is the opposite of the diagonal, cell by cell, as drawn.
          const drawn = textOf(shapes, `d-${i}-t`);
          expect(drawn).toBe(cellLabel(dOutcome(cell(i, i).outcome, framing), framing));
          expect(drawn).not.toBe(textOf(shapes, `val-${i}-${i}`));
          expect(row[i]).toBe(
            framing === 'halt' ? (halts(cell(i, i).outcome) ? 'loop' : 'halt') : drawn,
          );
        }
      }
  });

  it('answers every cell the same way through the reduction as directly', () => {
    for (const framing of framings) {
      const s = settings(framing, MAX_SIZE);
      const t = new Timeline(def, s, 1, [['reduce']]);
      const end = t.endState();
      for (let i = 0; i < MAX_SIZE; i++)
        for (let j = 0; j < MAX_SIZE; j++) {
          expect(end.reduced[i]![j]).toBe(true);
          const o = cell(i, j).outcome;
          // S says accept exactly when Mi accepts; R (via M′) says halts exactly when Mi halts.
          if (framing === 'atm')
            expect(reducedLabel(i, j, framing)).toBe(o === 'accept' ? 'acc' : 'rej');
          else expect(primeCell(i, j).outcome === 'accept').toBe(halts(o));
        }
    }
  });
});

const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  fc.constantFrom<OpCall>(['build'], ['diagonalize'], ['contradict'], ['reduce']),
  fc
    .tuple(fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 7 }))
    .map(([i, j]): OpCall => ['run', i, j]),
);

describe('every step', () => {
  it('keeps its invariants under random operations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...framings),
        fc.constantFrom(...sizes),
        fc.array(callArb, { maxLength: 8 }),
        (framing, size, calls) => {
          const s = settings(framing, size);
          const t = new Timeline(def, s, 1, calls);
          let prev: HaltState = t.initial.state;
          for (let k = 0; k < t.length; k++) {
            const { step } = t.at(k);
            const st = step.state;
            const n = st.n;
            expect(n).toBe(size);
            for (let i = 0; i < n; i++) {
              // Cells are never hidden again once run.
              for (let j = 0; j < n; j++) {
                if (prev.shown[i]![j]) expect(st.shown[i]![j]).toBe(true);
                if (st.reduced[i]![j]) expect(st.shown[i]![j]).toBe(true);
              }
              // D's entry i comes from the diagonal cell (i, i), so that cell has been run.
              if (st.d[i]) expect(st.shown[i]![i]).toBe(true);
            }
            if (st.dd !== 'none') expect(st.d.every(Boolean)).toBe(true);
            if (st.run) {
              expect(st.run.i).toBeLessThan(n);
              expect(st.run.j).toBeLessThan(n);
              expect(st.run.step).toBeLessThanOrEqual(cell(st.run.i, st.run.j).trace.length);
            }
            const shapes = def.view(step, s).shapes;
            for (let i = 0; i < n; i++)
              for (let j = 0; j < n; j++) {
                const want = !st.shown[i]![j]
                  ? undefined
                  : st.reduced[i]![j]
                    ? reducedLabel(i, j, framing)
                    : cellLabel(cell(i, j).outcome, framing);
                expect(textOf(shapes, `val-${i}-${j}`)).toBe(want);
              }
            expect(step.vars?.filled).toBe(`${st.shown.flat().filter(Boolean).length} of ${n * n}`);
            prev = st;
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('walks a run one line at a time, ending where the run ends', () => {
    for (let i = 0; i < MAX_SIZE; i++)
      for (let j = 0; j < MAX_SIZE; j++) {
        const t = new Timeline(def, settings('atm', MAX_SIZE), 1, [['run', i + 1, j + 1]]);
        const steps = t.entries[0]!.steps;
        const r = cell(i, j);
        // A start step, one per line run before the end, and the end.
        const runs = r.outcome === 'loop' ? r.steps : r.steps - 1;
        expect(steps.length).toBe(runs + 2);
        const end = t.endState().run!;
        expect(end.done).toBe(r.outcome);
        expect(end.step).toBe(r.steps);
        steps.slice(1, -1).forEach((st, k) => expect(st.state.run!.step).toBe(k + 1));
      }
  });
});

describe('input and presets', () => {
  it('reads program numbers and refuses anything else', () => {
    expect(parseProgram('3')).toBe(3);
    expect(parseProgram(' M6 ')).toBe(6);
    expect(parseProgram('m1')).toBe(1);
    for (const bad of ['0', '7', 'x', '3 2', '', 'M'])
      expect(parseProgram(bad)).toBeInstanceOf(Error);
  });

  it('explains a run outside the table', () => {
    const t = new Timeline(def, settings('atm', 4), 1, [
      ['run', 6, 1],
      ['run', 'cat', 2],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toContain('M6 is not in this table');
    expect(t.entries[1]!.steps[0]!.say).toContain('Run needs two program numbers');
    expect(t.endState()).toEqual(t.initial.state);
  });

  it('offers presets that suit every size and setting', () => {
    for (const framing of framings)
      for (const size of sizes)
        for (const p of def.controls.presets ?? []) {
          const s = settings(framing, size);
          const calls = p.make(makeRng(5), 5, s);
          expect(calls.length, p.label).toBeGreaterThan(0);
          const t = new Timeline(def, s, 1, calls);
          for (const e of t.entries) expect(e.steps.length, p.label).toBeGreaterThan(1);
        }
  });
});
