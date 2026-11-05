import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { listWords, plural, type Graph } from '../_graph/graph';
import { loadCall, shuffle } from '../_graph/presets';
import { clusters } from './graphs';
import {
  braces,
  defaults,
  type SccExtra,
  type SccRun,
  type SccSettings,
  type SccState,
} from './model';

type Def = VizDef<SccState, SccSettings, SccExtra>;

const code = (s: string) => `\`${s}\``;

/**
 * Practice for strongly connected components. Every answer comes from running the model: the
 * components, finish times and low-links are read from the run's last step.
 */
export function sccPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, settings: SccSettings = defaults) {
    const g: Graph = clusters(rng, rng.int(5, 8));
    const setup = [loadCall(g)];
    const watch: OpCall[] = [['run']];
    const t = new Timeline(def(), settings, 1, [...setup, ...watch]);
    const r: SccRun = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    return { g, setup, watch, r };
  }

  return [
    {
      id: 'count',
      title: 'How many components?',
      make(rng) {
        const { setup, watch, r } = setupRun(rng);
        return {
          prompt: 'How many strongly connected components does this directed graph have?',
          setup,
          answer: { kind: 'number', value: r.comps.length },
          explain: `${plural(r.comps.length, 'component')}: ${listWords(r.comps.map(braces))}. Two vertices share one exactly when each can reach the other, which means they lie on a common cycle.`,
          watch,
        };
      },
    },
    {
      id: 'same',
      title: 'Which vertices share a component?',
      make(rng) {
        for (;;) {
          const { g, setup, watch, r } = setupRun(rng);
          const big = g.vertices.filter((v) => r.comps[r.comp[v]!]!.length > 1);
          if (big.length === 0) continue;
          const v = big[rng.int(0, big.length - 1)]!;
          const c = r.comps[r.comp[v]!]!;
          return {
            prompt: `Type every vertex in ${v}'s strongly connected component, ${v} included, in name order.`,
            setup,
            answer: { kind: 'sequence', value: c },
            explain: `${braces(c)}: each of them can reach ${v} and ${v} can reach each of them. Anything else is either out of ${v}'s reach or cannot get back.`,
            watch,
          };
        }
      },
    },
    {
      id: 'second-pass',
      title: "Kosaraju's second pass",
      make(rng) {
        const { g, setup, watch, r } = setupRun(rng);
        const first = [...g.vertices].sort((a, b) => r.f[b]! - r.f[a]!)[0]!;
        const others = shuffle(
          rng,
          g.vertices.filter((v) => v !== first),
        ).slice(0, 3);
        const options = shuffle(rng, [first, ...others]);
        return {
          prompt: `Run Kosaraju's algorithm: pass 1 is DFS with the outer loop and every adjacency list in name order. Which vertex does the second pass start from?`,
          setup,
          answer: { kind: 'choice', options, correct: options.indexOf(first) },
          explain: `The second pass takes the vertices by decreasing finish time, and ${first} finishes last, with ${first}.f = ${r.f[first]}. It is the root of the last tree of pass 1. Its search in G^T finds ${braces(r.comps[0]!)}.`,
          watch,
        };
      },
    },
    {
      id: 'low-link',
      title: "Tarjan's low-link",
      make(rng) {
        const settings: SccSettings = { ...defaults, algorithm: 'tarjan' };
        const { g, setup, watch, r } = setupRun(rng, settings);
        const v = g.vertices[rng.int(0, g.vertices.length - 1)]!;
        const low = r.low[v]!;
        const root = g.vertices.find((x) => r.comp[x] === r.comp[v] && r.low[x] === r.d[x])!;
        return {
          prompt: `Run Tarjan's algorithm, with the outer loop and every adjacency list in name order. What is ${code(`${v}.low`)} when the run ends?`,
          setup,
          settings,
          answer: { kind: 'number', value: low },
          explain:
            low === r.d[v]
              ? `${v}.d = ${r.d[v]}, and nothing below ${v} reaches a smaller index still on the stack, so ${v}.low = ${low}: ${v} roots its component.`
              : `${v}.d = ${r.d[v]}, but ${v}'s subtree reaches a vertex with index ${low} that is still on the stack, so ${v}.low = ${low}. ${v}'s component is rooted at ${root}.`,
          watch,
        };
      },
    },
  ];
}
