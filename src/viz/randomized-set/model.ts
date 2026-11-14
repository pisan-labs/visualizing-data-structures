/**
 * A set with insert, remove and a random element, all in O(1) (expected, as hash maps go).
 *
 * - The pattern keeps the values in an array A, in no particular order, and a hash map from each
 *   value to its index in A. insert appends and records the index. remove looks the index up,
 *   moves the last value into the hole, drops the last slot and fixes the moved value's entry:
 *   nothing shifts, so no other index changes. random picks an index with the seeded random
 *   number generator and returns what is there.
 * - The naive design is the array alone: insert scans for a duplicate and remove scans to find
 *   the value (then the same move of the last value), so both are O(n); random is the same O(1).
 *   A hash set alone is the other half: insert and remove in O(1), but it has no index to pick
 *   at random. Narration and the concept page say so; the page does not draw it.
 *
 * Both designs keep the same array, so random gives the same answer either way.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a comparison is A[i] compared with x; a lookup
 * is one hash map read or write. The counters run over the whole session (src/viz/_design1/kit.ts).
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach } from '../_patterns/kit';
import { addCosts, fmt, list, NO_COSTS, readInt, type Costs } from '../_design1/kit';

export const MAX_SIZE = 8;
export const MIN_VALUE = 0;
export const MAX_VALUE = 99;

export interface RSSettings {
  [key: string]: Scalar;
  approach: Approach;
}

export const defaults: RSSettings = { approach: 'pattern' };

export interface Item {
  uid: number;
  value: number;
}

/** A map entry: a value and its index in A. */
export interface Entry {
  key: number;
  index: number;
}

export interface RSState {
  a: Item[];
  /** The hash map, in the order its keys went in. Empty in the naive design. */
  map: Entry[];
  nextUid: number;
  /** Comparisons and lookups so far, each design. */
  cost: Costs;
}

export interface RSExtra {
  /** The call and, at the end, its result. */
  label: string;
}

export type RSStep = Step<RSState, RSExtra>;
type Op = OpSpec<RSState, RSSettings, RSExtra>;
type Gen = Generator<RSStep, RSState, void>;

export const init = (): RSState => ({ a: [], map: [], nextUid: 1, cost: NO_COSTS });

export const vid = (uid: number) => `v${uid}`;
export const keyId = (key: number) => `mk-${key}`;
export const idxId = (key: number) => `mi-${key}`;
const cell = (i: number) => `a-${i}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export const values = (s: RSState) => s.a.map((i) => i.value);

// ----- Without steps: what each call costs -----

/** Comparisons and lookups each design makes for one call on these values (a valid call). */
export function callCost(op: string, a: readonly number[], x?: number): Costs {
  const at = x === undefined ? -1 : a.indexOf(x);
  const scan = at >= 0 ? at + 1 : a.length;
  if (op === 'insert') return { naive: scan, pattern: at >= 0 ? 1 : 2 };
  if (op === 'remove') return { naive: scan, pattern: at >= 0 ? 3 : 1 };
  return NO_COSTS;
}

// ----- Steps -----

interface Ctx {
  approach: Approach;
  work: Work;
  after: Costs;
}

function context(s: RSState, settings: RSSettings, op: string, x?: number): Ctx {
  const approach = approachOf(settings);
  const work = new Work(['comparisons', 'lookups']);
  const before = s.cost[approach];
  // The session's counters, split by unit: the naive design only compares, the pattern only looks up.
  work.add(approach === 'naive' ? 'comparisons' : 'lookups', before);
  return { approach, work, after: addCosts(s.cost, callCost(op, values(s), x)) };
}

function step(
  c: Ctx,
  state: RSState,
  say: string,
  lines: string[],
  level: 1 | 2,
  marks: Mark[],
  label: string,
  own: Record<string, Scalar> = {},
): RSStep {
  return {
    state,
    marks,
    say,
    lines,
    level,
    vars: { ...own, n: state.a.length, ...workVars(c.work, c.after) },
    extra: { label },
  };
}

const done = (s: RSState, c: Ctx): RSState => ({ ...s, cost: c.after });

function* refuse(s: RSState, settings: RSSettings, call: string, why: string, line: string): Gen {
  const c = context(s, settings, 'none');
  yield step(c, s, `${call}: ${why}`, [line], 1, [mark('a-name', 'error')], call);
  return s;
}

/** Look x up in the map: its entry's index, or undefined. */
const entryOf = (s: RSState, x: number) => s.map.find((e) => e.key === x);

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [arg], { settings }) {
    const x = readInt(arg, MIN_VALUE, MAX_VALUE);
    if (typeof x === 'string')
      return yield* refuse(s, settings, 'insert', `${x} Nothing is inserted.`, 'ins.sig');
    const call = `insert(${fmt(x)})`;
    if (s.a.length >= MAX_SIZE)
      return yield* refuse(
        s,
        settings,
        call,
        `this page keeps at most ${MAX_SIZE} values, so every one stays readable. Remove one first.`,
        'ins.sig',
      );
    const c = context(s, settings, 'insert', x);
    const n = s.a.length;
    const uid = s.nextUid;
    const appended = (st: RSState): RSState => ({
      ...st,
      a: [...st.a, { uid, value: x }],
      nextUid: uid + 1,
    });

    if (c.approach === 'naive') {
      for (let i = 0; i < n; i++) {
        c.work.add('comparisons');
        const y = s.a[i]!;
        if (y.value === x) {
          const end = done(s, c);
          yield step(
            c,
            end,
            `Compare A[${i}] = ${fmt(y.value)} with ${fmt(x)}: equal. ${fmt(x)} is already in the set, so return false. That took ${c.work.get('comparisons') - s.cost.naive} of the n = ${n} comparisons a miss would take.`,
            ['ins.loop', 'ins.cmp', 'ins.dup'],
            1,
            [mark(vid(y.uid), 'found'), mark('op-label', 'found')],
            `${call} → false`,
            { x, i, returned: false },
          );
          return end;
        }
        yield step(
          c,
          s,
          i === 0
            ? `${call}: without a map, the only way to know whether ${fmt(x)} is already here is to look at every value. Compare A[0] = ${fmt(y.value)} with ${fmt(x)}: not equal.`
            : `Compare A[${i}] = ${fmt(y.value)} with ${fmt(x)}: not equal.`,
          ['ins.loop', 'ins.cmp'],
          2,
          [mark(vid(y.uid), 'compare')],
          call,
          { x, i },
        );
      }
      const end = done(appended(s), c);
      yield step(
        c,
        end,
        n === 0
          ? `${call}: the set is empty, so ${fmt(x)} is new. Put it at the end: A[0] = ${fmt(x)}. Return true.`
          : `No value equals ${fmt(x)}, so it is new: ${n === 1 ? 'one comparison' : `all ${n} comparisons`} to be sure. Put it at the end: A[${n}] = ${fmt(x)}. Return true.`,
        ['ins.append', 'ins.ret'],
        1,
        [mark(vid(uid), 'new'), mark('op-label', 'found')],
        `${call} → true`,
        { x, returned: true },
      );
      return end;
    }

    c.work.add('lookups');
    const e = entryOf(s, x);
    if (e) {
      const end = done(s, c);
      yield step(
        c,
        end,
        `${call}: look ${fmt(x)} up in the map: map[${fmt(x)}] = ${e.index}, so ${fmt(x)} is already in the set, at A[${e.index}]. Return false; nothing changes.`,
        ['ins.check', 'ins.dup'],
        1,
        [mark(keyId(x), 'found'), mark(vid(s.a[e.index]!.uid), 'found'), mark('op-label', 'found')],
        `${call} → false`,
        { x, i: e.index, returned: false },
      );
      return end;
    }
    yield step(
      c,
      s,
      `${call}: look ${fmt(x)} up in the map: not there, so ${fmt(x)} is new. One lookup, however many values the set holds.`,
      ['ins.check'],
      2,
      [mark('map-name', 'active')],
      call,
      { x },
    );
    c.work.add('lookups');
    const mapped: RSState = { ...s, map: [...s.map, { key: x, index: n }] };
    yield step(
      c,
      mapped,
      `Record where ${fmt(x)} will go, the first free slot: map[${fmt(x)}] = ${n}.`,
      ['ins.map'],
      2,
      [mark(keyId(x), 'new'), mark(idxId(x), 'new'), mark(cell(n), 'new')],
      call,
      { x, i: n },
    );
    const end = done(appended(mapped), c);
    yield step(
      c,
      end,
      `Put ${fmt(x)} at the end: A[${n}] = ${fmt(x)}. Return true.`,
      ['ins.append', 'ins.ret'],
      1,
      [mark(vid(uid), 'new'), mark('op-label', 'found')],
      `${call} → true`,
      { x, i: n, returned: true },
    );
    return end;
  },
};

/** The array after moving its last value into slot i and dropping the last slot. */
function moved(s: RSState, i: number): RSState {
  const a = [...s.a];
  a[i] = a[a.length - 1]!;
  a.pop();
  return { ...s, a };
}

const remove: Op = {
  label: 'Remove',
  arity: 1,
  *run(s, [arg], { settings }) {
    const x = readInt(arg, MIN_VALUE, MAX_VALUE);
    if (typeof x === 'string')
      return yield* refuse(s, settings, 'remove', `${x} Nothing is removed.`, 'rm.sig');
    const call = `remove(${fmt(x)})`;
    const c = context(s, settings, 'remove', x);
    const n = s.a.length;
    const last = s.a[n - 1];
    const v = fmt(x);

    /** The move of the last value into slot i, said for both designs. */
    const moveSay = (i: number) =>
      i === n - 1
        ? `${v} is the last value, so A[${i}] = A[${n - 1}] changes nothing. Drop the last slot.`
        : `Move the last value, A[${n - 1}] = ${fmt(last!.value)}, into the hole: A[${i}] = ${fmt(last!.value)}. Drop the last slot. Nothing else shifts.`;
    const moveMarks = (i: number) =>
      i === n - 1 ? [mark(cell(i), 'remove')] : [mark(vid(last!.uid), 'active'), mark(cell(i), 'active')];

    if (c.approach === 'naive') {
      let i = 0;
      for (; i < n; i++) {
        c.work.add('comparisons');
        const y = s.a[i]!;
        const hit = y.value === x;
        yield step(
          c,
          s,
          `${i === 0 ? `${call}: scan A for ${v}. ` : ''}Compare A[${i}] = ${fmt(y.value)} with ${v}: ${hit ? 'equal, found it.' : 'not equal.'}`,
          ['rm.loop', 'rm.cmp'],
          2,
          [mark(vid(y.uid), hit ? 'remove' : 'compare')],
          call,
          { x, i },
        );
        if (hit) break;
      }
      if (i === n) {
        const end = done(s, c);
        yield step(
          c,
          end,
          n === 0
            ? `${call}: the set is empty, so ${v} is not in it. Return false.`
            : `${v} is not in the set: all ${n} values checked. Return false.`,
          ['rm.absent'],
          1,
          [mark('op-label', 'found')],
          `${call} → false`,
          { x, returned: false },
        );
        return end;
      }
      const end = done(moved(s, i), c);
      yield step(
        c,
        end,
        `${moveSay(i)} Return true. Finding ${v} took ${c.work.get('comparisons') - s.cost.naive} comparisons; a map would have said where it is in one lookup.`,
        ['rm.move', 'rm.pop', 'rm.ret'],
        1,
        [...moveMarks(i), mark('op-label', 'found')],
        `${call} → true`,
        { x, i, returned: true },
      );
      return end;
    }

    c.work.add('lookups');
    const e = entryOf(s, x);
    if (!e) {
      const end = done(s, c);
      yield step(
        c,
        end,
        `${call}: look ${v} up in the map: not there, so ${v} is not in the set. Return false.`,
        ['rm.find', 'rm.absent'],
        1,
        [mark('map-name', 'active'), mark('op-label', 'found')],
        `${call} → false`,
        { x, returned: false },
      );
      return end;
    }
    const i = e.index;
    yield step(
      c,
      s,
      `${call}: look ${v} up in the map: map[${v}] = ${i}, so ${v} is at A[${i}]. No scan.`,
      ['rm.find'],
      2,
      [mark(keyId(x), 'found'), mark(vid(s.a[i]!.uid), 'remove')],
      call,
      { x, i },
    );
    const shifted = moved(s, i);
    yield step(
      c,
      shifted,
      moveSay(i),
      ['rm.last', 'rm.move', 'rm.pop'],
      2,
      moveMarks(i),
      call,
      { x, i },
    );
    c.work.add('lookups');
    const y = last!.value;
    const fixed: RSState = {
      ...shifted,
      map: shifted.map.map((m) => (m.key === y ? { key: y, index: i } : m)),
    };
    yield step(
      c,
      fixed,
      y === x
        ? `Fix the moved value's entry: map[${v}] = ${i}, which it already was.`
        : `Fix the moved value's entry: ${fmt(y)} now lives at A[${i}], so map[${fmt(y)}] = ${i}. Without this, the map would send the next lookup of ${fmt(y)} to a slot that is gone.`,
      ['rm.fix'],
      2,
      [mark(idxId(y), 'new'), mark(keyId(y), 'active')],
      call,
      { x, i },
    );
    c.work.add('lookups');
    const end = done({ ...fixed, map: fixed.map.filter((m) => m.key !== x) }, c);
    yield step(
      c,
      end,
      `Delete ${v}'s entry from the map. Return true: three lookups and ${i === n - 1 ? 'no move' : 'one move'}, however many values the set holds.`,
      ['rm.del', 'rm.ret'],
      1,
      [mark('map-name', 'active'), mark('op-label', 'found')],
      `${call} → true`,
      { x, i, returned: true },
    );
    return end;
  },
};

const random: Op = {
  label: 'Random',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const c = context(s, settings, 'random');
    const n = s.a.length;
    if (n === 0) {
      yield step(
        c,
        s,
        'random(): the set is empty, so there is nothing to pick.',
        ['rand.check', 'rand.empty'],
        1,
        [mark('a-name', 'error')],
        'random() → empty',
      );
      return s;
    }
    const i = rng.int(0, n - 1);
    const item = s.a[i]!;
    const end = done(s, c);
    const set =
      c.approach === 'pattern'
        ? 'A hash set alone could not do this: it has no index to jump to.'
        : 'The array alone is just as fast here; its trouble is insert and remove.';
    yield step(
      c,
      end,
      `random(): the random number generator picks an index from 0 to ${n - 1}, each with chance 1/${n}. It picks ${i}, so return A[${i}] = ${fmt(item.value)}. ${set}`,
      ['rand.check', 'rand.pick', 'rand.ret'],
      1,
      [mark(vid(item.uid), 'found'), mark('op-label', 'found')],
      `random(): i = ${i} → ${fmt(item.value)}`,
      { i, returned: item.value },
    );
    return end;
  },
};

export const ops: Record<string, Op> = { insert, remove, random };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

const randomBlock: PseudoBlock = {
  op: 'random',
  lines: [
    L('rand.sig', 0, 'random()', 'To pick a value at random:'),
    L('rand.check', 1, 'if A is empty', 'If there are no values,'),
    L('rand.empty', 2, 'error "set is empty"', 'stop: there is nothing to pick.'),
    L('rand.pick', 1, 'i = random index from 0 to n − 1', 'Pick an index, each one equally likely,'),
    L('rand.ret', 1, 'return A[i]', 'and hand back the value there.'),
  ],
};

export function pseudocode(settings: RSSettings): PseudoBlock[] {
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'insert',
        lines: [
          L('ins.sig', 0, 'insert(x)   // the array alone', 'To insert x, with only the array:'),
          L('ins.loop', 1, 'for i = 0 to n − 1', 'look at every value;'),
          L('ins.cmp', 2, 'if A[i] == x', 'if one is x,'),
          L('ins.dup', 3, 'return false', 'x is already there: stop.'),
          L('ins.append', 1, 'A.append(x)', 'Otherwise put x at the end'),
          L('ins.ret', 1, 'return true', 'and say it went in.'),
        ],
      },
      {
        op: 'remove',
        lines: [
          L('rm.sig', 0, 'remove(x)   // the array alone', 'To remove x, with only the array:'),
          L('rm.loop', 1, 'for i = 0 to n − 1', 'look at every value;'),
          L('rm.cmp', 2, 'if A[i] == x', 'when one is x,'),
          L('rm.move', 3, 'A[i] = A[n − 1]', 'move the last value into its slot,'),
          L('rm.pop', 3, 'A.removeLast()', 'drop the last slot,'),
          L('rm.ret', 3, 'return true', 'and say it was removed.'),
          L('rm.absent', 1, 'return false', 'No value was x: say so.'),
        ],
      },
      randomBlock,
    ];
  }
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(x)', 'To insert x:'),
        L('ins.check', 1, 'if x in map', 'If the map already has x,'),
        L('ins.dup', 2, 'return false', 'it is already in the set: stop.'),
        L('ins.map', 1, 'map[x] = n', 'Record that x goes in the first free slot, index n,'),
        L('ins.append', 1, 'A.append(x)', 'put it there,'),
        L('ins.ret', 1, 'return true', 'and say it went in.'),
      ],
    },
    {
      op: 'remove',
      lines: [
        L('rm.sig', 0, 'remove(x)', 'To remove x:'),
        L('rm.find', 1, 'i = map.get(x)', 'Look up where x is.'),
        L('rm.absent', 1, 'if i is none: return false', 'If it is not there, say so and stop.'),
        L('rm.last', 1, 'last = A[n − 1]', 'Take the last value,'),
        L('rm.move', 1, 'A[i] = last', 'move it into x’s slot,'),
        L('rm.pop', 1, 'A.removeLast()', 'and drop the last slot.'),
        L('rm.fix', 1, 'map[last] = i', 'Tell the map where the moved value is now.'),
        L('rm.del', 1, 'map.delete(x)', 'Forget x,'),
        L('rm.ret', 1, 'return true', 'and say it was removed.'),
      ],
    },
    randomBlock,
  ];
}

// ----- Start -----

export function describe(s: RSState): string {
  if (!s.a.length) return 'The set is empty.';
  const map = s.map.length
    ? ` The map: ${s.map.map((e) => `${fmt(e.key)} at ${e.index}`).join(', ')}.`
    : '';
  return `A, from index 0: ${list(values(s))}.${map}`;
}

export function initialSay(_s: RSState, settings: RSSettings): string {
  return approachOf(settings) === 'naive'
    ? 'An empty array, and nothing else. random is O(1), but insert has to scan for a duplicate and remove has to scan to find its value. Insert some values.'
    : 'An empty array A and an empty hash map from each value to its index in A. The array makes random O(1); the map makes insert and remove O(1). Insert some values.';
}

export function initialVars(): Record<string, Scalar> {
  return { n: 0, ...workVars(new Work(['comparisons', 'lookups']), NO_COSTS) };
}

export function parseInput(token: string): Value | Error {
  const v = readInt(token, MIN_VALUE, MAX_VALUE);
  return typeof v === 'string' ? new Error(v) : v;
}
