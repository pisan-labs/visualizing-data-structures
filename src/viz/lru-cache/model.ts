import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

/** A list node. `prev` and `next` are uids, or null. */
export interface LNode {
  uid: number;
  key: number;
  value: number;
  prev: number | null;
  next: number | null;
}

export interface LruState {
  capacity: number;
  /** Nodes in drawing order: list order between operations. */
  nodes: LNode[];
  /** Most recently used end. */
  head: number | null;
  /** Least recently used end. */
  tail: number | null;
  /** The hash map, drawn as one entry per slot: slot s holds the uid of a node, or null. */
  map: (number | null)[];
  nextUid: number;
  hits: number;
  misses: number;
}

export interface LruSettings {
  [key: string]: Scalar;
  capacity: number;
}

export interface LruExtra {
  /** Local pointers (x, y), by name. */
  ptrs?: Record<string, number | null>;
  /** A node made but not linked in yet. */
  pending?: number;
  /** A node nothing points at any more. */
  garbage?: number;
  /** The call and, at the end, its result, drawn at the top left. */
  label?: string;
}

type S = LruState;
type X = LruExtra;
type Op = OpSpec<S, LruSettings, X>;
type LStep = Step<S, X>;
type Level = 1 | 2 | 3;
type Ptr = 'next' | 'prev';

export const MAX_KEY = 999;

export const defaults: LruSettings = { capacity: 3 };

export function init(settings: LruSettings): S {
  return {
    capacity: settings.capacity,
    nodes: [],
    head: null,
    tail: null,
    map: Array(settings.capacity).fill(null),
    nextUid: 1,
    hits: 0,
    misses: 0,
  };
}

export const nid = (uid: number) => `n${uid}`;
export const mapId = (uid: number) => `map-${uid}`;
const linkMark = (uid: number, f: Ptr) => `n${uid}.${f}`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export function node(s: S, uid: number): LNode {
  const n = s.nodes.find((x) => x.uid === uid);
  if (!n) throw new Error(`no node ${uid}`);
  return n;
}

/** Keys from most to least recently used. */
export function order(s: S): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let u = s.head; u !== null && !seen.has(u); u = node(s, u).next) {
    seen.add(u);
    out.push(u);
  }
  return out;
}

export const keysOf = (s: S) => order(s).map((u) => node(s, u).key);
const sizeOf = (s: S) => s.map.filter((u) => u !== null).length;
const lookup = (s: S, k: number) => s.map.find((u) => u !== null && node(s, u).key === k) ?? null;

function readouts(s: S): Record<string, Scalar> {
  const total = s.hits + s.misses;
  return {
    size: sizeOf(s),
    capacity: s.capacity,
    hits: s.hits,
    misses: s.misses,
    'hit rate': total ? Math.round((s.hits / total) * 100) / 100 : 0,
  };
}

/** Read a whole number from 0 to 999. */
export function readInt(raw: Value, what: string): number | Error {
  const t = String(raw).trim();
  if (!/^\d+$/.test(t)) return new Error(`${what} is a whole number from 0 to ${MAX_KEY}.`);
  const n = Number(t);
  return n > MAX_KEY ? new Error(`Keep ${what.toLowerCase()} between 0 and ${MAX_KEY}.`) : n;
}

// ---------------------------------------------------------------------------------------------
// Working copy

interface Ctx {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
}

function step(
  c: Ctx,
  say: string,
  lines: string[],
  level: Level,
  marks: Mark[],
  more: Partial<X> = {},
): LStep {
  const extra: X = { ...c.extra, ...more };
  if (extra.ptrs) extra.ptrs = { ...extra.ptrs };
  return { state: c.s, marks, say, lines, vars: { ...c.vars, ...readouts(c.s) }, level, extra };
}

function setPtr(s: S, uid: number, f: Ptr, to: number | null): S {
  return { ...s, nodes: s.nodes.map((x) => (x.uid === uid ? { ...x, [f]: to } : x)) };
}

/** Put the nodes in list order, most recent first (keeping any others at the end). */
function redraw(s: S): S {
  const ids = order(s);
  const rest = s.nodes.filter((x) => !ids.includes(x.uid));
  return { ...s, nodes: [...ids.map((u) => node(s, u)), ...rest] };
}

const name = (s: S, u: number | null) => (u === null ? 'null' : String(node(s, u).key));

function* badArg(s: S, call: string, err: Error, line: string): Generator<LStep, S, void> {
  const c: Ctx = { s, extra: { label: call }, vars: {} };
  yield step(c, `${call}: ${err.message} The cache is unchanged.`, [line], 1, []);
  return s;
}

/**
 * Unlink x from the list, one pointer at a time. `lines` gives the pseudocode line for each
 * of the four cases (prev.next, next.prev, tail, head).
 */
function* unlink(
  c: Ctx,
  x: number,
  lines: { prevNext: string[]; nextPrev: string[]; tail: string[]; head: string[] },
  who: string,
): Generator<LStep, void, void> {
  const n = node(c.s, x);
  const { prev, next } = n;
  if (prev !== null) {
    c.s = setPtr(c.s, prev, 'next', next);
    yield step(
      c,
      `Unlink ${who}: ${name(c.s, prev)}.next = ${who}.next, which is ${name(c.s, next)}. The list now skips ${who} going forward.`,
      lines.prevNext,
      2,
      [mark(linkMark(prev, 'next'), 'active')],
    );
  } else {
    c.s = { ...c.s, head: next };
    yield step(
      c,
      `${who} was first, so head = ${who}.next, which is ${name(c.s, next)}.`,
      lines.head,
      2,
      [mark('p:head', 'active')],
    );
  }
  if (next !== null) {
    c.s = setPtr(c.s, next, 'prev', prev);
    yield step(
      c,
      `${name(c.s, next)}.prev = ${who}.prev, which is ${name(c.s, prev)}. Now neither neighbour points at ${who}.`,
      lines.nextPrev,
      2,
      [mark(linkMark(next, 'prev'), 'active')],
    );
  } else {
    c.s = { ...c.s, tail: prev };
    yield step(
      c,
      `${who} was last, so tail = ${who}.prev, which is ${name(c.s, prev)}.`,
      lines.tail,
      2,
      [mark('p:tail', 'active')],
    );
  }
}

/** Link x in front of the head, one pointer at a time. */
function* pushFront(
  c: Ctx,
  x: number,
  lines: { next: string[]; prev: string[]; headPrev: string[]; tail: string[]; head: string[] },
  who: string,
): Generator<LStep, void, void> {
  const head = c.s.head;
  c.s = setPtr(c.s, x, 'next', head);
  yield step(c, `${who}.next = head, which is ${name(c.s, head)}.`, lines.next, 2, [
    mark(linkMark(x, 'next'), 'active'),
  ]);
  if (node(c.s, x).prev !== null) {
    c.s = setPtr(c.s, x, 'prev', null);
    yield step(c, `${who}.prev = null: nothing comes before the front.`, lines.prev, 2, [
      mark(linkMark(x, 'prev'), 'active'),
    ]);
  }
  if (head !== null) {
    c.s = setPtr(c.s, head, 'prev', x);
    yield step(
      c,
      `head.prev = ${who}: ${name(c.s, head)} now points back at ${who}.`,
      lines.headPrev,
      2,
      [mark(linkMark(head, 'prev'), 'active')],
    );
  } else {
    c.s = { ...c.s, tail: x };
    yield step(
      c,
      `The list was empty, so ${who} is also the last node: tail = ${who}.`,
      lines.tail,
      2,
      [mark('p:tail', 'active')],
    );
  }
  c.s = { ...c.s, head: x };
  yield step(c, `head = ${who}: ${who} is the most recently used.`, lines.head, 2, [
    mark('p:head', 'active'),
  ]);
}

// ---------------------------------------------------------------------------------------------
// get

const get: Op = {
  label: 'Get',
  arity: 1,
  *run(s, [raw]) {
    const k = readInt(raw!, 'A key');
    if (k instanceof Error) return yield* badArg(s, `get(${String(raw)})`, k, 'get.sig');
    const call = `get(${k})`;
    const c: Ctx = { s, extra: { label: call }, vars: { k } };
    const x = lookup(s, k);
    if (x === null) {
      c.s = { ...s, misses: s.misses + 1 };
      c.vars.returned = -1;
      c.extra.label = `${call} → −1`;
      yield step(
        c,
        `${call}: the map has no entry for ${k}, so this is a miss. Return −1; nothing moves.`,
        ['get.lookup', 'get.missif', 'get.miss'],
        1,
        [],
      );
      return c.s;
    }
    const value = node(s, x).value;
    c.s = { ...s, hits: s.hits + 1 };
    c.extra.ptrs = { x };
    if (s.head === x) {
      c.vars.returned = value;
      c.extra.label = `${call} → ${value}`;
      c.extra.ptrs = undefined;
      yield step(
        c,
        `${call}: the map points at ${k}'s node in one step, so this is a hit. It is already the most recently used, so nothing moves. Return ${value}.`,
        ['get.lookup', 'get.hit', 'get.check', 'get.ret'],
        1,
        [mark(nid(x), 'found'), mark(mapId(x), 'found')],
      );
      return c.s;
    }
    yield step(
      c,
      `${call}: the map points straight at ${k}'s node, x. A hit. Now make x the most recently used: take it out of the list and put it back at the front.`,
      ['get.lookup', 'get.hit', 'get.check'],
      2,
      [mark(nid(x), 'found'), mark(mapId(x), 'found')],
    );
    yield* unlink(
      c,
      x,
      {
        prevNext: ['get.u1'],
        nextPrev: ['get.u2if', 'get.u2'],
        tail: ['get.u3'],
        head: ['get.u1'],
      },
      'x',
    );
    yield* pushFront(
      c,
      x,
      {
        next: ['get.p1'],
        prev: ['get.p2'],
        headPrev: ['get.p3'],
        tail: ['get.p3'],
        head: ['get.p4'],
      },
      'x',
    );
    c.s = redraw(c.s);
    c.vars.returned = value;
    c.extra.label = `${call} → ${value}`;
    c.extra.ptrs = undefined;
    yield step(
      c,
      `Return ${value}. Most to least recent: ${keysOf(c.s).join(', ')}.`,
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
  *run(s, [rawK, rawV]) {
    const k = readInt(rawK!, 'A key');
    if (k instanceof Error)
      return yield* badArg(s, `put(${String(rawK)}, ${String(rawV)})`, k, 'put.sig');
    const v = readInt(rawV!, 'A value');
    if (v instanceof Error) return yield* badArg(s, `put(${k}, ${String(rawV)})`, v, 'put.sig');
    const call = `put(${k}, ${v})`;
    const c: Ctx = { s, extra: { label: call }, vars: { k, v } };
    const link = {
      next: ['put.link'],
      prev: ['put.link'],
      headPrev: ['put.headprev'],
      tail: ['put.headprev', 'put.tailx'],
      head: ['put.head'],
    };
    const found = lookup(s, k);

    if (found !== null) {
      const old = node(s, found).value;
      c.s = { ...s, nodes: s.nodes.map((n) => (n.uid === found ? { ...n, value: v } : n)) };
      c.extra.ptrs = { x: found };
      if (s.head === found) {
        c.extra.ptrs = undefined;
        yield step(
          c,
          `${call}: ${k} is already cached, and it is already the most recently used. Its value changes from ${old} to ${v}.`,
          ['put.lookup', 'put.exists', 'put.update', 'put.athead'],
          1,
          [mark(nid(found), 'found')],
        );
        return c.s;
      }
      yield step(
        c,
        `${call}: ${k} is already cached. Change its value from ${old} to ${v}, then move it to the front, as get does.`,
        ['put.lookup', 'put.exists', 'put.update'],
        2,
        [mark(nid(found), 'found'), mark(mapId(found), 'found')],
      );
      const lines = ['put.athead', 'put.unlink'];
      yield* unlink(c, found, { prevNext: lines, nextPrev: lines, tail: lines, head: lines }, 'x');
      yield* pushFront(c, found, link, 'x');
      c.s = redraw(c.s);
      c.extra.ptrs = undefined;
      yield step(
        c,
        `${k} = ${v} is the most recently used. Most to least recent: ${keysOf(c.s).join(', ')}.`,
        ['put.head'],
        1,
        [mark(nid(found), 'done')],
      );
      return c.s;
    }

    yield step(
      c,
      `${call}: the map has no entry for ${k}, so it needs a new node.`,
      ['put.lookup', 'put.exists', 'put.else'],
      2,
      [],
    );

    if (sizeOf(s) >= s.capacity) {
      const y = s.tail!;
      const victim = node(s, y).key;
      c.extra.ptrs = { y };
      yield step(
        c,
        `The cache is full (${sizeOf(s)} of ${s.capacity}), so evict the least recently used entry, y = tail, which is ${victim}.`,
        ['put.full', 'put.evict'],
        2,
        [mark(nid(y), 'remove'), mark('p:tail', 'active')],
      );
      const ev = ['put.evict'];
      yield* unlink(c, y, { prevNext: ev, nextPrev: ev, tail: ev, head: ev }, 'y');
      c.s = { ...c.s, map: c.s.map.map((u) => (u === y ? null : u)) };
      c.extra.ptrs = {};
      yield step(
        c,
        `Delete ${victim} from the map. Nothing points at its node any more: it is garbage.`,
        ['put.unmap'],
        2,
        [],
        { garbage: y },
      );
      c.s = { ...c.s, nodes: c.s.nodes.filter((n) => n.uid !== y) };
    }

    const x = c.s.nextUid;
    const at = c.s.map.indexOf(null);
    const made: LNode = { uid: x, key: k, value: v, prev: null, next: null };
    c.s = {
      ...c.s,
      nodes: [made, ...c.s.nodes],
      map: c.s.map.map((u, i) => (i === at ? x : u)),
      nextUid: x + 1,
    };
    c.extra.ptrs = { x };
    yield step(
      c,
      `Make a node x for ${k} = ${v} and add ${k} → x to the map.`,
      ['put.new'],
      2,
      [mark(nid(x), 'new'), mark(mapId(x), 'new')],
      { pending: x },
    );
    yield* pushFront(c, x, link, 'x');
    c.s = redraw(c.s);
    c.extra.ptrs = undefined;
    yield step(
      c,
      `${k} = ${v} is cached as the most recently used. Most to least recent: ${keysOf(c.s).join(', ')}.`,
      ['put.head'],
      1,
      [mark(nid(x), 'done')],
    );
    return c.s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { ...init({ capacity: s.capacity }), nextUid: s.nextUid };
    const c: Ctx = { s: empty, extra: { label: 'clear()' }, vars: {} };
    yield step(
      c,
      'clear(): empty the map and the list, and reset the hit and miss counters.',
      ['clr.set'],
      1,
      [],
    );
    return empty;
  },
};

export const ops = { get, put, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'get',
      lines: [
        L('get.sig', 0, 'get(k)', 'To get the value of k:'),
        L('get.lookup', 1, 'x = map[k]', 'Look k up in the hash map: O(1).'),
        L('get.missif', 1, 'if x == nil', 'If it is not there,'),
        L('get.miss', 2, 'misses += 1; return −1', 'count a miss and report it.'),
        L('get.hit', 1, 'hits += 1', 'Otherwise count a hit.'),
        L('get.check', 1, 'if x ≠ head', 'Unless x is already at the front:'),
        L('get.u1', 2, 'x.prev.next = x.next', 'the node before x skips it,'),
        L('get.u2if', 2, 'if x.next ≠ nil', 'and if x has a next node,'),
        L('get.u2', 3, 'x.next.prev = x.prev', 'that node points back past it;'),
        L('get.u3', 2, 'else tail = x.prev', 'otherwise x was last, so tail moves back.'),
        L('get.p1', 2, 'x.next = head', 'Then x points at the old front,'),
        L('get.p2', 2, 'x.prev = nil', 'nothing comes before x,'),
        L('get.p3', 2, 'head.prev = x', 'the old front points back at x,'),
        L('get.p4', 2, 'head = x', 'and x is the new front.'),
        L('get.ret', 1, 'return x.value', 'Hand back the value.'),
      ],
    },
    {
      op: 'put',
      lines: [
        L('put.sig', 0, 'put(k, v)', 'To store v under k:'),
        L('put.lookup', 1, 'x = map[k]', 'Look k up in the hash map.'),
        L('put.exists', 1, 'if x ≠ nil', 'If k is already cached,'),
        L('put.update', 2, 'x.value = v', 'replace its value,'),
        L('put.athead', 2, 'if x == head: return', 'and stop if it is already at the front;'),
        L('put.unlink', 2, 'unlink(x)', 'otherwise take x out of the list.'),
        L('put.else', 1, 'else', 'If k is new:'),
        L('put.full', 2, 'if size == capacity', 'if the cache is full,'),
        L('put.evict', 3, 'y = tail; unlink(y)', 'unlink the least recently used node,'),
        L('put.unmap', 3, 'delete map[y.key]', 'and forget it in the map.'),
        L('put.new', 2, 'x = node(k, v); map[k] = x', 'Make a node for k and v and map k to it.'),
        L('put.link', 1, 'x.next = head; x.prev = nil', 'Put x in front of the old front:'),
        L('put.headprev', 1, 'if head ≠ nil: head.prev = x', 'the old front points back at x,'),
        L('put.tailx', 1, 'else tail = x', 'or, if the list was empty, x is also the last.'),
        L('put.head', 1, 'head = x', 'x is the most recently used.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To clear:'),
        L('clr.set', 1, 'map = {}; head = tail = nil', 'Forget every entry and every node.'),
      ],
    },
  ];
}

export function initialSay(state: S): string {
  return `An empty LRU cache with room for ${state.capacity} entries. The hash map finds a key's node in O(1); the doubly linked list keeps the nodes in order of use, most recent at head and least recent at tail.`;
}

export function initialVars(state: S) {
  return readouts(state);
}

export function describe(state: S): string {
  const keys = order(state).map((u) => `${node(state, u).key}=${node(state, u).value}`);
  return keys.length
    ? `LRU cache, ${keys.length} of ${state.capacity} entries. From most to least recent: ${keys.join(', ')}.`
    : `Empty LRU cache with room for ${state.capacity} entries.`;
}
