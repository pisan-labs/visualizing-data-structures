import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, Step, VizDef } from '../../engine/types';
import { defaults, type LcsExtra, type LcsSettings, type LcsState } from './model';

type Def = VizDef<LcsState, LcsSettings, LcsExtra>;
type LcsStep = Step<LcsState, LcsExtra>;

const TIE: Record<LcsSettings['tie'], string> = {
  up: 'When the cell above and the cell to the left tie, the walk goes up (CLRS).',
  left: 'When the cell above and the cell to the left tie, the walk goes left.',
};

/** A word over a small alphabet, so matches are common. */
function word(rng: Rng, lo: number, hi: number, letters = 'ABCD'): string {
  return Array.from(
    { length: rng.int(lo, hi) },
    () => letters[rng.int(0, letters.length - 1)],
  ).join('');
}

/** Two words with at least one character in common. */
function pair(rng: Rng, lo: number, hi: number): [string, string] {
  for (;;) {
    const x = word(rng, lo, hi);
    const y = word(rng, lo, hi);
    if ([...x].some((ch) => y.includes(ch))) return [x, y];
  }
}

/**
 * Practice questions for the LCS table. Answers come from running the model with seed 1, the
 * way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function lcsPractice(def: () => Def): PracticeKind[] {
  const run = (settings: Settings, ops: OpCall[]) =>
    new Timeline(def(), { ...defaults, ...settings } as LcsSettings, 1, ops);
  const lastSteps = (settings: Settings, ops: OpCall[]): LcsStep[] =>
    run(settings, ops).entries.at(-1)!.steps;

  return [
    {
      id: 'cell',
      title: 'Fill the next row',
      make(rng) {
        const [x, y] = pair(rng, 4, 6);
        const done = rng.int(1, x.length - 1);
        const i = done + 1;
        const j = rng.int(1, y.length);
        const setup: OpCall[] = [
          ['load', x, y],
          ...Array.from({ length: done + 1 }, () => ['row'] as OpCall),
        ];
        const full = run({}, [...setup, ['row']]).endState();
        const value = full.c[i]![j]!;
        const rowSoFar = full.c[i]!.slice(1, j + 1);
        return {
          prompt: `X = ${x} down the side, Y = ${y} across the top. Rows 0 to ${done} are filled. What is c[${i}][${j}]?`,
          setup,
          answer: { kind: 'number', value },
          explain: `Row ${i} is X[${i}] = '${x[i - 1]}' against each character of Y. A match adds 1 to the cell up and to the left; anything else copies the bigger of the cell above and the cell to the left. From c[${i}][1]: ${rowSoFar.join(', ')}.`,
          watch: [['row']],
        };
      },
    },
    {
      id: 'next-move',
      title: 'Where does the walk go next?',
      make(rng) {
        const tie = rng.int(0, 1) ? 'up' : 'left';
        const settings: Settings = { tie };
        const [x, y] = pair(rng, 4, 6);
        const setup: OpCall[] = [['load', x, y], ['fill']];
        const path = lastSteps(settings, [...setup, ['trace']]).at(-1)!.extra!.path!;
        // A cell on the walk that still has a move to make.
        const k = rng.int(0, Math.max(0, path.length - 2));
        const [i, j] = path[k]!;
        const [ni, nj] = path[k + 1]!;
        const diag = `Diagonally to c[${i - 1}][${j - 1}], taking '${x[i - 1]}'`;
        const up = `Up to c[${i - 1}][${j}]`;
        const left = `Left to c[${i}][${j - 1}]`;
        const right = ni < i && nj < j ? diag : ni < i ? up : left;
        return {
          prompt: `The table for X = ${x} and Y = ${y} is filled. ${TIE[tie]} The walk back from c[${x.length}][${y.length}] reaches c[${i}][${j}]. Where does it go next?`,
          setup,
          settings,
          answer: {
            kind: 'choice',
            options: [diag, up, left],
            correct: [diag, up, left].indexOf(right),
          },
          explain:
            right === diag
              ? `X[${i}] = Y[${j}] = '${x[i - 1]}', so c[${i}][${j}] came from a match: take the character and go diagonally.`
              : `X[${i}] = '${x[i - 1]}' and Y[${j}] = '${y[j - 1]}' differ, so the walk goes to the bigger of the cell above and the cell to the left${right === up ? ': up' : ': left'}.`,
          watch: [['trace']],
        };
      },
    },
    {
      id: 'lcs',
      title: 'Which LCS does the walk find?',
      make(rng) {
        const tie = rng.int(0, 1) ? 'up' : 'left';
        const settings: Settings = { tie };
        const [x, y] = pair(rng, 4, 7);
        const setup: OpCall[] = [['load', x, y], ['fill']];
        const end = lastSteps(settings, [...setup, ['trace']]).at(-1)!;
        const lcs = String(end.vars?.lcs);
        return {
          prompt: `The table for X = ${x} and Y = ${y} is filled. ${TIE[tie]} Walk back from c[${x.length}][${y.length}] and type the LCS it finds, as one word.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: [lcs] },
          explain: `Each diagonal move takes a character, from the end of the LCS back to its start: ${lcs.split('').join(', ')}. That is ${lcs}, of length c[${x.length}][${y.length}] = ${lcs.length}.`,
          watch: [['trace']],
        };
      },
    },
    {
      id: 'length',
      title: 'How long is the LCS?',
      make(rng) {
        const [x, y] = pair(rng, 3, 5);
        const setup: OpCall[] = [['load', x, y]];
        const end = lastSteps({}, [...setup, ['fill']]).at(-1)!;
        const length = Number(end.vars?.length);
        const lcs = String(lastSteps({}, [...setup, ['fill'], ['trace']]).at(-1)!.vars?.lcs);
        return {
          prompt: `How long is the longest common subsequence of ${x} and ${y}? Fill the table in your head, or on paper.`,
          setup,
          answer: { kind: 'number', value: length },
          explain: `The bottom-right cell is c[${x.length}][${y.length}] = ${length}. One LCS is ${lcs}.`,
          watch: [['fill'], ['trace']],
        };
      },
    },
  ];
}
