import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import type { Shape } from '../../render/scene';
import { BLANK, CAP, formatConfig, parseMachine, type Machine } from '../_turing/machine';
import { parseInput, turingMachine } from '.';
import { ADD, COPY, FLIP, INCREMENT, PALINDROME, WALK, ZERO_ONE } from './machines';
import { LOOPY } from './practice';
import type { TmSettings } from './model';
import { fitLine } from '../../layouts/trace';
import { arrowLabel, diagramOf, view } from './view';
import { LAPTOP_STAGE, PHONE_STAGE, TYPICAL_STAGES } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (s: Partial<TmSettings> = {}): TmSettings =>
  ({ ...turingMachine.defaults, ...s }) as TmSettings;
const timeline = (calls: OpCall[], s: Partial<TmSettings> = {}) =>
  new Timeline(turingMachine, settings(s), 1, calls);
const last = (t: ReturnType<typeof timeline>) => t.entries.at(-1)!.steps.at(-1)!;

/**
 * A reference simulator written from the definition, independent of the model: the tape is a
 * map from cell to symbol, the rules a map from "state symbol" to an action.
 */
function reference(text: string, word: string, twoWay: boolean) {
  const delta = new Map<string, [string, string, string]>();
  let start: string | undefined;
  for (const item of text.split(';')) {
    const [from, reads, , to, ...rest] = item.trim().split(/\s+/);
    for (const a of reads!.split(','))
      delta.set(`${from} ${a}`, [to!, rest.length === 2 ? rest[0]! : a, rest.at(-1)!]);
    start ??= from;
  }
  const tape = new Map([...word].map((a, i) => [i, a]));
  let q = start!;
  let head = 0;
  let moves = 0;
  let outcome = 'running';
  for (;;) {
    if (q === 'accept' || q === 'reject') {
      outcome = q;
      break;
    }
    const rule = delta.get(`${q} ${tape.get(head) ?? BLANK}`);
    if (!rule) {
      outcome = 'reject';
      break;
    }
    if (moves === CAP) break;
    const [to, write, move] = rule;
    tape.set(head, write);
    head += move === 'R' ? 1 : move === 'L' ? -1 : 0;
    if (!twoWay) head = Math.max(0, head);
    q = to;
    moves++;
  }
  const filled = [...tape].filter(([, a]) => a !== BLANK).map(([i]) => i);
  const lo = Math.min(...filled);
  const hi = Math.max(...filled);
  const span = filled.length
    ? Array.from({ length: hi - lo + 1 }, (_, k) => tape.get(lo + k) ?? BLANK).join('')
    : '';
  return { outcome, moves, head, span, first: filled.length ? lo : 0 };
}

const stateArb = fc.constantFrom('q0', 'q1', 'q2');
const symArb = fc.constantFrom('0', '1', 'x', BLANK);
const ruleArb = (stay: boolean) =>
  fc.record({
    from: stateArb,
    read: symArb,
    to: fc.oneof(stateArb, fc.constantFrom('accept', 'reject')),
    write: symArb,
    move: stay ? fc.constantFrom('L', 'R', 'S') : fc.constantFrom('L', 'R'),
  });

function machineText(
  rules: { from: string; read: string; to: string; write: string; move: string }[],
) {
  const seen = new Set<string>();
  return rules
    .filter((r) =>
      seen.has(`${r.from}${r.read}`) ? false : (seen.add(`${r.from}${r.read}`), true),
    )
    .map((r) => `${r.from} ${r.read} -> ${r.to} ${r.write} ${r.move}`)
    .join('; ');
}

describe('Turing machine page', () => {
  it('matches a reference simulator on random machines and words, with sound steps', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('one-way' as const, 'two-way' as const),
        fc.constantFrom('LR' as const, 'LRS' as const),
        fc.array(ruleArb(true), { minLength: 1, maxLength: 12 }),
        fc.stringMatching(/^[01x]{0,6}$/),
        (tape, movesSetting, rawRules, word) => {
          const rules = rawRules.map((r) =>
            movesSetting === 'LR' && r.move === 'S' ? { ...r, move: 'R' } : r,
          );
          const text = machineText(rules);
          const st = settings({ tape, moves: movesSetting });
          const t = new Timeline(turingMachine, st, 1, [
            ['load', text],
            ['run', word || 'ε'],
          ]);
          const run = t.entries[1]!;
          const end = run.end.config!;
          const ref = reference(text, word, tape === 'two-way');
          const capped = !!run.steps.at(-1)!.extra?.capped;
          expect(capped ? 'running' : end.state).toBe(ref.outcome);
          expect(end.moves).toBe(ref.moves);
          expect(end.head).toBe(ref.head);
          expect(end.cells.join('')).toBe(ref.span);
          expect(end.first).toBe(ref.first);
          // One step for the start, one per move, and one for a halt without a move.
          const extra = capped || run.steps.at(-1)!.extra?.stuck ? 1 : 0;
          expect(run.steps.length).toBe(1 + end.moves + extra);
          let prev = -1;
          for (const s of run.steps) {
            const c = s.state.config!;
            expect(c.moves - prev).toBeLessThanOrEqual(1);
            prev = c.moves;
            expect(s.vars).toEqual({
              state: c.state,
              head: c.head,
              moves: c.moves,
              'cells used': c.hi - c.lo + 1,
            });
            expect(c.lo).toBeLessThanOrEqual(c.head);
            expect(c.head).toBeLessThanOrEqual(c.hi);
            if (tape === 'one-way') expect(c.head).toBeGreaterThanOrEqual(0);
            if (c.cells.length) {
              expect(c.cells[0]).not.toBe(BLANK);
              expect(c.cells.at(-1)).not.toBe(BLANK);
            }
            const line = s.state.trace.at(-1)!;
            const text = line.u ? `${line.u} ${line.q} ${line.v}` : `${line.q} ${line.v}`;
            expect(text).toBe(formatConfig(c, tape, 16));
            expect(s.state.trace.length).toBeLessThanOrEqual(6);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('decides 0ⁿ1ⁿ and says how it ended', () => {
    const t = timeline([
      ['load', ZERO_ONE],
      ['run', '000111'],
      ['run', '0010'],
    ]);
    const yes = t.entries[1]!.steps.at(-1)!;
    expect(yes.say).toMatch(/accepts 000111 after 25 moves/);
    expect(yes.marks).toContainEqual({ id: 'status', role: 'found' });
    const no = last(t);
    expect(no.say).toMatch(/q1 reads a blank, and no rule covers that/);
    expect(no.lines).toEqual(['move.read', 'move.none', 'run.halt']);
    expect(no.marks).toContainEqual({ id: 'rule-q1-_', role: 'error' });
  });

  it('stops at the cap and says why', () => {
    const t = timeline([['load', 'q0 0,1,_ -> q0 R'], ['run', '01'], ['step']]);
    const capped = t.entries[1]!.steps.at(-1)!;
    expect(capped.say).toContain(
      'Still running after 500 moves: it may never halt, and no program can tell in general. That is the halting problem.',
    );
    expect(capped.lines).toEqual(['run.cap']);
    expect(t.entries[1]!.steps).toHaveLength(502);
    expect(t.endState().config!.moves).toBe(501);
  });

  it('flips a cell forever with S moves, and refuses S without the setting', () => {
    const t = timeline(
      [
        ['load', FLIP],
        ['run', '0'],
      ],
      { moves: 'LRS' },
    );
    expect(last(t).extra?.capped).toBe(true);
    expect(t.endState().config!.hi).toBe(0);
    const off = timeline([['load', FLIP]]);
    expect(last(off).say).toMatch(/^Nothing loaded\. .* stays put \(S\)/);
    expect(off.endState().machine.states).toEqual(['q0', 'q1', 'q2', 'q3']);
  });

  it('keeps the head on cell 0 of a one-way tape and goes left of it on a two-way tape', () => {
    const one = timeline([
      ['load', INCREMENT],
      ['run', '111'],
    ]);
    expect(one.endState().config!.cells.join('')).toBe('100');
    expect(one.entries[1]!.steps.some((s) => /stays there/.test(s.say))).toBe(true);
    const two = timeline(
      [
        ['load', INCREMENT],
        ['run', '111'],
      ],
      { tape: 'two-way' },
    );
    expect(two.endState().config!.cells.join('')).toBe('1000');
    expect(two.endState().config!.first).toBe(-1);
    // The view shows the symbol left of cell 0.
    const scene = view(two.at(two.length - 1).step, settings({ tape: 'two-way' }));
    const cell = scene.shapes.find((s) => s.id === 'tape--1-t') as { text: string };
    expect(cell.text).toBe('1');
  });

  it('steps one move at a time after Start, and refuses to step past a halt', () => {
    const t = timeline([['load', PALINDROME], ['step'], ['start', '010'], ['step'], ['step']]);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/no word on the tape yet/);
    expect(t.endState().config!.moves).toBe(2);
    expect(t.endState().trace.map((l) => l.moves)).toEqual([0, 1, 2]);
    const done = timeline([['load', PALINDROME], ['run', '0'], ['step']]);
    expect(last(done).say).toMatch(/already halted in accept/);
  });

  it('refuses words and machines it cannot read, and leaves everything as it was', () => {
    const t = timeline([
      ['run', '0_1'],
      ['load', 'q0 1 q1'],
      ['start', 'q0 1 -> q1 R'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/^Nothing run\. .*blank/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/^Nothing loaded\. "q0 1 q1" is not a rule/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/looks like rules/);
    expect(t.endState()).toEqual(t.initial.state);
    expect(parseInput('0011')).toBe('0011');
    expect(parseInput('q0 0 -> q1 R; q1 0 -> q1 S')).toBe('q0 0 -> q1 R; q1 0 -> q1 S');
    expect(parseInput('q0 0 -> q1 Q')).toBeInstanceOf(Error);
    expect(parseInput('0?')).toBeInstanceOf(Error);
  });

  it('makes the pseudocode follow the settings', () => {
    const lines = (s: Partial<TmSettings>) =>
      turingMachine.pseudocode(settings(s)).find((b) => b.op === 'run')!.lines;
    expect(lines({}).some((l) => l.id === 'move.stay')).toBe(false);
    expect(lines({ moves: 'LRS' }).some((l) => l.id === 'move.stay')).toBe(true);
    const left = (s: Partial<TmSettings>) => lines(s).find((l) => l.id === 'move.left')!.text;
    expect(left({})).toContain('max(0, head − 1)');
    expect(left({ tape: 'two-way' })).toBe('if D = L: head = head − 1');
  });

  it('keeps the tape window still through stretches of a run', () => {
    const shifts = (machine: string, word: string, stage: { w: number; h: number }) => {
      const steps = timeline([
        ['load', machine],
        ['run', word],
      ]).entries[1]!.steps;
      const firstCell = (i: number) =>
        Math.min(
          ...view(steps[i]!, settings(), stage)
            .shapes.filter((s: Shape) => /^tape-\d+$/.test(s.id))
            .map((s) => Number(s.id.slice(5))),
        );
      return {
        moves: steps.length,
        shifts: steps.slice(1).filter((_, i) => firstCell(i + 1) !== firstCell(i)).length,
      };
    };
    // Everything the copy touches fits a wide stage's window: it never moves.
    expect(shifts(COPY, '0110', LAPTOP_STAGE).shifts).toBe(0);
    // A machine that walks off the window moves it half a window at a time.
    const walk = shifts('q0 0,1,_ -> q0 R', '01', PHONE_STAGE);
    expect(walk.shifts).toBeGreaterThan(0);
    expect(walk.shifts).toBeLessThanOrEqual(walk.moves / 5 + 1);
  });

  it('puts the table beside the tape on a wide stage and under it on a phone', () => {
    const t = timeline([
      ['load', ZERO_ONE],
      ['run', '0011'],
    ]);
    const step = t.at(3).step;
    const at = (stage?: { w: number; h: number }) => {
      const s = view(step, settings(), stage).shapes;
      const title = s.find((x) => x.id === 'rule-title') as { x: number; y: number };
      const status = s.find((x) => x.id === 'status') as { y: number };
      return { beside: title.x > 200, under: title.y > status.y };
    };
    expect(at(LAPTOP_STAGE)).toEqual({ beside: true, under: false });
    expect(at(PHONE_STAGE)).toEqual({ beside: false, under: true });
  });

  it("labels the diagram's arrows as Sipser does", () => {
    const a = diagramOf(parseMachine(ZERO_ONE) as Machine);
    const label = (p: string, q: string) => a.moves.find((m) => m.from === p && m.to === q)!.on;
    expect(label('q1', 'q1')).toBe('0,y→R');
    expect(label('q1', 'q2')).toBe('1→y,L');
    expect(label('q0', 'accept')).toBe('␣→R');
    expect(a.states).toEqual(['q0', 'q1', 'q2', 'q3', 'accept']);
    expect(arrowLabel((parseMachine(COPY) as Machine).rules.filter((r) => r.to === 'accept'))).toBe(
      '#→R ␣→#,R',
    );
  });

  it('marks drawn shapes in either picture of the rules, on any stage', () => {
    const words: [string, string, Partial<TmSettings>][] = [
      [ZERO_ONE, '0010', {}],
      [PALINDROME, '0110', {}],
      [COPY, '01', {}],
      [ADD, '1+1', {}],
      [INCREMENT, '111', { tape: 'two-way' }],
      [LOOPY, '0101', {}],
      [WALK, '0', {}],
      [FLIP, '0', { moves: 'LRS' }],
    ];
    for (const rules of ['table', 'diagram'] as const)
      for (const [machine, word, more] of words) {
        const st = settings({ ...more, rules });
        const t = new Timeline(turingMachine, st, 1, [
          ['load', machine],
          ['run', word],
        ]);
        for (let i = 0; i < t.length; i += 7)
          for (const stage of [undefined, ...TYPICAL_STAGES]) {
            const { step } = t.at(i);
            const ids = new Set(view(step, st, stage).shapes.map((s) => s.id));
            for (const m of step.marks) expect(ids, `${rules} ${word}: ${m.id}`).toContain(m.id);
          }
      }
  });

  it('cuts long configurations around the head', () => {
    expect(fitLine({ parts: ['0000000000', 'q1', '1111111111'] }, 14)).toBe('…0000 q1 1111…');
    expect(fitLine({ parts: ['', 'q0', '01'] }, 14)).toBe('q0 01');
    // With nothing left of the head, the right side gets all the room.
    expect(fitLine({ parts: ['', 'q0', '0123456789abcdef'] }, 14)).toBe('q0 0123456789…');
  });
});

describe('drawn text size', () => {
  // On a phone a long chain of states runs across, a little tighter, under the tape and trace.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(turingMachine, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(turingMachine, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
