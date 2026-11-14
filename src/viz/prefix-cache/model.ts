/**
 * A prefix cache as a radix tree (RadixAttention, Zheng et al. 2024, the SGLang paper). A server
 * keeps the keys and values of prompts it has already run, so a new prompt that starts the same
 * way skips that part of prefill. The cache is a radix tree (a compressed trie, /compressed-trie/)
 * over tokens: each edge holds a run of tokens and their cached keys and values, and a prompt's
 * path from the root spells it. Here a token is a word.
 *
 *   request(prompt)  walk down from the root while the edges match the prompt's tokens; split
 *                    an edge where the prompt leaves it; lock the path (one more reference on
 *                    every node of it); evict least recently used leaves no running request
 *                    uses until the rest fits; prefill the rest and hang it under the path's
 *                    last node as a new leaf. The last token always runs, even when it is
 *                    cached, because its output picks the first new token.
 *   finish(X)        request X is done: every node on its path loses one reference and counts
 *                    as used now. Its tokens stay cached.
 *
 * Time is a clock that ticks once per operation; a node remembers when a request last used it.
 * Eviction takes the leaf with the oldest time among those with no references (ties: the older
 * node), as SGLang does, and frees all its tokens. A request whose new tokens do not fit even
 * after every unused token is evicted waits: the state is unchanged.
 *
 * Settings
 *   capacity  tokens the cache can hold: '12', '16' (the default) or '24'
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { trieEdgeId, trieLabelId, trieNodeId } from '../../layouts/trie';

export type CapacitySetting = '12' | '16' | '24';

export interface PrefixSettings {
  [key: string]: Scalar;
  capacity: CapacitySetting;
}

export const defaults: PrefixSettings = { capacity: '16' };

export const capacityOf = (settings: PrefixSettings): number => Number(settings.capacity);

/** Tokens in a prompt, and letters in a token, so every edge label fits on a phone. */
export const MAX_TOKENS = 8;
export const MAX_WORD = 7;
/** Requests running at once. */
export const MAX_RUNNING = 4;
export const NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const ROOT = 0;
/** Leaves the panel lists in eviction order; the rest are counted. */
export const LRU_SHOWN = 5;

export interface PNode {
  uid: number;
  /** The run of tokens on the edge into this node; [] for the root. */
  tokens: string[];
  /** Children in the order they were added (a split keeps the old child's place). */
  kids: number[];
  parent: number | null;
  /** Running requests whose path passes through this node; a node with 0 may be evicted. */
  ref: number;
  /** The clock time a request last used this node. */
  last: number;
}

export interface Req {
  name: string;
  tokens: string[];
  /** The deepest node on its path. */
  node: number;
  /** Tokens found in the tree. */
  matched: number;
  reused: number;
  prefilled: number;
}

export interface PrefixState {
  nodes: Record<number, PNode>;
  nextUid: number;
  clock: number;
  /** Running requests, oldest first. */
  running: Req[];
  /** Names handed out so far (A is the first). */
  named: number;
  /** Totals over every request so far. */
  reused: number;
  prefilled: number;
  evicted: number;
}

export interface PrefixExtra {
  /** The request in progress: its name, its tokens, and how many are matched so far. */
  arg?: { name: string; tokens: string[]; matched: number; inserted: boolean };
  /** Nodes on the way down so far. */
  path?: number[];
  /** A node made in this step: it slides out of its parent. */
  fresh?: number;
}

type S = PrefixState;
type X = PrefixExtra;
type Op = OpSpec<S, PrefixSettings, X>;
type PStep = Step<S, X>;
type Level = 1 | 2 | 3;

export function init(): S {
  return {
    nodes: { [ROOT]: { uid: ROOT, tokens: [], kids: [], parent: null, ref: 0, last: 0 } },
    nextUid: 1,
    clock: 0,
    running: [],
    named: 0,
    reused: 0,
    prefilled: 0,
    evicted: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a state

export const label = (s: S, u: number): string => s.nodes[u]!.tokens.join(' ');

/** Tokens the cache holds. */
export const cachedTokens = (s: S): number =>
  Object.values(s.nodes).reduce((t, n) => t + n.tokens.length, 0);

/** Tokens on nodes some running request uses. */
export const lockedTokens = (s: S): number =>
  Object.values(s.nodes).reduce((t, n) => t + (n.ref > 0 ? n.tokens.length : 0), 0);

/** The nodes from u up to the root, the root left out, deepest first. */
export function pathUp(s: S, u: number): number[] {
  const out: number[] = [];
  for (let x: number | null = u; x !== null && x !== ROOT; x = s.nodes[x]!.parent) out.push(x);
  return out;
}

/** The tokens from the root down to u. */
export const spell = (s: S, u: number): string[] =>
  pathUp(s, u)
    .reverse()
    .flatMap((x) => s.nodes[x]!.tokens);

/** Leaves no running request uses, the one evicted first in front: oldest time, then oldest node. */
export function evictOrder(s: S): number[] {
  return Object.values(s.nodes)
    .filter((n) => n.uid !== ROOT && n.kids.length === 0 && n.ref === 0)
    .sort((a, b) => a.last - b.last || a.uid - b.uid)
    .map((n) => n.uid);
}

/** The child of u whose edge starts with token t. */
export const childOf = (s: S, u: number, t: string): number | null =>
  s.nodes[u]!.kids.find((k) => s.nodes[k]!.tokens[0] === t) ?? null;

/** How many leading tokens two runs share. */
export function common(a: readonly string[], b: readonly string[]): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}

/** How many of the prompt's leading tokens the tree holds: the length a request matches. */
export function matchLength(s: S, tokens: readonly string[]): number {
  let x = ROOT;
  let i = 0;
  while (i < tokens.length) {
    const y = childOf(s, x, tokens[i]!);
    if (y === null) break;
    const k = common(s.nodes[y]!.tokens, tokens.slice(i));
    i += k;
    if (k < s.nodes[y]!.tokens.length) break;
    x = y;
  }
  return i;
}

/** Tokens a request reuses: the match, except that the last token always runs. */
export const reusedOf = (matched: number, n: number): number => Math.min(matched, n - 1);

/**
 * Room for a request: the new tokens it needs, the free slots, and the tokens that could be
 * evicted once its matched path is locked.
 */
export function room(s: S, tokens: readonly string[], capacity: number) {
  const matched = matchLength(s, tokens);
  // The matched path's tokens that are not locked yet become locked.
  let locking = 0;
  let x = ROOT;
  let i = 0;
  while (i < matched) {
    const y = childOf(s, x, tokens[i]!)!;
    const n = s.nodes[y]!;
    const k = Math.min(n.tokens.length, matched - i);
    if (n.ref === 0) locking += k;
    i += k;
    x = y;
  }
  const cached = cachedTokens(s);
  return {
    matched,
    need: tokens.length - matched,
    free: capacity - cached,
    evictable: cached - lockedTokens(s) - locking,
  };
}

export function hitRate(s: S): string {
  const all = s.reused + s.prefilled;
  return all ? `${Math.round((100 * s.reused) / all)}%` : '–';
}

export function vars(s: S, settings: PrefixSettings): Record<string, Scalar> {
  return {
    time: s.clock,
    running: s.running.length,
    'cached tokens': cachedTokens(s),
    capacity: capacityOf(settings),
    'tokens reused': s.reused,
    'tokens prefilled': s.prefilled,
    'hit rate': hitRate(s),
    'tokens evicted': s.evicted,
  };
}

// ---------------------------------------------------------------------------------------------
// Words

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A", "A and D", "A, C and D". */
export function list(xs: readonly (string | number)[]): string {
  const s = xs.map(String);
  if (s.length <= 1) return s.join('');
  return `${s.slice(0, -1).join(', ')} and ${s.at(-1)}`;
}

const q = (tokens: readonly string[]) => `"${tokens.join(' ')}"`;

/** Read a prompt: words of letters, at most MAX_TOKENS of them; an Error says what is wrong. */
export function parsePrompt(v: Value | undefined): string[] | Error {
  const words = String(v ?? '')
    .toLowerCase()
    .replace(/[.,!?;:"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0)
    return new Error('Type a prompt first, such as "the cat sat on the mat".');
  if (words.length > MAX_TOKENS)
    return new Error(`Keep a prompt to ${MAX_TOKENS} words, so the tree fits on the screen.`);
  const bad = words.find((w) => !new RegExp(`^[a-z]{1,${MAX_WORD}}$`).test(w));
  if (bad)
    return new Error(`Use words of letters only, ${MAX_WORD} at most ("${bad}" is not one).`);
  return words;
}

/** Read a request's letter, or say what is wrong. */
export function parseName(s: S, v: Value | undefined): string | { error: string } {
  const running = s.running.length
    ? ` Running now: ${list(s.running.map((r) => r.name))}.`
    : ' No request is running.';
  const name = String(v ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]$/.test(name))
    return { error: `Finish takes a request's letter, such as A.${running}` };
  if (!s.running.some((r) => r.name === name))
    return { error: `There is no running request ${name}.${running}` };
  return name;
}

// ---------------------------------------------------------------------------------------------
// A working copy. Operations change it and yield snapshots.

/** A deep copy as a plain state. */
function copy(s: S): S {
  return {
    nodes: Object.fromEntries(
      Object.entries(s.nodes).map(([k, n]) => [
        k,
        { ...n, tokens: [...n.tokens], kids: [...n.kids] },
      ]),
    ),
    nextUid: s.nextUid,
    clock: s.clock,
    running: s.running.map((r) => ({ ...r, tokens: [...r.tokens] })),
    named: s.named,
    reused: s.reused,
    prefilled: s.prefilled,
    evicted: s.evicted,
  };
}

class Work {
  nodes: Record<number, PNode>;
  nextUid: number;
  clock: number;
  running: Req[];
  named: number;
  reused: number;
  prefilled: number;
  evicted: number;

  constructor(s: S) {
    const c = copy(s);
    this.nodes = c.nodes;
    this.nextUid = c.nextUid;
    this.clock = c.clock;
    this.running = c.running;
    this.named = c.named;
    this.reused = c.reused;
    this.prefilled = c.prefilled;
    this.evicted = c.evicted;
  }

  snap(): S {
    return copy(this);
  }

  n(u: number): PNode {
    return this.nodes[u]!;
  }

  /** Cut y's edge after k tokens: a new node takes the first k, and y hangs below it. */
  split(y: number, k: number): number {
    const n = this.n(y);
    const p = this.n(n.parent!);
    const m = this.nextUid++;
    this.nodes[m] = {
      uid: m,
      tokens: n.tokens.slice(0, k),
      kids: [y],
      parent: p.uid,
      ref: n.ref,
      last: n.last,
    };
    p.kids = p.kids.map((c) => (c === y ? m : c));
    n.tokens = n.tokens.slice(k);
    n.parent = m;
    return m;
  }

  /** A new leaf under u holding `tokens`, used by one request now. */
  leaf(u: number, tokens: string[]): number {
    const uid = this.nextUid++;
    this.nodes[uid] = { uid, tokens, kids: [], parent: u, ref: 1, last: this.clock };
    this.n(u).kids.push(uid);
    return uid;
  }

  /** Take leaf u out of the tree. */
  remove(u: number): void {
    const p = this.n(u).parent!;
    this.n(p).kids = this.n(p).kids.filter((k) => k !== u);
    delete this.nodes[u];
  }
}

const asState = (W: Work): S => W as unknown as S;

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const tokenId = (i: number) => `tok-${i}`;
const nodeMark = (u: number, role: Mark['role']) => mark(trieNodeId(u), role);
const edgeMarks = (u: number, role: Mark['role']) => [
  mark(trieEdgeId(u), role),
  mark(trieLabelId(u), role),
];
const tokenMarks = (from: number, to: number, role: Mark['role']) =>
  Array.from({ length: Math.max(0, to - from) }, (_, i) => mark(tokenId(from + i), role));

function refuse(s: S, settings: PrefixSettings, say: string): PStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, settings) };
}

const nodeName = (W: Work, u: number) =>
  u === ROOT ? 'the root' : `the node after ${q(spell(asState(W), u))}`;

const requestOp: Op = {
  label: 'Request',
  arity: 1,
  *run(s, args, { settings }) {
    const tokens = parsePrompt(args[0]);
    if (tokens instanceof Error) {
      yield refuse(s, settings, tokens.message);
      return s;
    }
    if (s.running.length >= MAX_RUNNING) {
      yield refuse(
        s,
        settings,
        `This toy runs at most ${MAX_RUNNING} requests at once. Finish one first.`,
      );
      return s;
    }
    if (s.named >= NAMES.length) {
      yield refuse(s, settings, 'All 26 letters are used. Start a new example to add more.');
      return s;
    }
    const cap = capacityOf(settings);
    const name = NAMES[s.named]!;
    const n = tokens.length;
    const r = room(s, tokens, cap);
    if (r.need > r.free + r.evictable) {
      const users = s.running.map((x) => x.name);
      yield refuse(
        s,
        settings,
        `Request ${name} (${plural(n, 'token')}) needs room for ${plural(r.need, 'new token')}. ${r.free === 0 ? 'No slot is free' : `Only ${plural(r.free, 'slot')} ${r.free === 1 ? 'is' : 'are'} free`}, and ${r.evictable === 0 ? 'nothing can be evicted' : `only ${r.evictable} more could be evicted`}: the rest belong to running requests (${list(users)}). ${name} waits until one of them finishes.`,
      );
      return s;
    }

    const W = new Work(s);
    W.clock = s.clock + 1;
    const t = W.clock;
    const extra: X = { arg: { name, tokens, matched: 0, inserted: false }, path: [ROOT] };
    const step = (
      say: string,
      lines: string[],
      level: Level,
      marks: Mark[],
      more: Partial<X> = {},
    ): PStep => {
      const state = W.snap();
      return {
        state,
        marks,
        say,
        lines,
        level,
        vars: vars(state, settings),
        extra: {
          arg: { ...extra.arg!, tokens: [...extra.arg!.tokens] },
          path: [...(extra.path ?? [])],
          ...more,
        },
      };
    };

    yield step(
      `Request ${name} arrives with ${plural(n, 'token')}: ${tokens.join(' ')}. Walk down from the root, following the edges that match its tokens.`,
      ['r-sig', 'r-walk'],
      2,
      [nodeMark(ROOT, 'active')],
    );

    let x = ROOT;
    let i = 0;
    let split = false;
    while (i < n) {
      const y = childOf(asState(W), x, tokens[i]!);
      if (y === null) {
        yield step(
          i === 0
            ? `No edge from the root starts with "${tokens[0]}": nothing of ${name} is cached.`
            : `No edge from ${nodeName(W, x)} starts with "${tokens[i]}". The match stops after ${plural(i, 'token')}.`,
          ['r-walk'],
          2,
          [nodeMark(x, 'active'), mark(tokenId(i), 'error')],
        );
        break;
      }
      const lab = W.n(y).tokens;
      const k = common(lab, tokens.slice(i));
      if (k === lab.length) {
        W.n(y).last = t;
        x = y;
        i += k;
        extra.path!.push(y);
        extra.arg!.matched = i;
        yield step(
          `The edge ${q(lab)} matches ${k === 1 ? 'its one token' : `all ${k} of its tokens`}: follow it down. ${plural(i, 'token')} of ${name} ${i === 1 ? 'is' : 'are'} cached so far.`,
          ['r-walk'],
          2,
          [...tokenMarks(i - k, i, 'visit'), ...edgeMarks(y, 'active'), nodeMark(y, 'active')],
        );
        continue;
      }
      // The prompt leaves the edge after k tokens (or runs out inside it): split the edge there.
      const top = lab.slice(0, k);
      const bottom = lab.slice(k);
      yield step(
        `The edge ${q(lab)} matches ${q(top)}, then ${i + k < n ? `has "${lab[k]}" where ${name} has "${tokens[i + k]}"` : `${name} runs out`}.`,
        ['r-walk', 'r-split'],
        2,
        [...tokenMarks(i, i + k, 'visit'), ...edgeMarks(y, 'active')],
      );
      const m = W.split(y, k);
      W.n(m).last = t;
      x = m;
      i += k;
      split = true;
      extra.path!.push(m);
      extra.arg!.matched = i;
      yield step(
        `Split the edge after ${plural(k, 'token')}: a new node for ${q(top)}, with ${q(bottom)} hanging below it. The keys and values stay where they are; nothing is computed.`,
        ['r-split'],
        2,
        [nodeMark(m, 'new'), ...edgeMarks(m, 'active'), mark(trieLabelId(y), 'new')],
        { fresh: m },
      );
      break;
    }
    const matched = i;

    // Lock the path, so nothing this request uses is evicted while it runs.
    const path = pathUp(asState(W), x);
    for (const u of path) W.n(u).ref++;
    if (path.length) {
      yield step(
        `Lock the path: ${path.length === 1 ? `its one node gets one more reference (now ${W.n(path[0]!).ref})` : `each of its ${path.length} nodes gets one more reference`}, and counts as used now (time ${t}). While ${name} runs, nothing it uses can be evicted.`,
        ['r-lock'],
        2,
        path.map((u) => nodeMark(u, 'found')),
      );
    }

    // Make room for the tokens that are not cached.
    const need = n - matched;
    let evicted = 0;
    for (;;) {
      const used = cachedTokens(asState(W));
      if (cap - used >= need) break;
      const order = evictOrder(asState(W));
      const v = order[0];
      if (v === undefined) break;
      const gone = W.n(v);
      // An older leaf that a running request holds is skipped: say so.
      const held = Object.values(W.nodes).find(
        (u) => u.uid !== ROOT && !u.kids.length && u.ref > 0 && u.last < gone.last,
      );
      const users = held
        ? W.running.filter((r) => pathUp(asState(W), r.node).includes(held.uid)).map((r) => r.name)
        : [];
      const skip = held
        ? ` (${q(held.tokens)} is older, but ${list(users)} ${users.length === 1 ? 'is' : 'are'} using it.)`
        : '';
      yield step(
        `The cache holds ${used} of ${cap} tokens and ${name} needs ${plural(need, 'slot')}. Evict the least recently used leaf that no running request uses: ${q(gone.tokens)}, last used at time ${gone.last}. Its ${plural(gone.tokens.length, 'token')} ${gone.tokens.length === 1 ? 'goes' : 'go'}.${skip}`,
        ['r-evict'],
        2,
        [nodeMark(v, 'remove'), ...edgeMarks(v, 'remove'), mark(`lru-${v}`, 'remove')],
      );
      evicted += gone.tokens.length;
      W.evicted += gone.tokens.length;
      W.remove(v);
    }

    // Prefill the rest and cache it as a new leaf.
    let end = x;
    if (need > 0) {
      const rest = tokens.slice(matched);
      end = W.leaf(x, rest);
      extra.arg!.inserted = true;
      yield step(
        `Prefill the ${need === 1 ? 'one token that is' : `${need} tokens that are`} not cached, ${q(rest)}, and keep ${need === 1 ? 'its' : 'their'} keys and values: a new leaf under ${nodeName(W, x)}, with one reference.`,
        ['r-insert'],
        2,
        [...tokenMarks(matched, n, 'new'), nodeMark(end, 'new'), ...edgeMarks(end, 'new')],
        { fresh: end },
      );
    }

    const reused = reusedOf(matched, n);
    const prefilled = n - reused;
    W.reused += reused;
    W.prefilled += prefilled;
    W.named++;
    W.running.push({ name, tokens, node: end, matched, reused, prefilled });
    const whole =
      matched === n
        ? ` All ${plural(n, 'token')} are cached, but the last one still runs once more: its output is what picks the first new token. So ${reused} ${reused === 1 ? 'is' : 'are'} reused and 1 is prefilled.`
        : reused === 0
          ? ` Nothing came from the cache: all ${plural(n, 'token')} ${n === 1 ? 'is' : 'are'} prefilled.`
          : ` ${reused} ${reused === 1 ? 'token comes' : 'tokens come'} from the cache and ${plural(prefilled, 'token')} ${prefilled === 1 ? 'is' : 'are'} prefilled.`;
    const state = W.snap();
    yield {
      state,
      marks: [...tokenMarks(0, reused, 'visit'), ...tokenMarks(reused, n, 'new')],
      say: `${name} is running.${whole}${split ? ' One edge was split.' : ''}${evicted ? ` ${plural(evicted, 'token')} ${evicted === 1 ? 'was' : 'were'} evicted to make room.` : ''} Hit rate so far: ${state.reused} of ${state.reused + state.prefilled} prompt tokens (${hitRate(state)}).`,
      lines: ['r-ret'],
      level: 1,
      vars: vars(state, settings),
      extra: {
        arg: { name, tokens, matched, inserted: need > 0 },
        path: [ROOT, ...[...path].reverse()],
      },
    };
    return state;
  },
};

const finishOp: Op = {
  label: 'Finish',
  arity: 1,
  *run(s, args, { settings }) {
    const name = parseName(s, args[0]);
    if (typeof name !== 'string') {
      yield refuse(s, settings, name.error);
      return s;
    }
    const W = new Work(s);
    W.clock = s.clock + 1;
    const t = W.clock;
    const req = W.running.find((r) => r.name === name)!;
    const path = pathUp(asState(W), req.node);
    for (const u of path) {
      W.n(u).ref--;
      W.n(u).last = t;
    }
    const freed = path.filter((u) => W.n(u).ref === 0);
    let state = W.snap();
    yield {
      state,
      marks: path.map((u) => nodeMark(u, W.n(u).ref === 0 ? 'visit' : 'active')),
      say: `${name} is done. Walk up its path: ${path.length === 1 ? 'its one node loses' : `each of its ${path.length} nodes loses`} one reference and counts as used now (time ${t}).${freed.length < path.length ? ` ${plural(path.length - freed.length, 'node')} ${path.length - freed.length === 1 ? 'is' : 'are'} still used by another running request.` : ''}`,
      lines: ['f-sig', 'f-unlock'],
      level: 2,
      vars: vars(state, settings),
    };
    W.running = W.running.filter((r) => r.name !== name);
    state = W.snap();
    const order = evictOrder(state);
    yield {
      state,
      marks: order.slice(0, LRU_SHOWN).map((u) => mark(`lru-${u}`, 'visit')),
      say: `${name}'s ${plural(req.tokens.length, 'token')} stay in the cache, so the next prompt that starts the same way can reuse them.${order.length ? ` Evicted first, if room is needed: ${q(state.nodes[order[0]!]!.tokens)}.` : ''}`,
      lines: ['f-ret'],
      level: 1,
      vars: vars(state, settings),
    };
    return state;
  },
};

export const ops = { request: requestOp, finish: finishOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PrefixSettings): PseudoBlock[] {
  const cap = capacityOf(settings);
  return [
    {
      op: 'request',
      lines: [
        L('r-sig', 0, 'REQUEST(tokens)', 'A new request arrives with its prompt:'),
        L(
          'r-walk',
          1,
          'node = root; follow the edges that match the next tokens',
          'follow the edges that match its tokens, as far as they go;',
        ),
        L(
          'r-split',
          1,
          'if the match ends inside an edge: split the edge there',
          'if it leaves an edge partway, split the edge there;',
        ),
        L(
          'r-lock',
          1,
          'for each node on the path: ref += 1; last = now',
          'lock the path, so nothing it uses is evicted;',
        ),
        L(
          'r-evict',
          1,
          `while cached + |rest| > ${cap}: evict the leaf with ref = 0 and the oldest last`,
          'make room by evicting the least recently used leaves nobody is using;',
        ),
        L(
          'r-insert',
          1,
          'prefill rest; add it under node as a leaf with ref = 1',
          'run the model only on the tokens that were not cached, and keep them.',
        ),
        L('r-ret', 1, 'return (matched, prefilled)', 'The request runs.'),
      ],
    },
    {
      op: 'finish',
      lines: [
        L('f-sig', 0, 'FINISH(r)', 'A request is done:'),
        L(
          'f-unlock',
          1,
          "for each node on r's path: ref −= 1; last = now",
          'its nodes lose one reference each and count as just used;',
        ),
        L('f-ret', 1, 'keep the tokens cached', 'its tokens stay for the next request.'),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(_s: S, settings: PrefixSettings): string {
  return `An empty prefix cache with room for ${capacityOf(settings)} tokens. Type a prompt, such as "the cat sat on the mat", and press Request. Finish takes a request's letter.`;
}

export const initialVars = (s: S, settings: PrefixSettings) => vars(s, settings);

/** The tree as text: each node's run, with its children in brackets. */
export function treeText(s: S, u: number = ROOT): string {
  return s.nodes[u]!.kids.map((k) => {
    const kid = s.nodes[k]!;
    return `"${kid.tokens.join(' ')}"${kid.kids.length ? ` [${treeText(s, k)}]` : ''}`;
  }).join(', ');
}

export function describe(s: S, settings: PrefixSettings): string {
  const tree = s.nodes[ROOT]!.kids.length ? `Cached runs: ${treeText(s)}.` : 'The cache is empty.';
  const running = s.running.length
    ? ` Running: ${s.running.map((r) => `${r.name} (${r.tokens.join(' ')})`).join('; ')}.`
    : ' No request is running.';
  const order = evictOrder(s);
  const next = order.length ? ` Evicted first: "${label(s, order[0]!)}".` : '';
  return `${cachedTokens(s)} of ${capacityOf(settings)} tokens cached. ${tree}${running}${next}`;
}
