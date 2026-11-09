import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { randomWord } from '../_automata/random';
import {
  formatMachine,
  mealyToMoore,
  moveKey,
  randomMachine,
  type Kind,
  type Machine,
} from './machine';
import { defaults, type MmExtra, type MmSettings, type MmState, type RunView } from './model';

type Def = VizDef<MmState, MmSettings, MmExtra>;

const code = (s: string) => `\`${s}\``;
const loadCall = (m: Machine): OpCall => ['load', formatMachine(m)];

/**
 * Practice for machines with output. Every answer comes from running the model: outputs are
 * read from the last step of a run, and converted machines from the state after Convert.
 */
export function mealyMoorePractice(def: () => Def): PracticeKind[] {
  const timeline = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  const runOf = (calls: OpCall[]): RunView =>
    timeline(calls).entries.at(-1)!.steps.at(-1)!.extra!.run!;
  const converted = (m: Machine): Machine =>
    timeline([loadCall(m), ['convert']]).endState().result!;

  return [
    {
      id: 'output-word',
      title: 'What does it write?',
      make(rng) {
        const kind: Kind = rng.int(0, 1) ? 'mealy' : 'moore';
        const m = randomMachine(rng, kind, rng.int(2, 3));
        const w = randomWord(rng, ['0', '1'], rng.int(3, 5));
        const r = runOf([loadCall(m), ['run', w]]);
        const out = r.tracks[0]!.out;
        const how =
          kind === 'mealy'
            ? 'one symbol per move, read off the arrow it follows'
            : `${m.fa.start}'s output first, before any input, then the output of each state it enters`;
        return {
          prompt: `Run this ${kind === 'mealy' ? 'Mealy' : 'Moore'} machine on ${code(w)}. What does it write? Type the output as one word, such as ${code('0110')}.`,
          setup: [loadCall(m)],
          answer: { kind: 'sequence', value: [out] },
          explain: `It writes ${how}: ${out}, ${out.length} symbols for ${w.length} input symbols.`,
          watch: [['run', w]],
        };
      },
    },
    {
      id: 'moore-to-mealy',
      title: 'What does the move write?',
      make(rng) {
        const m = randomMachine(rng, 'moore', rng.int(2, 4));
        const mv = m.fa.moves[rng.int(0, m.fa.moves.length - 1)]!;
        const mealy = converted(m);
        const o = mealy.out[moveKey(mv.from, mv.on)]!;
        const options = ['0', '1'];
        return {
          prompt: `Convert this Moore machine to a Mealy machine. What does the move from ${mv.from} on ${mv.on} write?`,
          setup: [loadCall(m)],
          answer: { kind: 'choice', options, correct: options.indexOf(o) },
          explain: `The move goes to ${mv.to}, and ${mv.to} writes ${o}. In the Mealy machine every move writes what the state it enters writes.`,
          watch: [['convert']],
        };
      },
    },
    {
      id: 'split-count',
      title: 'How many Moore states?',
      make(rng) {
        const m = randomMachine(rng, 'mealy', rng.int(2, 3));
        const moore = converted(m);
        const k = moore.fa.states.length;
        const splits = m.fa.states.filter((q) => moore.fa.states.includes(`${q}'`));
        return {
          prompt:
            'Convert this Mealy machine to a Moore machine, splitting each state by the outputs written on the moves into it. How many states does the Moore machine have?',
          setup: [loadCall(m)],
          answer: { kind: 'number', value: k },
          explain: splits.length
            ? `${splits.join(' and ')} ${splits.length === 1 ? 'is' : 'are'} entered with both 0 and 1, so ${splits.length === 1 ? 'it splits' : 'each splits'} in two: ${m.fa.states.length} + ${splits.length} = ${k}.`
            : `Every state is entered with one output only, so nothing splits: ${k} states, as many as the Mealy machine.`,
          watch: [['convert']],
        };
      },
    },
    {
      id: 'converted-output',
      title: 'What does the Moore machine write?',
      make(rng) {
        // What the Moore start state writes is fixed only when every move into the start
        // writes the same symbol. Otherwise any copy of it would do, and the page's pick (the
        // first copy) is not something the prompt can ask about.
        let m = randomMachine(rng, 'mealy', rng.int(2, 3));
        while (mealyToMoore(m).entered[m.fa.start]!.length !== 1)
          m = randomMachine(rng, 'mealy', rng.int(2, 3));
        const w = randomWord(rng, ['0', '1'], rng.int(3, 5));
        const mealyOut = runOf([loadCall(m), ['run', w]]).tracks[0]!.out;
        const r = runOf([loadCall(m), ['convert'], ['run', w]]);
        const moore = r.tracks.find((t) => t.kind === 'moore')!;
        const first = moore.out[0]!;
        return {
          prompt: `This Mealy machine writes ${code(mealyOut)} on ${code(w)}. Convert it to a Moore machine and run ${code(w)} on that. What does the Moore machine write? Type it as one word.`,
          setup: [loadCall(m)],
          answer: { kind: 'sequence', value: [moore.out] },
          explain: `Every move into ${m.fa.start} writes ${first}, so its one copy, the Moore start state, writes ${first} before any input. After that it writes what the Mealy machine writes, one step later: ${first} then ${mealyOut} is ${moore.out}.`,
          watch: [['convert'], ['run', w]],
        };
      },
    },
  ];
}
