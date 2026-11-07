import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { randomWord } from '../_automata/random';
import cppSource from './code/cpp/machines.hpp?raw';
import javaSource from './code/java/Machines.java?raw';
import pythonSource from './code/python/machines.py?raw';
import changeDetector from './examples/change-detector.json';
import detect101 from './examples/detect-101.json';
import detect101Once from './examples/detect-101-once.json';
import emptyWord from './examples/empty-word.json';
import mod3 from './examples/mod-3.json';
import noSplit from './examples/no-split.json';
import roundTrip from './examples/round-trip.json';
import sameStates from './examples/same-states.json';
import split from './examples/split.json';
import vending from './examples/vending.json';
import explain from './explain.md?raw';
import {
  formatMachine,
  moveKey,
  parseMachine,
  randomMachine,
  sizeProblem,
  type Kind,
  type Machine,
} from './machine';
import { machine, type MachineName } from './machines';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  looksLike,
  ops,
  pseudocode,
  type MmExtra,
  type MmSettings,
  type MmState,
} from './model';
import { mealyMoorePractice } from './practice';
import { view } from './view';

const loadCall = (m: Machine): OpCall => ['load', formatMachine(m)];
const convert: OpCall = ['convert'];

/** Load a machine, convert it, then run a word of the chosen length on both. */
function preset(label: string, make: (rng: Rng) => Machine): Preset {
  return {
    label,
    make: (rng, size) => {
      const m = make(rng);
      return [loadCall(m), convert, ['run', randomWord(rng, m.fa.alphabet, size) || 'eps']];
    },
  };
}

const named = (name: MachineName) => () => machine(name);
const randomKind = (rng: Rng): Kind => (rng.int(0, 1) ? 'mealy' : 'moore');

const TOKEN = /^(?:[A-Za-z0-9]+|eps|ε)$/;

export const mealyMoore: VizDef<MmState, MmSettings, MmExtra> = {
  id: 'mealy-moore',
  title: 'Mealy and Moore machines',
  family: 'Automata and computability',
  blurb:
    'Machines that write as they read: a Moore machine writes on its states, a Mealy machine on its moves. Run both on a word, and convert each into the other.',
  settings: [
    {
      kind: 'choice',
      key: 'first',
      label: 'Moore output',
      options: [
        {
          value: 'write',
          label: "The start state's output first: n + 1 symbols (Hopcroft and Ullman)",
        },
        { value: 'skip', label: 'One symbol per input symbol: n symbols' },
      ],
      help: 'A Moore machine is in its start state before it reads anything. Most textbooks count that state’s output, so a word of n symbols gives n + 1. Some digital-logic texts start counting after the first move.',
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
      label: 'Machine or word',
      placeholder: 'e.g. 0110, or q0 0 -> q0 / 0; q0 1 -> q1 / 1; q1 0,1 -> q0 / 0',
      maxLength: 600,
      sample: '0110',
      parse(token) {
        const t = token.trim();
        if (!t)
          return new Error(
            'Type a word such as 0110, or a machine such as "q0 0 -> q0 / 0; q0 1 -> q1 / 1; q1 0,1 -> q0 / 0".',
          );
        if (looksLike(t)) {
          const m = parseMachine(t);
          if (m instanceof Error) return m;
          const why = sizeProblem(m);
          return why ? new Error(why) : t;
        }
        for (const tok of t.split(/\s+/))
          if (!TOKEN.test(tok))
            return new Error(
              `"${tok}" is not a word. Use letters and digits, or ε (eps) for the empty word.`,
            );
        return t;
      },
    },
    buttons: [
      { op: 'run', label: 'Run', usesInput: true, primary: true },
      { op: 'convert', label: 'Convert', usesInput: false },
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'back', label: 'Convert back', usesInput: false, more: true },
    ],
    random: {
      label: 'Random machine',
      make: (rng) => [loadCall(randomMachine(rng, randomKind(rng), rng.int(2, 4))), convert],
    },
    presets: [
      preset('Detect 101, overlapping (Mealy)', named('detect101')),
      preset('Detect 101 (Moore)', named('detect101Moore')),
      preset('Did the input change? (Mealy, the worst case)', named('change')),
      preset('Parity bit (Moore)', named('parity')),
      preset('Remainder mod 3 (Moore)', named('mod3')),
      preset('Vending machine (Mealy)', named('vending')),
      preset('Traffic light (Moore)', named('traffic')),
      preset('Random Mealy machine', (rng) => randomMachine(rng, 'mealy', rng.int(2, 4))),
      preset('Random Moore machine', (rng) => randomMachine(rng, 'moore', rng.int(2, 4))),
    ],
    sizes: [4, 6, 9, 12],
  },
  explain,
  complexity: [
    {
      op: 'Run on a word of length n',
      best: {
        cost: 'Θ(n)',
        why: 'One move and one output symbol per input symbol.',
        example: 'detect-101',
      },
      average: {
        cost: 'Θ(n)',
        why: 'A Moore machine writes n + 1 symbols and a Mealy machine n: linear either way.',
        example: 'mod-3',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'No choices and no backing up: every symbol is one lookup in δ and one in λ.',
        example: 'vending',
      },
    },
    {
      op: 'Moore to Mealy',
      best: {
        cost: 'Θ(|Q|·|Σ|)',
        why: 'Each of the |Q|·|Σ| moves copies one output, the one its target state writes.',
        example: 'same-states',
      },
      average: {
        cost: 'Θ(|Q|·|Σ|)',
        why: 'The states stay as they are; only the moves get outputs.',
      },
      worst: {
        cost: 'Θ(|Q|·|Σ|)',
        why: 'Never more than one pass over the moves, whatever the outputs.',
        example: 'round-trip',
      },
    },
    {
      op: 'Mealy to Moore',
      best: {
        cost: 'Θ(|Q|·|Σ|)',
        why: 'No state is entered with two outputs, so nothing splits: |Q| states, |Σ| moves each.',
        example: 'no-split',
      },
      average: {
        cost: 'Θ(k·|Σ|)',
        why: 'k Moore states, one for each state and output some move enters it with.',
        example: 'split',
      },
      worst: {
        cost: 'Θ(|Q|·|Δ|·|Σ|)',
        why: 'Every state is entered with every output, so k = |Q|·|Δ|.',
        example: 'change-detector',
      },
      note: 'k is somewhere from |Q| to |Q|·|Δ|. You find out by looking at the outputs on the moves into each state.',
    },
    {
      op: 'Space for the Moore machine',
      best: {
        cost: '|Q| states',
        why: 'Each state is entered with one output only.',
        example: 'no-split',
      },
      average: {
        cost: 'O(|Q|·|Δ|) states',
        why: 'A state splits into as many copies as there are outputs on the moves into it.',
        example: 'split',
      },
      worst: {
        cost: '|Q|·|Δ| states',
        why: 'One copy of every state for every output symbol.',
        example: 'change-detector',
      },
    },
  ],
  practice: mealyMoorePractice(() => mealyMoore),
  preview: { example: 'split', level: 2 },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    detect101,
    detect101Once,
    split,
    sameStates,
    noSplit,
    changeDetector,
    mod3,
    vending,
    roundTrip,
    emptyWord,
  ] as unknown as SavedExample[],
};

/** Driver lines for a machine: "mealy|moore <states>", start, Moore outputs, then the moves. */
export function machineLines(m: Machine): string[] {
  return [
    `${m.kind} ${m.fa.states.join(' ')}`,
    `alphabet ${m.fa.alphabet.join(' ')}`,
    `start ${m.fa.start}`,
    ...(m.kind === 'moore' ? m.fa.states.map((q) => `out ${q} ${m.out[q]}`) : []),
    ...m.fa.moves.map(
      (mv) =>
        `move ${mv.from} ${mv.on} ${mv.to}${m.kind === 'mealy' ? ` ${m.out[moveKey(mv.from, mv.on)]}` : ''}`,
    ),
  ];
}

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A machine as the drivers print it: states and moves in plain string order. */
export function showMachine(m: Machine): string {
  const moves = [...m.fa.moves].sort((x, y) => byName(x.from, y.from) || byName(x.on, y.on));
  if (m.kind === 'moore') {
    const states = [...m.fa.states].sort(byName).map((q) => `${q}/${m.out[q]}`);
    return `moore start=${m.fa.start} | ${states.join(' ')} | ${moves.map((mv) => `${mv.from}-${mv.on}->${mv.to}`).join(' ')}`;
  }
  return `mealy start=${m.fa.start} | ${moves.map((mv) => `${mv.from}-${mv.on}/${m.out[moveKey(mv.from, mv.on)]}->${mv.to}`).join(' ')}`;
}

/**
 * Driver protocol for the code tabs: a machine's lines (machineLines), then "run <word>" (no
 * word for ε), which prints what the loaded machine writes ("-" for nothing) and, after a
 * conversion, " | " and what the converted machine writes; "convert", which prints the
 * converted machine (showMachine); and "back", which converts the converted machine in turn and
 * prints the result. The code writes the start state's output (the default setting), so the
 * script does too. Operations the model refuses leave no lines.
 */
function codeScript(calls: OpCall[], settings: MmSettings) {
  const t = new Timeline(mealyMoore, { ...settings, first: 'write' }, 1, calls);
  const input = machineLines(t.initial.state.machine);
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const name = e.call[0];
    const last = e.steps.at(-1)!.extra;
    if (name === 'load' && e.end !== before) input.push(...machineLines(e.end.machine));
    if (name === 'run' && last?.run) {
      const r = last.run;
      const out = (prefix: string) => r.tracks.find((x) => x.prefix === prefix)?.out;
      const src = out('') || '-';
      const dst = r.tracks.length > 1 ? ` | ${out('c-') || '-'}` : '';
      input.push(`run ${r.word}`.trimEnd());
      expected.push(`${src}${dst}`);
    }
    if ((name === 'convert' || name === 'back') && e.end !== before && e.end.result) {
      input.push(name);
      expected.push(showMachine(e.end.result));
    }
    before = e.end;
  }
  return { input, expected };
}

export default mealyMoore;
