import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { fmtNum, shuffle } from '../hash-chaining/hashing';
import {
  defaults,
  delCount,
  liveCount,
  type OpenExtra,
  type OpenSettings,
  type OpenState,
} from './model';

type Def = VizDef<OpenState, OpenSettings, OpenExtra>;
type T = Timeline<OpenState, OpenSettings, OpenExtra>;

const call = ([op, ...args]: OpCall) => `\`${op}(${args.join(', ')})\``;
const calls = (cs: OpCall[]) => cs.map(call).join(', ');
const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;

/** n different keys from 1 to 99 with k mod m = b. */
function homeAt(rng: Rng, n: number, m: number, b: number, avoid: number[] = []): number[] {
  const pool = [];
  for (let k = b; k <= 99; k += m) if (k > 0 && !avoid.includes(k)) pool.push(k);
  return shuffle(rng.next, pool).slice(0, n);
}

/** The slots the last operation probed, in order. */
function probesOf(t: T): number[] {
  const steps = t.entries[t.entries.length - 1]!.steps;
  return steps
    .filter((s) => s.lines.some((l) => l.endsWith('.probe')))
    .map((s) => Number(s.vars!.j));
}

/**
 * Practice for open addressing. Every answer comes from running the model. `def` is a getter
 * to avoid an import cycle.
 */
export function openPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: OpenSettings): T => new Timeline(def(), settings, 1, cs);
  const last = (t: T) => t.entries[t.entries.length - 1]!.steps.at(-1)!;

  /** A run of keys around home slot b, sometimes with a tombstone in it. */
  function cluster(rng: Rng, m: number, b: number, tomb: boolean) {
    const keys = homeAt(rng, 3, m, b);
    const near = homeAt(rng, 1, m, (b + 1) % m, keys);
    const setup: OpCall[] = [...keys, ...near].map((k) => ['insert', k]);
    if (tomb) setup.push(['delete', keys[1]!]);
    return { keys, setup };
  }

  return [
    {
      id: 'slot-of',
      title: 'Which slot?',
      make(rng) {
        const m = pick(rng, [7, 11, 13]);
        const probe = pick(rng, ['linear', 'linear', 'double'] as const);
        const settings: OpenSettings = { ...defaults, m, probe };
        const b = rng.int(0, m - 1);
        const { keys, setup } = cluster(rng, m, b, rng.int(0, 1) === 1);
        const k = homeAt(rng, 1, m, b, keys)[0]!;
        const t = run([...setup, ['insert', k]], settings);
        const j = Number(last(t).vars!.j);
        const seen = probesOf(t);
        const how =
          probe === 'double'
            ? `double hashing with h2(k) = 1 + (k mod ${m - 1})`
            : 'linear probing';
        return {
          prompt: `The table uses ${how}, with h(k) = k mod ${m}. Which slot does \`insert(${k})\` put ${k} in?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: j },
          explain: `${k} starts at slot ${b}, and the probes visit ${seen.join(', ')}. ${
            j === seen.at(-1)
              ? `Slot ${j} is the first empty one.`
              : `The first tombstone on the way was slot ${j}, and insert reuses it once it knows ${k} is new.`
          }`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'search-probes',
      title: 'How many probes?',
      make(rng) {
        const m = pick(rng, [7, 11]);
        const settings: OpenSettings = { ...defaults, m };
        const b = rng.int(0, m - 1);
        const { keys, setup } = cluster(rng, m, b, rng.int(0, 2) === 0);
        const hit = rng.int(0, 1) === 1;
        const k = hit ? keys[2]! : homeAt(rng, 1, m, b, keys)[0]!;
        const t = run([...setup, ['search', k]], settings);
        const probes = Number(last(t).vars!.probes);
        const seen = probesOf(t);
        return {
          prompt: `The table uses linear probing with h(k) = k mod ${m}. How many probes does \`search(${k})\` make?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: probes },
          explain: `${k} starts at slot ${b} and the search probes ${seen.join(', ')}. ${
            last(t).vars!.found
              ? `It finds ${k} in slot ${seen.at(-1)}: ${probes} probes.`
              : `Slot ${seen.at(-1)} is empty, so ${k} is not there: ${probes} probes.`
          } Tombstones count as probes: search has to look past them.`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'past-tombstone',
      title: 'Past a tombstone',
      make(rng) {
        const m = pick(rng, [7, 11, 13]);
        const settings: OpenSettings = { ...defaults, m };
        const b = rng.int(0, m - 1);
        const { keys, setup } = cluster(rng, m, b, true);
        const hit = rng.int(0, 2) > 0;
        const k = hit ? keys[2]! : homeAt(rng, 1, m, b, keys)[0]!;
        const t = run([...setup, ['search', k]], settings);
        const found = Boolean(last(t).vars!.found);
        const options = [
          'Found: search steps over the tombstone',
          'Not found: search stops at the tombstone',
          'Not found: search reaches an empty slot first',
        ];
        return {
          prompt: `The table uses linear probing with h(k) = k mod ${m}, and ${keys[1]} was deleted. What does \`search(${k})\` report?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct: found ? 0 : 2 },
          explain: found
            ? `A tombstone means "a key used to be here", so search keeps probing past it and finds ${k} further along. Stopping at the tombstone would lose ${k}.`
            : `Search steps over the tombstone, as it must, but ${k} was never inserted: the probes reach an empty slot, which proves ${k} is not in the table.`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'load-factor',
      title: 'The load factor',
      make(rng) {
        const m = pick(rng, [5, 8, 10]);
        const settings: OpenSettings = { ...defaults, m };
        const keys = homeAt(rng, 2, m, rng.int(0, m - 1));
        const setup: OpCall[] = keys.map((k) => ['insert', k]);
        const more = homeAt(rng, 2, m, rng.int(0, m - 1), keys);
        const ask: OpCall[] = [
          ...more.map((k): OpCall => ['insert', k]),
          ['delete', pick(rng, keys)],
        ];
        const end = run([...setup, ...ask], settings).endState();
        const n = liveCount(end);
        const d = delCount(end);
        const label = (x: number) => `${x}/${m} = ${fmtNum(x / m)}`;
        const choices = [...new Set([n, n + d, n + 1, Math.max(0, n - 1)])].slice(0, 4);
        const options = shuffle(rng.next, choices).map(label);
        return {
          prompt: `Starting from the table shown (m = ${m}), run ${calls(ask)}. What is the load factor α afterwards?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct: options.indexOf(label(n)) },
          explain: `α = n/m counts the keys in the table. ${n} keys remain, so α = ${label(n)}. The tombstone takes up a slot, which slows probing, but it is not a key.`,
          watch: ask,
        };
      },
    },
  ];
}
