/**
 * The algorithms a doubling experiment can measure, each instrumented to count its basic steps,
 * the inputs they run on, and the noise a timer would add.
 *
 * Each algorithm's `run` is the real thing with a counter in it, line for line the code in the
 * Python, Java and C++ tabs. Two of them would take too long to run on every replay of a page
 * (insertion sort near 20,000 items, the triple loop near 1,000), so the model gets their counts
 * from `fast`, which works out the same number another way; doubling-experiment.test.ts checks
 * that `fast` and `run` agree on random inputs.
 *
 * Inputs come from the seeded RNG of src/engine/rng.ts, so a run can be replayed exactly: the
 * input of size n for experiment seed s is n values from makeRng(s + n), each in
 * [−VALUE_MAX, VALUE_MAX]. The code tabs' drivers make the same inputs the same way.
 */
import { deriveSeed, makeRng } from '../../engine/rng';

export const ALGOS = ['linear', 'binary', 'hash', 'merge', 'insertion', 'threesum'] as const;
export type AlgoId = (typeof ALGOS)[number];

/** Input values have at most six digits, so three of them add up without overflow anywhere. */
export const VALUE_MAX = 999_999;
/** A value no input holds. The searches look for it, so they never find it: the worst case. */
export const MISSING = VALUE_MAX + 1;

export interface Algo {
  id: AlgoId;
  /** The option under Options. */
  label: string;
  /** In narration, mid-sentence: "insertion sort on random input". */
  name: string;
  /** What one counted step is, singular and plural. */
  step: string;
  steps: string;
  /** The smallest starting n (every input of this size takes at least one step) and the largest n. */
  minN: number;
  maxN: number;
  /** The true growth, and the exponent b tends to as n grows. */
  order: string;
  b: number;
  /** Search a sorted copy of the input. */
  sorted?: boolean;
  /** The algorithm, instrumented: runs on `a` (and may reorder it), returns the step count. */
  run(a: Int32Array): number;
  /** The same count worked out faster, for algorithms too slow to run on every replay. */
  fast?(a: Int32Array): number;
}

// ----- The instrumented algorithms -----

/** Linear search for a value that is not there: one comparison per item. */
export function linearSearch(a: Int32Array, x = MISSING): number {
  let steps = 0;
  for (let i = 0; i < a.length; i++) {
    steps++;
    if (a[i] === x) break;
  }
  return steps;
}

/** Binary search of a sorted array for a value bigger than every item: one probe per halving. */
export function binarySearch(a: Int32Array, x = MISSING): number {
  let steps = 0;
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    steps++;
    if (a[mid] === x) break;
    if (a[mid]! < x) lo = mid + 1;
    else hi = mid - 1;
  }
  return steps;
}

/**
 * Count the distinct values with a hash set: open addressing with linear probing, a table of the
 * smallest power of two at least 2n slots, and a multiplicative hash (Knuth's 2654435761). One
 * step per slot looked at.
 */
export function distinctValues(a: Int32Array): number {
  let bits = 1;
  while (1 << bits < 2 * a.length) bits++;
  const size = 1 << bits;
  const used = new Uint8Array(size);
  const keys = new Int32Array(size);
  let steps = 0;
  for (let k = 0; k < a.length; k++) {
    const x = a[k]!;
    let i = Math.imul(x, 0x9e3779b1) >>> (32 - bits);
    for (;;) {
      steps++;
      if (!used[i]) {
        used[i] = 1;
        keys[i] = x;
        break;
      }
      if (keys[i] === x) break;
      i = (i + 1) & (size - 1);
    }
  }
  return steps;
}

/** Top-down merge sort: one step per comparison of two items while merging. */
export function mergeSort(a: Int32Array): number {
  const aux = new Int32Array(a.length);
  let steps = 0;
  const sort = (lo: number, hi: number) => {
    if (hi - lo < 2) return;
    const mid = Math.floor((lo + hi) / 2);
    sort(lo, mid);
    sort(mid, hi);
    aux.set(a.subarray(lo, hi), lo);
    let i = lo;
    let j = mid;
    let k = lo;
    while (i < mid && j < hi) {
      steps++;
      if (aux[i]! <= aux[j]!) a[k++] = aux[i++]!;
      else a[k++] = aux[j++]!;
    }
    while (i < mid) a[k++] = aux[i++]!;
    while (j < hi) a[k++] = aux[j++]!;
  };
  sort(0, a.length);
  return steps;
}

/** Insertion sort: one step per comparison of an item with the key. */
export function insertionSort(a: Int32Array): number {
  let steps = 0;
  for (let j = 1; j < a.length; j++) {
    const key = a[j]!;
    let i = j - 1;
    while (i >= 0) {
      steps++;
      if (a[i]! <= key) break;
      a[i + 1] = a[i]!;
      i--;
    }
    a[i + 1] = key;
  }
  return steps;
}

/** Brute-force 3-sum: count the triples that add up to 0, one step per triple checked. */
export function threeSum(a: Int32Array): { triples: number; steps: number } {
  const n = a.length;
  let steps = 0;
  let triples = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        steps++;
        if (a[i]! + a[j]! + a[k]! === 0) triples++;
      }
    }
  }
  return { triples, steps };
}

// ----- Faster counts -----

/** n choose 3: the triples i < j < k. */
export const choose3 = (n: number) => (n < 3 ? 0 : (n * (n - 1) * (n - 2)) / 6);

/**
 * Insertion sort's comparisons without sorting: item j is compared with every earlier item that
 * is bigger (each one shifts right), plus the smaller-or-equal one that stops it, unless it
 * reaches the front. A Fenwick tree over the items' ranks counts the bigger earlier items.
 */
export function insertionCount(a: Int32Array): number {
  const n = a.length;
  const sorted = Int32Array.from(a).sort();
  const rank = (x: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]! <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo; // how many items are ≤ x
  };
  const tree = new Int32Array(n + 1);
  let steps = 0;
  for (let j = 0; j < n; j++) {
    const r = rank(a[j]!);
    let atMost = 0; // earlier items ≤ a[j]
    for (let i = r; i > 0; i -= i & -i) atMost += tree[i]!;
    const bigger = j - atMost;
    steps += bigger + (bigger < j ? 1 : 0);
    for (let i = r; i <= n; i += i & -i) tree[i]!++;
  }
  return steps;
}

// ----- The menu -----

export const ALGO: Record<AlgoId, Algo> = {
  linear: {
    id: 'linear',
    label: 'Linear search for a missing value',
    name: 'linear search for a missing value',
    step: 'comparison',
    steps: 'comparisons',
    minN: 1,
    maxN: 1_000_000,
    order: 'n',
    b: 1,
    run: (a) => linearSearch(a),
  },
  binary: {
    id: 'binary',
    label: 'Binary search for a missing value',
    name: 'binary search for a missing value',
    step: 'probe',
    steps: 'probes',
    minN: 1,
    maxN: 1_000_000,
    order: 'log n',
    b: 0,
    sorted: true,
    run: (a) => binarySearch(a),
  },
  hash: {
    id: 'hash',
    label: 'Distinct values with a hash set',
    name: 'counting distinct values with a hash set',
    step: 'slot looked at',
    steps: 'slots looked at',
    minN: 1,
    maxN: 200_000,
    order: 'n',
    b: 1,
    run: distinctValues,
  },
  merge: {
    id: 'merge',
    label: 'Merge sort on random input',
    name: 'merge sort on random input',
    step: 'comparison',
    steps: 'comparisons',
    minN: 2,
    maxN: 500_000,
    order: 'n log n',
    b: 1,
    run: mergeSort,
  },
  insertion: {
    id: 'insertion',
    label: 'Insertion sort on random input',
    name: 'insertion sort on random input',
    step: 'comparison',
    steps: 'comparisons',
    minN: 2,
    maxN: 20_000,
    order: 'n²',
    b: 2,
    run: insertionSort,
    fast: insertionCount,
  },
  threesum: {
    id: 'threesum',
    label: 'Brute-force 3-sum: every triple',
    name: 'brute-force 3-sum',
    step: 'triple checked',
    steps: 'triples checked',
    minN: 3,
    maxN: 1_000,
    order: 'n³',
    b: 3,
    run: (a) => threeSum(a).steps,
    fast: (a) => choose3(a.length),
  },
};

// ----- Inputs, counts and noise -----

/** The input of size n for experiment seed `seed`: n values from makeRng(seed + n). */
export function makeInput(n: number, seed: number, sorted = false): Int32Array {
  const rng = makeRng((seed + n) >>> 0);
  const a = new Int32Array(n);
  for (let i = 0; i < n; i++) a[i] = rng.int(-VALUE_MAX, VALUE_MAX);
  return sorted ? a.sort() : a;
}

/** Counts already worked out, by algorithm, n and seed: replays and redraws ask again. */
const memo = new Map<string, number>();

/** The exact step count of `algo` on the input of size n for seed `seed`. */
export function count(algo: AlgoId, n: number, seed: number): number {
  const key = `${algo} ${n} ${seed}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  const al = ALGO[algo];
  const t = (al.fast ?? al.run)(makeInput(n, seed, al.sorted));
  if (memo.size > 2000) memo.clear();
  memo.set(key, t);
  return t;
}

/**
 * How much a timing strays, as the spread of its logarithm: about ±50% for a run of a few
 * steps, ±30% for a few thousand, ±10% for 40,000 and ±2% for millions. Short runs suffer most
 * from the timer's resolution and from whatever else the computer is doing.
 */
export const spread = (t: number) => 0.02 + 0.5 / Math.sqrt(1 + t / 1000);

/**
 * Run `rep` of size n in experiment `seed`, as a timer would report it: the true count times a
 * random factor e^(σz), z a standard normal from the seeded RNG. The same seed, n and rep always
 * give the same reading.
 */
export function noisy(t: number, seed: number, n: number, rep: number): number {
  const rng = makeRng(deriveSeed(seed, n * 8 + rep));
  const u = 1 - rng.next();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  return Math.max(1, Math.round(t * Math.exp(spread(t) * z)));
}

/** The median of an odd number of readings. */
export function median(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  return s[(s.length - 1) >> 1]!;
}
