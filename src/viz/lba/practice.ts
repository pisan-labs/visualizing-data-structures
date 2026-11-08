import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { PracticeKind, VizDef } from '../../engine/types';
import {
  MACHINES,
  configurations,
  defaults,
  type LbaExtra,
  type LbaSettings,
  type LbaState,
  type MachineId,
} from './model';

type Def = VizDef<LbaState, LbaSettings, LbaExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

const WORDS: Record<'anbncn' | 'power2', string[]> = {
  anbncn: [
    'abc',
    'aabbcc',
    'aabbc',
    'abcc',
    'acb',
    'aabcbc',
    'abcabc',
    'aaabbbccc',
    'bca',
    'aabbbcc',
  ],
  power2: ['a', 'aa', 'aaa', 'aaaa', 'aaaaa', 'aaaaaa', 'aaaaaaaa'],
};

/** Practice for the LBA page. Answers come from running the model. */
export function lbaPractice(def: () => Def): PracticeKind[] {
  const run = (machine: MachineId, w: string) =>
    new Timeline(def(), { ...defaults, machine }, 1, [['run', w]]).entries[0]!;

  return [
    {
      id: 'verdict',
      title: 'Accept or reject?',
      make(rng) {
        const machine = pick(rng, ['anbncn', 'power2'] as const);
        const w = pick(rng, WORDS[machine]);
        const yes = run(machine, w).end.verdict === 'accept';
        return {
          prompt: `The ${MACHINES[machine].name} LBA on the stage runs on ${w}. Does it accept?`,
          setup: [],
          settings: { machine },
          answer: { kind: 'choice', options: ['Accept', 'Reject'], correct: yes ? 0 : 1 },
          explain: yes
            ? `${w} is in ${MACHINES[machine].language}.`
            : `${w} is not in ${MACHINES[machine].language}, and the machine gets stuck without a rule.`,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'moves',
      title: 'How many moves?',
      make(rng) {
        const machine = pick(rng, ['anbncn', 'power2'] as const);
        const w = pick(rng, WORDS[machine].slice(0, 5));
        const end = run(machine, w).end;
        return {
          prompt: `How many moves does the ${MACHINES[machine].name} LBA make on ${w} before it halts? (A halt without a rule is not a move.)`,
          setup: [],
          settings: { machine },
          answer: { kind: 'number', value: end.moves },
          explain: `Run it and count: ${end.moves} moves, then ${end.verdict === 'accept' ? 'accept' : 'reject'}.`,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'tape',
      title: 'The tape after a pass',
      make(rng) {
        const w = pick(rng, ['aabbcc', 'aaabbbccc', 'abc']);
        const e = run('anbncn', w);
        // The first time the machine is back in q0 after crossing off a c.
        const back = e.steps.find((s) => s.state.q === 'q0' && s.state.moves > 0)!;
        const cells = back.state.tape.slice(1, -1);
        return {
          prompt: `The aⁿbⁿcⁿ LBA runs on ${w}. What is between the markers the first time it is back in q0, after one pass? Type the cells in order.`,
          setup: [],
          settings: { machine: 'anbncn' },
          answer: { kind: 'sequence', value: cells },
          explain: `One pass crosses off the first a (x), the first b (y) and the first c (z): ${cells.join(' ')}.`,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'configs',
      title: 'Counting configurations',
      make(rng) {
        const machine = pick(rng, ['anbncn', 'power2'] as const);
        const m = MACHINES[machine];
        const n = rng.int(1, 3);
        return {
          prompt: `The ${m.name} LBA has ${m.states.length} states and ${m.symbols.length} tape symbols besides the markers. On a word of length ${n}, how many configurations (state, head position, tape contents) are there? The head can be on any of the n + 2 cells.`,
          setup: [],
          settings: { machine },
          answer: { kind: 'number', value: configurations(m, n) },
          explain: `|Q| · (n + 2) · |Γ|ⁿ = ${m.states.length} · ${n + 2} · ${m.symbols.length}^${n} = ${configurations(m, n)}. A run longer than that repeats a configuration and loops forever, which is why halting is decidable for LBAs.`,
          watch: [['run', 'a'.repeat(n)]],
        };
      },
    },
  ];
}
