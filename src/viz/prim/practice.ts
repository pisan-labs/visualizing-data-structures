import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { loadCall, shuffle } from '../_graph/presets';
import { defaults, type PrimExtra, type PrimRun, type PrimSettings, type PrimState } from './model';
import { randomMst } from '../_graph/mst';

type Def = VizDef<PrimState, PrimSettings, PrimExtra>;
type PStep = Step<PrimState, PrimExtra>;

const code = (s: string) => `\`${s}\``;

/** The run right after `u` joins the tree and all its edges are checked. */
export function afterAdding(steps: PStep[], u: string): PrimRun {
  const runs = steps.map((st) => st.extra!.run!);
  const at = steps.findIndex((st) => st.lines.includes('addT') && st.extra!.run!.T.at(-1) === u);
  const next = steps.findIndex(
    (st, i) => i > at && (st.lines.includes('extract') || st.lines.includes('restart')),
  );
  return runs[next === -1 ? runs.length - 1 : next - 1]!;
}

/**
 * Practice for Prim. Every answer comes from running the model: the order vertices join, the
 * keys and the weight are read from its steps.
 */
export function primPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng) {
    const g = randomMst(rng, rng.int(6, 8), 0.3);
    const setup: OpCall[] = [loadCall(g)];
    const t = new Timeline(def(), defaults, 1, [...setup, ['run']]);
    const steps = t.entries.at(-1)!.steps;
    const r = steps.at(-1)!.extra!.run!;
    return { g, setup, steps, r, watch: [['run']] as OpCall[] };
  }
  const intro = 'Run Prim from A on this graph. Ties go to the name that comes first.';

  return [
    {
      id: 'next',
      title: 'Which vertex joins next?',
      make(rng) {
        for (;;) {
          const { setup, steps, r, watch } = setupRun(rng);
          const moments = r.T.slice(1, -1).filter(
            (u) => afterAdding(steps, u).Q.filter((q) => q.k !== null).length >= 2,
          );
          if (moments.length === 0) continue;
          const u = moments[rng.int(0, moments.length - 1)]!;
          const at = afterAdding(steps, u);
          const next = r.T[r.T.indexOf(u) + 1]!;
          const waiting = at.Q.filter((q) => q.k !== null);
          const others = shuffle(
            rng,
            waiting.map((q) => q.v).filter((v) => v !== next),
          ).slice(0, 3);
          const options = shuffle(rng, [next, ...others]);
          return {
            prompt: `${intro} Right after ${u} joins the tree and its edges are checked, which vertex joins next?`,
            setup,
            answer: { kind: 'choice', options, correct: options.indexOf(next) },
            explain: `By then the tree holds ${r.T.slice(0, r.T.indexOf(u) + 1).join(', ')}, and Q holds ${waiting.map((q) => `${q.v} at ${q.k}`).join(', ')}. The smallest key is ${next}'s, ${at.key[next]}: the lightest edge leaving the tree goes to ${next}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'weight',
      title: 'How heavy is the tree?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng);
        return {
          prompt: `What is the total weight of a minimum spanning tree of this graph?`,
          setup,
          answer: { kind: 'number', value: r.weight },
          explain: `Prim from A adds ${r.T.slice(1)
            .map((v) => `${r.pi[v]}-${v} (${r.key[v]})`)
            .join(
              ', ',
            )}. Together they weigh ${r.weight}. Every minimum spanning tree has the same weight, even when there are several.`,
          watch,
        };
      },
    },
    {
      id: 'order',
      title: 'In what order?',
      make(rng) {
        const { setup, r, watch } = setupRun(rng);
        return {
          prompt: `${intro} Type the vertices in the order they join the tree, starting with A.`,
          setup,
          answer: { kind: 'sequence', value: r.T },
          explain: `Each round takes the waiting vertex with the lightest edge to the tree: ${r.T.join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'key',
      title: 'What is the key?',
      make(rng) {
        for (;;) {
          const { setup, steps, r, watch } = setupRun(rng);
          // A vertex whose key drops at least twice, asked about between two of the drops.
          const drops = new Map<string, string[]>();
          for (const st of steps) {
            if (!st.lines.includes('dec')) continue;
            const run = st.extra!.run!;
            drops.set(run.v!, [...(drops.get(run.v!) ?? []), run.u!]);
          }
          const choices = [...drops].filter(([, us]) => us.length >= 2);
          if (choices.length === 0) continue;
          const [v, us] = choices[rng.int(0, choices.length - 1)]!;
          const u = us[rng.int(0, us.length - 2)]!;
          const at = afterAdding(steps, u);
          const key = at.key[v]!;
          return {
            prompt: `${intro} Right after ${u} joins the tree and its edges are checked, what is ${code(`${v}.key`)}?`,
            setup,
            answer: { kind: 'number', value: key },
            explain: `${v}.key is the weight of the lightest edge from the tree to ${v} so far: ${at.pi[v]}-${v}, weight ${key}. It drops again later, to ${r.key[v]}.`,
            watch,
          };
        }
      },
    },
  ];
}
