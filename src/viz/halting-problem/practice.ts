import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { PracticeKind, Settings, VizDef } from '../../engine/types';
import {
  M,
  cellLabel,
  cellSay,
  dWords,
  defaults,
  desc,
  runWhy,
  type Framing,
  type HaltExtra,
  type HaltSettings,
  type HaltState,
} from './model';
import { MAX_SIZE, MIN_SIZE, PROGRAMS, cell, halts, listing } from './toy';

type Def = VizDef<HaltState, HaltSettings, HaltExtra>;

const code = (t: string) => `\`${t}\``;
const program = (i: number) => `${M(i)} = ${code(listing(PROGRAMS[i]!.prog))}`;
const input = (j: number) => `${desc(j)} = ${code(PROGRAMS[j]!.code)}`;

function framingOf(rng: Rng): Framing {
  return rng.int(0, 1) ? 'halt' : 'atm';
}

/** Every cell of the full family that passes `keep`, as [i, j]. */
function cellsWhere(keep: (i: number, j: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < MAX_SIZE; i++)
    for (let j = 0; j < MAX_SIZE; j++) if (keep(i, j)) out.push([i, j]);
  return out;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** A table just big enough to hold the cell, and never smaller than 4. */
const sizeFor = (i: number, j: number) => Math.max(MIN_SIZE, i + 1, j + 1);

/**
 * Practice questions for the halting-problem page. Every answer comes from running the toy
 * programs (toy.ts) or the model's timeline. `def` is a getter to avoid an import cycle.
 */
export function haltingPractice(def: () => Def): PracticeKind[] {
  return [
    {
      id: 'cell',
      title: 'What does Mi do on ⟨Mj⟩?',
      make(rng) {
        const framing = framingOf(rng);
        // Skip the first two rows most of the time: they do the same on every input.
        const [i, j] = pick(
          rng,
          cellsWhere((a) => a >= 2 || rng.int(0, 3) === 0),
        );
        const o = cell(i, j).outcome;
        const options =
          framing === 'halt'
            ? ['It halts', 'It loops forever']
            : ['It accepts', 'It rejects', 'It loops forever'];
        const correct =
          framing === 'halt' ? (halts(o) ? 0 : 1) : o === 'accept' ? 0 : o === 'reject' ? 1 : 2;
        const settings: Settings = { framing, size: sizeFor(i, j) };
        return {
          prompt: `${program(i)}. What does it do on ${input(j)}? The head starts on the first symbol, and \`end\` is the cell after the last one.`,
          setup: [],
          settings,
          answer: { kind: 'choice', options, correct },
          explain: cellSay(i, j, framing),
          watch: [['run', i + 1, j + 1]],
        };
      },
    },
    {
      id: 'd-row',
      title: 'Fill in D’s row',
      make(rng) {
        const framing = framingOf(rng);
        const size = rng.int(MIN_SIZE, MAX_SIZE);
        const settings: HaltSettings = { ...defaults, framing, size };
        // The picture is the built table; the answer comes from D's definition on that table.
        const t = new Timeline(def(), settings, 1, [['build']]);
        const n = t.endState().n;
        const row = dWords(n, framing);
        const how =
          framing === 'halt'
            ? 'as halt or loop'
            : 'as acc or rej (D always halts, so it never loops)';
        const diag = Array.from(
          { length: n },
          (_, i) => `${M(i)} on ${desc(i)} is ${cellLabel(cell(i, i).outcome, framing)}`,
        ).join(', ');
        return {
          prompt: `D does the opposite of what each program does on its own description. Type D’s row, from ${desc(0)} to ${desc(n - 1)}, ${how}.`,
          setup: [['build']],
          settings,
          answer: { kind: 'sequence', value: row },
          explain: `Only the diagonal matters: ${diag}. Flip each one and D’s row is ${row.join(' ')}.`,
          watch: [['diagonalize']],
        };
      },
    },
    {
      id: 'cap',
      title: 'Is a step cap enough?',
      make(rng) {
        const [i, j] = pick(
          rng,
          cellsWhere((a, b) => cell(a, b).steps >= 6),
        );
        const r = cell(i, j);
        const k = rng.int(5, 30);
        const right = !halts(r.outcome) || r.steps <= k;
        const settings: Settings = { framing: 'atm', size: sizeFor(i, j) };
        const explain = !halts(r.outcome)
          ? `Yes, but only by luck. ${M(i)} does loop: ${runWhy(r, i)}. The checker never saw that; it just ran out of steps.`
          : right
            ? `Yes. ${M(i)} ${r.outcome}s after ${r.steps} steps, within the cap of ${k}.`
            : `No. ${M(i)} ${r.outcome}s after ${r.steps} steps, so a cap of ${k} gives up too soon and calls a halting run a loop.`;
        return {
          prompt: `A checker runs ${M(i)} on ${desc(j)} for at most ${k} steps, and says “loops” if it has not halted by then. Is the checker right about this cell?`,
          setup: [],
          settings,
          answer: { kind: 'choice', options: ['Yes', 'No'], correct: right ? 0 : 1 },
          explain,
          watch: [['run', i + 1, j + 1]],
        };
      },
    },
    {
      id: 'steps',
      title: 'How long until it halts?',
      make(rng) {
        const [i, j] = pick(
          rng,
          cellsWhere((a, b) => halts(cell(a, b).outcome) && cell(a, b).steps >= 3),
        );
        const r = cell(i, j);
        const last = r.trace[r.trace.length - 1]!;
        const settings: Settings = { framing: 'atm', size: sizeFor(i, j) };
        return {
          prompt: `${program(i)}. Run it on ${input(j)}. How many steps does it take to halt? Each line it runs is one step, the last one included.`,
          setup: [],
          settings,
          answer: { kind: 'number', value: r.steps },
          explain: `${M(i)} ${r.outcome}s on step ${r.steps}, at line ${last.line}.`,
          watch: [['run', i + 1, j + 1]],
        };
      },
    },
  ];
}
