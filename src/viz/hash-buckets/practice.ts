import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { shuffle } from '../_hashing/hashing';
import { defaults, type BucketExtra, type BucketSettings, type BucketState } from './model';

type Def = VizDef<BucketState, BucketSettings, BucketExtra>;
type T = Timeline<BucketState, BucketSettings, BucketExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');
const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;

/** n different keys from 1 to 99 with k mod B = i. */
function inBucket(rng: Rng, n: number, B: number, i: number, avoid: number[] = []): number[] {
  const pool = [];
  for (let k = i; k <= 99; k += B) if (k > 0 && !avoid.includes(k)) pool.push(k);
  return shuffle(rng.next, pool).slice(0, n);
}

/**
 * Practice for hashing with buckets. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function bucketPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: BucketSettings): T => new Timeline(def(), settings, 1, cs);
  const last = (t: T) => t.entries[t.entries.length - 1]!.steps.at(-1)!;
  const settings: BucketSettings = { ...defaults, B: 5, b: 2 };

  /** A table where bucket i is full or nearly full, with maybe a key in the overflow area. */
  function crowded(rng: Rng, i: number) {
    const own = inBucket(rng, rng.int(1, 3), 5, i);
    const others = [1, 2, 3, 4]
      .map((d) => (i + d) % 5)
      .flatMap((j) => (rng.int(0, 1) ? inBucket(rng, 1, 5, j, own) : []));
    return { own, setup: shuffle(rng.next, [...own, ...others]).map((k): OpCall => ['insert', k]) };
  }

  return [
    {
      id: 'where-goes',
      title: 'Where does the key go?',
      make(rng) {
        const i = rng.int(0, 4);
        const { own, setup } = crowded(rng, i);
        const k = inBucket(rng, 1, 5, i, own)[0]!;
        const t = run([...setup, ['insert', k]], settings);
        const overflowed = last(t).lines.includes('ins.append');
        const other = (i + rng.int(1, 4)) % 5;
        const options = shuffle(rng.next, [`Bucket ${i}`, `Bucket ${other}`, 'The overflow area']);
        const right = overflowed ? 'The overflow area' : `Bucket ${i}`;
        return {
          prompt: `5 buckets of 2 slots, h(k) = k mod 5, with an overflow area. Where does \`insert(${k})\` put ${k}?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct: options.indexOf(right) },
          explain: overflowed
            ? `${k} mod 5 = ${i}, and bucket ${i} is already full, so ${k} goes to the end of the overflow area. It can never go in another bucket.`
            : `${k} mod 5 = ${i}, and bucket ${i} still has a free slot, so ${k} goes there.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'search-probes',
      title: 'How many probes?',
      make(rng) {
        const i = rng.int(0, 4);
        const { own, setup } = crowded(rng, i);
        const hit = rng.int(0, 1) === 1;
        const k = hit ? pick(rng, own) : inBucket(rng, 1, 5, i, own)[0]!;
        const t = run([...setup, ['search', k]], settings);
        const probes = Number(last(t).vars!.probes);
        const found = Boolean(last(t).vars!.found);
        const full = t.endState().buckets[i]!.every(Boolean);
        return {
          prompt: `5 buckets of 2 slots, h(k) = k mod 5, with an overflow area. Count every slot that \`search(${k})\` looks at, in the bucket and in the overflow area. How many probes?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: probes },
          explain: `${k} mod 5 = ${i}. ${
            found
              ? `The search finds ${k} after ${probes} ${probes === 1 ? 'probe' : 'probes'}${probes > 2 ? ', reading bucket ' + i + ' and then the overflow area' : ''}.`
              : full
                ? `Bucket ${i} is full, so the search reads both slots and then the whole overflow area: ${probes} probes, and no ${k}.`
                : `Bucket ${i} has a free slot, so ${k} never overflowed: the search stops after reading the bucket's ${probes} slots.`
          }`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'overflow-count',
      title: 'How many keys overflow?',
      make(rng) {
        const B = pick(rng, [3, 4, 5]);
        const s: BucketSettings = { ...defaults, B, b: 2 };
        const keys = new Set<number>();
        while (keys.size < 7) keys.add(rng.int(1, 40));
        const all = [...keys];
        const setup: OpCall[] = all.slice(0, 3).map((k) => ['insert', k]);
        const ask: OpCall[] = all.slice(3).map((k) => ['insert', k]);
        const end = run([...setup, ...ask], s).endState();
        const n = end.overflow.length;
        return {
          prompt: `${B} buckets of 2 slots, h(k) = k mod ${B}, with an overflow area. Run ${calls(ask)}. How many keys are in the overflow area afterwards?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'number', value: n },
          explain: n
            ? `A key overflows only when its own bucket is full. That happens ${n === 1 ? 'once' : `${n} times`}, so the overflow area ends with ${end.overflow.map((x) => x.key).join(', ')}.`
            : 'Every key finds a free slot in its own bucket, so nothing overflows.',
          watch: ask,
        };
      },
    },
    {
      id: 'after-delete',
      title: 'After a delete',
      make(rng) {
        const i = rng.int(0, 4);
        const own = inBucket(rng, 3, 5, i);
        const setup: OpCall[] = own.map((k) => ['insert', k]);
        const victim = pick(rng, own.slice(0, 2));
        const end = run([...setup, ['delete', victim]], settings).endState();
        const keys = end.buckets[i]!.filter(Boolean).map((x) => String(x!.key));
        return {
          prompt: `5 buckets of 2 slots, h(k) = k mod 5, with an overflow area. Run \`delete(${victim})\`. Type the keys in bucket ${i} afterwards, top slot first.`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'sequence', value: keys },
          explain: `Deleting ${victim} frees a slot in bucket ${i}, and ${own[2]} moves back from the overflow area into it. Only a full bucket may have keys in the overflow area, so the bucket reads ${keys.join(', ')}.`,
          watch: [['delete', victim]],
        };
      },
    },
  ];
}
