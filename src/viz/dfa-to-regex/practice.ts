import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { accepts, type Automaton } from '../_automata/automaton';
import { words } from '../_automata/page';
import { matches, type Regex } from '../_automata/regex';
import { concat, label, show, star, union, type Gnfa } from './gnfa';
import { defaults, type DfaState, type DrExtra, type DrRun, type DrSettings } from './model';
import { loadCall, randomFit } from './presets';

type Def = VizDef<DfaState, DrSettings, DrExtra>;
type DrStep = Step<DfaState, DrExtra>;

const code = (s: string) => `\`${s}\``;

/** The longest expression a "which expression" option may be. */
const MAX_OPTION = 30;

/** Every word over the alphabet of length up to n. */
export function allWords(alphabet: readonly string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => alphabet.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

/**
 * Practice for state elimination. Every answer comes from running the model: the new label of
 * a pair, the number of labels a rip rewrites, the order fewest-paths-first picks and the
 * final expression are all read from the steps of a Convert run. Wrong options for a label are
 * built from the same R1 to R4 with the classic slips (no star, no R4, R1 and R3 swapped).
 */
export function dfaToRegexPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, n: number, settings: DrSettings = defaults) {
    const dfa = randomFit(rng, n, { partial: rng.int(0, 2) === 0, settings: [settings] });
    const calls: OpCall[] = [loadCall(dfa)];
    const t = new Timeline(def(), settings, 1, [...calls, ['convert']]);
    const steps: DrStep[] = t.entries.at(-1)!.steps;
    const runs = steps.map((st) => st.extra?.run).filter((r): r is DrRun => !!r);
    return { dfa, setup: calls, runs, settings, watch: [['convert']] as OpCall[] };
  }
  const intro = (dfa: Automaton) =>
    `Turn this DFA into a regular expression by ripping out states (start ${dfa.start}, accept ${dfa.accept.length ? words(dfa.accept) : 'none'}). The new start is s and the new accept is f.`;

  return [
    {
      id: 'new-label',
      title: 'The rip rule',
      make(rng) {
        for (;;) {
          const { dfa, setup: s, runs, watch } = setup(rng, rng.int(3, 4));
          const first = runs.find((r) => r.phase === 'pick')!;
          const rip = first.rip!;
          const done = runs.filter((r) => r.phase === 'pair' && r.rip === rip);
          if (!done.length) continue;
          const at = done[rng.int(0, done.length - 1)]!;
          const [p, q] = at.pair!;
          const before = first.g;
          const R = (x: string, y: string): Regex => label(before, x, y)?.r ?? { kind: 'empty' };
          const R1 = R(p, rip);
          const R2 = R(rip, rip);
          const R3 = R(rip, q);
          const R4 = R(p, q);
          const o = { simplify: true };
          const right = label(at.g, p, q)!;
          const answer = right.text;
          // A slip that happens to mean the same (a*a for aa*) would be marked wrong unfairly.
          const words = allWords(dfa.alphabet, 6);
          const differs = (x: Regex) => words.some((w) => matches(x, w) !== matches(right.r, w));
          const slips = [
            concat(concat(R1, star(R2, o), o), R3, o),
            union(concat(concat(R1, R2, o), R3, o), R4, o),
            union(concat(concat(R3, star(R2, o), o), R1, o), R4, o),
            union(star(concat(concat(R1, R2, o), R3, o), o), R4, o),
            union(concat(R1, R3, o), R4, o),
          ]
            .filter(differs)
            .map(show);
          const options = [...new Set([answer, ...slips])];
          if (options.length < 3) continue;
          const pickd = options.slice(1, 4);
          const all = [answer, ...pickd];
          for (let i = all.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            [all[i], all[j]] = [all[j]!, all[i]!];
          }
          const parts = `R1 = ${code(show(R1))}, R2 = ${code(show(R2))}, R3 = ${code(show(R3))} and R4 = ${code(show(R4))}`;
          return {
            prompt: `${intro(dfa)} In name order, ${rip} goes first. What new label does the arrow ${p} → ${q} get? Use the identities with ∅ and ε.`,
            setup: s,
            answer: { kind: 'choice', options: all, correct: all.indexOf(answer) },
            explain: `Here ${parts}. R1(R2)*R3 ∪ R4 simplifies to ${code(answer)}: in through R1, round the loop any number of times, out through R3, or skip ${rip} along R4.`,
            watch,
          };
        }
      },
    },
    {
      id: 'rewrites',
      title: 'How many labels change?',
      make(rng) {
        const { dfa, setup: s, runs, watch } = setup(rng, rng.int(3, 4));
        const first = runs.find((r) => r.phase === 'pick')!;
        const rip = first.rip!;
        const g: Gnfa = first.g;
        const ins = g.states.filter((x) => x !== rip && label(g, x, rip));
        const outs = g.states.filter((x) => x !== rip && label(g, rip, x));
        const n = runs.filter((r) => r.phase === 'pair' && r.rip === rip).length;
        return {
          prompt: `${intro(dfa)} After adding s and f and uniting parallel moves, ${rip} is ripped first. How many labels does that rewrite? (A loop counts.)`,
          setup: s,
          answer: { kind: 'number', value: n },
          explain: n
            ? `Arrows come into ${rip} from ${words(ins)} and go out to ${words(outs)}: each pair gets a new label, ${ins.length} × ${outs.length} = ${n}.`
            : `No path runs through ${rip} (${ins.length ? 'no arrow leaves it for another state' : 'no arrow enters it'}), so ripping it rewrites nothing.`,
          watch,
        };
      },
    },
    {
      id: 'fewest-order',
      title: 'Fewest paths first',
      make(rng) {
        const settings: DrSettings = { ...defaults, order: 'fewest' };
        const { dfa, setup: s, runs, watch } = setup(rng, rng.int(3, 4), settings);
        const order = runs.at(-1)!.ripped;
        return {
          prompt: `${intro(dfa)} Each time, rip the state with the fewest paths through it (arrows in × arrows out, loops left out), the first in name order on a tie. In what order do the states go? Type them in order.`,
          setup: s,
          settings,
          answer: { kind: 'sequence', value: order },
          explain: `Count again after every rip, since ripping a state adds arrows between its neighbours. The order is ${words(order)}.`,
          watch,
        };
      },
    },
    {
      id: 'answer',
      title: 'Which expression?',
      make(rng) {
        for (;;) {
          const { dfa, setup: s, runs, watch } = setup(rng, rng.int(2, 3));
          const answer = runs.at(-1)!.answer!;
          // Long expressions make a reading test, not a conversion test.
          const short = (x: string) => x.length <= MAX_OPTION;
          if (!short(answer)) continue;
          // Other expressions from the same rips: the DFA with other accept states, as long
          // as that changes the language (two states may do the same job).
          const n = dfa.states.length;
          const sets = Array.from({ length: 2 ** n - 1 }, (_, m) =>
            dfa.states.filter((_, i) => (m + 1) & (1 << i)),
          );
          const differs = (accept: string[]) =>
            allWords(dfa.alphabet, 6).some(
              (w) => accepts(dfa, w) !== accepts({ ...dfa, accept }, w),
            );
          const others = sets
            .filter(differs)
            .map((accept) => {
              const t = new Timeline(def(), defaults, 1, [
                loadCall({ ...dfa, accept }),
                ['convert'],
              ]);
              return t.entries.at(-1)!.steps.at(-1)!.extra?.run?.answer;
            })
            .filter((x): x is string => !!x && x !== answer && short(x));
          const options = [...new Set([answer, ...others])].slice(0, 4);
          if (options.length < 3) continue;
          for (let i = options.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            [options[i], options[j]] = [options[j]!, options[i]!];
          }
          return {
            prompt: `${intro(dfa)} Ripping in name order, with the identities with ∅ and ε, which expression is on the arrow from s to f at the end?`,
            setup: s,
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain: `The answer is ${code(answer)}. The others come from the same DFA with another accept state: try a short word on each to tell them apart.`,
            watch,
          };
        }
      },
    },
  ];
}
