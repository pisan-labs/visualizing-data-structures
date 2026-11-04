import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, Step, VizDef } from '../../engine/types';
import { defaults, walkBack, type EditExtra, type EditSettings, type EditState } from './model';

type Def = VizDef<EditState, EditSettings, EditExtra>;
type EditStep = Step<EditState, EditExtra>;

const WORDS = [
  'cat',
  'cut',
  'cart',
  'act',
  'care',
  'core',
  'cord',
  'card',
  'dart',
  'tart',
  'star',
  'stare',
  'rats',
  'arts',
  'trace',
  'crate',
  'react',
  'cater',
];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Two different words of a few letters. */
function pair(rng: Rng, max = 5): [string, string] {
  const short = WORDS.filter((w) => w.length <= max);
  const a = pick(rng, short);
  let b = pick(rng, short);
  while (b === a) b = pick(rng, short);
  return [a, b];
}

const costs = (st: EditSettings) =>
  st.ins === 1 && st.del === 1 && st.sub === 1
    ? 'Every edit costs 1.'
    : `An insert costs ${st.ins}, a delete ${st.del} and a substitution ${st.sub}.`;

/** Unit costs most of the time; sometimes a substitution costs 2. */
function someCosts(rng: Rng): EditSettings {
  return rng.int(0, 2) ? { ...defaults } : { ...defaults, sub: 2 };
}

/**
 * Practice questions for edit distance. Answers come from running the model with seed 1, the
 * way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function editPractice(def: () => Def): PracticeKind[] {
  const run = (settings: Settings, ops: OpCall[]) =>
    new Timeline(def(), { ...defaults, ...settings } as EditSettings, 1, ops);
  const last = (settings: Settings, ops: OpCall[]): EditStep =>
    run(settings, ops).entries.at(-1)!.steps.at(-1)!;

  return [
    {
      id: 'cell',
      title: 'Fill the next row',
      make(rng) {
        const settings = someCosts(rng);
        const [a, b] = pair(rng);
        const done = rng.int(1, a.length - 1);
        const i = done + 1;
        const j = rng.int(1, b.length);
        const setup: OpCall[] = [
          ['load', a, b],
          ...Array.from({ length: done + 1 }, () => ['row'] as OpCall),
        ];
        const full = run(settings, [...setup, ['row']]).endState();
        const value = full.d[i]![j]!;
        return {
          prompt: `Turn ${a} (down the side) into ${b} (across the top). ${costs(settings)} Rows 0 to ${done} are filled. What is D[${i}][${j}]?`,
          setup,
          settings,
          answer: { kind: 'number', value },
          explain: `Each cell is the cheapest of the diagonal plus the substitution cost (0 on a match), the cell above plus a delete, and the cell to the left plus an insert. Row ${i} from D[${i}][0]: ${full.d[i]!.slice(0, j + 1).join(', ')}.`,
          watch: [['row']],
        };
      },
    },
    {
      id: 'which-edit',
      title: 'Which edit is this step?',
      make(rng) {
        const settings = someCosts(rng);
        const [a, b] = pair(rng);
        const setup: OpCall[] = [['load', a, b], ['fill']];
        const s = run(settings, setup).endState();
        const walk = walkBack(s, settings);
        const col = walk[rng.int(0, walk.length - 1)]!;
        const match = 'A match (free)';
        const sub = 'A substitution';
        const del = 'A delete';
        const ins = 'An insert';
        const right = { M: match, S: sub, D: del, I: ins }[col.op];
        return {
          prompt: `The table turning ${a} into ${b} is filled. ${costs(settings)} The walk back reaches D[${col.i}][${col.j}] = ${s.d[col.i]![col.j]}. Which edit does its next step stand for? Ties go to the diagonal first, then up, then left.`,
          setup,
          settings,
          answer: {
            kind: 'choice',
            options: [match, sub, del, ins],
            correct: [match, sub, del, ins].indexOf(right),
          },
          explain:
            col.op === 'M'
              ? `A[${col.i}] = B[${col.j}] = '${col.from}', and D[${col.i}][${col.j}] equals the diagonal: a free match.`
              : col.op === 'S'
                ? `'${col.from}' ≠ '${col.to}', and D[${col.i}][${col.j}] is the diagonal plus ${settings.sub}: substitute '${col.to}' for '${col.from}'.`
                : col.op === 'D'
                  ? `The diagonal does not explain D[${col.i}][${col.j}], but the cell above plus ${settings.del} does: delete '${col.from}'.`
                  : `Only the cell to the left plus ${settings.ins} explains D[${col.i}][${col.j}]: insert '${col.to}'.`,
          watch: [['trace']],
        };
      },
    },
    {
      id: 'distance',
      title: 'What is the edit distance?',
      make(rng) {
        const settings = someCosts(rng);
        const [a, b] = pair(rng, 4);
        const setup: OpCall[] = [['load', a, b]];
        const end = last(settings, [...setup, ['fill']]);
        const dist = Number(end.vars?.distance);
        const ops = String(last(settings, [...setup, ['fill'], ['trace']]).vars?.ops);
        return {
          prompt: `What does it cost to turn ${a} into ${b}? ${costs(settings)} Fill the table in your head, or on paper.`,
          setup,
          settings,
          answer: { kind: 'number', value: dist },
          explain: `D[${a.length}][${b.length}] = ${dist}. One cheapest alignment, from left to right: ${ops.split('').join(' ')} (M match, S substitute, D delete, I insert).`,
          watch: [['fill'], ['trace']],
        };
      },
    },
    {
      id: 'alignment',
      title: 'Read off the alignment',
      make(rng) {
        const settings = someCosts(rng);
        const [a, b] = pair(rng);
        const setup: OpCall[] = [['load', a, b], ['fill']];
        const ops = String(last(settings, [...setup, ['trace']]).vars?.ops).split('');
        return {
          prompt: `The table turning ${a} into ${b} is filled. ${costs(settings)} Walk back from the bottom-right corner, trying the diagonal first, then up, then left. Type the edits from left to right, separated by spaces: M for a match, S substitute, D delete, I insert.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: ops },
          explain: `The walk back finds the edits from right to left; reversed, they are ${ops.join(' ')}. Their costs add up to D[${a.length}][${b.length}].`,
          watch: [['trace']],
        };
      },
    },
  ];
}
