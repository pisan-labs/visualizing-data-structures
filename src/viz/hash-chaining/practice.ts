import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { fmtNum, hashOf, shuffle } from './hashing';
import { defaults, sizeOf, type ChainExtra, type ChainSettings, type ChainState } from './model';

type Def = VizDef<ChainState, ChainSettings, ChainExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');
const pick = <T>(rng: Rng, xs: T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** n different keys from 1 to 99 that are not in `avoid`. */
function fresh(rng: Rng, n: number, avoid: number[] = []): number[] {
  const out = new Set<number>();
  while (out.size < n) {
    const k = rng.int(1, 99);
    if (!avoid.includes(k)) out.add(k);
  }
  return [...out];
}

/** n different keys from 1 to 99 with k mod m = b. */
function sameBucket(rng: Rng, n: number, m: number, b: number, avoid: number[] = []): number[] {
  const pool = [];
  for (let k = b; k <= 99; k += m) if (k > 0 && !avoid.includes(k)) pool.push(k);
  return shuffle(rng.next, pool).slice(0, n);
}

/**
 * Practice for separate chaining. Every answer comes from running the model. `def` is a getter
 * to avoid an import cycle.
 */
export function chainingPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: ChainSettings) => new Timeline(def(), settings, 1, cs);
  const last = (t: Timeline<ChainState, ChainSettings, ChainExtra>) =>
    t.entries[t.entries.length - 1]!.steps.at(-1)!;

  return [
    {
      id: 'bucket-of',
      title: 'Which bucket?',
      make(rng) {
        const m = pick(rng, [5, 7, 10, 11, 13]);
        const settings: ChainSettings = { ...defaults, m };
        const keys = fresh(rng, rng.int(3, 5));
        const setup: OpCall[] = keys.map((k) => ['insert', k]);
        const k = rng.int(10, 99);
        const t = run([...setup, ['insert', k]], settings);
        const i = Number(last(t).vars!.i);
        return {
          prompt: `This table has m = ${m} buckets and uses h(k) = k mod ${m}. Which bucket does \`insert(${k})\` use? Type its index.`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: i },
          explain: `${hashOf(k, m, 'division').say}, so ${k} goes in bucket ${i}.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const m = pick(rng, [5, 7]);
        const settings: ChainSettings = { ...defaults, m };
        const b = rng.int(0, m - 1);
        const crowd = sameBucket(rng, rng.int(3, 4), m, b);
        const others = fresh(rng, 2, crowd).filter((k) => k % m !== b);
        const setup: OpCall[] = [...crowd, ...others].map((k) => ['insert', k]);
        const hit = rng.int(0, 2) > 0;
        const k = hit ? pick(rng, crowd) : sameBucket(rng, 1, m, b, crowd)[0]!;
        const t = run([...setup, ['search', k]], settings);
        const end = last(t);
        const compares = Number(end.vars!.compares);
        const chain = t.endState().buckets[b]!.map((e) => String(e.key));
        return {
          prompt: `The table uses h(k) = k mod ${m}, and new keys go to the front of their chain. How many keys does \`search(${k})\` compare ${k} with?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: compares },
          explain: `${k} mod ${m} = ${b}, and bucket ${b} reads ${chain.join(', ')} from the front. ${
            end.vars!.found
              ? `The search compares with ${chain.slice(0, compares).join(', ')} and stops at ${k}: ${compares}.`
              : `${k} is not there, so the search compares with all ${compares} keys before it reaches nil.`
          }`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'load-factor',
      title: 'The load factor after some inserts',
      make(rng) {
        const m = pick(rng, [4, 5, 8, 10]);
        const settings: ChainSettings = { ...defaults, m };
        const keys = fresh(rng, rng.int(2, 4));
        const setup: OpCall[] = keys.map((k) => ['insert', k]);
        const more = fresh(rng, rng.int(2, 3), keys);
        const repeat = rng.int(0, 2) > 0 ? [pick(rng, keys)] : [];
        const ask: OpCall[] = shuffle(rng.next, [...more, ...repeat]).map((k) => ['insert', k]);
        const n = sizeOf(run([...setup, ...ask], settings).endState());
        const label = (x: number) => `${x}/${m} = ${fmtNum(x / m)}`;
        const wrong = [n + 1, n - 1, n + 2].filter((x) => x > 0 && x !== n);
        const options = shuffle(rng.next, [n, ...wrong.slice(0, 3)]).map(label);
        return {
          prompt: `Starting from the table shown (m = ${m}), run ${calls(ask)}. What is the load factor α afterwards?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct: options.indexOf(label(n)) },
          explain: `α = n/m, where n counts the keys in the table. ${
            repeat.length
              ? `${repeat[0]} was already there, so inserting it again adds nothing. `
              : ''
          }The table ends with ${n} keys, so α = ${label(n)}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'chain-after',
      title: 'What is in the bucket?',
      make(rng) {
        const m = 7;
        const settings: ChainSettings = { ...defaults, m };
        const b = rng.int(0, m - 1);
        const crowd = sameBucket(rng, 5, m, b);
        const setup: OpCall[] = [
          ...crowd.slice(0, 2).map((k): OpCall => ['insert', k]),
          ...fresh(rng, 2, crowd)
            .filter((k) => k % m !== b)
            .map((k): OpCall => ['insert', k]),
        ];
        const ask: OpCall[] = shuffle(rng.next, [
          ['insert', crowd[2]!],
          ['insert', crowd[3]!],
        ] as OpCall[]);
        ask.push(['delete', pick(rng, crowd.slice(0, 4))]);
        const chain = run([...setup, ...ask], settings)
          .endState()
          .buckets[b]!.map((e) => String(e.key));
        return {
          prompt: `The table uses h(k) = k mod 7, and new keys go to the front of their chain. Run ${calls(ask)}. Type the keys in bucket ${b}, from the front of the chain to the end.`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'sequence', value: chain },
          explain: chain.length
            ? `Each new key becomes the first node, and delete unlinks one node without moving the others. Bucket ${b} ends as ${chain.join(', ')}.`
            : `The deletes empty bucket ${b}.`,
          watch: ask,
        };
      },
    },
  ];
}
