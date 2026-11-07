import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import type { Sym } from '../_grammar/grammar';
import {
  cellName,
  defaults,
  setText,
  type CykExtra,
  type CykSettings,
  type CykState,
} from './model';

type Def = VizDef<CykState, CykSettings, CykExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const word = (rng: Rng, n: number, from: string) =>
  Array.from({ length: n }, () => pick(rng, [...from])).join('');

/** A grammar already in Chomsky normal form, so the table's variables are the ones typed. */
const CLASSIC = 'S -> AB | BC; A -> BA | a; B -> CC | b; C -> AB | a';
const ANBN = 'S -> aSb | eps';

/**
 * Practice for the CYK page. Every answer comes from running the model, so it agrees with what
 * the page shows. `def` is a getter to avoid an import cycle.
 */
export function cykPractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) =>
    new Timeline(def(), { ...defaults, conversion: 'result' }, 1, calls);
  const parsed = (grammar: string, w: string) =>
    run([
      ['load', grammar],
      ['parse', w],
    ]).entries.at(-1)!;
  /** Every distinct set the table holds, as text, for wrong answers. */
  const sets = (table: (Sym[] | null)[][]) => [
    ...new Set(table.flat().map((c) => setText(c ?? []))),
  ];

  /** Choices: the right set and up to three others, all different. */
  const choices = (rng: Rng, right: string, others: string[]) => {
    const pool = [...new Set(others.filter((o) => o !== right))];
    for (const extra of ['∅', '{ S }', '{ A, C }', '{ B }', '{ A, S }', '{ C }'])
      if (pool.length < 3 && extra !== right && !pool.includes(extra)) pool.push(extra);
    const options = shuffle(rng, [right, ...shuffle(rng, pool).slice(0, 3)]);
    return { options, correct: options.indexOf(right) };
  };

  return [
    {
      id: 'bottom-row',
      title: 'The bottom row',
      make(rng) {
        const w = word(rng, rng.int(3, 5), 'ab');
        const end = parsed(CLASSIC, w).end;
        const i = rng.int(0, w.length - 1);
        const right = setText(end.table![0]![i]!);
        const { options, correct } = choices(rng, right, sets(end.table!));
        return {
          prompt: `The rules on the stage are in Chomsky normal form. CYK parses ${w}. Which variables go in ${cellName(1, i)}, the bottom cell for symbol ${i + 1}, which is ${w[i]}?`,
          setup: [['load', CLASSIC]],
          settings: { conversion: 'result' },
          answer: { kind: 'choice', options, correct },
          explain: `${cellName(1, i)} holds every variable with a rule giving ${w[i]} on its own: ${right}.`,
          watch: [['parse', w]],
        };
      },
    },
    {
      id: 'cell',
      title: 'A cell higher up',
      make(rng) {
        const w = word(rng, rng.int(3, 5), 'ab');
        const end = parsed(CLASSIC, w).end;
        const len = rng.int(2, Math.min(3, w.length));
        const i = rng.int(0, w.length - len);
        const right = setText(end.table![len - 1]![i]!);
        const { options, correct } = choices(rng, right, sets(end.table!));
        return {
          prompt: `CYK parses ${w} with the rules on the stage. Which variables end up in ${cellName(len, i)}, the cell for "${w.slice(i, i + len)}"?`,
          setup: [['load', CLASSIC]],
          settings: { conversion: 'result' },
          answer: { kind: 'choice', options, correct },
          explain: `Try each way to cut "${w.slice(i, i + len)}" in two, and each rule A → BC with B in the left part's cell and C in the right part's: ${cellName(len, i)} = ${right}.`,
          watch: [['parse', w]],
        };
      },
    },
    {
      id: 'accept',
      title: 'Accept or reject?',
      make(rng) {
        const [grammar, name, w] = pick(rng, [
          [ANBN, 'aⁿbⁿ', pick(rng, ['aabb', 'aab', 'abab', 'ab', 'aaabbb', 'abb'])],
          [CLASSIC, 'the grammar on the stage', word(rng, rng.int(2, 5), 'ab')],
        ] as const);
        const e = parsed(grammar, w);
        const yes = !!e.end.accept;
        const start = e.end.cnf.cnf.start;
        const top = e.end.table![w.length - 1]![0]!;
        const options = ['Accept', 'Reject'];
        return {
          prompt: `The grammar is for ${name}. Does CYK accept ${w}?`,
          setup: [['load', grammar]],
          settings: { conversion: 'result' },
          answer: { kind: 'choice', options, correct: yes ? 0 : 1 },
          explain: `The top cell, ${cellName(w.length, 0)}, is ${setText(top)}: ${start} is ${yes ? '' : 'not '}in it, so CYK ${yes ? 'accepts' : 'rejects'}.`,
          watch: [['parse', w]],
        };
      },
    },
    {
      id: 'splits',
      title: 'How many splits?',
      make(rng) {
        const n = rng.int(3, 7);
        const w = word(rng, n, 'ab');
        const tried = Number(parsed(ANBN, w).steps.at(-1)!.vars?.['splits tried'] ?? 0);
        return {
          prompt: `CYK fills the table for a word of ${n} symbols, ${w}. How many splits does it try in all? (A cell for ℓ symbols has ℓ − 1 places to cut.)`,
          setup: [['load', ANBN]],
          settings: { conversion: 'result' },
          answer: { kind: 'number', value: tried },
          explain: `Add up ℓ − 1 over every cell: there are n − ℓ + 1 cells of length ℓ. For n = ${n} that is ${tried}, which is (n³ − n)/6. The grammar and the word do not matter, only n.`,
          watch: [['parse', w]],
        };
      },
    },
  ];
}
