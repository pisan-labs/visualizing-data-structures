import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind, Settings } from '../../engine/types';
import { andList, loadCall, plural, randomWord } from '../_strings/kit';
import { nexts, ordered, pair, stateAfter, type MatchDef } from '../_strings/practice';

const DIGITS = '0123456789';

/** A text of digits with the pattern planted once, and a small modulus. */
function digitsInput(rng: Rng, n: number, m: number, moduli: readonly number[]) {
  const pattern = randomWord(rng, m, DIGITS);
  const chars = [...randomWord(rng, n, DIGITS)];
  const at = rng.int(0, n - m);
  for (let j = 0; j < m; j++) chars[at + j] = pattern[j]!;
  const text = chars.join('');
  const q = moduli[rng.int(0, moduli.length - 1)]!;
  const settings: Settings = { radix: 'auto', q };
  return { text, pattern, load: loadCall(text, pattern), settings, q };
}

/**
 * Practice questions for Rabin-Karp, on digits so the hashes can be worked out by hand (d = 10).
 * Every answer comes from running the model. `def` is a getter to avoid an import cycle.
 */
export function rkPractice(def: () => MatchDef): PracticeKind[] {
  const hashing = (settings: Settings, ops: OpCall[]) =>
    stateAfter(def(), settings, ops).search!.hashing!;

  return [
    {
      id: 'pattern-hash',
      title: 'The hash of P',
      make(rng) {
        const { text, pattern, load, settings, q } = digitsInput(
          rng,
          rng.int(9, 12),
          rng.int(3, 4),
          [7, 11, 13],
        );
        const p = hashing(settings, [load, ['next']]).p;
        return {
          prompt: `${pair(text, pattern)}, with d = 10 and q = ${q}. What is p, the hash of P?`,
          setup: [load],
          settings,
          answer: { kind: 'number', value: p },
          explain: `P read as a number is ${Number(pattern)}, and ${Number(pattern)} mod ${q} = ${p}. Horner's rule gets there one digit at a time, keeping only the remainder.`,
          watch: [['next']],
        };
      },
    },
    {
      id: 'roll',
      title: 'Roll the hash',
      make(rng) {
        const { text, pattern, load, settings, q } = digitsInput(rng, rng.int(9, 12), 3, [11, 13]);
        const m = pattern.length;
        const k = rng.int(0, text.length - m - 1);
        const setup: OpCall[] = [load, ...nexts(k)];
        const hs = hashing(settings, [...setup, ['next']]);
        const t = hs.values[k]!;
        const next = hs.values[k + 1]!;
        const a = t - Number(text[k]) * hs.h;
        return {
          prompt: `${pair(text, pattern)}, with d = 10, q = ${q} and h = 10² mod ${q} = ${hs.h}. The window at shift ${k}, ${text.slice(k, k + m)}, has hash t = ${t}. Roll it: what is the hash of the next window, ${text.slice(k + 1, k + 1 + m)}?`,
          setup,
          settings,
          answer: { kind: 'number', value: next },
          explain: `Drop ${text[k]} and bring in ${text[k + m]}: (10 × (${t} − ${text[k]} × ${hs.h}) + ${text[k + m]}) mod ${q} = ${10 * a + Number(text[k + m])} mod ${q} = ${next}. Check: ${Number(text.slice(k + 1, k + 1 + m))} mod ${q} = ${next}.`,
          watch: [['next']],
        };
      },
    },
    {
      id: 'spurious',
      title: 'Real match or spurious hit?',
      make(rng) {
        for (let tries = 0; tries < 1000; tries++) {
          const { text, pattern, load, settings, q } = digitsInput(
            rng,
            rng.int(10, 13),
            3,
            [7, 11],
          );
          const end = stateAfter(def(), settings, [load, ['search']]);
          const hits = end
            .search!.attempts.map((a, k) => ({ a, k }))
            .filter(({ a }) => a.end === 'match' || a.end === 'spurious');
          // Spurious hits most of the time, so guessing "match" does not pay.
          const spurious = hits.filter(({ a }) => a.end === 'spurious');
          const pool = spurious.length && rng.int(0, 2) ? spurious : hits;
          if (!pool.length) continue;
          const { a, k } = pool[rng.int(0, pool.length - 1)]!;
          const hs = end.search!.hashing!;
          const options = ['A real match', 'A spurious hit'];
          const real = a.end === 'match';
          return {
            prompt: `${pair(text, pattern)}, with d = 10 and q = ${q}. P waits at shift ${k}, where the window's hash equals p = ${hs.p}. Is it a real match or a spurious hit?`,
            setup: [load, ...nexts(k)],
            settings,
            answer: ordered(options, options[real ? 0 : 1]!),
            explain: real
              ? `T[${k}..${k + 2}] = ${text.slice(k, k + 3)} is P itself, so the check finds a real match.`
              : `T[${k}..${k + 2}] = ${text.slice(k, k + 3)} is not ${pattern}: ${Number(text.slice(k, k + 3))} and ${Number(pattern)} just leave the same remainder mod ${q}. Only the character check can tell.`,
            watch: [['next']],
          };
        }
        throw new Error('No hash hit turned up.');
      },
    },
    {
      id: 'count',
      title: 'How many spurious hits?',
      make(rng) {
        const { text, pattern, load, settings, q } = digitsInput(
          rng,
          rng.int(8, 10),
          2,
          [7, 9, 11],
        );
        const hs = hashing(settings, [load, ['search']]);
        const count = hs.spurious.length;
        return {
          prompt: `${pair(text, pattern)}, with d = 10 and q = ${q}. Each window is a two-digit number. How many spurious hits does the search run into?`,
          setup: [load],
          settings,
          answer: { kind: 'number', value: count },
          explain: `p = ${Number(pattern)} mod ${q} = ${hs.p}. ${count ? `${count === 1 ? 'The window at shift' : `${plural(count, 'window')}, at shifts`} ${andList(hs.spurious)}, ${count === 1 ? 'leaves' : 'leave'} the same remainder without being ${pattern}` : `No window other than a real match leaves remainder ${hs.p}`}.`,
          watch: [['search']],
        };
      },
    },
  ];
}
