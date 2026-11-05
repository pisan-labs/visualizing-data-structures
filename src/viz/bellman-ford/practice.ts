import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, Step, VizDef } from '../../engine/types';
import type { Graph } from '../_graph/graph';
import { loadCall, shuffle } from '../_graph/presets';
import { arcs, arrow, cycleWords, rotateCycle } from '../_paths/kit';
import { cycleOutOfReach, withNegativeCycle, withNegativeEdges } from '../_paths/presets';
import { defaults, type BfExtra, type BfRun, type BfSettings, type BfState } from './model';

type Def = VizDef<BfState, BfSettings, BfExtra>;
type BfStep = Step<BfState, BfExtra>;

const code = (s: string) => `\`${s}\``;

/** The run as it stands at the end of pass k (the step that opens the next pass or the check). */
export function afterPass(steps: BfStep[], k: number): BfRun {
  const runs = steps.map((st) => st.extra!.run!);
  const next = runs.findIndex((r, i) => i > 0 && (r.pass > k || !!r.checking || !!r.result));
  return runs[next === -1 ? runs.length - 1 : next]!;
}

/**
 * Practice for Bellman-Ford. Every answer comes from running the model: the changes per pass,
 * the distances after a pass, the number of passes and the result are read from its steps.
 */
export function bellmanFordPractice(def: () => Def): PracticeKind[] {
  const runSteps = (setup: OpCall[], settings: Settings = defaults): BfStep[] => {
    const t = new Timeline(def(), settings as BfSettings, 1, [...setup, ['run', 'A']]);
    return t.entries.at(-1)!.steps;
  };

  /** Directed, with negative edges and no negative cycle, 5 to 7 vertices. */
  function setupRun(rng: Rng, settings: Settings = defaults) {
    const g = withNegativeEdges(rng, rng.int(5, 7));
    const setup = [loadCall(g)];
    const steps = runSteps(setup, settings);
    return { g, setup, steps, r: steps.at(-1)!.extra!.run!, watch: [['run', 'A']] as OpCall[] };
  }
  const order = (g: Graph) =>
    arcs(g)
      .map((a) => arrow(a.u, a.v))
      .join(', ');
  const intro = (g: Graph) =>
    `Run Bellman-Ford from A on this graph. Each pass relaxes the edges in this order: ${order(g)}.`;

  return [
    {
      id: 'changes',
      title: 'How many changes?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng);
          const k = rng.int(1, 2);
          if (r.changes.length < k) continue;
          const n = r.changes[k - 1]!;
          return {
            prompt: `${intro(g)} How many distances does pass ${k} lower?`,
            setup,
            answer: { kind: 'number', value: n },
            explain: `Pass ${k} lowers ${n === 1 ? '1 distance' : `${n} distances`}. Count the relaxations that succeed, in order: one edge can only help once the vertex it starts from has a finite d, maybe earlier in the same pass. The passes change ${r.changes.join(', ')} in all.`,
            watch,
          };
        }
      },
    },
    {
      id: 'after-pass',
      title: 'What is d after pass 1?',
      make(rng) {
        for (;;) {
          const { g, setup, steps, r, watch } = setupRun(rng);
          const after = afterPass(steps, 1);
          // A vertex reached in pass 1 whose d still drops later is the interesting kind.
          const moving = g.vertices.filter(
            (v) => v !== 'A' && after.d[v] !== null && after.d[v] !== r.d[v],
          );
          const reached = g.vertices.filter((v) => v !== 'A' && after.d[v] !== null);
          const pool = moving.length ? moving : reached;
          if (pool.length === 0) continue;
          const v = pool[rng.int(0, pool.length - 1)]!;
          const d = after.d[v]!;
          return {
            prompt: `${intro(g)} What is ${code(`${v}.d`)} right after pass 1?`,
            setup,
            answer: { kind: 'number', value: d },
            explain: `After pass 1, ${v}.d = ${d}, set from ${after.pi[v]}. ${d === r.d[v] ? 'It is already final.' : `It is not final yet: later passes lower it to ${r.d[v]}.`}`,
            watch,
          };
        }
      },
    },
    {
      id: 'passes',
      title: 'How many passes?',
      make(rng) {
        const settings: Settings = { ...defaults, early: true };
        const { g, setup, r, watch } = setupRun(rng, settings);
        const n = r.changes.length;
        const quiet = r.changes.at(-1) === 0;
        return {
          prompt: `${intro(g)} It stops after the first pass that changes nothing. How many passes does it make, counting that last one?`,
          setup,
          settings,
          answer: { kind: 'number', value: n },
          explain: quiet
            ? `The passes change ${r.changes.join(', ')}. Pass ${n} is the first that changes nothing, so it stops there.`
            : `The passes change ${r.changes.join(', ')}: every one of the V - 1 = ${n} passes changes something, so it makes them all.`,
          watch,
        };
      },
    },
    {
      id: 'result',
      title: 'TRUE or FALSE?',
      make(rng) {
        const which = rng.int(0, 2);
        const g =
          which === 0
            ? withNegativeEdges(rng, rng.int(5, 7))
            : which === 1
              ? withNegativeCycle(rng, rng.int(5, 7))
              : cycleOutOfReach(rng, rng.int(6, 7));
        const setup = [loadCall(g)];
        const r = runSteps(setup).at(-1)!.extra!.run!;
        const options = shuffle(rng, [
          'TRUE: no negative cycle can be reached from A',
          'FALSE: A can reach a negative cycle',
        ]);
        const right =
          r.result === 'true'
            ? options.findIndex((o) => o.startsWith('TRUE'))
            : options.findIndex((o) => o.startsWith('FALSE'));
        return {
          prompt: `Run Bellman-Ford from A on this graph. What does it return?`,
          setup,
          answer: { kind: 'choice', options, correct: right },
          explain: r.cycle
            ? `A can reach the cycle ${cycleWords(rotateCycle(r.cycle))}, whose weight is negative, so an edge can still be relaxed after V - 1 passes: FALSE.`
            : `No edge can be relaxed after V - 1 passes, so TRUE. ${which === 2 ? 'There is a negative cycle, but A cannot reach it, so it changes no distance from A.' : 'Negative edges are fine as long as no cycle is negative.'}`,
          watch: [['run', 'A']],
        };
      },
    },
  ];
}
