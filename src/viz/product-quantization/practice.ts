import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { dist2 } from './kmeans';
import {
  adc,
  adcTable,
  bitsOf,
  cut,
  D,
  defaults,
  MAX,
  nearPrototypes,
  num,
  piece,
  pieceOf,
  writeVectors,
  type PqExtra,
  type PqSettings,
  type PqState,
  type Size,
  type Pieces,
} from './model';

type Def = VizDef<PqState, PqSettings, PqExtra>;

/**
 * Practice for product quantization. The picture shows the vectors and the trained codebooks
 * (and the codes, when the setup encoded them); the prompt asks about the step that follows.
 * Every answer comes from running the model.
 */
export function pqPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: PqSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);

  function setup(rng: Rng, encoded: boolean, settings: PqSettings = defaults, n = rng.int(6, 8)) {
    const ops: OpCall[] = [['load', writeVectors(nearPrototypes(rng, n))], ['train']];
    if (encoded) ops.push(['encode']);
    return { ops, s: run(ops, settings).endState() };
  }
  const someQuery = (rng: Rng) => Array.from({ length: D }, () => rng.int(0, MAX));
  /** The smallest value is ahead of the next by at least `gap`. */
  const clear = (xs: number[], gap = 0.5) => {
    const ys = [...xs].sort((a, b) => a - b);
    return ys.length < 2 || ys[1]! - ys[0]! >= gap;
  };

  return [
    {
      id: 'code',
      title: 'The code of a vector',
      make(rng) {
        for (;;) {
          const { ops, s } = setup(rng, false);
          const i = rng.int(0, s.vecs.length - 1);
          const v = s.vecs[i]!;
          const dd = s.books.map((b, j) => b.map((c) => dist2(pieceOf(v.v, 2, j), c)));
          if (!dd.every((row) => clear(row))) continue;
          const watch: OpCall[] = [['encode']];
          const code = run([...ops, ...watch]).endState().codes![i]!;
          return {
            prompt: `The two codebooks are trained. What code does Encode give **${v.name}** = ${cut(v.v, 2)}? Give the number of the nearest centre for each piece, piece 1 first, for example 3 0.`,
            setup: ops,
            answer: { kind: 'sequence', value: code.map(String) },
            explain: code
              .map(
                (c, j) =>
                  `Piece ${j + 1}, ${piece(pieceOf(v.v, 2, j))}: d² to the centres ${dd[j]!.map((d, k) => `${k} ${num(d)}`).join(', ')}, so ${c}.`,
              )
              .join(' ')
              .concat(` The code is ${code.join(' ')}: 4 bits instead of 4 numbers.`),
            watch,
          };
        }
      },
    },
    {
      id: 'adc',
      title: 'A distance from the table',
      make(rng) {
        const { ops, s } = setup(rng, true);
        const q = someQuery(rng);
        const i = rng.int(0, s.vecs.length - 1);
        const v = s.vecs[i]!;
        const code = s.codes![i]!;
        const watch: OpCall[] = [['search', q.join(',')]];
        const last = run([...ops, ...watch]).endState().last!;
        const value = last.approx[i]!;
        const table = adcTable(q, s.books);
        return {
          prompt: `Search for q = ${cut(q, 2)}. **${v.name}** is stored as the code ${code.join(' ')}. What squared distance does the table give for ${v.name}? Work out q's piece 1 against centre ${code[0]} of codebook 1 and q's piece 2 against centre ${code[1]} of codebook 2, and add them. Two decimals.`,
          setup: ops,
          answer: { kind: 'number', value, tolerance: 0.005 },
          explain: `Piece 1: ${piece(pieceOf(q, 2, 0))} to ${piece(s.books[0]![code[0]!]!)} is ${num(table[0]![code[0]!]!)}. Piece 2: ${piece(pieceOf(q, 2, 1))} to ${piece(s.books[1]![code[1]!]!)} is ${num(table[1]![code[1]!]!)}. The table gives ${num(adc(table, code))}; the exact d² to ${cut(v.v, 2)} is ${num(last.exact[i]!)}.`,
          watch,
        };
      },
    },
    {
      id: 'rank',
      title: 'The nearest by the table',
      make(rng) {
        for (;;) {
          const { ops, s } = setup(rng, true);
          const q = someQuery(rng);
          const table = adcTable(q, s.books);
          const approx = s.codes!.map((c) => adc(table, c));
          if (!clear(approx)) continue;
          const watch: OpCall[] = [['search', q.join(',')]];
          const last = run([...ops, ...watch]).endState().last!;
          const best = last.found[0]!;
          const options = s.vecs.map((v) => v.name);
          const truth = last.truth[0]!;
          return {
            prompt: `Search for q = ${cut(q, 2)}. Using only the codes and the codebooks (asymmetric distance), which stored vector comes out nearest?`,
            setup: ops,
            answer: { kind: 'choice', options, correct: best },
            explain: `By the table: ${s.vecs.map((v, i) => `${v.name} ${num(approx[i]!)}`).join(', ')}. The smallest is ${options[best]}.${truth === best ? ' It is also the nearest by the exact distance.' : ` By the exact distance the nearest is ${options[truth]} (${num(last.exact[truth]!)} against ${num(last.exact[best]!)}): the codes lost the difference.`}`,
            watch,
          };
        }
      },
    },
    {
      id: 'bits',
      title: 'Memory per vector',
      make(rng) {
        const pieces = (['1', '2', '4'] as Pieces[])[rng.int(0, 2)]!;
        const size = (['2', '4', '8'] as Size[])[rng.int(0, 2)]!;
        const settings: PqSettings = { pieces, size };
        const { ops, s } = setup(rng, false, settings, rng.int(8, 10));
        const watch: OpCall[] = [['encode']];
        const value = bitsOf(s.m, s.ks);
        return {
          prompt: `The codebooks were trained with **${s.m} ${s.m === 1 ? 'piece' : 'pieces'}** and **${s.ks} centres** in each codebook. How many bits does Encode store for each vector?`,
          setup: ops,
          settings,
          answer: { kind: 'number', value },
          explain: `A code is the number of one of ${s.ks} centres: log₂ ${s.ks} = ${Math.log2(s.ks)} bit${s.ks === 2 ? '' : 's'}. There is one code per piece, so ${s.m} × ${Math.log2(s.ks)} = ${value} bits, against ${D * 32} bits for ${D} floats. The ${s.m * s.ks} centres are stored once, for every vector.`,
          watch,
        };
      },
    },
  ];
}
