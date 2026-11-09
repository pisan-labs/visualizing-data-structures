import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { busyBeaver, randomMachine } from '.';
import { CHAMPIONS, formatMachine, parseMachine, type BbMachine } from './machines';
import { CAP, ROWS, defaults, ones, stateOf } from './model';

const timeline = (machine: string, ...calls: [string, ...(string | number)[]][]) =>
  new Timeline(busyBeaver, defaults, 1, [['load', machine], ...calls]);

/** A direct simulation, the reference: a set of cells holding 1. */
function reference(m: BbMachine, limit: number) {
  const tape = new Set<number>();
  let head = 0;
  let q = 'A';
  let moves = 0;
  const trace: { q: string; head: number; ones: number }[] = [];
  while (q !== 'H' && moves < limit) {
    const r = m.table[q]![tape.has(head) ? 1 : 0];
    if (!r) {
      q = 'H';
      break;
    }
    if (r.write === '1') tape.add(head);
    else tape.delete(head);
    head += r.move === 'R' ? 1 : -1;
    q = r.next;
    moves++;
    trace.push({ q, head, ones: tape.size });
  }
  return { q, moves, ones: tape.size, trace };
}

describe('busy beaver', () => {
  it('runs every champion to its record', () => {
    for (const c of CHAMPIONS) {
      const end = timeline(c.name, ['run']).endState();
      expect(stateOf(end), c.name).toBe('H');
      expect(end.config.moves, c.name).toBe(c.moves);
      expect(ones(end.config), c.name).toBe(c.ones);
    }
  });

  it('reads and writes the compact form', () => {
    for (const c of CHAMPIONS)
      expect(formatMachine(parseMachine(c.text) as BbMachine)).toBe(c.text);
    expect(parseMachine('1RB 1LB; 1LA 1RZ')).toEqual(parseMachine('bb2'));
    expect((parseMachine('1RB1LC_1LA1RH') as Error).message).toContain('goes to C');
    expect((parseMachine('1RB1L') as Error).message).toContain('two rules');
  });

  it('stops a machine that comes back to a configuration', () => {
    const t = timeline('0RB1RH_1LA1LA', ['run']);
    const last = t.entries.at(-1)!.steps.at(-1)!;
    expect(last.extra?.repeat).toBe(2);
    expect(last.state.config.moves).toBe(4);
  });

  it('stops a machine that walks away at the cap', () => {
    const t = timeline('1RB---_1RA---', ['run']);
    expect(t.endState().config.moves).toBe(CAP);
    expect(t.entries.at(-1)!.steps.at(-1)!.extra?.capped).toBe(true);
  });

  it('makes Run moves fine detail, every tenth move a normal step', () => {
    const steps = timeline('bb4', ['steps', 25]).entries.at(-1)!.steps;
    expect(steps).toHaveLength(25);
    expect(steps.filter((s) => s.level === 2).map((s) => s.state.config.moves)).toEqual([10, 20]);
    expect(steps.at(-1)!.level).toBe(1);
  });

  it('agrees with a direct simulation, move by move (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), fc.integer({ min: 1, max: 4 }), (seed, n) => {
        const m = randomMachine(makeRng(seed), n);
        const text = formatMachine(m);
        const t = timeline(text, ['steps', 60]);
        const ref = reference(m, 60);
        const end = t.endState();
        expect(stateOf(end), text).toBe(ref.q);
        expect(end.config.moves, text).toBe(ref.moves);
        expect(ones(end.config), text).toBe(ref.ones);
        const moved = t.entries.at(-1)!.steps.filter((s) => s.extra?.used && !s.state.halted);
        moved.forEach((s, k) => {
          const c = s.state.config;
          expect(c.moves).toBe(k + 1);
          expect({ q: c.state, head: c.head, ones: ones(c) }).toEqual(ref.trace[k]);
          expect(c.head).toBeGreaterThanOrEqual(c.lo);
          expect(c.head).toBeLessThanOrEqual(c.hi);
          expect(s.state.rows.length).toBeLessThanOrEqual(ROWS);
          expect(s.state.rows.at(-1)!.n).toBe(c.moves);
        });
      }),
      { numRuns: 150 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = busyBeaver.code!.script(
      [['load', 'bb2'], ['step'], ['run'], ['reset'], ['steps', 3]],
      defaults,
    );
    expect(input).toEqual([
      'load 1RB1LB_1LA1RH',
      'load 1RB1LB_1LA1RH',
      'run 1',
      'run 5',
      'reset',
      'run 3',
    ]);
    expect(expected).toEqual(['B 1 1', 'H 6 4', 'B 3 2']);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(busyBeaver, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(busyBeaver, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
