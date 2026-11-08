import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { loadCall, randomGraph } from '../_graph/presets';
import { defaults, type BiExtra, type BiRun, type BiSettings, type BiState } from './model';

type Def = VizDef<BiState, BiSettings, BiExtra>;

/**
 * Practice for bidirectional search, taking turns (s side first). Every answer comes from
 * running the model: the meeting vertex, the path, the vertices expanded, and plain BFS's count.
 */
export function biPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, needPath = true) {
    for (;;) {
      const g = randomGraph(rng, rng.int(8, 11), { density: rng.int(6, 16) / 100 });
      const s = g.vertices[0]!;
      const t = g.vertices.at(-1)!;
      const ops: OpCall[] = [loadCall(g)];
      const run: OpCall = ['run', s, t];
      const tl = new Timeline(def(), defaults, 1, [...ops, run]);
      const r: BiRun = tl.entries.at(-1)!.steps.at(-1)!.extra!.run!;
      if (needPath && (!r.path || r.path.length < 4)) continue;
      return { s, t, ops, r, watch: [run] };
    }
  }
  const intro = (s: string, t: string) =>
    `Search from ${s} to ${t} with BFS from both ends, taking turns (${s}'s side first, one whole layer per turn, neighbours in name order).`;

  return [
    {
      id: 'meet',
      title: 'Where do they meet?',
      make(rng) {
        const { s, t, ops, r, watch } = setup(rng);
        const options = [...new Set([r.meet!, ...r.path!.slice(1, -1)])].sort();
        return {
          prompt: `${intro(s, t)} At which vertex do the two searches first meet?`,
          setup: ops,
          answer: { kind: 'choice', options, correct: options.indexOf(r.meet!) },
          explain: `The ${s} side reaches distance ${r.ds[r.meet!]} and the ${t} side distance ${r.dt[r.meet!]}; ${r.meet} is the first vertex found that the other side had seen.`,
          watch,
        };
      },
    },
    {
      id: 'path',
      title: 'Which path?',
      make(rng) {
        const { s, t, ops, r, watch } = setup(rng);
        return {
          prompt: `${intro(s, t)} Type the path it returns, such as ${s} B ${t}.`,
          setup: ops,
          answer: { kind: 'sequence', value: r.path! },
          explain: `They meet at ${r.meet}. Follow parents back to ${s} and forward to ${t}: ${r.path!.join(' → ')}.`,
          watch,
        };
      },
    },
    {
      id: 'expanded',
      title: 'How many expanded?',
      make(rng) {
        const { s, t, ops, r, watch } = setup(rng);
        return {
          prompt: `${intro(s, t)} How many vertices does it expand (scan the neighbours of) before the searches meet, counting the one that finds the meeting?`,
          setup: ops,
          answer: { kind: 'number', value: r.expanded },
          explain: `It expands ${r.expanded} in ${r.rounds} turns. A plain BFS from ${s} would expand ${r.plain} before discovering ${t}.`,
          watch,
        };
      },
    },
    {
      id: 'plain',
      title: 'And plain BFS?',
      make(rng) {
        const { s, t, ops, r, watch } = setup(rng);
        return {
          prompt: `Run a plain BFS from ${s}, neighbours in name order. How many vertices does it take out of the queue and expand before it discovers ${t}, counting the one that discovers it?`,
          setup: ops,
          answer: { kind: 'number', value: r.plain },
          explain: `Plain BFS expands ${r.plain}. The search from both ends expands ${r.expanded}.`,
          watch,
        };
      },
    },
  ];
}
