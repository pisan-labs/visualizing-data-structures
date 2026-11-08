import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { distinctKeys } from '../_hashing/hashing';
import { h, keysOf, type CuckooExtra, type CuckooSettings, type CuckooState } from './model';

type Def = VizDef<CuckooState, CuckooSettings, CuckooExtra>;
type T = Timeline<CuckooState, CuckooSettings, CuckooExtra>;

const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;
const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k]);
const fns = (m: number) => `h1(k) = k mod ${m} and h2(k) = ⌊k/${m}⌋ mod ${m}`;

/**
 * Practice for cuckoo hashing. Every answer comes from running the model. `def` is a getter to
 * avoid an import cycle.
 */
export function cuckooPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], s: CuckooSettings): T => new Timeline(def(), s, 1, cs);
  const lastEntry = (t: T) => t.entries[t.entries.length - 1]!;

  /** A setup with no rehash, and a new key whose T1 nest is taken (when possible). */
  function crowded(rng: Rng, m: number) {
    for (;;) {
      const keys = distinctKeys(rng, rng.int(3, 6));
      const end = run(inserts(keys), { m }).endState();
      if (end.rehashes) continue;
      const taken = new Set(end.t[0].map((c, j) => (c ? j : -1)));
      let k = rng.int(0, 150);
      for (let i = 0; i < 150 && (keys.includes(k) || !taken.has(h(0, k, m))); i++)
        k = (k + 1) % 151;
      if (keys.includes(k)) continue;
      const t = run(inserts([...keys, k]), { m });
      if (t.endState().rehashes) continue;
      return { setup: inserts(keys), k, t };
    }
  }

  return [
    {
      id: 'nests',
      title: 'The two nests',
      make(rng) {
        const m = pick(rng, [7, 11, 13]);
        const k = rng.int(10, 200);
        const setup = inserts(distinctKeys(rng, 2).filter((x) => x !== k));
        const a = h(0, k, m);
        const b = h(1, k, m);
        return {
          prompt: `Each table has m = ${m} slots, with ${fns(m)}. In which two slots may ${k} live? Give its T1 slot, then its T2 slot.`,
          setup,
          settings: { m } as Settings,
          answer: { kind: 'sequence', value: [String(a), String(b)] },
          explain: `h1(${k}) = ${k} mod ${m} = ${a} and h2(${k}) = ⌊${k}/${m}⌋ mod ${m} = ${Math.floor(k / m)} mod ${m} = ${b}.`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'kicks',
      title: 'How many kicks?',
      make(rng) {
        const m = 11;
        const { setup, k, t } = crowded(rng, m);
        const kicks = Number(lastEntry(t).steps.at(-1)!.vars!.kicks);
        return {
          prompt: `Each table has m = ${m} slots, with ${fns(m)}. How many keys does \`insert(${k})\` kick out before every key has a slot?`,
          setup,
          settings: { m } as Settings,
          answer: { kind: 'number', value: kicks },
          explain: `${k} goes to T1[${h(0, k, m)}]. ${
            kicks
              ? `Each kicked key moves to its nest in the other table; ${kicks} ${kicks === 1 ? 'kick' : 'kicks'} in all.`
              : 'That slot is empty, so nothing is kicked.'
          }`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'first-kicked',
      title: 'Who gets kicked?',
      make(rng) {
        const m = 11;
        const { setup, k } = crowded(rng, m);
        const before = run(setup, { m }).endState();
        const victim = before.t[0][h(0, k, m)];
        const answer = victim ? victim.key : -1;
        const options = [...new Set([String(answer), ...keysOf(before).map(String), String(k)])]
          .filter((x) => x !== '-1')
          .slice(0, 4);
        if (!victim) options.push('Nobody: the slot is empty');
        const correct = victim ? options.indexOf(String(answer)) : options.length - 1;
        return {
          prompt: `Each table has m = ${m} slots, with ${fns(m)}. Which key does \`insert(${k})\` kick out first?`,
          setup,
          settings: { m } as Settings,
          answer: { kind: 'choice', options, correct },
          explain: victim
            ? `h1(${k}) = ${h(0, k, m)}, and T1[${h(0, k, m)}] holds ${victim.key}. ${k} always takes its T1 nest, so ${victim.key} is kicked out to T2[${h(1, victim.key, m)}].`
            : `T1[${h(0, k, m)}] is empty, so ${k} simply goes there.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'probes',
      title: 'How many probes?',
      make(rng) {
        const m = 11;
        const { setup, k } = crowded(rng, m);
        const all = [...setup.map((c) => Number(c[1])), k];
        const target = rng.int(0, 2) === 0 ? rng.int(151, 300) : pick(rng, all);
        const t = run([...setup, ['insert', k], ['search', target]], { m });
        const probes = Number(lastEntry(t).steps.at(-1)!.vars!.probes);
        return {
          prompt: `Each table has m = ${m} slots, with ${fns(m)}. Starting from the tables shown, run \`insert(${k})\`, then \`search(${target})\`. How many probes does the search make?`,
          setup,
          settings: { m } as Settings,
          answer: { kind: 'number', value: probes },
          explain:
            probes === 1
              ? `${target} is in its T1 nest, T1[${h(0, target, m)}]: one probe.`
              : `Search looks in T1[${h(0, target, m)}], then T2[${h(1, target, m)}]. ${
                  lastEntry(t).steps.at(-1)!.vars!.found
                    ? `${target} is in T2`
                    : `${target} is in neither`
                }: two probes, never more.`,
          watch: [
            ['insert', k],
            ['search', target],
          ],
        };
      },
    },
  ];
}
