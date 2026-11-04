import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

/** A node of the list: its key and one forward pointer per level (next[0] is level 1). */
export interface SLNode {
  uid: number;
  key: number;
  next: (number | null)[];
}

export interface SLState {
  nodes: Record<number, SLNode>;
  /** The head's forward pointers, one per possible level (the maximum level). */
  head: (number | null)[];
  /** Levels in use: the height of the tallest node, 0 when the list is empty. */
  level: number;
  nextUid: number;
}

export interface SkipSettings {
  [key: string]: Scalar;
  /** Chance that a coin flip comes up heads and the new node grows one more level. */
  p: '1/2' | '1/4';
  /** No node is taller than this. */
  maxLevel: number;
  /** Levels as rows (keys left to right) or as columns (keys top to bottom, for a phone). */
  draw: 'across' | 'down';
}

export const defaults: SkipSettings = { p: '1/2', maxLevel: 5, draw: 'across' };

/** Where a search can stand: the head, or a node. */
export type Pos = number | 'head';

export interface SkipExtra {
  arg?: { name: string; text: string; error?: boolean };
  /** Where the search stands now. */
  at?: { node: Pos; level: number };
  /** Boxes the search has stood on, as [node, level]. */
  path?: [Pos, number][];
  /** Pointers the search has followed, by shape id. */
  moves?: string[];
  /** Coin flips so far for the node being inserted. */
  flips?: ('H' | 'T')[];
  /** The node being built: drawn dashed in its place until it is linked in. */
  fresh?: { uid: number; key: number; level: number };
  /** The node before the new key at each level (the update array). */
  update?: Pos[];
}

type S = SLState;
type X = SkipExtra;
type SkipStep = Step<S, X>;
type Op = OpSpec<S, SkipSettings, X>;
type Gen = Generator<SkipStep, S, void>;

export const MIN_KEY = -99;
export const MAX_KEY = 999;
export const MAX_LEVEL = 8;

export function probOf(settings: SkipSettings): number {
  return settings.p === '1/4' ? 0.25 : 0.5;
}

export function capOf(settings: SkipSettings): number {
  const m = Math.round(Number(settings.maxLevel));
  return Number.isFinite(m) ? Math.max(2, Math.min(MAX_LEVEL, m)) : 5;
}

export function parseKey(raw: Value): number | Error {
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text))
    return new Error(`Keys are whole numbers from ${MIN_KEY} to ${MAX_KEY}, such as 42.`);
  const k = Number(text);
  if (k < MIN_KEY || k > MAX_KEY)
    return new Error(`Keep keys between ${MIN_KEY} and ${MAX_KEY} so they fit in the boxes.`);
  return k;
}

export function init(settings: SkipSettings): S {
  return { nodes: {}, head: Array(capOf(settings)).fill(null), level: 0, nextUid: 1 };
}

// ---------------------------------------------------------------------------------------------
// Shape ids, shared with the view so marks always point at shapes.

export const boxId = (p: Pos, l: number) => `box-${p}-${l}`;
export const ptrId = (p: Pos, l: number) => `ptr-${p}-${l}`;
export const NIL_ID = 'nil';

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

// ---------------------------------------------------------------------------------------------
// Working copy

class Work {
  nodes: Record<number, SLNode>;
  head: (number | null)[];
  level: number;
  nextUid: number;
  constructor(s: S) {
    this.nodes = Object.fromEntries(
      Object.entries(s.nodes).map(([k, n]) => [k, { ...n, next: [...n.next] }]),
    );
    this.head = [...s.head];
    this.level = s.level;
    this.nextUid = s.nextUid;
  }
  snap(): S {
    return {
      nodes: Object.fromEntries(
        Object.entries(this.nodes).map(([k, n]) => [k, { ...n, next: [...n.next] }]),
      ) as Record<number, SLNode>,
      head: [...this.head],
      level: this.level,
      nextUid: this.nextUid,
    };
  }
  next(p: Pos, l: number): number | null {
    return p === 'head' ? (this.head[l] ?? null) : (this.nodes[p]!.next[l] ?? null);
  }
  setNext(p: Pos, l: number, v: number | null): void {
    if (p === 'head') this.head[l] = v;
    else this.nodes[p]!.next[l] = v;
  }
  key(p: Pos): string {
    return p === 'head' ? 'head' : String(this.nodes[p]!.key);
  }
}

/** Keys in order, read along level 1. */
export function keysOf(s: S): number[] {
  const out: number[] = [];
  for (let u = s.head[0] ?? null; u !== null; u = s.nodes[u]!.next[0] ?? null)
    out.push(s.nodes[u]!.key);
  return out;
}

/** Forward pointers in all the nodes (the head's are not counted). */
export function pointerCount(s: S): number {
  return Object.values(s.nodes).reduce((a, n) => a + n.next.length, 0);
}

export const readouts = (s: S): Record<string, Scalar> => ({
  N: Object.keys(s.nodes).length,
  levels: s.level,
  pointers: pointerCount(s),
});

interface Ctx {
  W: Work;
  extra: X;
  vars: Record<string, Scalar>;
}

function step(c: Ctx, say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[]): SkipStep {
  const state = c.W.snap();
  const e: X = { ...c.extra };
  if (e.path) e.path = e.path.map((p) => [...p] as [Pos, number]);
  if (e.moves) e.moves = [...e.moves];
  if (e.flips) e.flips = [...e.flips];
  if (e.update) e.update = [...e.update];
  if (e.fresh) e.fresh = { ...e.fresh };
  if (e.arg) e.arg = { ...e.arg };
  return { state, marks, say, lines, vars: { ...readouts(state), ...c.vars }, level, extra: e };
}

function* badArg(s: S, name: string, raw: Value, err: Error, line: string): Gen {
  const c: Ctx = {
    W: new Work(s),
    extra: { arg: { name, text: String(raw).slice(0, 6), error: true } },
    vars: {},
  };
  yield step(c, `${name}(${String(raw)}): ${err.message} The list is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Pugh's walk: start at the head on the top level; at each level move right while the next key
 * is smaller than k, then drop down. Returns update[], the last node before k on every level.
 */
function* descend(
  c: Ctx,
  k: number,
  lines: { right: string[]; down: string[] },
): Generator<SkipStep, Pos[], void> {
  const W = c.W;
  const update: Pos[] = [];
  let x: Pos = 'head';
  const path: [Pos, number][] = [];
  const moves: string[] = [];
  c.extra.path = path;
  c.extra.moves = moves;
  c.vars.comparisons = 0;
  for (let l = W.level - 1; l >= 0; l--) {
    path.push([x, l]);
    c.extra.at = { node: x, level: l };
    for (;;) {
      const nx = W.next(x, l);
      const here = x === 'head' ? 'the head' : W.key(x);
      if (nx !== null) c.vars.comparisons = Number(c.vars.comparisons) + 1;
      if (nx !== null && W.nodes[nx]!.key < k) {
        moves.push(ptrId(x, l));
        yield step(
          c,
          `Level ${l + 1}: the next key after ${here} is ${W.nodes[nx]!.key} < ${k}, so move right to ${W.nodes[nx]!.key}.`,
          lines.right,
          2,
          [mark(ptrId(x, l), 'active'), mark(boxId(nx, l), 'active')],
        );
        x = nx;
        path.push([x, l]);
        c.extra.at = { node: x, level: l };
        continue;
      }
      const why =
        nx === null
          ? `the pointer after ${here} is nil (the end)`
          : `the next key after ${here} is ${W.nodes[nx]!.key} ≥ ${k}`;
      yield step(
        c,
        l > 0
          ? `Level ${l + 1}: ${why}, so go down to level ${l}.`
          : `Level 1: ${why}, so stop: ${k} is either the next key or not in the list.`,
        lines.down,
        2,
        [
          mark(boxId(x, l), 'active'),
          mark(ptrId(x, l), 'active'),
          mark(nx === null ? NIL_ID : boxId(nx, l), 'compare'),
        ],
      );
      break;
    }
    update[l] = x;
  }
  return update;
}

// ---------------------------------------------------------------------------------------------
// search

function* searchGen(s: S, k: number): Gen {
  const c: Ctx = { W: new Work(s), extra: { arg: { name: 'k', text: String(k) } }, vars: { k } };
  const W = c.W;
  if (W.level === 0) {
    c.vars.found = false;
    yield step(c, `search(${k}): the list is empty, so ${k} is not in it.`, ['srch.sig'], 1, []);
    return s;
  }
  yield step(
    c,
    `search(${k}): start at the head, on the top level, level ${W.level}.`,
    ['srch.sig', 'srch.start'],
    3,
    [mark(boxId('head', W.level - 1), 'active')],
  );
  const update = yield* descend(c, k, {
    right: ['srch.loop', 'srch.while', 'srch.right'],
    down: ['srch.loop', 'srch.while'],
  });
  const cand = W.next(update[0]!, 0);
  const found = cand !== null && W.nodes[cand]!.key === k;
  c.vars.found = found;
  const n = Number(c.vars.comparisons);
  yield step(
    c,
    found
      ? `The next node on level 1 holds ${k}: found it, after ${plural(n, 'key comparison')}.`
      : `The next node on level 1 is ${cand === null ? 'nil' : W.nodes[cand]!.key}, not ${k}, so ${k} is not in the list. That took ${plural(n, 'key comparison')}.`,
    ['srch.next', 'srch.ret'],
    1,
    found ? [mark(boxId(cand, 0), 'found')] : [mark(boxId(update[0]!, 0), 'active')],
  );
  return s;
}

// ---------------------------------------------------------------------------------------------
// insert

function* insertGen(s: S, k: number, settings: SkipSettings, rng: { next(): number }): Gen {
  const W = new Work(s);
  const c: Ctx = { W, extra: { arg: { name: 'k', text: String(k) } }, vars: { k } };
  const cap = capOf(settings);
  const p = probOf(settings);
  const odds = p === 0.25 ? 'a 1-in-4 chance' : 'a 1-in-2 chance';
  let update: Pos[] = [];
  if (W.level === 0) {
    yield step(
      c,
      `insert(${k}): the list is empty, so ${k} will come right after the head.`,
      ['ins.sig', 'ins.find'],
      2,
      [mark(boxId('head', 0), 'active')],
    );
  } else {
    yield step(
      c,
      `insert(${k}): first search for ${k}, starting at the head on level ${W.level}, and remember the last node before ${k} on every level.`,
      ['ins.sig', 'ins.find'],
      3,
      [mark(boxId('head', W.level - 1), 'active')],
    );
    update = yield* descend(c, k, {
      right: ['ins.find', 'ins.right'],
      down: ['ins.find', 'ins.update'],
    });
    const cand = W.next(update[0]!, 0);
    if (cand !== null && W.nodes[cand]!.key === k) {
      c.extra.arg = { name: 'k', text: String(k), error: true };
      yield step(
        c,
        `The next node on level 1 already holds ${k}. Keys are not repeated, so the list does not change.`,
        ['ins.dup'],
        1,
        [mark(boxId(cand, 0), 'found'), mark('arg-box', 'error')],
      );
      return s;
    }
  }
  c.extra.update = [...update];

  // Flip coins for the new node's height.
  const uid = W.nextUid;
  let lvl = 1;
  c.extra.flips = [];
  c.extra.fresh = { uid, key: k, level: 1 };
  c.vars.level = 1;
  yield step(
    c,
    `Every node is at least 1 level tall. Flip a coin: heads (${odds}) adds a level, tails stops.`,
    ['ins.lvl', 'ins.flip'],
    2,
    [mark(boxId(uid, 0), 'new')],
  );
  while (lvl < cap) {
    const heads = rng.next() < p;
    c.extra.flips.push(heads ? 'H' : 'T');
    c.vars.flips = c.extra.flips.join('');
    const n = c.extra.flips.length;
    if (!heads) {
      yield step(
        c,
        `Flip ${n}: tails, so stop. The new node is ${plural(lvl, 'level')} tall.`,
        ['ins.flip'],
        2,
        [mark(`coin-${n}`, 'active')],
      );
      break;
    }
    lvl++;
    c.extra.fresh = { uid, key: k, level: lvl };
    c.vars.level = lvl;
    yield step(
      c,
      lvl === cap
        ? `Flip ${n}: heads, so the node grows to level ${lvl}. That is the maximum level, ${cap}, so stop flipping.`
        : `Flip ${n}: heads, so the node grows to level ${lvl}. Flip again.`,
      ['ins.flip', 'ins.grow'],
      2,
      [mark(`coin-${n}`, 'active'), mark(boxId(uid, lvl - 1), 'new')],
    );
  }

  if (lvl > W.level) {
    const from = W.level;
    for (let l = from; l < lvl; l++) update[l] = 'head';
    W.level = lvl;
    c.extra.update = [...update];
    yield step(
      c,
      from === 0
        ? `The list was empty, so it now has ${plural(lvl, 'level')}, and the head points at the new node on each.`
        : `The new node is taller than the list, so the list grows to ${lvl} levels. On the new ${lvl - from === 1 ? 'level' : 'levels'}, the node before it is the head.`,
      ['ins.taller', 'ins.head', 'ins.grow2'],
      2,
      [mark(boxId('head', lvl - 1), 'active')],
    );
  }

  // Link it in on every level.
  const node: SLNode = { uid, key: k, next: [] };
  for (let l = 0; l < lvl; l++) {
    node.next[l] = W.next(update[l]!, l);
    W.setNext(update[l]!, l, uid);
  }
  W.nodes[uid] = node;
  W.nextUid = uid + 1;
  c.extra.fresh = undefined;
  c.extra.arg = undefined;
  c.extra.at = undefined;
  const befores = update
    .slice(0, lvl)
    .map((u) => W.key(u))
    .filter((x, i, xs) => xs.indexOf(x) === i);
  const st = W.snap();
  yield step(
    c,
    `${
      lvl === 1
        ? `Link ${k} in on level 1: it takes over the pointer of ${befores[0]} and points where that one used to.`
        : `Link ${k} in on ${lvl === 2 ? 'both levels' : `all ${lvl} levels`}: on each one it takes over the pointer of the node before it (${befores.join(', ')}) and points where that one used to.`
    } N = ${Object.keys(st.nodes).length}, levels = ${st.level}.`,
    ['ins.link', 'ins.next', 'ins.prev'],
    1,
    [
      ...Array.from({ length: lvl }, (_, l) => mark(boxId(uid, l), 'new')),
      ...update.slice(0, lvl).map((u, l) => mark(ptrId(u, l), 'active')),
    ],
  );
  return st;
}

// ---------------------------------------------------------------------------------------------
// delete

function* deleteGen(s: S, k: number): Gen {
  const W = new Work(s);
  const c: Ctx = { W, extra: { arg: { name: 'k', text: String(k) } }, vars: { k } };
  if (W.level === 0) {
    yield step(
      c,
      `delete(${k}): the list is empty, so there is nothing to delete.`,
      ['del.sig'],
      1,
      [mark('arg-box', 'error')],
    );
    return s;
  }
  yield step(
    c,
    `delete(${k}): search for ${k} from the top level, remembering the last node before it on every level.`,
    ['del.sig', 'del.find'],
    3,
    [mark(boxId('head', W.level - 1), 'active')],
  );
  const update = yield* descend(c, k, {
    right: ['del.find', 'del.right'],
    down: ['del.find', 'del.update'],
  });
  const x = W.next(update[0]!, 0);
  if (x === null || W.nodes[x]!.key !== k) {
    yield step(
      c,
      `The next node on level 1 is ${x === null ? 'nil' : W.nodes[x]!.key}, not ${k}, so ${k} is not in the list. Nothing changes.`,
      ['del.check', 'del.missing'],
      1,
      [mark('arg-box', 'error')],
    );
    return s;
  }
  const node = W.nodes[x]!;
  const lvl = node.next.length;
  c.extra.update = [...update];
  yield step(
    c,
    `Found ${k}: it is ${plural(lvl, 'level')} tall. On each of its levels, the node before it will skip over it.`,
    ['del.check'],
    2,
    Array.from({ length: lvl }, (_, l) => mark(boxId(x, l), 'remove')),
  );
  for (let l = 0; l < lvl; l++) W.setNext(update[l]!, l, node.next[l] ?? null);
  delete W.nodes[x];
  const before = W.level;
  while (W.level > 0 && W.head[W.level - 1] === null) W.level--;
  c.extra.at = undefined;
  c.extra.update = undefined;
  const shrank = W.level < before;
  const st = W.snap();
  yield step(
    c,
    `Unlinked: on every level, the pointer that led to ${k} now jumps past it.${
      shrank
        ? ` The top ${before - W.level === 1 ? 'level is' : `${before - W.level} levels are`} empty now, so the list drops to ${plural(W.level, 'level')}.`
        : ''
    } N = ${Object.keys(st.nodes).length}, levels = ${st.level}.`,
    ['del.unlink', ...(shrank ? ['del.shrink'] : [])],
    1,
    // Levels that went away have no pointers left to show.
    update.slice(0, Math.min(lvl, W.level)).map((u, l) => mark(ptrId(u, l), 'active')),
  );
  return st;
}

// ---------------------------------------------------------------------------------------------
// Operations

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw], { settings, rng }) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'insert', raw!, k, 'ins.sig');
    return yield* insertGen(s, k, settings, rng);
  },
};

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'delete', raw!, k, 'del.sig');
    return yield* deleteGen(s, k);
  },
};

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    const k = parseKey(raw!);
    if (k instanceof Error) return yield* badArg(s, 'search', raw!, k, 'srch.sig');
    return yield* searchGen(s, k);
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty: S = { nodes: {}, head: s.head.map(() => null), level: 0, nextUid: s.nextUid };
    yield {
      state: empty,
      marks: [],
      say:
        s.level === 0
          ? 'clear(): the list was already empty.'
          : 'clear(): every head pointer becomes nil, and every node is gone.',
      lines: ['clear.head'],
      vars: readouts(empty),
      level: 1,
    } satisfies SkipStep;
    return empty;
  },
};

export const ops = { insert, delete: del, search, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after Pugh. Lines stay short (33 characters with their indent) for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SkipSettings): PseudoBlock[] {
  const p = settings.p === '1/4' ? '1/4' : '1/2';
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(k)', 'To insert key k:'),
        L('ins.find', 1, 'x = head; for i = top down to 1', 'search from the top level down:'),
        L(
          'ins.right',
          2,
          'while x.next[i].key < k: →',
          'move right while the next key is smaller,',
        ),
        L('ins.update', 2, 'update[i] = x', 'and remember where each level stopped.'),
        L('ins.dup', 1, 'if x.next[1].key == k: return', 'If k is already there, stop.'),
        L('ins.lvl', 1, 'lvl = 1', 'The new node starts 1 level tall.'),
        L('ins.flip', 1, `while random() < ${p} and`, `While a coin comes up heads (${p}),`),
        L('ins.grow', 2, '  lvl < maxLevel: lvl += 1', 'and it is below the maximum, grow it.'),
        L('ins.taller', 1, 'if lvl > top', 'If it is taller than the list,'),
        L('ins.head', 2, 'update[top+1..lvl] = head', 'the head comes before it on the new levels'),
        L('ins.grow2', 2, 'top = lvl', 'and the list grows.'),
        L('ins.link', 1, 'for i = 1 to lvl', 'On each of its levels,'),
        L(
          'ins.next',
          2,
          'z.next[i] = update[i].next[i]',
          'the new node points where the node before did,',
        ),
        L('ins.prev', 2, 'update[i].next[i] = z', 'and the node before points at it.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(k)', 'To delete key k:'),
        L('del.find', 1, 'x = head; for i = top down to 1', 'search from the top level down:'),
        L(
          'del.right',
          2,
          'while x.next[i].key < k: →',
          'move right while the next key is smaller,',
        ),
        L('del.update', 2, 'update[i] = x', 'and remember where each level stopped.'),
        L('del.check', 1, 'x = x.next[1]; if x.key == k', 'If the next node on level 1 holds k,'),
        L('del.unlink', 2, 'skip x on each of its levels', 'every pointer to it jumps past it,'),
        L('del.shrink', 2, 'drop empty levels from top', 'and empty top levels go away.'),
        L('del.missing', 1, 'else return  // not found', 'Otherwise k is not in the list.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(k)', 'To find key k:'),
        L('srch.start', 1, 'x = head', 'start at the head,'),
        L('srch.loop', 1, 'for i = top down to 1', 'on the top level, then each level down:'),
        L('srch.while', 2, 'while x.next[i].key < k', 'while the next key is smaller than k,'),
        L('srch.right', 3, 'x = x.next[i]', 'move right.'),
        L('srch.next', 1, 'x = x.next[1]', 'Then look at the next node on level 1:'),
        L('srch.ret', 1, 'return x.key == k', 'it either holds k or k is not there.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clear.sig', 0, 'clear()', 'To empty the list:'),
        L('clear.head', 1, 'head.next[i] = nil for all i', 'point every head pointer at nil.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(_s: S, settings: SkipSettings): string {
  return `An empty skip list. Each new node gets a random height: it starts 1 level tall and grows one more level for every coin flip that comes up heads (chance ${settings.p === '1/4' ? '1/4' : '1/2'}), up to ${capOf(settings)} levels.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return readouts(s);
}

/** Screen-reader summary: each level, top down. */
export function describe(s: S): string {
  const n = Object.keys(s.nodes).length;
  if (n === 0) return 'An empty skip list.';
  const rows: string[] = [];
  for (let l = s.level - 1; l >= 0; l--) {
    const keys: number[] = [];
    for (let u = s.head[l] ?? null; u !== null; u = s.nodes[u]!.next[l] ?? null)
      keys.push(s.nodes[u]!.key);
    rows.push(`Level ${l + 1}: ${keys.join(' ')}.`);
  }
  return `A skip list with ${plural(n, 'key')} on ${plural(s.level, 'level')}. ${rows.join(' ')}`;
}
