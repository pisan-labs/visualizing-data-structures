import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, q, type SuffixExtra, type SuffixSettings, type SuffixState } from './model';

type Def = VizDef<SuffixState, SuffixSettings, SuffixExtra>;

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
 * Practice for suffix arrays. Every answer comes from running the model: SA and LCP from a
 * build, positions from a search, and the longest repeat from its operation.
 */
export function suffixPractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  const built = (t: string) => run([['load', t], ['build']]).endState();

  return [
    {
      id: 'sa',
      title: 'Sort the suffixes',
      make(rng) {
        const t = word(rng, rng.int(5, 6), rng.int(0, 1) ? 'AB' : 'ABC');
        const s = built(t);
        const sa = s.sa!.map(String);
        return {
          prompt: `The table lists the suffixes of ${q(t)} in the order they start. Type the suffix array: the start positions in sorted order, such as 2 0 1.`,
          setup: [['load', t]],
          answer: { kind: 'sequence', value: sa },
          explain: `In dictionary order: ${s.sa!.map((p) => `${q(t.slice(p))} (${p})`).join(', ')}. A suffix that is a prefix of another comes first.`,
          watch: [['build']],
        };
      },
    },
    {
      id: 'lcp',
      title: 'Longest common prefix',
      make(rng) {
        for (;;) {
          const t = word(rng, rng.int(6, 8), 'AB');
          const s = built(t);
          const rows = s.lcp!.map((v, i) => [v, i]).filter(([v, i]) => i! > 0 && v! >= 1);
          if (rows.length === 0) continue;
          const [v, i] = rows[rng.int(0, rows.length - 1)]!;
          const a = s.sa![i! - 1]!;
          const b = s.sa![i!]!;
          return {
            prompt: `Build the suffix array of ${q(t)}. What is LCP[${i}], the longest common prefix of the suffixes in rows ${i! - 1} and ${i}?`,
            setup: [['load', t]],
            answer: { kind: 'number', value: v! },
            explain: `Row ${i! - 1} is ${q(t.slice(a))} and row ${i} is ${q(t.slice(b))}. They share ${q(t.slice(b, b + v!))}, ${v} characters, before they differ or one runs out.`,
            watch: [['build']],
          };
        }
      },
    },
    {
      id: 'search',
      title: 'Where does P occur?',
      make(rng) {
        for (;;) {
          const t = word(rng, rng.int(7, 9), 'ABN');
          const len = rng.int(2, 3);
          const from = rng.int(0, t.length - len);
          const p = t.slice(from, from + len);
          const tl = run([['load', t], ['build'], ['search', p]]);
          const last = tl.entries.at(-1)!.steps.at(-1)!;
          const found = String(last.vars!.found).split(' ');
          if (found.length < 2 && rng.int(0, 1)) continue;
          return {
            prompt: `The suffix array of ${q(t)} is built. Search for P = ${q(p)}: type every position where it occurs, smallest first.`,
            setup: [['load', t], ['build']],
            answer: { kind: 'sequence', value: found },
            explain: `The suffixes that start with ${q(p)} sit in a block of neighbouring rows, and their SA values are the positions: ${found.join(', ')}.`,
            watch: [['search', p]],
          };
        }
      },
    },
    {
      id: 'repeat',
      title: 'The longest repeat',
      make(rng) {
        for (;;) {
          const t = word(rng, rng.int(7, 9), rng.int(0, 1) ? 'AB' : 'ABC');
          const tl = run([['load', t], ['build'], ['repeat']]);
          const answer = String(tl.entries.at(-1)!.steps.at(-1)!.vars!.repeat);
          if (answer === 'none' || answer.length < 2) continue;
          // Other substrings: shorter repeats, and pieces of the same length that may not repeat.
          const pieces = new Set<string>();
          for (let i = 0; i < t.length; i++)
            for (let n = 2; n <= answer.length + 1 && i + n <= t.length; n++)
              pieces.add(t.slice(i, i + n));
          // Another repeat as long as the answer would be right too: leave those out.
          const repeats = (x: string) => t.indexOf(x) !== t.lastIndexOf(x);
          for (const x of pieces) if (x.length >= answer.length && repeats(x)) pieces.delete(x);
          const options = shuffle(rng, [answer, ...shuffle(rng, [...pieces]).slice(0, 3)]);
          return {
            prompt: `What is the longest substring of ${q(t)} that occurs at least twice? (The two copies may overlap.)`,
            setup: [['load', t], ['build']],
            answer: { kind: 'choice', options, correct: options.indexOf(answer) },
            explain: `The largest LCP is ${answer.length}: two neighbouring rows share ${q(answer)}. Every repeat is a common prefix of two suffixes, and the longest one belongs to neighbours.`,
            watch: [['repeat']],
          };
        }
      },
    },
  ];
}
