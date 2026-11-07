import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { showRegex } from '../_automata/regex';
import { randomRegex, randomWord } from '../regex-to-nfa/gen';
import {
  defaults,
  growthShape,
  type EngExtra,
  type EngSettings,
  type EngState,
  type Shape,
} from './model';

type Def = VizDef<EngState, EngSettings, EngExtra>;

const code = (s: string) => `\`${s}\``;
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Expressions to grow on a's, by how the backtracker's steps grow (the model decides). */
const GROW_POOL: Record<Shape, string[]> = {
  linear: ['a*b', 'a+b', '(a|b)*b', '(ab|a)*b', '(a|a)*', 'a*(b|c)', '(a|b)*c'],
  polynomial: ['a*a*b', 'a*a+b', 'a+a*c', 'a*a*a*b', '(a|b)*a*c'],
  exponential: ['(a|a)*b', '(a*)*b', '(a+)+b', '(a|aa)*b', '(aa|a)*c', '(a|a|b)*c'],
};

const SHAPE_TEXT: Record<Shape, string> = {
  linear: 'It goes up by the same amount each time',
  polynomial: 'It goes up by a little more each time, but by far less than double',
  exponential: 'It is multiplied by about the same factor each time',
};

const SHAPE_WHY: Record<Shape, string> = {
  linear: 'each a can be matched only one way, so a failure backs up a fixed number of steps per a',
  polynomial:
    'the a’s can be split between neighboring repeats in about n² (or n³) ways, a polynomial number of paths',
  exponential:
    'each a can be matched more than one way inside a repeat, so the number of paths multiplies with every a',
};

/**
 * Practice for the regex engines page. Every answer comes from running the model, so it agrees
 * with what the page shows. `def` is a getter to avoid an import cycle.
 */
export function enginesPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: EngSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);
  const end = (cs: OpCall[], settings: EngSettings = defaults) => run(cs, settings).endState();
  const small = (rng: Rng) => showRegex(randomRegex(rng, rng.int(2, 3), ['a', 'b'], true));

  return [
    {
      id: 'live-set',
      title: 'Which states are live?',
      make(rng) {
        const settings: EngSettings = { ...defaults, engine: 'nfa' };
        for (;;) {
          const r = small(rng);
          const w = randomWord(rng, rng.int(2, 3));
          const k = rng.int(1, w.length);
          const prefix = w.slice(0, k);
          const set = end([['match', `${r} ; ${prefix}`]], settings).sim!.set;
          if (set.length > 6) continue;
          return {
            prompt: `This is the NFA for ${code(r)}. The NFA simulation reads ${code(w)}. Which states are live after it reads the first ${k === 1 ? 'symbol' : `${k} symbols`}, ${code(prefix)}? Type them in name order, or leave it blank if none are.`,
            setup: [['load', `${r} ; ${w}`]],
            settings,
            answer: { kind: 'sequence', value: set },
            explain: set.length
              ? `Move every live state along its ${prefix.at(-1)}-arrows, then follow ε-arrows from the states reached: ${set.join(', ')}.`
              : `No live state has an arrow for ${code(prefix.at(-1)!)} at that point, so the set is empty: every path has died.`,
            watch: [['match', w]],
          };
        }
      },
    },
    {
      id: 'first-path',
      title: 'The first path',
      make(rng) {
        for (;;) {
          const order = pick(rng, ['greedy', 'lazy'] as const);
          const settings: EngSettings = { ...defaults, engine: 'backtrack', order };
          const r = small(rng);
          const w = randomWord(rng, rng.int(1, 3));
          const t = run(
            [
              ['load', `${r} ; ${w}`],
              ['match', w],
            ],
            settings,
          );
          const visits: string[] = [];
          let dead = false;
          for (const step of t.entries[1]!.steps) {
            const bt = step.state.bt;
            if (step.state.phase !== 'bt' || !bt || bt.steps === 0) continue;
            visits.push(bt.q);
            if (step.lines.includes('bt.dead')) {
              dead = true;
              break;
            }
          }
          if (!dead || visits.length < 4 || visits.length > 9) continue;
          const first =
            order === 'greedy'
              ? 'goes into a star (or a ?) before going around it'
              : 'goes around a star (or a ?) before going into it';
          return {
            prompt: `The backtracker matches ${code(w)} against ${code(r)}. At a choice it ${first}, and takes the left side of ${code('|')} first. List the states it visits, in order, from q0 up to its first dead end.`,
            setup: [['load', `${r} ; ${w}`]],
            settings,
            answer: { kind: 'sequence', value: visits },
            explain: `It follows one path: ${visits.join(', ')}. At ${visits.at(-1)} no arrow leads on, so it backs up to the latest choice on its stack.`,
            watch: [['match', w]],
          };
        }
      },
    },
    {
      id: 'growth',
      title: 'How fast does it grow?',
      make(rng) {
        const want = pick(rng, ['linear', 'polynomial', 'exponential'] as const);
        const r = pick(rng, GROW_POOL[want]);
        const g = end([['grow', `${r} ; a`]]).growth!;
        const done = g.rows.filter((x) => x.btResult !== 'stopped').map((x) => x.bt);
        const shape = growthShape(done) ?? 'linear';
        const options = (['linear', 'polynomial', 'exponential'] as const).map(
          (s) => SHAPE_TEXT[s],
        );
        const last = done.slice(-3).map((x) => x.toLocaleString('en-US'));
        return {
          prompt: `Grow runs the backtracker against ${code(r)} on a, aa, aaa, and so on. When the word gets one a longer, how does the backtracker's step count change?`,
          setup: [['load', `${r} ; a`]],
          answer: { kind: 'choice', options, correct: options.indexOf(SHAPE_TEXT[shape]) },
          explain: `${SHAPE_TEXT[shape]}: ${SHAPE_WHY[shape]}. Its last three counts are ${last.join(', ')}.`,
          watch: [['grow', `${r} ; a`]],
        };
      },
    },
    {
      id: 'fewer-steps',
      title: 'Which engine does less work?',
      make(rng) {
        const options = [
          'The backtracker',
          'The NFA simulation',
          'Both take the same number of steps',
        ];
        for (;;) {
          const r = pick(rng, ['(a|a)*b', '(a*)*b', 'a*b', '(a|b)*abb', 'a*a*b', '(a+)+b']);
          const n = rng.int(3, 6);
          const w = pick(rng, [
            'a'.repeat(n),
            `${'a'.repeat(n)}b`,
            'ab'.repeat(Math.ceil(n / 2)) + 'b',
            randomWord(rng, n),
          ]);
          const s = end([['match', `${r} ; ${w}`]]);
          const bt = s.bt!.steps;
          const nfa = s.sim!.steps;
          const correct = bt === nfa ? 2 : bt < nfa ? 0 : 1;
          // Keep the clear cases: the same count, or one at least half again the other.
          if (bt !== nfa && Math.max(bt, nfa) < 1.5 * Math.min(bt, nfa)) continue;
          return {
            prompt: `Both engines match ${code(w)} against ${code(r)}. Which one takes fewer steps?`,
            setup: [['load', `${r} ; ${w}`]],
            answer: { kind: 'choice', options, correct },
            explain: `The backtracker takes ${bt} steps and ${s.bt!.result === 'accept' ? 'accepts' : 'rejects'}; the NFA simulation takes ${nfa}. ${
              correct === 0
                ? 'Few paths are tried here, one state at a time, while the simulation carries every live state along at each position.'
                : correct === 1
                  ? 'The backtracker tries many paths that reach the same states at the same positions; the simulation visits each state once per position.'
                  : 'Each symbol can be read only one way, so the backtracker never backs up far, and both visit the same states.'
            }`,
            watch: [['match', w]],
          };
        }
      },
    },
  ];
}
