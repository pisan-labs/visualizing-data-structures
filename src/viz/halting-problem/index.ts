import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/halting.hpp?raw';
import javaSource from './code/java/Halting.java?raw';
import pythonSource from './code/python/halting.py?raw';
import cycleCheck from './examples/cycle-check.json';
import diagonalOnly from './examples/diagonal-only.json';
import flipReject from './examples/flip-reject.json';
import haltingVersion from './examples/halting-version.json';
import lateHalter from './examples/late-halter.json';
import reduction from './examples/reduction.json';
import sixPrograms from './examples/six-programs.json';
import theTable from './examples/the-table.json';
import wholeArgument from './examples/whole-argument.json';
import explain from './explain.md?raw';
import {
  clampSize,
  defaults,
  describe,
  dWords,
  init,
  initialSay,
  initialVars,
  ops,
  programIndex,
  pseudocode,
  type HaltExtra,
  type HaltSettings,
  type HaltState,
} from './model';
import { haltingPractice } from './practice';
import { MAX_SIZE, PROGRAMS, cell, primeCell, type RunResult } from './toy';
import { view } from './view';

/** The input box: program numbers, as Run takes them ("3 2" runs M3 on ⟨M2⟩). */
export function parseProgram(token: string): Value | Error {
  const t = token.trim();
  const k = programIndex(t);
  if (k === null)
    return new Error(
      `"${t}" is not a program number. Type two numbers from 1 to ${MAX_SIZE}, such as 3 2 to run M3 on ⟨M2⟩.`,
    );
  return k + 1;
}

const settingsOf = (s?: Settings): HaltSettings => ({ ...defaults, ...(s as HaltSettings) });

/** Every cell of a table of this size, row by row. */
function cells(size: number): [number, number][] {
  const n = clampSize(size);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([i, j]);
  return out;
}

const runCall = ([i, j]: [number, number]): OpCall => ['run', i + 1, j + 1];

function pick<T>(rng: Rng, xs: T[]): T {
  return xs[rng.int(0, xs.length - 1)]!;
}

export const haltingProblem: VizDef<HaltState, HaltSettings, HaltExtra> = {
  id: 'halting-problem',
  title: 'The halting problem',
  family: 'Automata and computability',
  blurb:
    'Why no Turing machine decides halting: a table of programs against their descriptions, a machine D that flips the diagonal, and what D does on its own description.',
  settings: [
    {
      kind: 'choice',
      key: 'framing',
      label: 'The problem',
      options: [
        { value: 'atm', label: 'A_TM: does M accept w? (Sipser)' },
        { value: 'halt', label: 'HALT: does M halt on w?' },
      ],
      help: 'Sipser runs the diagonal argument on A_TM, where D always halts, and gets HALT by a reduction. Many courses run it on HALT directly, where D loops wherever Mi halts.',
    },
    {
      kind: 'number',
      key: 'size',
      label: 'Programs in the table',
      min: 4,
      max: MAX_SIZE,
      help: 'The toy programs M1 to M6. The argument is the same for any number; the real table of all Turing machines never ends.',
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
      label: 'Program and input',
      placeholder: 'e.g. 3 2 runs M3 on ⟨M2⟩',
      maxLength: 12,
      sample: '3',
      parse: parseProgram,
    },
    buttons: [
      { op: 'build', label: 'Build table', usesInput: false },
      { op: 'diagonalize', label: 'Diagonalize', usesInput: false },
      { op: 'contradict', label: 'D on ⟨D⟩', usesInput: false },
      {
        op: 'run',
        label: 'Run',
        usesInput: true,
        primary: true,
        args: ['a program', 'an input'],
      },
      { op: 'reduce', label: 'Reduce', usesInput: false, more: true },
    ],
    presets: [
      { label: 'The whole argument', make: () => [['build'], ['diagonalize'], ['contradict']] },
      { label: 'The table only', make: () => [['build']] },
      { label: 'Straight to the diagonal', make: () => [['diagonalize'], ['contradict']] },
      {
        label: 'Run a random cell',
        make: (rng, _size, s) => [runCall(pick(rng, cells(settingsOf(s).size)))],
      },
      {
        label: 'Run a cell that loops',
        make: (rng, _size, s) => {
          const loops = cells(settingsOf(s).size).filter(([i, j]) => cell(i, j).outcome === 'loop');
          return [runCall(pick(rng, loops))];
        },
      },
      {
        label: 'The longest run in the table',
        make: (_rng, _size, s) => {
          const all = cells(settingsOf(s).size);
          const steps = (c: [number, number]) => cell(c[0], c[1]).steps;
          return [runCall(all.reduce((a, b) => (steps(b) > steps(a) ? b : a)))];
        },
      },
      { label: 'The reduction', make: () => [['build'], ['reduce']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Fill one cell: run Mi on ⟨Mj⟩ (L lines, a description of m symbols)',
      best: {
        cost: 'O(1)',
        why: 'M1 accepts on its first line, whatever it reads.',
        example: 'the-table',
      },
      average: {
        cost: 'O(L·m)',
        why: 'Each step is O(1) with a table of seen configurations, and there are only L·(m + 1) of them.',
        example: 'cycle-check',
      },
      worst: {
        cost: 'Θ(L·m)',
        why: 'A run can pass through almost every configuration first: M6 on ⟨M5⟩ takes 40 steps.',
        example: 'late-halter',
      },
      note: 'Only because toy programs never write. A Turing machine’s configurations include its tape, so there is no such bound.',
    },
    {
      op: 'Build the table (n programs)',
      best: {
        cost: 'Θ(n²)',
        why: 'At least one step per cell, and there are n² cells.',
        example: 'the-table',
      },
      average: {
        cost: 'O(n²·L·m)',
        why: 'n² runs, each bounded by its number of configurations.',
        example: 'whole-argument',
      },
      worst: {
        cost: 'Θ(n²·L·m)',
        why: 'Every run as long as it can be, as for programs that walk the whole description.',
        example: 'six-programs',
      },
    },
    {
      op: 'Diagonalize: D’s row',
      best: {
        cost: 'n questions to H',
        why: 'D needs only the diagonal: one cell per row.',
        example: 'diagonal-only',
      },
      average: {
        cost: 'n questions to H',
        why: 'The rest of the table never matters to D.',
        example: 'whole-argument',
      },
      worst: {
        cost: 'n questions to H',
        why: 'The cost of D is H’s cost. For Turing machines no H exists, so there is no cost to give.',
        example: 'halting-version',
      },
    },
    {
      op: 'Decide whether a Turing machine halts on w',
      best: {
        cost: 'finite, if it halts',
        why: 'Simulate it. If it halts, the simulation finds out, after as many steps as it took.',
        example: 'cycle-check',
      },
      average: {
        cost: 'no bound',
        why: 'Halting machines of a given size can run longer than any computable function of the size.',
        example: 'late-halter',
      },
      worst: {
        cost: 'impossible',
        why: 'No algorithm answers for every machine and input: that is the diagonal argument.',
        example: 'whole-argument',
      },
      note: 'HALT is recognizable (simulate, and accept when it halts), but not decidable.',
    },
  ],
  practice: haltingPractice(() => haltingProblem),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settingsOf(settings)),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    theTable,
    wholeArgument,
    diagonalOnly,
    haltingVersion,
    sixPrograms,
    cycleCheck,
    lateHalter,
    reduction,
    flipReject,
  ] as unknown as SavedExample[],
  preview: {
    example: 'whole-argument',
    level: 1,
    hide: ['panel-', 'legend-', 'ln-', 'tape', 'status', 'proof-'],
  },
  opening: 'the-table',
};

/** A run as the drivers print it. */
export function runLine(r: RunResult): string {
  switch (r.outcome) {
    case 'accept':
    case 'reject':
      return `${r.outcome} ${r.steps}`;
    case 'loop':
      return `loop ${r.first} ${r.again}`;
    case 'unknown':
      return 'unknown';
  }
}

/**
 * Driver protocol for the code tabs, one line per run the model made. Programs and inputs are
 * codes, such as E6>E3>G1A:
 *   run <program> <input>              accept <steps> | reject <steps> | loop <first> <again> | unknown
 *   diagonal <atm|halt> <p1> ... <pn>  D: <D's entry for each pi, acc/rej or halt/loop>
 *   reduce <atm|halt> <program> <input>  S: accept|reject (atm), or R: halts|loops (halt)
 * Build runs each new cell, Run its cell, Diagonalize prints D's row, Reduce answers every cell.
 */
function codeScript(calls: OpCall[], settings: HaltSettings) {
  const t = new Timeline(haltingProblem, settings, 1, calls);
  const n = clampSize(settings.size);
  const codes = PROGRAMS.slice(0, n).map((p) => p.code);
  const framing = settings.framing;
  const input: string[] = [];
  const expected: string[] = [];
  const run = (i: number, j: number) => {
    input.push(`run ${codes[i]} ${codes[j]}`);
    expected.push(runLine(cell(i, j)));
  };
  let before = t.initial.state;
  for (const e of t.entries) {
    const [op, a, b] = e.call;
    if (op === 'build')
      for (const [i, j] of cells(n)) if (!before.shown[i]![j] && e.end.shown[i]![j]) run(i, j);
    if (op === 'run') {
      const i = programIndex(a);
      const j = programIndex(b);
      if (i !== null && j !== null && i < n && j < n) run(i, j);
    }
    if (op === 'diagonalize') {
      input.push(`diagonal ${framing} ${codes.join(' ')}`);
      expected.push(`D: ${dWords(n, framing).join(' ')}`);
    }
    if (op === 'reduce')
      for (const [i, j] of cells(n)) {
        input.push(`reduce ${framing} ${codes[i]} ${codes[j]}`);
        expected.push(
          framing === 'halt'
            ? `R: ${primeCell(i, j).outcome === 'accept' ? 'halts' : 'loops'}`
            : `S: ${cell(i, j).outcome === 'accept' ? 'accept' : 'reject'}`,
        );
      }
    before = e.end;
  }
  return { input, expected };
}

export default haltingProblem;
