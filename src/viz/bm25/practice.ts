import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import { CORPUS } from '../_lm/corpus';
import {
  avgdl,
  bOf,
  dName,
  defaults,
  k1Of,
  lengthPart,
  postingsOf,
  tfPart,
  tokens,
  type BmExtra,
  type BmSettings,
  type BmState,
  type SearchDone,
} from './model';

type Def = VizDef<BmState, BmSettings, BmExtra>;

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/**
 * Practice for BM25 with the default settings (k₁ = 1.2, b = 0.75, Robertson's IDF). The picture
 * shows the documents and the index after the setup; every answer comes from running the model.
 */
export function bm25Practice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops);

  function collection(rng: Rng, n = rng.int(5, 6)) {
    const docs = shuffle(rng, CORPUS).slice(0, n);
    const ops: OpCall[] = [['add', docs.join('; ')]];
    const s = run(ops).endState();
    const terms = s.index.map((t) => t.term).filter((t) => t !== 'the' && t !== 'a');
    return { ops, s, terms };
  }

  const search = (ops: OpCall[], q: string) =>
    run([...ops, ['search', q]]).endState().last as SearchDone;

  return [
    {
      id: 'idf',
      title: 'The IDF of a word',
      make(rng) {
        const { ops, s, terms } = collection(rng);
        const t = pick(rng, terms);
        const watch: OpCall[] = [['search', t]];
        const done = search(ops, t);
        const N = s.docs.length;
        const n = postingsOf(s, t)!.length;
        return {
          prompt: `What is the IDF of **${t}**? Use IDF = ln((N − n + 0.5) / (n + 0.5)), where n is the number of documents that contain it. Two decimals.`,
          setup: ops,
          answer: { kind: 'number', value: done.idf[t]!, tolerance: 0.005 },
          explain: `N = ${N} documents and "${t}" is in n = ${n} of them, so IDF = ln((${N} − ${n} + 0.5) / (${n} + 0.5)) = ln(${two((N - n + 0.5) / (n + 0.5))}) = ${two(done.idf[t]!)}.${done.idf[t]! < 0 ? ' Negative: the word is in more than half the documents.' : ''}`,
          watch,
        };
      },
    },
    {
      id: 'score',
      title: 'A document’s score',
      make(rng) {
        const { ops, s, terms } = collection(rng);
        const t = pick(rng, terms);
        const list = postingsOf(s, t)!;
        const p = pick(rng, list);
        const watch: OpCall[] = [['search', t]];
        const done = search(ops, t);
        const doc = s.docs[p.doc - 1]!;
        const avg = avgdl(s);
        const B = lengthPart(doc.words.length, avg, bOf(defaults));
        const part = tfPart(p.tf, k1Of(defaults), B);
        return {
          prompt: `Search for the one word **${t}**. What score does **${dName(p.doc)}** get? k₁ = 1.2, b = 0.75, avgdl = ${two(avg)}. Two decimals.`,
          setup: ops,
          answer: { kind: 'number', value: done.scores[p.doc]!, tolerance: 0.005 },
          explain: `IDF(${t}) = ${two(done.idf[t]!)}. ${dName(p.doc)} has ${doc.words.length} words, so B = 0.25 + 0.75 × ${doc.words.length} / ${two(avg)} = ${two(B)}, and tf = ${p.tf}, so the share is ${p.tf} / (${p.tf} + 1.2 × ${two(B)}) = ${two(part)}. The score is ${two(done.idf[t]!)} × ${two(part)} = ${two(done.scores[p.doc]!)}.`,
          watch,
        };
      },
    },
    {
      id: 'top',
      title: 'The top document',
      make(rng) {
        for (;;) {
          const { ops, s, terms } = collection(rng);
          const q = shuffle(rng, terms).slice(0, 2).join(' ');
          const done = search(ops, q);
          const [first, second] = done.top;
          // A clear winner, so the answer does not hang on the third decimal.
          if (!first || (second && first.score - second.score < 0.05)) continue;
          const options = s.docs.map((d) => dName(d.id));
          return {
            prompt: `Which document ranks first for the query **${q}**? (k₁ = 1.2, b = 0.75)`,
            setup: ops,
            answer: { kind: 'choice', options, correct: first.doc - 1 },
            explain: `The scores: ${Object.entries(done.scores)
              .map(([d, v]) => `${dName(Number(d))} ${two(v)}`)
              .join(
                ', ',
              )}. ${dName(first.doc)} is highest${second ? `, ahead of ${dName(second.doc)}` : ''}.`,
            watch: [['search', q]],
          };
        }
      },
    },
    {
      id: 'postings',
      title: 'A postings list after an add',
      make(rng) {
        const docs = shuffle(rng, CORPUS);
        const ops: OpCall[] = [['add', docs.slice(0, 4).join('; ')]];
        const s = run(ops).endState();
        const extra = docs[4]!;
        const words = tokens(extra).filter((w) => w !== 'the' && w !== 'a');
        const t = pick(rng, words);
        const watch: OpCall[] = [['add', extra]];
        const after = run([...ops, ...watch]).endState();
        const list = postingsOf(after, t)!;
        return {
          prompt: `Add d5: "${extra}". Then what is the postings list of **${t}**? List its documents in order (such as d1 d3 d5).`,
          setup: ops,
          answer: { kind: 'sequence', value: list.map((p) => dName(p.doc)) },
          explain: `${
            postingsOf(s, t)
              ? `"${t}" was on ${postingsOf(s, t)!
                  .map((p) => dName(p.doc))
                  .join(', ')}; d5 goes on the end`
              : `"${t}" was not in the index, so it gets a new list`
          }: ${list.map((p) => `${dName(p.doc)}:${p.tf}`).join(' ')} (document:tf). Lists stay in document order for free, because documents arrive in order.`,
          watch,
        };
      },
    },
  ];
}
