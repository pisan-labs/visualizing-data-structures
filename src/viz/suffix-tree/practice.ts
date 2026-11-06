import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { counts, defaults, full, q, type StExtra, type StSettings, type StState } from './model';

type Def = VizDef<StState, StSettings, StExtra>;

function word(rng: Rng, n: number, letters: string): string {
  return Array.from({ length: n }, () => letters[rng.int(0, letters.length - 1)]).join('');
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Practice for suffix trees. Every answer comes from running the model: node counts from a
 * build, positions from a search, counts from count, and the repeat from its operation.
 */
export function suffixTreePractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  const lastVars = (calls: OpCall[]) => run(calls).entries.at(-1)!.steps.at(-1)!.vars!;

  return [
    {
      id: 'internal',
      title: 'How many internal nodes?',
      make(rng) {
        const t = word(rng, rng.int(4, 6), rng.int(0, 1) ? 'AB' : 'ABC');
        const s = run([['load', t], ['build']]).endState();
        const k = counts(s.tree);
        return {
          prompt: `Build the suffix tree of ${q(full(t))}. How many internal nodes does it have, not counting the root? (It has ${k.leaves} leaves, one per suffix.)`,
          setup: [['load', t]],
          answer: { kind: 'number', value: k.internal },
          explain: `An internal node is where two suffixes that share a start go different ways. ${q(full(t))} has ${k.internal} such places besides the root. There are never more than n - 1 of them for n leaves, since each has at least two children.`,
          watch: [['build']],
        };
      },
    },
    {
      id: 'search',
      title: 'Where does P occur?',
      make(rng) {
        for (;;) {
          const t = word(rng, rng.int(6, 9), 'ABN');
          const len = rng.int(2, 3);
          const from = rng.int(0, t.length - len);
          const p = t.slice(from, from + len);
          const found = String(lastVars([['load', t], ['build'], ['search', p]]).found).split(' ');
          if (found.length < 2 && rng.int(0, 1)) continue;
          return {
            prompt: `The suffix tree of ${q(full(t))} is built. Search for P = ${q(p)}: type every position where it occurs, smallest first.`,
            setup: [['load', t], ['build']],
            answer: { kind: 'sequence', value: found },
            explain: `Walk ${q(p)} down from the root. Every leaf below the end of the walk is a suffix that starts with ${q(p)}, and its label is where that suffix starts: ${found.join(', ')}.`,
            watch: [['search', p]],
          };
        }
      },
    },
    {
      id: 'count',
      title: 'How often does P occur?',
      make(rng) {
        const t = word(rng, rng.int(7, 10), 'AB');
        const p = word(rng, rng.int(1, 3), 'AB');
        const count = Number(lastVars([['load', t], ['build'], ['count', p]]).count);
        return {
          prompt: `The suffix tree of ${q(full(t))} is built. How many times does ${q(p)} occur in ${q(t)}? Copies may overlap.`,
          setup: [['load', t], ['build']],
          answer: { kind: 'number', value: count },
          explain:
            count === 0
              ? `The walk for ${q(p)} falls off the tree, so it occurs 0 times.`
              : `The walk for ${q(p)} ends at or inside the edge into a node with ${count} ${count === 1 ? 'leaf' : 'leaves'} below it, one per occurrence.`,
          watch: [['count', p]],
        };
      },
    },
    {
      id: 'repeat',
      title: 'The longest repeat',
      make(rng) {
        for (;;) {
          const t = word(rng, rng.int(6, 9), rng.int(0, 1) ? 'AB' : 'ABC');
          const answer = String(lastVars([['load', t], ['build'], ['repeat']]).repeat);
          if (answer === 'none' || answer.length < 2) continue;
          const pieces = new Set<string>();
          for (let i = 0; i < t.length; i++)
            for (let n = 2; n <= answer.length + 1 && i + n <= t.length; n++)
              pieces.add(t.slice(i, i + n));
          // Another repeat as long as the answer would be right too: leave those out.
          const repeats = (x: string) => t.indexOf(x) !== t.lastIndexOf(x);
          for (const x of pieces) if (x.length >= answer.length && repeats(x)) pieces.delete(x);
          pieces.delete(answer);
          const options = shuffle(rng, [answer, ...shuffle(rng, [...pieces]).slice(0, 3)]);
          return {
            prompt: `Which is the longest substring of ${q(t)} that occurs at least twice? (The copies may overlap.)`,
            setup: [['load', t], ['build']],
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain: `The deepest internal node, counted in characters, spells ${q(answer)}. It has at least two leaves below, so at least two suffixes start with it.`,
            watch: [['repeat']],
          };
        }
      },
    },
  ];
}
