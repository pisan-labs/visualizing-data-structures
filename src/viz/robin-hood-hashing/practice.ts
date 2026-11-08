import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { shuffle } from '../_hashing/hashing';
import { defaults, type RobinExtra, type RobinSettings, type RobinState } from './model';

type Def = VizDef<RobinState, RobinSettings, RobinExtra>;
type T = Timeline<RobinState, RobinSettings, RobinExtra>;

const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;
const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k]);

/** n different keys from 1 to 99 whose homes fall in slots lo … lo + 3 of a table of m. */
function crowd(rng: Rng, m: number, n: number, lo: number, avoid: number[] = []): number[] {
  const pool: number[] = [];
  for (let k = 1; k <= 99; k++)
    if ((k % m) - lo >= 0 && (k % m) - lo <= 3 && !avoid.includes(k)) pool.push(k);
  return shuffle(rng.next, pool).slice(0, n);
}

/**
 * Practice for Robin Hood hashing. Every answer comes from running the model. `def` is a getter
 * to avoid an import cycle.
 */
export function robinPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], s: RobinSettings): T => new Timeline(def(), s, 1, cs);
  const last = (t: T) => t.entries[t.entries.length - 1]!.steps.at(-1)!;

  function setup(rng: Rng) {
    const m = pick(rng, [7, 11]);
    const s: RobinSettings = { ...defaults, m };
    const lo = rng.int(0, m - 4);
    const keys = crowd(rng, m, rng.int(3, 5), lo);
    return { m, s, lo, keys, calls: inserts(keys) };
  }

  return [
    {
      id: 'slot-of',
      title: 'Where does it land?',
      make(rng) {
        const { m, s, lo, keys, calls } = setup(rng);
        const k = crowd(rng, m, 1, lo, keys)[0]!;
        const end = run([...calls, ['insert', k]], s).endState();
        const j = end.slots.findIndex((c) => c?.key === k);
        return {
          prompt: `Robin Hood hashing, h(k) = k mod ${m}. Which slot does \`insert(${k})\` put ${k} in?`,
          setup: calls,
          settings: s as Settings,
          answer: { kind: 'number', value: j },
          explain: `${k} starts at slot ${k % m} and walks forward. It takes the first slot that is empty or whose key is closer to home than ${k} is at that point: slot ${j}, ${(j - (k % m) + m) % m} from home.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'swaps',
      title: 'How many swaps?',
      make(rng) {
        const { m, s, lo, keys, calls } = setup(rng);
        const k = crowd(rng, m, 1, Math.max(0, lo - 1), keys)[0]!;
        const t = run([...calls, ['insert', k]], s);
        const swaps = Number(last(t).vars!.swaps ?? 0);
        return {
          prompt: `Robin Hood hashing, h(k) = k mod ${m}. How many times does \`insert(${k})\` hand its key in hand to a slot and carry off a richer key?`,
          setup: calls,
          settings: s as Settings,
          answer: { kind: 'number', value: swaps },
          explain: `A swap happens when the key in the slot is closer to its home than the key in hand is. Here that happens ${swaps} ${swaps === 1 ? 'time' : 'times'}.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'search-probes',
      title: 'When does search stop?',
      make(rng) {
        const { m, s, lo, keys, calls } = setup(rng);
        const k = rng.int(0, 1) ? pick(rng, keys) : crowd(rng, m, 1, lo, keys)[0]!;
        const t = run([...calls, ['search', k]], s);
        const v = last(t).vars!;
        return {
          prompt: `Robin Hood hashing, h(k) = k mod ${m}. How many slots does \`search(${k})\` look at?`,
          setup: calls,
          settings: s as Settings,
          answer: { kind: 'number', value: Number(v.probes) },
          explain: v.found
            ? `${k} is found in slot ${v.j} after ${v.probes} probes.`
            : `${k} is not there. Search stops at the first empty slot, or earlier, at a key closer to its home than ${k} would be: ${v.probes} probes.`,
          watch: [['search', k]],
        };
      },
    },
    {
      id: 'shifts',
      title: 'Backward shift',
      make(rng) {
        const { m, s, keys, calls } = setup(rng);
        const k = pick(rng, keys);
        const t = run([...calls, ['delete', k]], s);
        const shifts = Number(last(t).vars!.shifts);
        return {
          prompt: `Robin Hood hashing, h(k) = k mod ${m}. After \`delete(${k})\` empties its slot, how many keys move back one slot?`,
          setup: calls,
          settings: s as Settings,
          answer: { kind: 'number', value: shifts },
          explain: `Each key after the hole moves back while it is away from home (d > 0). The shifting stops at an empty slot or a key with d = 0: ${shifts} ${shifts === 1 ? 'key moves' : 'keys move'}.`,
          watch: [['delete', k]],
        };
      },
    },
  ];
}
