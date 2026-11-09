import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, Step, VizDef } from '../../engine/types';
import {
  cellName,
  loadCall,
  names,
  randomGrid,
  rc,
  startOf,
  targetOf,
  type Grid,
} from '../_grid/grid';
import {
  defaults,
  expandedWith,
  fmt,
  heuristic,
  HEURISTIC_NAMES,
  type AStarExtra,
  type AStarSettings,
  type AStarState,
  type Heuristic,
} from './model';

type Def = VizDef<AStarState, AStarSettings, AStarExtra>;

/** "3 columns and 1 row apart", from cell k to T. */
function apart(g: Grid, k: number): string {
  const [r0, c0] = rc(g, k);
  const [r1, c1] = rc(g, targetOf(g));
  const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  return `${count(Math.abs(c1 - c0), 'column')} and ${count(Math.abs(r1 - r0), 'row')} apart`;
}
type AStarStep = Step<AStarState, AStarExtra>;

const shuffle = <T>(rng: Rng, xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/**
 * Practice for A*. Every answer comes from running the model (or its heuristic function):
 * h, the f a cell gets when it is first added, the order of expansion, and the number of
 * cells each heuristic expands.
 */
export function aStarPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, h: Heuristic = 'manhattan') {
    const g = randomGrid(rng, rng.int(4, 6), rng.int(7, 9), 0.22);
    const settings: AStarSettings = { ...defaults, heuristic: h };
    const setup: OpCall[] = [loadCall(g)];
    const t = new Timeline(def(), settings, 1, [...setup, ['run']]);
    const steps: AStarStep[] = t.entries.at(-1)!.steps;
    const r = steps.at(-1)!.extra!.run!;
    return { g, settings, setup, steps, r, watch: [['run']] as OpCall[] };
  }
  const intro = (h: Heuristic) =>
    `A* searches this grid with 4 neighbours, every move costing 1, and h the ${HEURISTIC_NAMES[h]} to T.`;

  return [
    {
      id: 'h',
      title: 'What is h?',
      make(rng) {
        for (;;) {
          const which: Heuristic = rng.int(0, 1) ? 'manhattan' : 'chebyshev';
          const { g, settings, setup, r, watch } = setupRun(rng, which);
          const seen = r.g
            .map((x, k) => (x >= 0 && k !== targetOf(g) && k !== startOf(g) ? k : -1))
            .filter((k) => k >= 0);
          if (seen.length === 0) continue;
          const k = seen[rng.int(0, seen.length - 1)]!;
          const h = heuristic(g, k, which);
          return {
            prompt: `${intro(which)} What is h for cell ${cellName(g, k)}? Columns are letters and rows are numbers.`,
            setup,
            settings: settings as Settings,
            answer: { kind: 'number', value: h },
            explain: `${cellName(g, k)} and T at ${cellName(g, targetOf(g))} are ${apart(g, k)}, so h = ${which === 'manhattan' ? 'their sum' : 'the larger'}, ${fmt(h)}. h ignores the walls; that is what makes it a guess.`,
            watch,
          };
        }
      },
    },
    {
      id: 'f',
      title: 'What is f?',
      make(rng) {
        for (;;) {
          const { g, settings, setup, steps, watch } = setupRun(rng);
          // Cells added at least two moves from S, as the step that first adds them shows.
          const added = steps.filter(
            (st) =>
              st.lines.includes('push') &&
              st.extra!.run!.v >= 0 &&
              st.extra!.run!.g[st.extra!.run!.v]! >= 2,
          );
          if (added.length === 0) continue;
          const st = added[rng.int(0, added.length - 1)]!;
          const run = st.extra!.run!;
          const k = run.v;
          const first = steps.find((x) => x.lines.includes('push') && x.extra!.run!.v === k)!;
          const fr = first.extra!.run!;
          return {
            prompt: `${intro('manhattan')} When A* first adds cell ${cellName(g, k)} to the open set, what is its f?`,
            setup,
            settings: settings as Settings,
            answer: { kind: 'number', value: fr.f[k]! },
            explain: `It is first reached from ${cellName(g, fr.pi[k]!)}, so g = ${fmt(fr.g[k]!)}, and h = ${fmt(fr.h[k]!)} (rows plus columns to T). f = g + h = ${fmt(fr.f[k]!)}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'second',
      title: 'Which cell is expanded next?',
      make(rng) {
        for (;;) {
          const { g, settings, setup, steps, r, watch } = setupRun(rng);
          if (r.closed.length < 3) continue;
          // The open set just before the second expansion: S's neighbours.
          const pick = steps.filter((st) => st.lines.includes('pop'))[1];
          const open = pick ? steps[steps.indexOf(pick) - 1]!.extra!.run!.open : [];
          if (open.length < 2) continue;
          const second = cellName(g, r.closed[1]!);
          const options = shuffle(
            rng,
            open.slice(0, 4).map((e) => cellName(g, e.k)),
          );
          if (!options.includes(second)) continue;
          return {
            prompt: `${intro('manhattan')} After S, which cell does A* expand next? Ties on f go to the smaller h, then to the cell added first (neighbours are added clockwise from north).`,
            setup,
            settings: settings as Settings,
            answer: { kind: 'choice', options, correct: options.indexOf(second) },
            explain: `S's open neighbours get g = 1 and f = 1 + h. ${open
              .slice(0, 4)
              .map((e) => `${cellName(g, e.k)} has f = ${fmt(e.f)}`)
              .join(', ')}. The least f, with the tie-breaks, is ${second}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'fewer',
      title: 'Which heuristic does less work?',
      make(rng) {
        for (;;) {
          const { g, settings, setup, r, watch } = setupRun(rng);
          if (r.end !== 'found') continue;
          const withH = r.closed.length;
          const zero = expandedWith(g, { ...settings, heuristic: 'zero' });
          const options = ['The Manhattan distance', 'h = 0 (Dijkstra)', 'They expand the same'];
          const correct = withH < zero ? 0 : withH > zero ? 1 : 2;
          return {
            prompt: `A* searches this grid with 4 neighbours. Which h expands fewer cells before T comes out of the open set?`,
            setup,
            settings: settings as Settings,
            answer: { kind: 'choice', options, correct },
            explain: `With the Manhattan distance A* expands ${withH} cells; with h = 0 it expands ${zero}. Both find a path of ${r.path.length - 1} moves (${names(g, r.path).join(' → ')}). ${correct === 0 ? 'The guess pulls the search toward T.' : 'Here the walls make the guess no help.'}`,
            watch,
          };
        }
      },
    },
  ];
}
