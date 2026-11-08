import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { loadCall, randomGraph } from '../_graph/presets';
import { eulerianGraph } from './graphs';
import {
  defaults,
  type EulerExtra,
  type EulerRun,
  type EulerSettings,
  type EulerState,
} from './model';

type Def = VizDef<EulerState, EulerSettings, EulerExtra>;

/**
 * Practice for Euler paths. Every answer comes from running the model: the verdict, the odd
 * vertices, the start and the path Hierholzer finds.
 */
export function eulerPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, kind: 'circuit' | 'path' | 'any') {
    const n = rng.int(5, 7);
    const g =
      kind === 'any'
        ? [
            () => eulerianGraph(rng, n, false),
            () => eulerianGraph(rng, n, true),
            () => randomGraph(rng, n, { density: 0.35 }),
          ][rng.int(0, 2)]!()
        : eulerianGraph(rng, n, kind === 'path');
    const ops: OpCall[] = [loadCall(g)];
    const t = new Timeline(def(), defaults, 1, [...ops, ['run']]);
    const r: EulerRun = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    return { g, ops, r, watch: [['run']] as OpCall[] };
  }

  return [
    {
      id: 'verdict',
      title: 'Path, circuit or neither?',
      make(rng) {
        const { ops, r, watch } = setup(rng, 'any');
        const options = ['An Euler circuit', 'An Euler path, but no circuit', 'Neither'];
        const correct = r.kind === 'circuit' ? 0 : r.kind === 'path' ? 1 : 2;
        return {
          prompt:
            'Count the degrees. Does this graph have an Euler circuit, an Euler path, or neither?',
          setup: ops,
          answer: { kind: 'choice', options, correct },
          explain:
            r.kind === 'circuit'
              ? 'Every degree is even and the edges are in one piece, so there is an Euler circuit.'
              : r.kind === 'path'
                ? `Exactly two vertices, ${r.bad!.join(' and ')}, have odd degree: a path from one to the other, but no circuit.`
                : (r.why ?? ''),
          watch,
        };
      },
    },
    {
      id: 'odd',
      title: 'How many odd degrees?',
      make(rng) {
        const { g, ops, r, watch } = setup(rng, 'any');
        return {
          prompt: 'How many vertices of this graph have odd degree?',
          setup: ops,
          answer: { kind: 'number', value: r.bad!.length },
          explain: `Degrees: ${g.vertices.map((v) => `${v} ${g.edges.filter((e) => e.u === v || e.v === v).length}`).join(', ')}.${
            r.bad!.length ? ` Odd: ${r.bad!.join(', ')}.` : ''
          } The count is always even: the degrees add up to twice the number of edges.`,
          watch,
        };
      },
    },
    {
      id: 'start',
      title: 'Where does it start?',
      make(rng) {
        const { g, ops, r, watch } = setup(rng, 'path');
        const options = [...g.vertices];
        return {
          prompt:
            'This graph has an Euler path but no circuit. Hierholzer starts at the odd vertex first in name order. Where does it start?',
          setup: ops,
          answer: { kind: 'choice', options, correct: options.indexOf(r.start!) },
          explain: `The odd vertices are ${r.bad!.join(' and ')}. Every Euler path runs from one to the other, and the page starts at ${r.start}.`,
          watch,
        };
      },
    },
    {
      id: 'walk',
      title: 'Trace the walk',
      make(rng) {
        const { ops, r, watch } = setup(rng, rng.int(0, 1) ? 'circuit' : 'path');
        const path = r.circuit.map((c) => c.v);
        return {
          prompt: `Run Hierholzer from ${r.start}: always take the unused edge to the neighbour first in name order. Type the ${r.kind} it returns, such as ${r.start} B C ${r.kind === 'circuit' ? r.start : 'D'}.`,
          setup: ops,
          answer: { kind: 'sequence', value: path },
          explain: `The stack walk gives ${path.join(' → ')}.`,
          watch,
        };
      },
    },
  ];
}
