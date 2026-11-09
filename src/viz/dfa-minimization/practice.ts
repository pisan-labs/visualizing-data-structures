import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { formatAutomaton } from '../_automata/parse';
import { words } from '../_automata/page';
import {
  defaults,
  delta,
  pairKey,
  type MinExtra,
  type MinRun,
  type MinSettings,
  type MinState,
} from './model';
import { withCopies } from './presets';

type Def = VizDef<MinState, MinSettings, MinExtra>;
type MinStep = Step<MinState, MinExtra>;

/**
 * Practice for DFA minimization. Every answer comes from running the model: the blocks, the
 * minimal DFA, the blocks after one round and the symbol in a pair's cell are read from the
 * steps of a Minimize run.
 */
export function minimizationPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, settings: MinSettings = defaults) {
    const dfa = withCopies(rng, rng.int(5, 6));
    const calls: OpCall[] = [['load', formatAutomaton(dfa)]];
    const t = new Timeline(def(), settings, 1, [...calls, ['minimize']]);
    const steps: MinStep[] = t.entries.at(-1)!.steps;
    const r: MinRun = steps.at(-1)!.extra!.run!;
    return { dfa, setup: calls, steps, r, watch: [['minimize']] as OpCall[] };
  }
  const intro = 'Minimize this DFA.';

  return [
    {
      id: 'min-size',
      title: 'How small can it get?',
      make(rng) {
        const { dfa, setup: s, r, watch } = setup(rng);
        const k = r.min!.states.length;
        const merged = Object.values(r.blocks!).filter((b) => b.length > 1);
        return {
          prompt: `${intro} How many states does the minimal DFA have?`,
          setup: s,
          answer: { kind: 'number', value: k },
          explain: merged.length
            ? `The ${dfa.states.length} states fall into ${k} blocks of states no word can tell apart. ${merged.map((b) => `${words(b)} merge`).join('; ')}.`
            : `Every state can be told apart from every other, so all ${k} stay.`,
          watch,
        };
      },
    },
    {
      id: 'equivalent',
      title: 'Can they be told apart?',
      make(rng) {
        for (;;) {
          const { setup: s, r, watch } = setup(rng);
          const Q = r.work.states;
          const same: [string, string][] = [];
          const apart: [string, string][] = [];
          for (let i = 0; i < Q.length; i++)
            for (let j = 0; j < i; j++)
              (r.block[Q[i]!] === r.block[Q[j]!] ? same : apart).push([Q[j]!, Q[i]!]);
          const pool = same.length && rng.int(0, 1) ? same : apart;
          if (!pool.length) continue;
          const [p, q] = pool[rng.int(0, pool.length - 1)]!;
          const yes = r.block[p] === r.block[q];
          const options = ['Yes: they merge into one state', 'No: some word tells them apart'];
          return {
            prompt: `${intro} Are ${p} and ${q} equivalent: does every word take both to accept, or both to reject?`,
            setup: s,
            answer: { kind: 'choice', options, correct: yes ? 0 : 1 },
            explain: yes
              ? `${p} and ${q} end up in the same block: refining never finds a symbol that sends them to different blocks, so they merge into ${r.min!.states.find((b) => r.blocks![b]!.includes(p))}.`
              : `${p} and ${q} end up in different blocks, so some word leads one to accept and the other to reject.`,
            watch,
          };
        }
      },
    },
    {
      id: 'first-round',
      title: 'After one round',
      make(rng) {
        const { setup: s, steps, watch } = setup(rng);
        const after = steps.filter((st) => st.extra!.run!.round === 1).at(-1)!.extra!.run!;
        const k = new Set(Object.values(after.block)).size;
        return {
          prompt: `${intro} Partition refinement starts with two blocks, accept and non-accept. How many blocks are there after the first round?`,
          setup: s,
          answer: { kind: 'number', value: k },
          explain: `In round 1 each state's signature is the block (accept or not) each symbol leads to. States in one block with different signatures split, which leaves ${k} blocks.`,
          watch,
        };
      },
    },
    {
      id: 'separator',
      title: 'What tells them apart?',
      make(rng) {
        const settings: MinSettings = { ...defaults, method: 'table' };
        for (;;) {
          const { setup: s, r, watch } = setup(rng, settings);
          const Q = r.work.states;
          // Only pairs that one symbol alone can separate: when two symbols both lead to
          // marked pairs, which one marks the cell depends on the order of the passes.
          const marked = Object.keys(r.marked).filter((k) => {
            if (r.marked[k] === 'ε') return false;
            const [p, q] = k.split('|') as [string, string];
            const by = r.work.alphabet.filter((c) => {
              const [x, y] = [delta(r.work, p, c), delta(r.work, q, c)];
              return x !== y && r.marked[pairKey(Q, x, y)];
            });
            return by.length === 1;
          });
          if (!marked.length) continue;
          const [p, q] = marked[rng.int(0, marked.length - 1)]!.split('|') as [string, string];
          const sym = r.marked[pairKey(Q, p, q)]!;
          const options = ['ε', ...r.work.alphabet];
          return {
            prompt: `${intro} With table filling, what does the cell for the pair ${p}, ${q} hold: ε (marked at the start), or the symbol that marked it?`,
            setup: s,
            settings,
            answer: { kind: 'choice', options, correct: options.indexOf(sym) },
            explain: `${p} and ${q} both accept or both reject, so ε does not separate them. On ${sym} they go to a pair that was already marked, which is why their cell holds ${sym}.`,
            watch,
          };
        }
      },
    },
  ];
}
