/**
 * LFU cache: when full, evict the key used the fewest times; among keys used equally often, the
 * one used least recently. Two designs, chosen by the approach setting:
 *
 * - pattern: O(1) for get and put. A map from key to node; a map from each frequency f to a
 *   doubly linked list of the nodes used f times, least recently used first; and minFreq, the
 *   smallest frequency in use. A use unlinks the node from list f and appends it to list f + 1
 *   (if list f empties and f was minFreq, minFreq becomes f + 1). Eviction takes the head of
 *   list minFreq. A new key goes on list 1, and minFreq becomes 1.
 * - naive: a map from key to (value, uses, last used). get and put are one lookup, but evicting
 *   scans every key for the fewest uses (the oldest last use breaks a tie): O(n).
 *
 * Both evict the same key: within each frequency list the nodes are in order of last use,
 * because a node joins a list's tail exactly when it is used. The state keeps the lists in both
 * designs (the naive view does not draw them), so the two end every operation in the same
 * cache, and only the work differs.
 *
 * Work, in the units of src/viz/_patterns/kit.ts, counted over the whole run: a lookup is one
 * read or write of the key map; a link is one splice of a list (unlinking a node or appending
 * one, a few pointer changes and the frequency map's entry); a scan is one key looked at while
 * searching for the one to evict.
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
import {
  approachOf,
  DEFAULT_APPROACH,
  Work,
  workVars,
  type Approach,
  type Totals,
} from '../_patterns/kit';

export interface FNode {
  uid: number;
  key: number;
  value: number;
  /** How many times the key has been used: put and every hit. */
  freq: number;
  /** The clock reading at its last use. */
  used: number;
}

export interface FreqList {
  freq: number;
  /** Least recently used first. */
  uids: number[];
}

export interface LfuState {
  capacity: number;
  nodes: FNode[];
  /** The key map, drawn as one entry per slot: slot s holds the uid of a node, or null. */
  map: (number | null)[];
  /** The frequency map: the non-empty lists, by frequency. */
  lists: FreqList[];
  /** The smallest frequency in use; 0 when the cache is empty. */
  minFreq: number;
  /** Counts the gets and puts, for "last used". */
  clock: number;
  hits: number;
  misses: number;
  /** The work so far, in this design. */
  work: Record<Unit, number>;
  /** What each design has cost so far on these operations. */
  spent: Totals;
  nextUid: number;
}

export const UNITS = ['lookups', 'links', 'scans'] as const;
export type Unit = (typeof UNITS)[number];

export interface LfuSettings {
  [key: string]: Scalar;
  approach: Approach;
  capacity: number;
}

export interface LfuExtra {
  /** The call and, at the end, its result, drawn at the top left. */
  label?: string;
  /** A node in no list yet, on its way to the list for `to`. */
  moving?: { uid: number; to: number };
  /** naive, while scanning: the key looked at now and the pick so far. */
  scan?: number;
  pick?: number;
}

type S = LfuState;
type X = LfuExtra;
type Op = OpSpec<S, LfuSettings, X>;
type LStep = Step<S, X>;

export const MAX_KEY = 999;
export const MAX_CAPACITY = 4;

export const defaults: LfuSettings = { approach: DEFAULT_APPROACH, capacity: 3 };

const zero = (): Record<Unit, number> => ({ lookups: 0, links: 0, scans: 0 });

export function init(settings: LfuSettings): S {
  const capacity = Math.max(1, Math.min(MAX_CAPACITY, Math.round(Number(settings.capacity) || 3)));
  return {
    capacity,
    nodes: [],
    map: Array(capacity).fill(null),
    lists: [],
    minFreq: 0,
    clock: 0,
    hits: 0,
    misses: 0,
    work: zero(),
    spent: { naive: 0, pattern: 0 },
    nextUid: 1,
  };
}

export const nid = (uid: number) => `n${uid}`;
export const mid = (uid: number) => `m${uid}`;
export const fid = (freq: number) => `f-${freq}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export function node(s: S, uid: number): FNode {
  const n = s.nodes.find((x) => x.uid === uid);
  if (!n) throw new Error(`no node ${uid}`);
  return n;
}

export const sizeOf = (s: S) => s.map.filter((u) => u !== null).length;
export const lookup = (s: S, k: number) =>
  s.map.find((u) => u !== null && node(s, u).key === k) ?? null;
export const listOf = (s: S, f: number) => s.lists.find((l) => l.freq === f);

/** The key each design evicts next: the fewest uses, then the oldest last use. */
export function victim(s: S): FNode | null {
  let best: FNode | null = null;
  for (const u of s.map) {
    if (u === null) continue;
    const n = node(s, u);
    if (!best || n.freq < best.freq || (n.freq === best.freq && n.used < best.used)) best = n;
  }
  return best;
}

/** "once", "twice", "3 times". */
export const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

const entryCount = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** "freq 1: 4, 2; freq 2: 1", or "empty". */
export function listsText(s: S): string {
  if (!s.lists.length) return 'empty';
  return s.lists
    .map((l) => `freq ${l.freq}: ${l.uids.map((u) => node(s, u).key).join(', ')}`)
    .join('; ');
}

/** Read a whole number from 0 to 999. */
export function readInt(raw: Value, what: string): number | Error {
  const t = String(raw).trim();
  if (!/^\d+$/.test(t)) return new Error(`${what} is a whole number from 0 to ${MAX_KEY}.`);
  const n = Number(t);
  return n > MAX_KEY ? new Error(`Keep ${what.toLowerCase()} between 0 and ${MAX_KEY}.`) : n;
}

// ---------------------------------------------------------------------------------------------
// What each design costs for one call, from the state before it.

function cost(s: S, op: 'get' | 'put', k: number): Totals {
  const x = lookup(s, k);
  if (x !== null) return op === 'get' ? { naive: 1, pattern: 3 } : { naive: 1, pattern: 3 };
  if (op === 'get') return { naive: 1, pattern: 1 };
  if (sizeOf(s) < s.capacity) return { naive: 2, pattern: 3 };
  return { naive: 3 + sizeOf(s), pattern: 5 };
}

// ---------------------------------------------------------------------------------------------
// Working copy

interface Ctx {
  s: S;
  work: Work;
  extra: X;
  vars: Record<string, Scalar>;
  naive: boolean;
}

function readouts(c: Ctx): Record<string, Scalar> {
  const s = c.s;
  const out: Record<string, Scalar> = { ...c.vars, size: sizeOf(s), capacity: s.capacity };
  if (!c.naive) out['min freq'] = s.minFreq;
  out.clock = s.clock;
  out.hits = s.hits;
  out.misses = s.misses;
  return { ...out, ...workVars(c.work, s.spent) };
}

function step(c: Ctx, say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]): LStep {
  c.s = { ...c.s, work: c.work.vars() as Record<Unit, number> };
  return { state: c.s, marks, say, lines, vars: readouts(c), level, extra: { ...c.extra } };
}

function ctx(s: S, settings: LfuSettings, label: string, vars: Record<string, Scalar> = {}): Ctx {
  const work = new Work(UNITS);
  for (const u of UNITS) work.add(u, s.work[u]);
  return { s, work, extra: { label }, vars, naive: approachOf(settings) === 'naive' };
}

const setNode = (s: S, uid: number, f: (n: FNode) => FNode): S => ({
  ...s,
  nodes: s.nodes.map((n) => (n.uid === uid ? f(n) : n)),
});

/** Take uid out of list f, dropping the list if it empties. */
function unlinkFrom(s: S, uid: number, f: number): S {
  const lists = s.lists
    .map((l) => (l.freq === f ? { ...l, uids: l.uids.filter((u) => u !== uid) } : l))
    .filter((l) => l.uids.length > 0);
  return { ...s, lists };
}

/** Append uid at the tail of list f, making the list if needed. */
function appendTo(s: S, uid: number, f: number): S {
  const has = s.lists.some((l) => l.freq === f);
  const lists = has
    ? s.lists.map((l) => (l.freq === f ? { ...l, uids: [...l.uids, uid] } : l))
    : [...s.lists, { freq: f, uids: [uid] }].sort((a, b) => a.freq - b.freq);
  return { ...s, lists };
}

function* badArg(s: S, settings: LfuSettings, call: string, err: Error): Generator<LStep, S, void> {
  const c = ctx(s, settings, call);
  yield step(c, `${call}: ${err.message} The cache is unchanged.`, [], 1, []);
  return s;
}

// ---------------------------------------------------------------------------------------------
// The pattern: move a used node up one frequency.

function* bump(c: Ctx, x: number, lines: { unlink: string; min: string }) {
  const n = node(c.s, x);
  const f = n.freq;
  const emptied = listOf(c.s, f)!.uids.length === 1;
  const wasMin = c.s.minFreq === f;
  c.s = unlinkFrom(c.s, x, f);
  if (emptied && wasMin) c.s = { ...c.s, minFreq: f + 1 };
  c.work.add('links');
  c.extra.moving = { uid: x, to: f + 1 };
  yield step(
    c,
    emptied
      ? `Unlink ${n.key} from the freq-${f} list, where it was alone. The list is now empty, ${
          wasMin
            ? `and ${f} was the smallest frequency, so minFreq = ${f + 1}.`
            : 'so the frequency map drops it.'
        }`
      : `Unlink ${n.key} from the freq-${f} list: its neighbours point past it, O(1).`,
    emptied && wasMin ? [lines.unlink, lines.min] : [lines.unlink],
    2,
    [mark(nid(x), 'active'), ...(emptied && wasMin ? [mark('p:min', 'active')] : [])],
  );
  // Append at the tail of list f + 1; the caller narrates it.
  c.s = appendTo(
    setNode(c.s, x, (m) => ({ ...m, freq: f + 1, used: c.s.clock })),
    x,
    f + 1,
  );
  c.work.add('links');
  c.extra.moving = undefined;
}

// ---------------------------------------------------------------------------------------------
// get

const get: Op = {
  label: 'Get',
  arity: 1,
  *run(s0, [raw], { settings }) {
    const k = readInt(raw!, 'A key');
    if (k instanceof Error) return yield* badArg(s0, settings, `get(${String(raw)})`, k);
    const call = `get(${k})`;
    const spent = cost(s0, 'get', k);
    const s: S = {
      ...s0,
      clock: s0.clock + 1,
      spent: { naive: s0.spent.naive + spent.naive, pattern: s0.spent.pattern + spent.pattern },
    };
    const c = ctx(s, settings, call, { k });
    const x = lookup(s, k);
    c.work.add('lookups');
    if (x === null) {
      c.s = { ...c.s, misses: c.s.misses + 1 };
      c.vars.returned = -1;
      c.extra.label = `${call} → −1`;
      yield step(
        c,
        `${call}: the map has no entry for ${k}, so this is a miss. Return −1; nothing moves.`,
        ['get.lookup', 'get.miss'],
        1,
        [],
      );
      return c.s;
    }
    const n = node(s, x);
    c.s = { ...c.s, hits: c.s.hits + 1 };
    if (c.naive) {
      c.s = appendTo(
        unlinkFrom(
          setNode(c.s, x, (m) => ({ ...m, freq: m.freq + 1, used: c.s.clock })),
          x,
          n.freq,
        ),
        x,
        n.freq + 1,
      );
      c.s = { ...c.s, minFreq: Math.min(...c.s.lists.map((l) => l.freq)) };
      c.vars.returned = n.value;
      c.extra.label = `${call} → ${n.value}`;
      yield step(
        c,
        `${call}: map[${k}] holds its entry, a hit. Count the use: ${k} has been used ${times(n.freq + 1)}, last at ${c.s.clock}. Return ${n.value}.`,
        ['get.lookup', 'get.hit', 'get.count', 'get.ret'],
        1,
        [mark(mid(x), 'found'), mark(nid(x), 'found')],
      );
      return c.s;
    }
    yield step(
      c,
      `${call}: map[${k}] points at its node in one step, a hit. ${k} has been used ${times(n.freq)}, so it sits in the freq-${n.freq} list. A use moves it up to freq ${n.freq + 1}.`,
      ['get.lookup', 'get.hit'],
      2,
      [mark(mid(x), 'found'), mark(nid(x), 'found')],
    );
    const created = !listOf(c.s, n.freq + 1);
    yield* bump(c, x, { unlink: 'get.unlink', min: 'get.min' });
    yield step(
      c,
      `Append ${k} at the tail of the freq-${n.freq + 1} list${created ? ', a new list' : ''}: the most recent of the keys used ${times(n.freq + 1)}.`,
      ['get.inc', 'get.append'],
      2,
      [mark(nid(x), 'new'), mark(fid(n.freq + 1), 'new')],
    );
    c.vars.returned = n.value;
    c.extra.label = `${call} → ${n.value}`;
    yield step(
      c,
      `Return ${n.value}. The lists: ${listsText(c.s)}. minFreq = ${c.s.minFreq}.`,
      ['get.ret'],
      1,
      [mark(nid(x), 'done')],
    );
    return c.s;
  },
};

// ---------------------------------------------------------------------------------------------
// put

const put: Op = {
  label: 'Put',
  arity: 2,
  *run(s0, [rawK, rawV], { settings }) {
    const k = readInt(rawK!, 'A key');
    if (k instanceof Error)
      return yield* badArg(s0, settings, `put(${String(rawK)}, ${String(rawV)})`, k);
    const v = readInt(rawV!, 'A value');
    if (v instanceof Error) return yield* badArg(s0, settings, `put(${k}, ${String(rawV)})`, v);
    const call = `put(${k}, ${v})`;
    const spent = cost(s0, 'put', k);
    const s: S = {
      ...s0,
      clock: s0.clock + 1,
      spent: { naive: s0.spent.naive + spent.naive, pattern: s0.spent.pattern + spent.pattern },
    };
    const c = ctx(s, settings, call, { k, v });
    const found = lookup(s, k);
    c.work.add('lookups');

    if (found !== null) {
      const n = node(s, found);
      c.s = setNode(c.s, found, (m) => ({ ...m, value: v }));
      if (c.naive) {
        c.s = appendTo(
          unlinkFrom(
            setNode(c.s, found, (m) => ({ ...m, freq: m.freq + 1, used: c.s.clock })),
            found,
            n.freq,
          ),
          found,
          n.freq + 1,
        );
        c.s = { ...c.s, minFreq: Math.min(...c.s.lists.map((l) => l.freq)) };
        yield step(
          c,
          `${call}: ${k} is cached, so change its value from ${n.value} to ${v}. A put counts as a use: ${k} has been used ${times(n.freq + 1)}, last at ${c.s.clock}.`,
          ['put.lookup', 'put.exists', 'put.update'],
          1,
          [mark(mid(found), 'found'), mark(nid(found), 'found')],
        );
        return c.s;
      }
      yield step(
        c,
        `${call}: ${k} is cached, so change its value from ${n.value} to ${v}. A put counts as a use, so ${k} moves up from freq ${n.freq} to freq ${n.freq + 1}, as with get.`,
        ['put.lookup', 'put.exists', 'put.update'],
        2,
        [mark(mid(found), 'found'), mark(nid(found), 'found')],
      );
      const created = !listOf(c.s, n.freq + 1);
      yield* bump(c, found, { unlink: 'put.unlink', min: 'put.min' });
      yield step(
        c,
        `Append ${k} at the tail of the freq-${n.freq + 1} list${created ? ', a new list' : ''}. The lists: ${listsText(c.s)}. minFreq = ${c.s.minFreq}.`,
        ['put.inc', 'put.append'],
        1,
        [mark(nid(found), 'done'), mark(fid(n.freq + 1), 'new')],
      );
      return c.s;
    }

    yield step(
      c,
      `${call}: the map has no entry for ${k}, so ${k} is a new key.`,
      ['put.lookup', 'put.exists'],
      2,
      [],
    );

    let evicted: number | null = null;
    if (sizeOf(c.s) >= c.s.capacity) {
      const y = victim(c.s)!;
      evicted = y.key;
      if (c.naive) {
        // Scan every key for the fewest uses, the oldest last use breaking a tie.
        let pick: FNode | null = null;
        for (const u of c.s.map) {
          if (u === null) continue;
          const e = node(c.s, u);
          c.work.add('scans');
          const before = pick;
          const better =
            !pick || e.freq < pick.freq || (e.freq === pick.freq && e.used < pick.used);
          if (better) pick = e;
          c.extra.scan = e.uid;
          c.extra.pick = pick!.uid;
          const why = !before
            ? 'the first, so the pick so far.'
            : e.freq < before.freq
              ? `fewer uses than ${before.key}: the new pick.`
              : e.freq > before.freq
                ? `more uses than ${before.key}, which stays the pick.`
                : better
                  ? `as many uses as ${before.key}, but last used earlier (${e.used} before ${before.used}): the new pick.`
                  : `as many uses as ${before.key}, but used later (${e.used} after ${before.used}): ${before.key} stays the pick.`;
          const what = `${e.key}: used ${times(e.freq)}, last at ${e.used}; ${why}`;
          yield step(
            c,
            before ? what : `The cache is full, so look at every key for the one to evict. ${what}`,
            ['put.full', 'put.scan'],
            2,
            [
              mark(nid(e.uid), 'compare'),
              ...(pick!.uid !== e.uid ? [mark(nid(pick!.uid), 'found')] : []),
            ],
          );
        }
        c.extra.scan = undefined;
        c.extra.pick = undefined;
      } else {
        yield step(
          c,
          `The cache is full (${sizeOf(c.s)} of ${c.s.capacity}). Evict from the minFreq list, freq ${c.s.minFreq}: its head, ${y.key}, is the least recently used of the keys used ${times(c.s.minFreq)}. No search.`,
          ['put.full', 'put.victim'],
          2,
          [mark(nid(y.uid), 'remove'), mark('p:min', 'active'), mark(fid(c.s.minFreq), 'active')],
        );
        c.work.add('links');
      }
      c.s = unlinkFrom(c.s, y.uid, y.freq);
      c.s = {
        ...c.s,
        map: c.s.map.map((u) => (u === y.uid ? null : u)),
        nodes: c.s.nodes.filter((m) => m.uid !== y.uid),
      };
      c.work.add('lookups');
      yield step(
        c,
        c.naive
          ? `Evict ${y.key}, used ${times(y.freq)}: delete map[${y.key}].`
          : `Unlink ${y.key} from the freq-${y.freq} list and delete map[${y.key}].`,
        ['put.evict'],
        2,
        [],
      );
    }

    const x = c.s.nextUid;
    const at = c.s.map.indexOf(null);
    const made: FNode = { uid: x, key: k, value: v, freq: 1, used: c.s.clock };
    c.s = {
      ...c.s,
      nodes: [...c.s.nodes, made],
      map: c.s.map.map((u, i) => (i === at ? x : u)),
      nextUid: x + 1,
    };
    c.work.add('lookups');
    const tail = evicted === null ? '' : ` (it evicted ${evicted})`;
    if (c.naive) {
      c.s = { ...appendTo(c.s, x, 1), minFreq: 1 };
      c.extra.label = `${call}${evicted === null ? '' : `, evicted ${evicted}`}`;
      yield step(
        c,
        `Store ${k} = ${v} in the map: used once, last at ${c.s.clock}${tail}.`,
        ['put.new'],
        1,
        [mark(mid(x), 'new'), mark(nid(x), 'new')],
      );
      return c.s;
    }
    c.extra.moving = { uid: x, to: 1 };
    yield step(
      c,
      `Make a node for ${k} = ${v} and set map[${k}] to it. A new key has been used once.`,
      ['put.new'],
      2,
      [mark(mid(x), 'new'), mark(nid(x), 'new')],
    );
    c.extra.moving = undefined;
    c.s = { ...appendTo(c.s, x, 1), minFreq: 1 };
    c.work.add('links');
    c.extra.label = `${call}${evicted === null ? '' : `, evicted ${evicted}`}`;
    yield step(
      c,
      `Append ${k} at the tail of the freq-1 list, and minFreq = 1: no key is used less than a new one${tail}. The lists: ${listsText(c.s)}.`,
      ['put.link', 'put.min1'],
      1,
      [mark(nid(x), 'done'), mark(fid(1), 'new')],
    );
    return c.s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const empty: S = { ...init({ ...settings, capacity: s.capacity }), nextUid: s.nextUid };
    const c = ctx(empty, settings, 'clear()');
    yield step(
      c,
      'clear(): empty the map and the lists, and reset the counters.',
      ['clr.set'],
      1,
      [],
    );
    return c.s;
  },
};

export const ops = { get, put, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: LfuSettings): PseudoBlock[] {
  const clr: PseudoBlock = {
    op: 'clear',
    lines: [
      L('clr.sig', 0, 'clear()', 'To clear:'),
      L('clr.set', 1, 'map = {}; lists = {}; minFreq = 0', 'Forget every key and every list.'),
    ],
  };
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'get',
        lines: [
          L('get.sig', 0, 'get(k)   // scan to evict', 'To get the value of k:'),
          L('get.lookup', 1, 'e = map[k]', 'Look k up in the hash map: O(1).'),
          L(
            'get.miss',
            1,
            'if e == nil: misses += 1; return −1',
            'If it is not there, report a miss.',
          ),
          L('get.hit', 1, 'hits += 1', 'Otherwise count a hit,'),
          L('get.count', 1, 'e.uses += 1; e.used = now', 'and a use, at the current time.'),
          L('get.ret', 1, 'return e.value', 'Hand back the value.'),
        ],
      },
      {
        op: 'put',
        lines: [
          L('put.sig', 0, 'put(k, v)   // scan to evict', 'To store v under k:'),
          L('put.lookup', 1, 'e = map[k]', 'Look k up in the hash map.'),
          L('put.exists', 1, 'if e ≠ nil', 'If k is cached,'),
          L(
            'put.update',
            2,
            'e.value = v; e.uses += 1; e.used = now; return',
            'replace its value and count a use. Done.',
          ),
          L('put.full', 1, 'if size == capacity', 'If k is new and the cache is full,'),
          L(
            'put.scan',
            2,
            'y = the key with the fewest uses, oldest used first',
            'look at every key for the one used the fewest times (the one used longest ago, on a tie): O(n),',
          ),
          L('put.evict', 2, 'delete map[y]', 'and evict it.'),
          L(
            'put.new',
            1,
            'map[k] = (v, uses = 1, used = now)',
            'Store k with its value, used once, now.',
          ),
        ],
      },
      clr,
    ];
  }
  return [
    {
      op: 'get',
      lines: [
        L('get.sig', 0, 'get(k)', 'To get the value of k:'),
        L('get.lookup', 1, 'x = map[k]', 'Look k up in the hash map: O(1).'),
        L(
          'get.miss',
          1,
          'if x == nil: misses += 1; return −1',
          'If it is not there, report a miss.',
        ),
        L('get.hit', 1, 'hits += 1', 'Otherwise count a hit, and move x up a frequency:'),
        L(
          'get.unlink',
          1,
          'unlink x from lists[x.freq]',
          'take x out of its list (doubly linked, so O(1));',
        ),
        L(
          'get.min',
          1,
          'if lists[x.freq] == [] and minFreq == x.freq: minFreq += 1',
          'if that emptied the list of the smallest frequency, the smallest is now one more;',
        ),
        L('get.inc', 1, 'x.freq += 1', 'x has been used once more,'),
        L(
          'get.append',
          1,
          'append x to lists[x.freq]',
          'so it goes at the tail of the next list: the most recent of its frequency.',
        ),
        L('get.ret', 1, 'return x.value', 'Hand back the value.'),
      ],
    },
    {
      op: 'put',
      lines: [
        L('put.sig', 0, 'put(k, v)', 'To store v under k:'),
        L('put.lookup', 1, 'x = map[k]', 'Look k up in the hash map.'),
        L('put.exists', 1, 'if x ≠ nil', 'If k is cached,'),
        L(
          'put.update',
          2,
          'x.value = v',
          'replace its value, and move x up a frequency, as get does:',
        ),
        L('put.unlink', 2, 'unlink x from lists[x.freq]', 'take it out of its list,'),
        L(
          'put.min',
          2,
          'if lists[x.freq] == [] and minFreq == x.freq: minFreq += 1',
          'move minFreq on if that emptied the smallest list,',
        ),
        L('put.inc', 2, 'x.freq += 1', 'count the use,'),
        L(
          'put.append',
          2,
          'append x to lists[x.freq]; return',
          'and append it to the next list. Done.',
        ),
        L('put.full', 1, 'if size == capacity', 'If k is new and the cache is full,'),
        L(
          'put.victim',
          2,
          'y = lists[minFreq].head',
          'the key to evict is the head of the smallest frequency’s list: the least recently used of the least used. No search;',
        ),
        L('put.evict', 2, 'unlink y; delete map[y.key]', 'unlink it and forget it in the map.'),
        L(
          'put.new',
          1,
          'x = node(k, v, freq = 1); map[k] = x',
          'Make a node for k, used once, and map k to it.',
        ),
        L(
          'put.link',
          1,
          'append x to lists[1]',
          'It goes at the tail of the list for frequency 1,',
        ),
        L('put.min1', 1, 'minFreq = 1', 'and nothing is used less than a new key.'),
      ],
    },
    clr,
  ];
}

export function initialSay(state: S, settings: LfuSettings): string {
  return approachOf(settings) === 'naive'
    ? `An empty LFU cache with room for ${entryCount(state.capacity)}, the obvious way: a hash map from each key to its value, how many times it was used and when it was last used. get and put are one lookup, but evicting scans every key.`
    : `An empty LFU cache with room for ${entryCount(state.capacity)}. A hash map finds a key's node; each frequency has a doubly linked list of the keys used that many times, least recently used first; and minFreq names the smallest frequency. Every operation is O(1).`;
}

export function initialVars(state: S, settings: LfuSettings) {
  return readouts(ctx(state, settings, ''));
}

export function describe(state: S): string {
  const n = sizeOf(state);
  if (!n) return `Empty LFU cache with room for ${entryCount(state.capacity)}.`;
  const entries = state.lists
    .flatMap((l) => l.uids)
    .map((u) => {
      const x = node(state, u);
      return `${x.key}=${x.value} used ${times(x.freq)}`;
    });
  return `LFU cache, ${n} of ${state.capacity} entries: ${entries.join(', ')}. Lists by frequency: ${listsText(state)}. minFreq = ${state.minFreq}.`;
}
