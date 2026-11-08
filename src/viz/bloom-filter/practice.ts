import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { distinctKeys, shuffle } from '../_hashing/hashing';
import {
  defaults,
  formulaRate,
  hashList,
  ones,
  pct,
  positions,
  type BloomExtra,
  type BloomSettings,
  type BloomState,
} from './model';

type Def = VizDef<BloomState, BloomSettings, BloomExtra>;
type T = Timeline<BloomState, BloomSettings, BloomExtra>;

const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;
const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k]);

function hashes(s: BloomSettings): string {
  return `k = ${s.k} hash functions hᵢ(x) = ((aᵢ·x + bᵢ) mod 1009) mod ${s.m} with (aᵢ, bᵢ) = ${hashList(s.k)}`;
}

/**
 * Practice for the Bloom filter. Every answer comes from running the model. `def` is a getter to
 * avoid an import cycle.
 */
export function bloomPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], s: BloomSettings): T => new Timeline(def(), s, 1, cs);
  const last = (t: T) => t.entries[t.entries.length - 1]!.steps.at(-1)!;

  return [
    {
      id: 'which-bits',
      title: 'Which bits?',
      make(rng) {
        const s: BloomSettings = { m: pick(rng, [8, 16]), k: pick(rng, [2, 3]) };
        const keys = distinctKeys(rng, rng.int(1, 3));
        const x = distinctKeys(rng, 6).find((y) => !keys.includes(y))!;
        const setup = inserts(keys);
        const t = run([...setup, ['insert', x]], s);
        // The positions as the model's steps show them, hash by hash.
        const js = t.entries
          .at(-1)!
          .steps.filter((st) => st.lines.includes('ins.set'))
          .map((st) => String(st.vars!.j));
        return {
          prompt: `The filter has m = ${s.m} bits and ${hashes(s)}. Which bits does \`insert(${x})\` set? List h1(${x}) to h${s.k}(${x}) in order.`,
          setup,
          settings: s as Settings,
          answer: { kind: 'sequence', value: js },
          explain: `${js.map((j, i) => `h${i + 1}(${x}) = ${j}`).join(', ')}. Insert sets each of those bits to 1, whatever it was before.`,
          watch: [['insert', x]],
        };
      },
    },
    {
      id: 'query-answer',
      title: 'What does query say?',
      make(rng) {
        const s: BloomSettings = { ...defaults };
        const keys = distinctKeys(rng, rng.int(4, 6));
        const setup = inserts(keys);
        const base = run(setup, s).endState();
        const absent = shuffle(
          rng.next,
          Array.from({ length: 200 }, (_, i) => i),
        ).filter((y) => !keys.includes(y));
        const fps = absent.filter((y) => positions(y, s.m, s.k).every((j) => base.bits[j]));
        const kind = rng.int(0, 2);
        const x =
          kind === 0
            ? pick(rng, keys)
            : kind === 1 && fps.length
              ? fps[0]!
              : absent.find((y) => !fps.includes(y))!;
        const t = run([...setup, ['query', x]], s);
        const end = last(t);
        const options = [
          'Definitely not in the set',
          'Probably in the set, and it was inserted',
          'Probably in the set, but it is a false positive',
        ];
        const correct = end.vars!.answer === 'no' ? 0 : keys.includes(x) ? 1 : 2;
        const js = positions(x, s.m, s.k);
        return {
          prompt: `The filter has m = ${s.m} bits and ${hashes(s)}. The keys inserted are ${keys.join(', ')}. What does \`query(${x})\` report?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'choice', options, correct },
          explain: `The bits of ${x} are ${js.join(', ')}. ${
            correct === 0
              ? `At least one of them is 0, which proves ${x} was never inserted.`
              : correct === 1
                ? `${x} was inserted, so all of them are 1: a Bloom filter never gives a false negative.`
                : `All of them are 1, set by other keys, so the filter says "probably", but ${x} was never inserted.`
          }`,
          watch: [['query', x]],
        };
      },
    },
    {
      id: 'bits-set',
      title: 'How many bits are set?',
      make(rng) {
        const s: BloomSettings = { m: pick(rng, [8, 16]), k: pick(rng, [2, 3]) };
        const setup = inserts(distinctKeys(rng, rng.int(1, 2)));
        const more = distinctKeys(rng, 6)
          .filter((y) => !setup.some((c) => c[1] === y))
          .slice(0, 2);
        const ask = inserts(more);
        const end = run([...setup, ...ask], s).endState();
        const n = ones(end);
        return {
          prompt: `The filter has m = ${s.m} bits and ${hashes(s)}. Starting from the bits shown, run ${ask.map((c) => `\`insert(${c[1]})\``).join(', ')}. How many bits are 1 afterwards?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'number', value: n },
          explain: `${more.map((y) => `${y} sets bits ${positions(y, s.m, s.k).join(', ')}`).join('; ')}. Bits that were 1 already, or that two hashes share, count once: ${n} bits are 1.`,
          watch: ask,
        };
      },
    },
    {
      id: 'formula',
      title: 'The false-positive formula',
      make(rng) {
        const m = pick(rng, [16, 32]);
        const k = pick(rng, [1, 2, 3, 4]);
        const s: BloomSettings = { m, k };
        const n = rng.int(2, 6);
        const setup = inserts(distinctKeys(rng, n));
        const t = run(setup, s);
        const got = String(last(t).vars!['formula p']);
        const wrong = [
          pct(formulaRate(n, m, k) ** (1 / k)),
          pct(1 - Math.exp(-n / m)),
          pct(formulaRate(n, m, k + 1)),
          pct((n * k) / m / 4),
        ];
        const options = shuffle(rng.next, [...new Set([got, ...wrong])].slice(0, 4));
        return {
          prompt: `A filter with m = ${m} bits and k = ${k} ${k === 1 ? 'hash function' : 'hash functions'} holds n = ${n} keys. What false-positive rate does the formula (1 − e^(−kn/m))^k predict?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'choice', options, correct: options.indexOf(got) },
          explain: `kn/m = ${k}·${n}/${m} = ${Math.round(((k * n) / m) * 1000) / 1000}, so a bit stays 0 with probability e^(−kn/m) ≈ ${Math.round(Math.exp((-k * n) / m) * 1000) / 1000}. All k bits of a new key are 1 with probability (1 − that)^${k} ≈ ${got}.`,
          watch: [['measure']],
        };
      },
    },
  ];
}
