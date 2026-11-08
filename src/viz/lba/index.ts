import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/lba.hpp?raw';
import javaSource from './code/java/Lba.java?raw';
import pythonSource from './code/python/lba.py?raw';
import anbncn from './examples/anbncn.json';
import emptyWord from './examples/empty-word.json';
import oddCount from './examples/odd-count.json';
import outOfOrder from './examples/out-of-order.json';
import powerOfTwo from './examples/power-of-two.json';
import shortOnC from './examples/short-on-c.json';
import theBound from './examples/the-bound.json';
import explain from './explain.md?raw';
import {
  MACHINES,
  MAX_WORD,
  defaults,
  describe,
  init,
  initialSay,
  ops,
  pseudocode,
  vars,
  type LbaExtra,
  type LbaSettings,
  type LbaState,
  type MachineId,
} from './model';
import { lbaPractice } from './practice';
import { view } from './view';

/** The input box: a word of a's, b's and c's (eps for the empty word). Run checks the alphabet. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (t === 'eps' || t === 'ε') return 'eps';
  if (!/^[abc]+$/.test(t))
    return new Error(`"${t}" is not a word of a's, b's and c's. Type eps for the empty word.`);
  if (t.length > MAX_WORD) return new Error(`Keep words to ${MAX_WORD} symbols.`);
  return t;
}

const machineOf = (settings?: Settings): MachineId => (settings?.machine as MachineId) ?? 'anbncn';

/** A word for the machine in the settings: in its language, or near it. */
const preset = (label: string, make: (rng: Rng, n: number, m: MachineId) => string): Preset => ({
  label,
  make: (rng, size, settings) => [
    ['run', make(rng, Math.min(size, MAX_WORD), machineOf(settings)) || 'eps'],
  ],
});

const member = (n: number, m: MachineId) => {
  if (m === 'anbncn') {
    const k = Math.max(1, Math.floor(n / 3));
    return 'a'.repeat(k) + 'b'.repeat(k) + 'c'.repeat(k);
  }
  return 'a'.repeat(m === 'power2' ? 2 ** Math.floor(Math.log2(Math.max(1, n))) : Math.min(n, 4));
};

export const lba: VizDef<LbaState, LbaSettings, LbaExtra> = {
  id: 'lba',
  title: 'Linear-bounded automaton',
  family: 'Automata and computability',
  blurb:
    'A Turing machine that may only use the cells its input is written on, between two end markers: enough for aⁿbⁿcⁿ, the machine of the context-sensitive languages.',
  settings: [
    {
      kind: 'choice',
      key: 'machine',
      label: 'Machine',
      options: [
        { value: 'anbncn', label: 'aⁿbⁿcⁿ: cross off one of each per pass' },
        { value: 'power2', label: 'a^(2^k): halve the a’s each pass (Sipser)' },
        { value: 'double', label: 'Doubling: needs more room than it has' },
      ],
      help: 'Each machine runs between ⊢ and ⊣. The first two are LBAs for context-sensitive languages that no PDA accepts; the third shows the bound stopping a machine that wants to write past its input.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars: (s) => vars(s),
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Word',
      placeholder: 'e.g. aabbcc, or eps',
      maxLength: 20,
      sample: 'aa',
      parse: parseInput,
    },
    buttons: [{ op: 'run', label: 'Run', usesInput: true, primary: true }],
    presets: [
      preset('A word in the language', (_rng, n, m) => member(n, m)),
      preset('One letter too few', (_rng, n, m) => member(n, m).slice(1)),
      preset('Random letters', (rng, n, m) =>
        Array.from(
          { length: n },
          () => MACHINES[m].alphabet[rng.int(0, MACHINES[m].alphabet.length - 1)],
        ).join(''),
      ),
      preset('Shuffled (right counts, wrong order)', (rng, n, m) => {
        const w = [...member(n, m)];
        for (let i = w.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          [w[i], w[j]] = [w[j]!, w[i]!];
        }
        return w.join('');
      }),
    ],
    sizes: [3, 6, 9],
  },
  explain,
  complexity: [
    {
      op: 'Run aⁿbⁿcⁿ on a word of length n',
      best: {
        cost: 'O(1)',
        why: 'A word that starts with b or c is rejected on the first move.',
        example: 'out-of-order',
      },
      average: {
        cost: 'Θ(n²)',
        why: 'n/3 passes, each walking across the tape and back.',
        example: 'anbncn',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'A word in the language makes every pass, and the check at the end.',
        example: 'anbncn',
      },
      note: 'Space: exactly n + 2 cells, always. That is the point.',
    },
    {
      op: 'Decide whether an LBA halts on w',
      best: {
        cost: 'O(1)',
        why: 'A machine with no rule for its first symbol stops at once.',
        example: 'empty-word',
      },
      average: {
        cost: 'at most |Q|·(n+2)·|Γ|ⁿ moves',
        why: 'There are only that many configurations; a longer run must repeat one, so it loops.',
        example: 'power-of-two',
      },
      worst: {
        cost: 'exponential in n',
        why: 'Count the moves and stop past the number of configurations: decidable, but slow.',
        example: 'odd-count',
      },
      note: 'So membership in a context-sensitive language is decidable, unlike halting for Turing machines.',
    },
    {
      op: 'Run a machine that needs more than n cells',
      best: { cost: 'stopped', why: 'The first move past ⊣ is refused.', example: 'the-bound' },
      average: {
        cost: 'stopped',
        why: 'Whatever it computed so far, it cannot write beyond its input.',
        example: 'the-bound',
      },
      worst: {
        cost: 'stopped',
        why: 'An LBA can use a constant factor more room only by packing several symbols into each cell.',
        example: 'the-bound',
      },
    },
  ],
  practice: lbaPractice(() => lba),
  preview: { example: 'anbncn', level: 2, hide: ['rule-', 'level-'] },
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LbaSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    anbncn,
    outOfOrder,
    shortOnC,
    powerOfTwo,
    oddCount,
    theBound,
    emptyWord,
  ] as unknown as SavedExample[],
};

/** Driver protocol: "machine <id>", then each run prints its verdict and the moves made. */
function codeScript(calls: OpCall[], settings: LbaSettings) {
  const t = new Timeline(lba, settings, 1, calls);
  const input = [`machine ${t.initial.state.machine}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const s = e.end;
    if (s.word === null || !s.verdict || e.steps.at(-1)!.say.startsWith('Nothing run')) continue;
    input.push(`run ${s.word || 'eps'}`);
    expected.push(`${s.verdict} ${s.moves}`);
  }
  return { input, expected };
}

export default lba;
