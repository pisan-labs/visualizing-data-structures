import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { PROGRAMS } from '../halting-problem/toy';
import {
  EXAMPLES,
  M,
  defaults,
  desc,
  haltsOn,
  propOf,
  wordText,
  type RiceSettings,
  type RiceState,
} from './model';

type Def = VizDef<RiceState, RiceSettings, unknown>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const n = PROGRAMS.length;
const pair = (rng: Rng): [number, number] => [rng.int(1, n), rng.int(1, n)];

const KIND_TEXT = {
  semantic: 'Semantic and non-trivial: undecidable by Rice',
  syntactic: 'About the code or a bounded run: decidable',
  trivial: 'Trivial (true for all or none): decidable',
} as const;

/** Practice for the Rice's theorem page. Answers come from running the model. */
export function ricePractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);

  return [
    {
      id: 'kind',
      title: 'Does Rice apply?',
      make(rng) {
        const e = pick(rng, EXAMPLES);
        const options = Object.values(KIND_TEXT);
        return {
          prompt: `Is this property of programs M decidable? "${e.text}"`,
          setup: [],
          answer: { kind: 'choice', options, correct: options.indexOf(KIND_TEXT[e.kind]) },
          explain: `${KIND_TEXT[e.kind]}: ${e.why}.`,
          watch: [['build', 3, 2], ['decide']],
        };
      },
    },
    {
      id: 'test',
      title: 'What does M′ do?',
      make(rng) {
        const [i, j] = pair(rng);
        const x = pick(rng, ['', 'A', 'G', 'AG', 'R']);
        const end = run([
          ['build', i, j],
          ['test', x || 'eps'],
        ]).endState();
        const outcome = end.rows.at(-1)!.outcome;
        const options = ['accept', 'reject', 'loop'];
        return {
          prompt: `M′ is built from M = M${i} and w = ⟨M${j}⟩, with M_P = A (accepts everything). What does M′ do on input ${wordText(x)}?`,
          setup: [['build', i, j]],
          answer: { kind: 'choice', options, correct: options.indexOf(outcome) },
          explain: haltsOn(i - 1, j - 1)
            ? `M${i} halts on ⟨M${j}⟩, so M′ goes on to M_P, which accepts ${wordText(x)}.`
            : `M${i} loops on ⟨M${j}⟩, so M′ never gets past line 1: it loops, whatever the input.`,
          watch: [['test', x || 'eps']],
        };
      },
    },
    {
      id: 'has-p',
      title: 'Does M′ have P?',
      make(rng) {
        const [i, j] = pair(rng);
        const end = run([['build', i, j], ['decide']]).endState();
        const yes = haltsOn(end.m!, end.w!);
        return {
          prompt: `P is "${propOf(end).text}". M′ is built from ${M(i - 1)} and ${desc(j - 1)}. Does M′ have P?`,
          setup: [['build', i, j]],
          answer: { kind: 'choice', options: ['Yes', 'No'], correct: yes ? 0 : 1 },
          explain: yes
            ? `${M(i - 1)} halts on ${desc(j - 1)}, so L(M′) = L(M_P), which contains A.`
            : `${M(i - 1)} loops on ${desc(j - 1)}, so L(M′) = ∅, which does not contain A.`,
          watch: [['decide']],
        };
      },
    },
    {
      id: 'steps',
      title: 'Phase 1',
      make(rng) {
        const pairs: [number, number][] = [];
        for (let i = 1; i <= n; i++)
          for (let j = 1; j <= n; j++) if (haltsOn(i - 1, j - 1)) pairs.push([i, j]);
        const [i, j] = pick(rng, pairs);
        const end = run([
          ['build', i, j],
          ['test', 'A'],
        ]).endState();
        return {
          prompt: `M′ is built from M${i} and ⟨M${j}⟩ = ${PROGRAMS[j - 1]!.code}. On any input, line 1 runs M${i} on ⟨M${j}⟩. How many steps does that run take before it halts?`,
          setup: [['build', i, j]],
          answer: { kind: 'number', value: end.current!.firstSteps },
          explain: `Run M${i} (${PROGRAMS[i - 1]!.code}) on ${PROGRAMS[j - 1]!.code} line by line: it halts after ${end.current!.firstSteps} steps. The input x plays no part.`,
          watch: [['test', 'A']],
        };
      },
    },
  ];
}
