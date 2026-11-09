import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { run as runKit } from '../_turing/machine';
import cppSource from './code/cpp/busy_beaver.hpp?raw';
import javaSource from './code/java/BusyBeaver.java?raw';
import pythonSource from './code/python/busy_beaver.py?raw';
import fourStates from './examples/four-states.json';
import loops from './examples/loops.json';
import mostMoves from './examples/most-moves.json';
import mostOnes from './examples/most-ones.json';
import haltsAtOnce from './examples/halts-at-once.json';
import oneBitOff from './examples/one-bit-off.json';
import twoStates from './examples/two-states.json';
import walksAway from './examples/walks-away.json';
import explain from './explain.md?raw';
import {
  CHAMPIONS,
  HALT,
  formatMachine,
  kitMachine,
  parseMachine,
  stateLetter,
  type BbMachine,
  type BbRule,
} from './machines';
import {
  CAP,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  moveCount,
  ones,
  ops,
  pseudocode,
  stateOf,
  type BbExtra,
  type BbSettings,
  type BbState,
} from './model';
import { bbPractice } from './practice';
import { view } from './view';

/** The input box: a machine (or a champion's name) for Load, or a number for Run moves. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t)
    return new Error(
      'Type a machine such as 1RB1LB_1LA1RH, a champion such as bb3, or a number of moves.',
    );
  if (/^\d+$/.test(t)) {
    const n = moveCount(t);
    return n instanceof Error ? n : n;
  }
  const m = parseMachine(t);
  return m instanceof Error ? m : t;
}

/**
 * A random n-state machine with one rule into H, as the champions have: every other rule
 * writes a random bit, moves a random way and goes to a random working state.
 */
export function randomMachine(rng: Rng, n: number): BbMachine {
  const states = Array.from({ length: n }, (_, i) => stateLetter(i));
  const halt = rng.int(1, 2 * n - 1);
  const table: BbMachine['table'] = {};
  states.forEach((q, i) => {
    const rule = (k: number): BbRule => ({
      write: rng.int(0, 1) ? '1' : '0',
      move: rng.int(0, 1) ? 'R' : 'L',
      next: k === halt ? HALT : states[rng.int(0, n - 1)]!,
    });
    table[q] = [rule(2 * i), rule(2 * i + 1)];
  });
  // A0 should not halt at once, or there is nothing to watch.
  if (table.A![0]!.next === HALT) table.A![0] = { write: '1', move: 'R', next: states[n - 1]! };
  return { states, table };
}

/** Moves a machine makes from a blank tape before it halts, or null if it runs past `cap`. */
export function haltsAfter(m: BbMachine, cap = CAP): number | null {
  const r = runKit(kitMachine(m), '', 'two-way', cap);
  return r.outcome === 'accept' ? r.config.moves : null;
}

/** A random n-state machine that halts after at least n + 1 moves (the champion if none turns up). */
export function randomHalter(rng: Rng, n: number): BbMachine {
  for (let i = 0; i < 300; i++) {
    const m = randomMachine(rng, n);
    const k = haltsAfter(m, 200);
    if (k !== null && k > n) return m;
  }
  return parseMachine(CHAMPIONS.find((c) => c.states === n)!.text) as BbMachine;
}

/** Each state moves right to the next and writes 1: it walks away forever, the 1s piling up. */
export function walker(n: number): string {
  return Array.from({ length: n }, (_, i) => `1R${stateLetter((i + 1) % n)}---`).join('_');
}

const champion = (n: number) => CHAMPIONS.find((c) => c.states === n)!.name;

export const busyBeaver: VizDef<BbState, BbSettings, BbExtra> = {
  id: 'busy-beaver',
  title: 'Busy beaver',
  family: 'Automata and computability',
  blurb:
    'The Turing machines with n states that run longest before they halt. Watch the 2-, 3- and 4-state champions fill a blank tape, and see why no program can compute the record.',
  settings: [
    {
      kind: 'choice',
      key: 'rules',
      label: 'Show the rules as',
      options: [
        { value: 'table', label: 'A table, as the busy beaver papers do' },
        { value: 'diagram', label: 'A state diagram, as Sipser draws machines' },
      ],
      help: 'Only the picture changes. The table writes each rule as 1RB: write 1, move right, go to B. The diagram labels an arrow 0→1R for "read 0, write 1, move right". Machines with 5 states keep the table.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Machine or moves',
      placeholder: 'e.g. bb3, 1RB1LB_1LA1RH, or 50',
      maxLength: 60,
      sample: 'bb3',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Run', usesInput: false },
      { op: 'step', label: 'Step', usesInput: false },
      { op: 'steps', label: 'Run moves', usesInput: true },
      { op: 'reset', label: 'Reset', usesInput: false },
    ],
    presets: [
      {
        label: 'The champion with this many states',
        make: (_rng, size) => [['load', champion(size)], ['run']],
      },
      {
        label: 'A random machine that halts',
        make: (rng, size) => [['load', formatMachine(randomHalter(rng, size))], ['run']],
      },
      {
        label: 'A random machine (it may never halt)',
        make: (rng, size) => [['load', formatMachine(randomMachine(rng, size))], ['run']],
      },
      {
        label: 'A machine that walks away forever',
        make: (_rng, size) => [
          ['load', walker(size)],
          ['steps', 30],
        ],
      },
      {
        label: 'The 3-state champion for moves',
        make: () => [['load', 'bb3s'], ['run']],
      },
    ],
    sizes: [2, 3, 4],
  },
  explain,
  complexity: [
    {
      op: 'One move',
      best: {
        cost: 'Θ(1)',
        why: 'Look up δ(q, a), write one cell, move one cell.',
        example: 'two-states',
      },
      average: { cost: 'Θ(1)', why: 'Every move does the same three things.' },
      worst: {
        cost: 'Θ(1)',
        why: 'Even a machine that never halts makes each move in constant time.',
        example: 'walks-away',
      },
    },
    {
      op: 'Run an n-state machine from a blank tape',
      best: {
        cost: 'Θ(1)',
        why: 'A rule like A0 → 1RH halts on the first move.',
        example: 'halts-at-once',
      },
      average: {
        cost: 'small, or forever',
        why: 'Most random machines halt within a few moves or never halt at all.',
        example: 'loops',
      },
      worst: {
        cost: 'S(n) moves',
        why: 'The champion: 6, 21, 107 and 47,176,870 moves for n = 2 to 5, and no computable bound.',
        example: 'four-states',
      },
      note: 'A run that halts takes at most S(n) moves, by definition. The catch is that you cannot compute S(n), so you cannot use it as a timer.',
    },
    {
      op: 'Find Σ(n) by trying every machine',
      best: {
        cost: '(4n + 4)^(2n) machines',
        why: 'Each of the 2n rules has 2 bits × 2 moves × (n + 1) next states: 20,736 machines for n = 2.',
        example: 'two-states',
      },
      average: {
        cost: 'each run up to S(n)',
        why: 'You only know a machine halts by running it until it does.',
        example: 'most-ones',
      },
      worst: {
        cost: 'not computable',
        why: 'To finish, you must prove every other machine never halts. No program can do that for every n.',
        example: 'walks-away',
      },
      note: 'Σ(5) = 4,098 and S(5) = 47,176,870 were proved in 2024 by settling all 5-state machines, many by hand-written proofs checked in Coq.',
    },
  ],
  practice: bbPractice(() => busyBeaver),
  preview: { example: 'most-moves', level: 2, hide: ['rule', 'count-', 'status'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BbSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twoStates,
    mostOnes,
    mostMoves,
    fourStates,
    oneBitOff,
    haltsAtOnce,
    loops,
    walksAway,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "load <machine>" (prints nothing) loads a machine in the
 * compact form on a blank tape; "reset" (prints nothing) clears the tape; "run <k>" makes up to k
 * tries at a move, stopping once it halts (a try on a missing rule halts it without a move), and
 * prints "<state> <moves> <ones>", with H once halted. Each Step, Run and Run moves becomes
 * "run k", k the tries the model made, so a run the page stops on a repeated configuration
 * matches too.
 */
function codeScript(calls: OpCall[], settings: BbSettings) {
  const t = new Timeline(busyBeaver, settings, 1, calls);
  let machine = t.initial.state.machine;
  const input = [`load ${formatMachine(machine)}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const [op] = e.call;
    const end = e.end;
    if (op === 'load' && end.machine !== machine) {
      machine = end.machine;
      input.push(`load ${formatMachine(machine)}`);
    } else if (op === 'reset') input.push('reset');
    else if (op === 'run' || op === 'step' || (op === 'steps' && end !== before)) {
      const stuck = end.halted === 'none' && before.halted !== 'none' ? 1 : 0;
      input.push(`run ${end.config.moves - before.config.moves + stuck}`);
      expected.push(`${stateOf(end)} ${end.config.moves} ${ones(end.config)}`);
    }
    before = end;
  }
  return { input, expected };
}

export default busyBeaver;
