import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { defaults, type SieveSettings, type SieveState } from './model';

type Def = VizDef<SieveState, SieveSettings, undefined>;

/** Practice for the sieve. Every answer comes from running the model. */
export function sievePractice(def: () => Def): PracticeKind[] {
  const steps = (settings: SieveSettings, calls: OpCall[]): Step<SieveState, undefined>[] => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries[t.entries.length - 1]!.steps;
  };
  /** The numbers p crossed out, in order, in a run up to n. */
  const crossedBy = (n: number, p: number, settings = defaults) =>
    steps(settings, [['sieve', n]])
      .filter((s) => s.state.p === p && s.state.at !== null)
      .map((s) => s.state.at!);

  return [
    {
      id: 'first',
      title: 'Where does p start?',
      make(rng) {
        const n = rng.int(60, 120);
        const p = [3, 5, 7][rng.int(0, 2)]!;
        const first = crossedBy(n, p)[0]!;
        return {
          prompt: `The sieve runs up to ${n}, crossing out from p². When p = ${p}, which number is crossed out first?`,
          setup: [],
          answer: { kind: 'number', value: first },
          explain: `It starts at ${p}² = ${first}. The smaller multiples, ${p}·2 up to ${p}·${p - 1}, each have a prime factor smaller than ${p}, so they are crossed out already.`,
          watch: [['sieve', n]],
        };
      },
    },
    {
      id: 'count',
      title: 'How many cross-outs for p?',
      make(rng) {
        const n = rng.int(40, 120);
        const p = [2, 3, 5][rng.int(0, 2)]!;
        const list = crossedBy(n, p);
        return {
          prompt: `The sieve runs up to ${n}, crossing out from p². How many cross-outs does p = ${p} make (counting numbers that were crossed out already)?`,
          setup: [],
          answer: { kind: 'number', value: list.length },
          explain: `${p} crosses out ${list.join(', ')}: every ${p === 2 ? 'second' : p === 3 ? 'third' : 'fifth'} number from ${p * p} to ${n}, ${list.length} in all.`,
          watch: [['sieve', n]],
        };
      },
    },
    {
      id: 'last-p',
      title: 'When does it stop?',
      make(rng) {
        const n = rng.int(20, 120);
        const run = steps(defaults, [['sieve', n]]);
        const ps = run.map((s) => s.state.p).filter((p): p is number => p !== null);
        const last = Math.max(...ps);
        return {
          prompt: `The sieve runs up to ${n} and stops once p² > n. What is the last p the loop looks at?`,
          setup: [],
          answer: { kind: 'number', value: last },
          explain: `${last}² = ${last * last} ≤ ${n}, but ${last + 1}² = ${(last + 1) ** 2} > ${n}. Every composite number up to ${n} has a factor of at most √${n} ≈ ${Math.sqrt(n).toFixed(1)}.`,
          watch: [['sieve', n]],
        };
      },
    },
    {
      id: 'primes',
      title: 'How many primes?',
      make(rng) {
        const n = rng.int(20, 80);
        const end = run(n);
        const primes = end.status.flatMap((v, k) => (v === 'prime' ? [k] : []));
        return {
          prompt: `The picture shows the sieve up to 30. How many primes are there up to ${n}?`,
          setup: [['sieve', 30]],
          answer: { kind: 'number', value: primes.length },
          explain: `The numbers that survive are ${primes.join(', ')}: ${primes.length} primes.`,
          watch: [['sieve', n]],
        };
      },
    },
  ];

  function run(n: number): SieveState {
    return steps(defaults, [['sieve', n]]).at(-1)!.state;
  }
}
