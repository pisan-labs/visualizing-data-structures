import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { cellName, loadCall, names, randomGrid, targetOf, type Grid } from '../_grid/grid';
import {
  defaults,
  pathTo,
  type BfsGridExtra,
  type BfsGridSettings,
  type BfsGridState,
  type GridRun,
} from './model';

type Def = VizDef<BfsGridState, BfsGridSettings, BfsGridExtra>;

/**
 * Practice for grid BFS. Every answer comes from running the model: distances, the path and
 * the order cells leave the queue are read from the run's last step.
 */
export function gridBfsPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, density = 0.25, moves: '4' | '8' = rng.int(0, 2) ? '4' : '8') {
    const g: Grid = randomGrid(rng, rng.int(4, 6), rng.int(6, 8), density);
    const settings: BfsGridSettings = { ...defaults, moves };
    const setup: OpCall[] = [loadCall(g)];
    const t = new Timeline(def(), settings, 1, [...setup, ['run']]);
    const r: GridRun = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    const how =
      moves === '8'
        ? 'with 8 neighbours (diagonal moves allowed, each costing one move)'
        : 'with 4 neighbours (up, down, left and right)';
    return { g, settings: settings as Settings, setup, r, how, watch: [['run']] as OpCall[] };
  }

  return [
    {
      id: 'length',
      title: 'How many moves?',
      make(rng) {
        for (;;) {
          const { g, settings, setup, r, how, watch } = setupRun(rng);
          if (r.end !== 'found' || r.path.length < 4) continue;
          const d = r.path.length - 1;
          return {
            prompt: `Search this grid from S to T ${how}. How many moves does the shortest path take?`,
            setup,
            settings,
            answer: { kind: 'number', value: d },
            explain: `T is ${d} moves from S. One shortest path is ${names(g, r.path).join(' → ')}. Walls force the detour; without them it could be shorter.`,
            watch,
          };
        }
      },
    },
    {
      id: 'distance',
      title: 'What is d here?',
      make(rng) {
        for (;;) {
          const { g, settings, setup, r, how, watch } = setupRun(rng);
          const far = r.d.map((d, k) => [d, k]).filter(([d, k]) => d! >= 2 && k !== targetOf(g));
          if (far.length === 0) continue;
          const [d, k] = far[rng.int(0, far.length - 1)]!;
          const name = cellName(g, k!);
          return {
            prompt: `Run BFS from S on this grid ${how}. What distance d does it give cell ${name}? Columns are letters and rows are numbers.`,
            setup,
            settings,
            answer: { kind: 'number', value: d! },
            explain: `${name} is ${d} moves from S: ${names(g, pathTo(r, k!)).join(' → ')}. BFS gives every cell at distance ${d! - 1} its number before any cell at distance ${d}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'reachable',
      title: 'Is there a way through?',
      make(rng) {
        const { g, settings, setup, r, how, watch } = setupRun(rng, rng.int(0, 1) ? 0.42 : 0.3);
        const options = ['Yes, T can be reached', 'No, T cannot be reached'];
        const yes = r.end === 'found';
        return {
          prompt: `Can BFS get from S to T in this grid ${how}?`,
          setup,
          settings,
          answer: { kind: 'choice', options, correct: yes ? 0 : 1 },
          explain: yes
            ? `Yes: ${names(g, r.path).join(' → ')}, ${r.path.length - 1} moves.`
            : `No. BFS reaches ${r.order.length} cells, every one S can get to, and the queue runs dry before T is found.`,
          watch,
        };
      },
    },
    {
      id: 'order',
      title: 'Which cells leave the queue first?',
      make(rng) {
        for (;;) {
          const { g, setup, r, watch } = setupRun(rng, 0.25, '4');
          if (r.order.length < 6) continue;
          const first = names(g, r.order.slice(0, 5));
          return {
            prompt: `Run BFS from S on this grid with 4 neighbours, looking at them clockwise from north: up, right, down, left. Type the first 5 cells to leave the queue, such as A1 B1.`,
            setup,
            settings: { ...defaults, moves: '4' },
            answer: { kind: 'sequence', value: first },
            explain: `The queue is first in, first out: S, then its neighbours in the order they were found (north, east, south, west), then theirs. ${first.join(', ')}.`,
            watch,
          };
        }
      },
    },
  ];
}
