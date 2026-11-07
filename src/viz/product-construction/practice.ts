import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { words } from '../_automata/page';
import { loadPair, randomPair } from './machines';
import {
  defaults,
  type BuildRun,
  type ProdExtra,
  type ProdSettings,
  type ProdState,
} from './model';
import { OPS, SET_OPS, deadOf, pairText, type SetOp } from './product';

type Def = VizDef<ProdState, ProdSettings, ProdExtra>;

const code = (s: string) => `\`${s}\``;
const pairOf = (n: string) => pairText(...(n.split(',') as [string, string]));

/**
 * Practice for the product construction. Every answer comes from running the model: the pairs,
 * their moves and which ones accept are read from the last step of a Build, and the complement
 * from the state after Complement A.
 */
export function productPractice(def: () => Def): PracticeKind[] {
  function built(rng: Rng, op: SetOp, partial: boolean) {
    const [a, b] = randomPair(rng, { partial, minPairs: 3, maxPairs: 7 });
    const setup: OpCall[] = [loadPair(a, b)];
    const settings: ProdSettings = { ...defaults, op };
    const t = new Timeline(def(), settings, 1, [...setup, ['build']]);
    const r = t.entries.at(-1)!.steps.at(-1)!.extra!.build as BuildRun;
    return { a, b, setup, r, settings, watch: [['build']] as OpCall[] };
  }

  return [
    {
      id: 'pair-move',
      title: 'Where does a pair go?',
      make(rng) {
        for (;;) {
          const { setup, r, watch } = built(rng, 'union', false);
          // A move out of a pair other than the start, so the learner reads both machines.
          const options = r.moves.filter((m) => m.from !== r.rows[0]);
          if (!options.length) continue;
          const m = options[rng.int(0, options.length - 1)]!;
          const [p, q] = m.from.split(',') as [string, string];
          const [p2, q2] = m.to.split(',') as [string, string];
          return {
            prompt: `In the product of A and B, the pair ${pairOf(m.from)} reads ${code(m.on)}. Which pair does it go to? Type A's state, then B's.`,
            setup,
            answer: { kind: 'sequence', value: [p2, q2] },
            explain: `Each half moves on its own: in A, ${p} goes to ${p2} on ${m.on}, and in B, ${q} goes to ${q2}. So ${pairOf(m.from)} goes to ${pairOf(m.to)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'pair-count',
      title: 'How many pairs?',
      make(rng) {
        const partial = rng.int(0, 1) === 1;
        const { a, b, setup, r, watch } = built(rng, 'union', partial);
        const missing = deadOf(a) || deadOf(b) ? ' A missing move goes to a dead state.' : '';
        const nA = a.states.length + (deadOf(a) ? 1 : 0);
        const nB = b.states.length + (deadOf(b) ? 1 : 0);
        return {
          prompt: `Build the product of A and B from the start pair, one symbol at a time.${missing} How many pairs does it reach?`,
          setup,
          answer: { kind: 'number', value: r.rows.length },
          explain: `Breadth first from ${pairOf(r.rows[0]!)}, these pairs turn up: ${r.rows.map(pairOf).join(', ')}. That is ${r.rows.length} of the ${nA} × ${nB} = ${nA * nB} pairs${r.rows.length < nA * nB ? '; no word reaches the others' : ''}.`,
          watch,
        };
      },
    },
    {
      id: 'accepting',
      title: 'Which pairs accept?',
      make(rng) {
        for (;;) {
          const op = SET_OPS[rng.int(0, SET_OPS.length - 1)]!;
          const { setup, r, settings, watch } = built(rng, op, false);
          if (r.accept.length === r.rows.length) continue;
          const info = OPS[op];
          const acc = r.accept.map(pairOf);
          return {
            prompt: `Build the product of A and B for ${info.label}, the ${info.name}. How many of the pairs it reaches accept?`,
            setup,
            settings,
            answer: { kind: 'number', value: r.accept.length },
            explain: `For ${info.label}, a pair (p, q) accepts when ${info.plain('p', 'q')}. Of the ${r.rows.length} pairs reached, ${acc.length ? `${acc.length === 1 ? 'one does' : `${acc.length} do`}: ${words(acc)}` : 'none does, so the language is empty'}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'complement',
      title: 'Complement',
      make(rng) {
        for (;;) {
          const [a, b] = randomPair(rng, { partial: true, minPairs: 2, maxPairs: 9 });
          const dead = deadOf(a);
          if (!dead) continue;
          const setup: OpCall[] = [loadPair(a, b)];
          const t = new Timeline(def(), defaults, 1, [...setup, ['complementA']]);
          const after = t.endState().a;
          const acc = after.accept;
          return {
            prompt: `Complement A: complete it if it needs it, then swap its accept and non-accept states. How many states of the new A accept?`,
            setup,
            answer: { kind: 'number', value: acc.length },
            explain: `A has missing moves, so it first gets a dead state, ${dead}, which does not accept. Then everything swaps: ${acc.length ? `${words(acc)} ${acc.length === 1 ? 'accepts' : 'accept'}` : 'no state accepts'}. Forget the dead state and the words that fell off A would be rejected by both A and its complement.`,
            watch: [['complementA']],
          };
        }
      },
    },
  ];
}
