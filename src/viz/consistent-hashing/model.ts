import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { familyHash, FAMILY_A, FAMILY_B, FAMILY_P } from '../_hashing/family';
import { readNumber } from '../_hashing/hashing';

/** Ring positions 0 … 359, like degrees on a clock face. */
export const RING = 360;
export const SERVER_NAMES = 'ABCDEFGH';

export interface KeyItem {
  uid: number;
  key: number;
}

export interface RingState {
  /** Servers in the order they were added. */
  servers: string[];
  keys: KeyItem[];
  nextUid: number;
  /** How many virtual nodes each server has. */
  v: number;
}

export interface RingSettings {
  [key: string]: Scalar;
  vnodes: number;
}

export interface RingExtra {
  arg?: { text: string; error?: boolean };
  formula?: string;
  /** A walk clockwise from a key's position to the node that owns it. */
  walk?: { from: number; to: number };
  /** Nodes of a server being added, placed so far (not yet in the state). */
  pending?: RingNode[];
  /** Keys that changed server in this operation. */
  moved?: number[];
}

type S = RingState;
type X = RingExtra;
type Op = OpSpec<S, RingSettings, X>;
type RStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: RingSettings = { vnodes: 1 };

export function init(settings: RingSettings): S {
  return { servers: [], keys: [], nextUid: 1, v: settings.vnodes };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** h(k) = ((71·k + 5) mod 1009) mod 360: where a key sits on the ring. */
export const keyPos = (k: number) => familyHash(0, k, RING);
/** A server's r-th virtual node: hashed from the number 100·s + r, s = 1 for A, 2 for B, … */
export const nodeToken = (server: string, r: number) =>
  100 * (SERVER_NAMES.indexOf(server) + 1) + r;
export const nodePos = (server: string, r: number) => familyHash(1, nodeToken(server, r), RING);

export interface RingNode {
  /** "A" or, with virtual nodes, "A1", "A2", … */
  label: string;
  server: string;
  pos: number;
}

export const nodeLabel = (server: string, r: number, v: number) =>
  v === 1 ? server : `${server}${r + 1}`;
export const nodeId = (label: string) => `node-${label}`;

/** Every virtual node on the ring, sorted clockwise (ties by label). */
export function nodes(servers: string[], v: number): RingNode[] {
  return servers
    .flatMap((server) =>
      Array.from({ length: v }, (_, r) => ({
        label: nodeLabel(server, r, v),
        server,
        pos: nodePos(server, r).value,
      })),
    )
    .sort((a, b) => a.pos - b.pos || (a.label < b.label ? -1 : 1));
}

/** The first node clockwise from position p (wrapping past 359 to 0), or null with no servers. */
export function successor(ns: RingNode[], p: number): RingNode | null {
  if (!ns.length) return null;
  return ns.find((n) => n.pos >= p) ?? ns[0]!;
}

export const ownerOf = (s: S, k: number): string | null =>
  successor(nodes(s.servers, s.v), keyPos(k).value)?.server ?? null;

/** The naive scheme for comparison: server number h(k) mod N, servers in alphabetical order. */
export function modOwner(servers: string[], k: number): string | null {
  if (!servers.length) return null;
  const sorted = [...servers].sort();
  return sorted[keyPos(k).value % sorted.length]!;
}

export function loads(s: S): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sv of [...s.servers].sort()) out[sv] = 0;
  for (const { key } of s.keys) {
    const o = ownerOf(s, key);
    if (o) out[o]!++;
  }
  return out;
}

function readouts(s: S): Record<string, Scalar> {
  const out: Record<string, Scalar> = {
    servers: s.servers.length,
    nodes: s.servers.length * s.v,
    keys: s.keys.length,
  };
  for (const [sv, n] of Object.entries(loads(s))) out[`load ${sv}`] = n;
  return out;
}

interface Ctx {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): RStep {
  const extra: X = {
    ...c.extra,
    moved: c.extra.moved ? [...c.extra.moved] : undefined,
    pending: c.extra.pending ? [...c.extra.pending] : undefined,
  };
  return { state: c.s, marks, say, lines, vars: { ...c.vars, ...readouts(c.s) }, level, extra };
}

function* bad(s: S, say: string, raw: Value, line: string) {
  const c: Ctx = { s, extra: { arg: { text: String(raw), error: true } }, vars: {} };
  yield step(c, say, [line], 1, [mark('arg-box', 'error')]);
  return s;
}

/** A server name typed in the box: one letter A to H. */
export function readServer(raw: Value): string | Error {
  const t = String(raw).trim().toUpperCase();
  if (t.length === 1 && SERVER_NAMES.includes(t)) return t;
  return new Error('Servers are named by one letter, A to H.');
}

const list = (xs: (string | number)[]): string =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------
// keys

function* place(s0: S, raw: Value, store: boolean): Generator<RStep, S, void> {
  const name = store ? 'addKey' : 'lookup';
  const line = store ? 'key.sig' : 'look.sig';
  const k = readNumber(raw);
  if (k instanceof Error)
    return yield* bad(s0, `${name}(${String(raw)}): ${k.message} Nothing changes.`, raw, line);
  const p = keyPos(k);
  const c: Ctx = {
    s: s0,
    extra: { arg: { text: String(k) }, formula: p.short },
    vars: { k, 'h(k)': p.value },
  };
  const there = s0.keys.find((x) => x.key === k);
  const ns = nodes(s0.servers, s0.v);
  const owner = successor(ns, p.value);
  if (!owner) {
    c.extra.arg = { text: String(k), error: true };
    yield step(
      c,
      `${name}(${k}): ${p.say}. There are no servers on the ring yet, so no one can hold ${k}. Add a server first.`,
      [line, 'key.hash', 'key.none'],
      1,
      [mark('arg-box', 'error')],
    );
    return s0;
  }
  if (store && !there)
    c.s = { ...s0, keys: [...s0.keys, { uid: s0.nextUid, key: k }], nextUid: s0.nextUid + 1 };
  const uid = store ? (there?.uid ?? s0.nextUid) : undefined;
  yield step(
    c,
    `${name}(${k}): ${p.say}, so ${k} sits at position ${p.value} on the ring. Walk clockwise to the first server node.`,
    [line, 'key.hash'],
    2,
    uid ? [mark(`v${uid}`, 'active')] : [],
  );
  const wrap = owner.pos < p.value;
  c.extra.walk = { from: p.value, to: owner.pos };
  c.vars.server = owner.server;
  yield step(
    c,
    `The first node at or after ${p.value}${wrap ? ', going past 359 back to 0,' : ''} is ${owner.label} at ${owner.pos}${
      owner.label !== owner.server ? `, a virtual node of server ${owner.server}` : ''
    }. ${store ? (there ? `${k} is already stored there.` : `${k} goes to server ${owner.server}.`) : `${k} belongs to server ${owner.server}.`}`,
    [line === 'key.sig' ? 'key.walk' : 'look.walk', store ? 'key.store' : 'look.ret'],
    1,
    [mark(nodeId(owner.label), 'found'), ...(uid ? [mark(`v${uid}`, 'found')] : [])],
  );
  return c.s;
}

const addKey: Op = {
  label: 'Add key',
  arity: 1,
  *run(s, [raw]) {
    return yield* place(s, raw!, true);
  },
};
const lookup: Op = {
  label: 'Look up',
  arity: 1,
  *run(s, [raw]) {
    return yield* place(s, raw!, false);
  },
};

// ---------------------------------------------------------------------------------------------
// servers

function* membership(s0: S, raw: Value, adding: boolean): Generator<RStep, S, void> {
  const name = adding ? 'addServer' : 'removeServer';
  const line = adding ? 'add.sig' : 'rem.sig';
  const sv = readServer(raw);
  if (sv instanceof Error)
    return yield* bad(s0, `${name}(${String(raw)}): ${sv.message} Nothing changes.`, raw, line);
  if (adding === s0.servers.includes(sv))
    return yield* bad(
      s0,
      `${name}(${sv}): server ${sv} is ${adding ? 'already on' : 'not on'} the ring. Nothing changes.`,
      sv,
      line,
    );
  const v = s0.v;
  const after: S = {
    ...s0,
    servers: adding ? [...s0.servers, sv] : s0.servers.filter((x) => x !== sv),
  };
  const c: Ctx = { s: s0, extra: { arg: { text: sv } }, vars: {} };
  const tokens = Array.from({ length: v }, (_, r) => ({
    r,
    label: nodeLabel(sv, r, v),
    h: nodePos(sv, r),
  }));

  if (adding) {
    yield step(
      c,
      `addServer(${sv}): hash ${v === 1 ? 'the server' : `each of its ${v} virtual nodes`} to a place on the ring. Server ${sv} is number ${SERVER_NAMES.indexOf(sv) + 1}, so node r gets the number 100·${SERVER_NAMES.indexOf(sv) + 1} + r, hashed with h2.`,
      [line],
      2,
      [mark('arg-box', 'active')],
    );
    // Nodes appear one at a time; the keys keep their servers until all are placed.
    const placed: RingNode[] = [];
    for (const t of tokens) {
      c.extra.formula = t.h.short;
      placed.push({ label: t.label, server: sv, pos: t.h.value });
      c.extra.pending = [...placed];
      yield step(
        c,
        `${t.label}: ${t.h.say}. Node ${t.label} goes at position ${t.h.value}.`,
        ['add.loop', 'add.place'],
        v === 1 ? 2 : 3,
        [mark(nodeId(t.label), 'new')],
      );
    }
    c.extra.pending = undefined;
  } else {
    yield step(
      c,
      `removeServer(${sv}): take ${v === 1 ? `node ${sv}` : `its ${v} virtual nodes`} off the ring. Only the keys ${sv} held have to move.`,
      [line, 'rem.loop'],
      2,
      tokens.map((t) => mark(nodeId(t.label), 'remove')),
    );
  }

  // Which keys change hands?
  const moved = s0.keys.filter((x) => ownerOf(s0, x.key) !== ownerOf(after, x.key));
  const naive = s0.keys.filter(
    (x) => modOwner(s0.servers, x.key) !== modOwner(after.servers, x.key),
  ).length;
  c.s = after;
  c.extra.formula = `${moved.length} of ${s0.keys.length} keys move`;
  c.extra.moved = moved.map((x) => x.uid);
  c.vars.moved = moved.length;
  c.vars['mod-N moved'] = naive;
  const where = adding
    ? `They were in the arcs just counter-clockwise of ${sv}'s ${v === 1 ? 'node' : 'nodes'}, and now belong to ${sv}`
    : `Each goes to the next node clockwise, which belongs to ${list([...new Set(moved.map((x) => ownerOf(after, x.key)!))].sort())}`;
  const N0 = s0.servers.length;
  const N1 = after.servers.length;
  const cmp =
    s0.keys.length && N0 && N1
      ? ` With h(k) mod N instead, going from ${N0} to ${N1} servers would move ${naive} of the ${s0.keys.length}.`
      : '';
  yield step(
    c,
    moved.length
      ? `${plural(moved.length, 'key')} of ${s0.keys.length} change server: ${list(moved.map((x) => x.key))}. ${where}; every other key stays put.${cmp}`
      : `No key changes server${s0.keys.length ? '' : ' (there are no keys yet)'}.${cmp}`,
    [adding ? 'add.move' : 'rem.move'],
    1,
    [...moved.map((x) => mark(`v${x.uid}`, 'new'))],
  );
  return after;
}

const addServer: Op = {
  label: 'Add server',
  arity: 1,
  *run(s, [raw]) {
    return yield* membership(s, raw!, true);
  },
};
const removeServer: Op = {
  label: 'Remove server',
  arity: 1,
  *run(s, [raw]) {
    return yield* membership(s, raw!, false);
  },
};

const clearKeys: Op = {
  label: 'Clear keys',
  arity: 0,
  *run(s0) {
    const s: S = { ...s0, keys: [] };
    yield step(
      { s, extra: {}, vars: {} },
      'clearKeys(): every key is removed; the servers stay on the ring.',
      ['clr.sig'],
      1,
      [],
    );
    return s;
  },
};

export const ops: Record<string, Op> = {
  addKey,
  lookup,
  addServer,
  removeServer,
  clear: clearKeys,
};

// ---------------------------------------------------------------------------------------------
// pseudocode and text

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RingSettings): PseudoBlock[] {
  const v = settings.vnodes;
  const h = `((${FAMILY_A[0]}·k + ${FAMILY_B[0]}) mod ${FAMILY_P}) mod ${RING}`;
  return [
    {
      op: 'addKey',
      lines: [
        L('key.sig', 0, 'addKey(k)', 'To store key k:'),
        L('key.hash', 1, `p = h(k) = ${h}`, 'hash it to a position on the ring;'),
        L(
          'key.none',
          1,
          'if the ring is empty: error',
          'with no servers there is nowhere to put it;',
        ),
        L(
          'key.walk',
          1,
          'n = first node clockwise from p',
          'walk clockwise to the first server node;',
        ),
        L('key.store', 1, 'store k on server(n)', 'that server holds k.'),
      ],
    },
    {
      op: 'lookup',
      lines: [
        L('look.sig', 0, 'lookup(k)', 'To find which server holds k:'),
        L('key.hash', 1, `p = h(k) = ${h}`, 'hash it to a position on the ring;'),
        L('key.none', 1, 'if the ring is empty: error', 'with no servers there is no answer;'),
        L(
          'look.walk',
          1,
          'n = first node clockwise from p',
          'walk clockwise to the first server node;',
        ),
        L('look.ret', 1, 'return server(n)', 'its server holds k.'),
      ],
    },
    {
      op: 'addServer',
      lines: [
        L('add.sig', 0, 'addServer(s)', 'To add server s:'),
        L(
          'add.loop',
          1,
          `for r = 0 to ${v - 1}  // ${v} ${v === 1 ? 'node' : 'virtual nodes'}`,
          `for each of its ${v === 1 ? 'one node' : `${v} virtual nodes`},`,
        ),
        L(
          'add.place',
          2,
          `put a node at h2(100·s + r) mod ${RING}`,
          'hash it to a place on the ring.',
        ),
        L(
          'add.move',
          1,
          'move to s the keys now closest to its nodes',
          'Only keys just counter-clockwise of the new nodes move.',
        ),
      ],
    },
    {
      op: 'removeServer',
      lines: [
        L('rem.sig', 0, 'removeServer(s)', 'To remove server s:'),
        L('rem.loop', 1, 'take its nodes off the ring', 'take its nodes off the ring;'),
        L(
          'rem.move',
          1,
          'its keys go to the next node clockwise',
          'only its own keys move, each to the next node clockwise.',
        ),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clearKeys()', 'To start again, remove every key and keep the servers.'),
      ],
    },
  ];
}

export function initialSay(state: S): string {
  return `An empty ring of positions 0 to ${RING - 1}. Keys go to h(k) = ((${FAMILY_A[0]}·k + ${FAMILY_B[0]}) mod ${FAMILY_P}) mod ${RING}; each server gets ${state.v === 1 ? 'one node' : `${state.v} virtual nodes`}. A key belongs to the first server node clockwise from it. Add servers with letters A to H.`;
}

export function initialVars(state: S) {
  return readouts(state);
}

export function describe(state: S): string {
  if (!state.servers.length) return 'An empty ring with no servers.';
  const ns = nodes(state.servers, state.v).map((n) => `${n.label} at ${n.pos}`);
  const per = Object.entries(loads(state)).map(([sv, n]) => `${sv}: ${n}`);
  return `Ring with nodes ${ns.join(', ')}. Keys per server: ${per.join(', ')}.`;
}
