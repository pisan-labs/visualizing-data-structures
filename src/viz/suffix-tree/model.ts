/**
 * Suffix tree: every suffix of T$ in one compressed trie. The text gets an end marker $ that
 * occurs nowhere else, so no suffix is a prefix of another and every suffix ends at a leaf.
 * A leaf is labelled with the position where its suffix starts; an edge stores its label as a
 * range [start, end) of T$, so the tree takes O(n) space however long the labels are.
 *
 * Build (setting `method`):
 *   naive    insert the suffixes one at a time, longest first, into a compressed trie: walk
 *            down while the characters match, then either hang a new leaf off a node or split
 *            an edge where the suffix leaves it. O(n²) character comparisons in the worst case.
 *   ukkonen  Ukkonen's online algorithm: read T$ left to right, one phase per character.
 *            Leaves grow by themselves (their end is "the current end"), and the active point
 *            (node, edge, length) remembers where the next suffix still to insert ends, so each
 *            phase does only the extensions that change the tree. Suffix links jump from the
 *            node for xα to the node for α. O(n) in all.
 *
 * Both give the same tree (the property test checks this). Operations after a build:
 *   search P   walk down from the root along P; the leaves under the end of the walk are the
 *              positions where P occurs.
 *   count P    the same walk, then count those leaves one by one.
 *   repeat     the deepest internal node, by the length of its path label, spells the longest
 *              repeated substring (two leaves below it: two suffixes start with it).
 * Each builds first when the tree is not there yet, as the suffix array page does.
 *
 * Node ids are stable uids, so a split slides the old child down and a new leaf grows out of
 * its parent. Children are kept in order of their first character ($ first).
 */
import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export const MAX_TEXT = 12;
/** The same start text as the suffix array page, so compare mode lines up. */
export const START_TEXT = 'BANANA';
export const END = '$';

export interface StNode {
  /** The edge into this node is T$[start..end). The root has start = end = 0. */
  start: number;
  end: number;
  kids: number[];
  parent: number | null;
  /** For a leaf: where its suffix starts. Null for the root and internal nodes. */
  leaf: number | null;
  /** Ukkonen's suffix link, for internal nodes (null until set, or for the naive build). */
  link: number | null;
}

export interface StTree {
  nodes: Record<number, StNode>;
  root: number;
  next: number;
}

export interface StState {
  text: string;
  /** Null until built. */
  tree: StTree | null;
}

export interface StSettings {
  [key: string]: Scalar;
  method: 'naive' | 'ukkonen';
}

export const defaults: StSettings = { method: 'naive' };

export interface StExtra {
  /** The pattern being walked (or the suffix being inserted), and how much of it is matched. */
  arg?: { name: string; text: string; at: number; bad?: boolean };
  /** Nodes on the path walked so far. */
  path?: number[];
  /** Positions of T$ to shade in the text row. */
  spots?: { from: number; len: number; role: MarkRole }[];
  /** Ukkonen: the phase (the character being added) and the suffixes still to insert. */
  phase?: { i: number; remainder: number };
  /** Ukkonen: the active point. `edge` is the child the active edge leads to, if any. */
  active?: { node: number; edge: number | null; len: number };
  /** Leaves counted so far. */
  counted?: number[];
  /** A node that has just appeared, to grow out of its parent. */
  fresh?: number;
}

type S = StState;
type X = StExtra;
type Op = OpSpec<S, StSettings, X>;
type StStep = Step<S, X>;
type Gen<R = S> = Generator<StStep, R, void>;

export const init = (): S => ({ text: START_TEXT, tree: null });

export const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const nodeId = (u: number) => `tn-${u}`;
export const edgeId = (u: number) => `te-${u}`;
export const labelId = (u: number) => `tl-${u}`;
export const textId = (j: number) => `t-${j}`;

export const q = (s: string) => `'${s}'`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const andList = (xs: readonly (number | string)[]) =>
  xs.length <= 1 ? String(xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** T$, the string the tree is built on. */
export const full = (t: string) => t + END;
export const edgeText = (s: S, u: number) => {
  const n = s.tree!.nodes[u]!;
  return full(s.text).slice(n.start, n.end);
};

// ----- Reading input -----

export function parseText(raw: Value | undefined, what: 'text' | 'pattern'): string | Error {
  const t = String(raw ?? '').trim();
  if (!t) return new Error(`Type a ${what}, such as ${what === 'text' ? 'BANANA' : 'ANA'}.`);
  if (/\s/.test(t)) return new Error(`The ${what} cannot hold spaces: type one word.`);
  if (t.includes(END))
    return new Error(`Leave out the $: the build adds it to the end of the text for you.`);
  const bad = /[^A-Za-z0-9]/.exec(t);
  if (bad) return new Error(`"${bad[0]}" is not allowed. Use letters and digits only.`);
  if (t.length > MAX_TEXT)
    return new Error(`That is ${t.length} characters. Keep it to ${MAX_TEXT}, so the tree fits.`);
  return t;
}

export const parseInput = (token: string): Value | Error => parseText(token, 'text');

// ----- Tree helpers -----

function cloneTree(t: StTree): StTree {
  const nodes: Record<number, StNode> = {};
  for (const [k, v] of Object.entries(t.nodes)) nodes[Number(k)] = { ...v, kids: [...v.kids] };
  return { nodes, root: t.root, next: t.next };
}

function emptyTree(): StTree {
  return {
    nodes: { 0: { start: 0, end: 0, kids: [], parent: null, leaf: null, link: null } },
    root: 0,
    next: 1,
  };
}

/** Put child c into u's children, in order of first character. */
function addKid(tr: StTree, src: string, u: number, c: number) {
  const kids = tr.nodes[u]!.kids;
  const ch = src[tr.nodes[c]!.start]!;
  let i = 0;
  while (i < kids.length && src[tr.nodes[kids[i]!]!.start]! < ch) i++;
  kids.splice(i, 0, c);
  tr.nodes[c]!.parent = u;
}

function kidStarting(tr: StTree, src: string, u: number, ch: string): number | null {
  for (const k of tr.nodes[u]!.kids) if (src[tr.nodes[k]!.start] === ch) return k;
  return null;
}

/** The path label from the root to u. */
export function spell(s: S, u: number): string {
  const tr = s.tree!;
  const parts: string[] = [];
  for (let v: number | null = u; v !== null && v !== tr.root; v = tr.nodes[v]!.parent)
    parts.push(edgeText(s, v));
  return parts.reverse().join('');
}

/** Leaves under u, in left-to-right order. */
export function leavesUnder(tr: StTree, u: number): number[] {
  const out: number[] = [];
  const go = (v: number) => {
    const n = tr.nodes[v]!;
    if (n.leaf !== null) out.push(v);
    n.kids.forEach(go);
  };
  go(u);
  return out;
}

/** Nodes in preorder. */
export function preorder(tr: StTree): number[] {
  const out: number[] = [];
  const go = (v: number) => {
    out.push(v);
    tr.nodes[v]!.kids.forEach(go);
  };
  go(tr.root);
  return out;
}

export function counts(tr: StTree | null) {
  if (!tr) return { nodes: 1, leaves: 0, internal: 0 };
  const all = preorder(tr);
  const leaves = all.filter((u) => tr.nodes[u]!.leaf !== null).length;
  return { nodes: all.length, leaves, internal: all.length - leaves - 1 };
}

/**
 * The tree as text, for the code tabs and tests: each node's children in order, as
 * label(children). BANANA gives ($ A($ NA($ NA$)) BANANA$ NA($ NA$)).
 */
export function bracket(s: S): string {
  const tr = s.tree!;
  const go = (u: number): string => {
    const n = tr.nodes[u]!;
    const inner = n.kids.map(go).join(' ');
    const label = u === tr.root ? '' : edgeText(s, u);
    return n.kids.length ? `${label}(${inner})` : label;
  };
  return go(tr.root);
}

// ----- Counters and vars -----

interface Counters {
  chars: number;
}

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  const c = counts(s.tree);
  return { n: s.text.length, ...more, leaves: c.leaves, internal: c.internal };
}

// ----- Naive build -----

function* naiveBuild(s0: S, c: Counters): Gen {
  const text = s0.text;
  const src = full(text);
  const n = src.length;
  const tr = emptyTree();
  let s: S = { text, tree: cloneTree(tr) };
  yield {
    state: s,
    marks: [mark(nodeId(tr.root), 'active')],
    say: `Add the end marker: T$ = ${q(src)}. Start with a lone root and insert the ${n} suffixes of T$ one at a time, longest first.`,
    lines: ['n.sig'],
    level: 2,
    vars: vars(s, { chars: c.chars }),
    extra: {},
  };
  for (let i = 0; i < n; i++) {
    const suf = src.slice(i);
    const arg = (at: number) => ({ name: `suffix ${i}`, text: suf, at });
    let u = tr.root;
    let j = i;
    const path = [u];
    s = { text, tree: cloneTree(tr) };
    yield {
      state: s,
      marks: [mark(nodeId(u), 'active')],
      say: `Insert suffix ${i}, ${q(suf)}. Start at the root.`,
      lines: ['n.for', 'n.walk'],
      level: 2,
      vars: vars(s, { i, chars: c.chars }),
      extra: { arg: arg(0), path: [...path], spots: [{ from: i, len: n - i, role: 'visit' }] },
    };
    for (;;) {
      const child = kidStarting(tr, src, u, src[j]!);
      c.chars += tr.nodes[u]!.kids.length ? 1 : 0;
      if (child === null) {
        const leaf = tr.next++;
        tr.nodes[leaf] = { start: j, end: n, kids: [], parent: u, leaf: i, link: null };
        addKid(tr, src, u, leaf);
        s = { text, tree: cloneTree(tr) };
        const where = u === tr.root ? 'the root' : `the node for ${q(spell(s, u))}`;
        yield {
          state: s,
          marks: [mark(nodeId(leaf), 'new'), mark(edgeId(leaf), 'new')],
          say: `No edge out of ${where} starts with ${q(src[j]!)}. Hang a new leaf off it, with the rest of the suffix, ${q(src.slice(j))}, on its edge. Leaf ${i} marks where this suffix starts.`,
          lines: ['n.none', 'n.leaf'],
          level: 2,
          vars: vars(s, { i, chars: c.chars }),
          extra: { arg: arg(j - i), path: [...path], fresh: leaf },
        };
        break;
      }
      const e = tr.nodes[child]!;
      const len = e.end - e.start;
      let k = 0;
      while (k < len && src[e.start + k] === src[j + k]) k++;
      c.chars += Math.min(len, k + 1) - 1;
      const label = src.slice(e.start, e.end);
      if (k === len) {
        u = child;
        j += k;
        path.push(u);
        yield {
          state: s,
          marks: [mark(edgeId(child), 'compare'), mark(nodeId(child), 'active')],
          say: `The edge ${q(label)} matches all ${plural(len, 'character')}. Go down to its end and keep going with ${q(src.slice(j))}.`,
          lines: ['n.walk', 'n.down'],
          level: 3,
          vars: vars(s, { i, chars: c.chars }),
          extra: { arg: arg(j - i), path: [...path] },
        };
        continue;
      }
      // The suffix leaves the edge after k characters: split it there.
      const mid = tr.next++;
      tr.nodes[mid] = {
        start: e.start,
        end: e.start + k,
        kids: [],
        parent: u,
        leaf: null,
        link: null,
      };
      const at = tr.nodes[u]!.kids.indexOf(child);
      tr.nodes[u]!.kids[at] = mid;
      e.start += k;
      tr.nodes[mid]!.kids.push(child);
      e.parent = mid;
      const leaf = tr.next++;
      tr.nodes[leaf] = { start: j + k, end: n, kids: [], parent: mid, leaf: i, link: null };
      addKid(tr, src, mid, leaf);
      s = { text, tree: cloneTree(tr) };
      yield {
        state: s,
        marks: [
          mark(nodeId(mid), 'new'),
          mark(nodeId(leaf), 'new'),
          mark(edgeId(leaf), 'new'),
          mark(edgeId(child), 'compare'),
        ],
        say: `The edge ${q(label)} matches ${q(label.slice(0, k))}, then the suffix has ${q(src[j + k]!)} where the edge has ${q(label[k]!)}. Split the edge after ${plural(k, 'character')} with a new internal node, and hang leaf ${i} off it with ${q(src.slice(j + k))}.`,
        lines: ['n.walk', 'n.split', 'n.leaf'],
        level: 2,
        vars: vars(s, { i, chars: c.chars }),
        extra: { arg: arg(j + k - i), path: [...path, mid], fresh: leaf },
      };
      break;
    }
  }
  return { text, tree: cloneTree(tr) };
}

// ----- Ukkonen -----

/**
 * Ukkonen's algorithm with the active point and suffix links. Leaves store end = -1 for "the
 * current end"; each step's snapshot writes the current end into them.
 */
function* ukkonenBuild(s0: S, c: Counters): Gen {
  const text = s0.text;
  const src = full(text);
  const n = src.length;
  const tr = emptyTree();
  const root = tr.root;
  let node = root;
  let edge = 0; // index into src of the active edge's first character
  let len = 0;
  let remainder = 0;
  let end = 0; // leaves end here (exclusive) in the current phase
  const snap = (): S => {
    const t = cloneTree(tr);
    for (const v of Object.values(t.nodes)) if (v.end === -1) v.end = end;
    return { text, tree: t };
  };
  const edgeLen = (v: number) =>
    (tr.nodes[v]!.end === -1 ? end : tr.nodes[v]!.end) - tr.nodes[v]!.start;
  const activeEdge = () => (len > 0 ? kidStarting(tr, src, node, src[edge]!) : null);
  const where = (s: S) => {
    const at = node === root ? 'the root' : `node ${q(spell(s, node))}`;
    if (len === 0) return `(${at}, -, 0)`;
    return `(${at}, ${q(src[edge]!)}, ${len})`;
  };
  const uvars = (s: S, i: number) =>
    vars(s, {
      i,
      remainder,
      'active node': node === root ? 'root' : spell(s, node),
      'active edge': len > 0 ? src[edge]! : '-',
      'active length': len,
      chars: c.chars,
    });
  const ex = (i: number, more: Partial<X> = {}): X => ({
    phase: { i, remainder },
    active: { node, edge: activeEdge(), len },
    spots: [
      ...(remainder > 1
        ? [{ from: i - remainder + 1, len: remainder - 1, role: 'visit' as MarkRole }]
        : []),
      { from: i, len: 1, role: 'active' as MarkRole },
    ],
    ...more,
  });

  let s = snap();
  yield {
    state: s,
    marks: [mark(nodeId(root), 'active')],
    say: `Add the end marker: T$ = ${q(src)}. Ukkonen reads T$ left to right, one phase per character. The active point (node, edge, length) starts at the root, and remainder, the number of suffixes still to insert, is 0.`,
    lines: ['u.sig'],
    level: 2,
    vars: uvars(s, 0),
    extra: { active: { node, edge: null, len } },
  };

  for (let i = 0; i < n; i++) {
    end = i + 1;
    remainder++;
    let last: number | null = null;
    const ch = src[i]!;
    s = snap();
    yield {
      state: s,
      marks: [mark(textId(i), 'active')],
      say: `Phase ${i}: add ${q(ch)}. Every leaf grows by itself, since a leaf's edge runs to the current end. remainder = ${remainder}: ${remainder === 1 ? `the suffix ${q(ch)} still has to go in` : `the last ${remainder} suffixes, ${q(src.slice(i - remainder + 1, i + 1))} and shorter, still have to go in`}.`,
      lines: ['u.for', 'u.rem'],
      level: 2,
      vars: uvars(s, i),
      extra: ex(i),
    };
    while (remainder > 0) {
      if (len === 0) edge = i;
      const child = kidStarting(tr, src, node, src[edge]!);
      c.chars++;
      if (child === null) {
        const leaf = tr.next++;
        tr.nodes[leaf] = {
          start: i,
          end: -1,
          kids: [],
          parent: node,
          leaf: i - remainder + 1,
          link: null,
        };
        addKid(tr, src, node, leaf);
        const linked = last;
        if (last !== null) {
          tr.nodes[last]!.link = node;
          last = null;
        }
        remainder--;
        s = snap();
        const at = node === root ? 'the root' : `node ${q(spell(s, node))}`;
        const sayLink =
          linked !== null
            ? node === root
              ? ' The node made just before in this phase gets its suffix link: the root (links to the root are not drawn).'
              : ` The node made just before in this phase gets a suffix link to ${at}.`
            : '';
        const fromNode = node;
        const moved = advance(i);
        s = snap();
        yield {
          state: s,
          marks: [mark(nodeId(leaf), 'new'), mark(edgeId(leaf), 'new')],
          say: `No edge out of ${fromNode === root ? 'the root' : `node ${q(spell(s, fromNode))}`} starts with ${q(ch)}: add leaf ${tr.nodes[leaf]!.leaf} (rule 2).${sayLink} ${moved} remainder = ${remainder}.`,
          lines: ['u.while', 'u.none', 'u.leaf', ...(linked !== null ? ['u.link'] : []), 'u.next'],
          level: 2,
          vars: uvars(s, i),
          extra: ex(i, { fresh: leaf }),
        };
        continue;
      }
      const elen = edgeLen(child);
      if (len >= elen) {
        // Walk down: the active point is past the end of this edge.
        edge += elen;
        len -= elen;
        node = child;
        s = snap();
        yield {
          state: s,
          marks: [mark(nodeId(child), 'active'), mark(edgeId(child), 'compare')],
          say: `The active length runs past the end of the edge ${q(edgeText(s, child))}, so walk down to the node at its end. The active point is now ${where(s)}.`,
          lines: ['u.while', 'u.walk'],
          level: 3,
          vars: uvars(s, i),
          extra: ex(i),
        };
        continue;
      }
      const at = tr.nodes[child]!.start + len;
      c.chars++;
      if (src[at] === ch) {
        // Rule 3: the suffix is already in the tree, and so are all the shorter ones.
        const linked = last !== null && node !== root;
        if (linked) tr.nodes[last!]!.link = node;
        len++;
        s = snap();
        yield {
          state: s,
          marks: [mark(edgeId(child), 'found')],
          say: `${q(ch)} is already the next character on the edge ${q(edgeText(s, child))}, so ${q(src.slice(i - remainder + 1, i + 1))} is already in the tree, and so is every shorter suffix (rule 3). Move the active length on to ${len} and end the phase early. remainder stays ${remainder}.${linked ? ' The last node made in this phase gets a suffix link to the active node.' : ''}`,
          lines: ['u.while', 'u.three', ...(linked ? ['u.link'] : [])],
          level: 2,
          vars: uvars(s, i),
          extra: ex(i),
        };
        break;
      }
      // Rule 2 with a split: the suffix leaves the edge in the middle.
      const e = tr.nodes[child]!;
      const mid = tr.next++;
      tr.nodes[mid] = {
        start: e.start,
        end: e.start + len,
        kids: [],
        parent: node,
        leaf: null,
        link: null,
      };
      const pos = tr.nodes[node]!.kids.indexOf(child);
      tr.nodes[node]!.kids[pos] = mid;
      e.start += len;
      e.parent = mid;
      tr.nodes[mid]!.kids.push(child);
      const leaf = tr.next++;
      tr.nodes[leaf] = {
        start: i,
        end: -1,
        kids: [],
        parent: mid,
        leaf: i - remainder + 1,
        link: null,
      };
      addKid(tr, src, mid, leaf);
      const linked = last;
      if (last !== null) tr.nodes[last]!.link = mid;
      last = mid;
      remainder--;
      s = snap();
      const split = q(spell(s, mid));
      const moved = advance(i);
      s = snap();
      yield {
        state: s,
        marks: [mark(nodeId(mid), 'new'), mark(nodeId(leaf), 'new'), mark(edgeId(leaf), 'new')],
        say: `The edge has ${q(src[at]!)} where we need ${q(ch)}: split it after ${split} with a new internal node and add leaf ${tr.nodes[leaf]!.leaf} (rule 2).${linked !== null ? ` The node made just before in this phase gets a suffix link to this one.` : ''} ${moved} remainder = ${remainder}.`,
        lines: ['u.while', 'u.split', 'u.leaf', ...(linked !== null ? ['u.link'] : []), 'u.next'],
        level: 2,
        vars: uvars(s, i),
        extra: ex(i, { fresh: leaf }),
      };
    }
  }
  return snap();

  /** Move the active point to the next shorter suffix; returns a sentence saying how. */
  function advance(i: number): string {
    if (node === root && len > 0) {
      len--;
      edge = i - remainder + 1;
      const s = snap();
      return `At the root, drop the first character: the active point becomes ${where(s)}.`;
    }
    if (node !== root) {
      const to = tr.nodes[node]!.link;
      node = to ?? root;
      const s = snap();
      return to !== null
        ? `Follow the suffix link: the active point becomes ${where(s)}.`
        : `This node has no suffix link yet, so go back to the root: the active point becomes ${where(s)}.`;
    }
    return `The active point stays ${where(snap())}.`;
  }
}

function* build(s0: S, settings: StSettings, c: Counters): Gen {
  return settings.method === 'ukkonen' ? yield* ukkonenBuild(s0, c) : yield* naiveBuild(s0, c);
}

function builtSay(s: S, c: Counters, settings: StSettings): string {
  const k = counts(s.tree);
  return `Built: ${plural(k.leaves, 'leaf', 'leaves')}, one per suffix of ${q(full(s.text))}, and ${k.internal ? `${plural(k.internal, 'internal node')} besides the root, each with at least two children` : 'no internal node besides the root'}. ${settings.method === 'ukkonen' ? `Ukkonen's build compared ${plural(c.chars, 'character')}.` : `Inserting the suffixes compared ${plural(c.chars, 'character')}.`}`;
}

const buildOp: Op = {
  label: 'Build',
  arity: 0,
  *run(s, _args, { settings }) {
    const c: Counters = { chars: 0 };
    const done = yield* build(s, settings, c);
    yield {
      state: done,
      marks: [],
      say: builtSay(done, c, settings),
      lines: [settings.method === 'ukkonen' ? 'u.done' : 'n.done'],
      level: 1,
      vars: vars(done, { chars: c.chars }),
      extra: {},
    };
    return done;
  },
};

/** Build first when needed. */
function* ready(s: S, settings: StSettings): Gen {
  if (s.tree) return s;
  const c: Counters = { chars: 0 };
  const done = yield* build(s, settings, c);
  yield {
    state: done,
    marks: [],
    say: `${builtSay(done, c, settings)} Now the question.`,
    lines: [settings.method === 'ukkonen' ? 'u.done' : 'n.done'],
    level: 2,
    vars: vars(done, { chars: c.chars }),
    extra: {},
  };
  return done;
}

// ----- Walking a pattern -----

interface Walk {
  /** The node the match ends at or inside the edge into; null when P is not in T. */
  at: number | null;
  path: number[];
}

/** Walk P down from the root, one step per edge. */
function* walk(s: S, pat: string, op: 'search' | 'count', c: Counters): Gen<Walk> {
  const tr = s.tree!;
  const src = full(s.text);
  const m = pat.length;
  const p = op === 'search' ? 's' : 'c';
  const arg = (at: number, bad = false) => ({ name: 'P', text: pat, at, bad });
  let u = tr.root;
  let j = 0;
  const path = [u];
  yield {
    state: s,
    marks: [mark(nodeId(u), 'active')],
    say: `${op === 'search' ? 'Search for' : 'Count'} P = ${q(pat)}. Every substring of T is the start of some suffix, so P occurs in T exactly when it spells a path down from the root. Start at the root.`,
    lines: [`${p}.sig`, `${p}.walk`],
    level: 2,
    vars: vars(s, { chars: c.chars }),
    extra: { arg: arg(0), path: [...path] },
  };
  while (j < m) {
    const child = kidStarting(tr, src, u, pat[j]!);
    c.chars++;
    if (child === null) {
      const at = u === tr.root ? 'the root' : `the node for ${q(spell(s, u))}`;
      yield {
        state: s,
        marks: [mark(nodeId(u), 'error')],
        say: `No edge out of ${at} starts with ${q(pat[j]!)}, so no suffix starts with ${q(pat.slice(0, j + 1))}. P does not occur in T.`,
        lines: [`${p}.walk`, `${p}.miss`],
        level: 2,
        vars: vars(s, { chars: c.chars }),
        extra: { arg: arg(j), path: [...path] },
      };
      return { at: null, path };
    }
    const e = tr.nodes[child]!;
    const label = src.slice(e.start, e.end);
    let k = 0;
    while (k < label.length && j + k < m && label[k] === pat[j + k]) k++;
    c.chars += Math.max(0, Math.min(label.length, m - j) - 1);
    if (k < label.length && j + k < m) {
      yield {
        state: s,
        marks: [mark(edgeId(child), 'error'), mark(nodeId(child), 'error')],
        say: `The edge ${q(label)} has ${q(label[k]!)} where P has ${q(pat[j + k]!)}${k ? `, after ${q(label.slice(0, k))} matched` : ''}. P does not occur in T.`,
        lines: [`${p}.walk`, `${p}.miss`],
        level: 2,
        vars: vars(s, { chars: c.chars }),
        extra: { arg: arg(j + k), path: [...path] },
      };
      return { at: null, path };
    }
    j += k;
    path.push(child);
    const inside = k < label.length;
    yield {
      state: s,
      marks: [mark(edgeId(child), 'compare'), mark(nodeId(child), 'active')],
      say: inside
        ? `P ends inside the edge ${q(label)}, after ${plural(k, 'character')}. All of P matched.`
        : `The edge ${q(label)} matches. ${j < m ? `Go down and keep going with ${q(pat.slice(j))}.` : 'All of P matched, at this node.'}`,
      lines: [`${p}.walk`, `${p}.down`],
      level: 3,
      vars: vars(s, { chars: c.chars }),
      extra: { arg: arg(j), path: [...path] },
    };
    u = child;
  }
  return { at: u, path };
}

/** Where P occurs: the leaves under the end of its path, as positions in increasing order. */
export function occurrences(s: S, at: number): number[] {
  const tr = s.tree!;
  return leavesUnder(tr, at)
    .map((v) => tr.nodes[v]!.leaf!)
    .sort((a, b) => a - b);
}

function patternArg(args: Value[]): string | Error {
  return parseText(args[0], 'pattern');
}

function* badPattern(s: S, err: Error, what: string): Gen {
  yield {
    state: s,
    marks: [],
    say: `Nothing to ${what}. ${err.message}`,
    lines: [],
    level: 1,
    vars: vars(s),
    extra: {},
  };
  return s;
}

const searchOp: Op = {
  label: 'Search',
  arity: 1,
  *run(s0, args, { settings }) {
    const pat = patternArg(args);
    if (pat instanceof Error) return yield* badPattern(s0, pat, 'search for');
    const s = yield* ready(s0, settings);
    const c: Counters = { chars: 0 };
    const w = yield* walk(s, pat, 'search', c);
    if (w.at === null) {
      yield {
        state: s,
        marks: [],
        say: `${q(pat)} does not occur in ${q(s.text)}. The walk compared ${plural(c.chars, 'character')}, at most |P|, however long T is.`,
        lines: ['s.miss'],
        level: 1,
        vars: vars(s, { found: 'none', chars: c.chars }),
        extra: { arg: { name: 'P', text: pat, at: 0, bad: false }, path: w.path },
      };
      return s;
    }
    const leaves = leavesUnder(s.tree!, w.at);
    const at = occurrences(s, w.at);
    yield {
      state: s,
      marks: leaves.map((v) => mark(nodeId(v), 'found')),
      say: `Every leaf below the end of the walk is a suffix that starts with ${q(pat)}. Their labels are the positions: P occurs ${plural(at.length, 'time')}, at ${at.length === 1 ? 'position' : 'positions'} ${andList(at)}.`,
      lines: ['s.leaves'],
      level: 1,
      vars: vars(s, { found: at.join(' '), chars: c.chars }),
      extra: {
        arg: { name: 'P', text: pat, at: pat.length },
        path: w.path,
        spots: at.map((p) => ({ from: p, len: pat.length, role: 'found' as MarkRole })),
      },
    };
    return s;
  },
};

const countOp: Op = {
  label: 'Count',
  arity: 1,
  *run(s0, args, { settings }) {
    const pat = patternArg(args);
    if (pat instanceof Error) return yield* badPattern(s0, pat, 'count');
    const s = yield* ready(s0, settings);
    const c: Counters = { chars: 0 };
    const w = yield* walk(s, pat, 'count', c);
    const arg = { name: 'P', text: pat, at: pat.length };
    if (w.at === null) {
      yield {
        state: s,
        marks: [],
        say: `The walk fell off the tree, so ${q(pat)} occurs 0 times in ${q(s.text)}.`,
        lines: ['c.miss'],
        level: 1,
        vars: vars(s, { count: 0, chars: c.chars }),
        extra: { arg: { ...arg, at: 0 }, path: w.path },
      };
      return s;
    }
    const tr = s.tree!;
    const leaves = leavesUnder(tr, w.at);
    const counted: number[] = [];
    for (const v of leaves) {
      counted.push(v);
      yield {
        state: s,
        marks: [mark(nodeId(v), 'found')],
        say: `Leaf ${tr.nodes[v]!.leaf}: the suffix ${q(full(s.text).slice(tr.nodes[v]!.leaf!))} starts with ${q(pat)}. count = ${counted.length}.`,
        lines: ['c.for', 'c.inc'],
        level: 3,
        vars: vars(s, { count: counted.length, chars: c.chars }),
        extra: { arg, path: w.path, counted: [...counted] },
      };
    }
    yield {
      state: s,
      marks: leaves.map((v) => mark(nodeId(v), 'found')),
      say: `${plural(leaves.length, 'leaf', 'leaves')} below the end of the walk, so ${q(pat)} occurs ${plural(leaves.length, 'time')}. Counting took one visit per node in that subtree. (Storing a leaf count in every node during the build would make it O(|P|).)`,
      lines: ['c.ret'],
      level: 1,
      vars: vars(s, { count: leaves.length, chars: c.chars }),
      extra: {
        arg,
        path: w.path,
        counted: [...counted],
        spots: occurrences(s, w.at).map((p) => ({
          from: p,
          len: pat.length,
          role: 'found' as MarkRole,
        })),
      },
    };
    return s;
  },
};

/** The deepest internal node by string depth; the first in preorder when several tie. */
export function deepest(s: S): { node: number | null; depth: number } {
  const tr = s.tree!;
  let best: number | null = null;
  let depth = 0;
  for (const u of preorder(tr)) {
    const n = tr.nodes[u]!;
    if (u === tr.root || n.leaf !== null) continue;
    const d = spell(s, u).length;
    if (d > depth) {
      depth = d;
      best = u;
    }
  }
  return { node: best, depth };
}

const repeatOp: Op = {
  label: 'Longest repeat',
  arity: 0,
  *run(s0, _args, { settings }) {
    const s = yield* ready(s0, settings);
    const tr = s.tree!;
    let best: number | null = null;
    let depth = 0;
    yield {
      state: s,
      marks: [],
      say: `A substring that occurs twice starts two different suffixes, so their paths share it and then split at an internal node. The longest repeat is the path label of the deepest internal node, counting characters, not edges. Visit every internal node.`,
      lines: ['r.sig'],
      level: 2,
      vars: vars(s, { best: 0 }),
      extra: {},
    };
    for (const u of preorder(tr)) {
      const n = tr.nodes[u]!;
      if (u === tr.root || n.leaf !== null) continue;
      const label = spell(s, u);
      const better = label.length > depth;
      if (better) {
        depth = label.length;
        best = u;
      }
      yield {
        state: s,
        marks: [mark(nodeId(u), better ? 'new' : 'compare')],
        say: better
          ? `The node for ${q(label)}, ${plural(label.length, 'character')} deep, is the deepest so far. It has ${plural(leavesUnder(tr, u).length, 'leaf', 'leaves')} below it, so ${q(label)} occurs that many times.`
          : `The node for ${q(label)} is ${plural(label.length, 'character')} deep, no deeper than ${depth}.`,
        lines: ['r.for', 'r.if'],
        level: 3,
        vars: vars(s, { best: depth }),
        extra: {},
      };
    }
    if (best === null) {
      yield {
        state: s,
        marks: [],
        say: `The root is the only internal node: every suffix leaves the root on its own edge, so no character of ${q(s.text)} occurs twice and nothing repeats.`,
        lines: ['r.ret'],
        level: 1,
        vars: vars(s, { repeat: 'none' }),
        extra: {},
      };
      return s;
    }
    const sub = spell(s, best);
    const at = occurrences(s, best);
    const path: number[] = [];
    for (let v: number | null = best; v !== null; v = tr.nodes[v]!.parent) path.unshift(v);
    yield {
      state: s,
      marks: [
        mark(nodeId(best), 'found'),
        ...leavesUnder(tr, best).map((v) => mark(nodeId(v), 'found')),
      ],
      say: `The deepest internal node spells ${q(sub)}, ${plural(sub.length, 'character')}: the longest repeated substring. The leaves below it say where: positions ${andList(at)}.`,
      lines: ['r.ret'],
      level: 1,
      vars: vars(s, { repeat: sub }),
      extra: {
        path,
        spots: at.map((p) => ({ from: p, len: sub.length, role: 'found' as MarkRole })),
      },
    };
    return s;
  },
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const t = parseText(arg, 'text');
    if (t instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${t.message} The text stays ${q(s.text)}.`,
        lines: [],
        level: 1,
        vars: vars(s),
        extra: {},
      };
      return s;
    }
    const next: S = { text: t, tree: null };
    yield {
      state: next,
      marks: [],
      say: `T = ${q(t)}, ${plural(t.length, 'character')}. With the end marker that makes ${plural(t.length + 1, 'suffix', 'suffixes')} of ${q(full(t))}. Press Build to put them in a tree.`,
      lines: [],
      level: 1,
      vars: vars(next),
      extra: {},
    };
    return next;
  },
};

export const ops = { load, build: buildOp, search: searchOp, count: countOp, repeat: repeatOp };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: StSettings): PseudoBlock[] {
  const build =
    settings.method === 'ukkonen'
      ? [
          L('u.sig', 0, 'UKKONEN(T$)', 'Build the tree in one pass over T$:'),
          L('u.for', 1, 'for i = 0 to n', 'For each character, in order:'),
          L('u.rem', 2, 'remainder = remainder + 1', 'one more suffix waits to go in.'),
          L('u.while', 2, 'while remainder > 0', 'While some suffix still waits,'),
          L('u.walk', 3, 'if length ≥ |edge|: walk down', 'skip down past whole edges;'),
          L(
            'u.three',
            3,
            'if next char on edge == T[i]: length++; break',
            'if it is already there, stop this phase;',
          ),
          L('u.none', 3, 'if no edge for T[i]: new leaf', 'if there is no edge, add a leaf;'),
          L(
            'u.split',
            3,
            'else split the edge, new leaf',
            'otherwise split the edge and add a leaf;',
          ),
          L('u.leaf', 3, 'leaf end = current end', 'the leaf grows with every later phase.'),
          L('u.link', 3, 'link(previous new node) = this node', 'Point the last new node here.'),
          L(
            'u.next',
            3,
            'remainder--; follow link or drop a char',
            'Move to the next shorter suffix.',
          ),
          L('u.done', 1, 'return the tree', 'Every suffix is in.'),
        ]
      : [
          L('n.sig', 0, 'SUFFIX-TREE(T$)', 'Build the tree one suffix at a time:'),
          L('n.for', 1, 'for i = 0 to n', 'For each suffix, longest first,'),
          L('n.walk', 2, 'walk down while T[j..] matches', 'follow the edges that match it;'),
          L(
            'n.down',
            3,
            'whole edge matched: go to its node',
            'a whole edge matched: go on from its end.',
          ),
          L(
            'n.none',
            2,
            'if no edge starts with T[j]',
            'If no edge starts with the next character,',
          ),
          L(
            'n.split',
            2,
            'if it differs inside an edge: split',
            'if it differs inside an edge, split it there;',
          ),
          L(
            'n.leaf',
            2,
            'add leaf i with label T[j..]',
            'hang a leaf with the rest of the suffix.',
          ),
          L('n.done', 1, 'return the tree', 'Every suffix is in.'),
        ];
  return [
    { op: 'build', lines: build },
    {
      op: 'search',
      lines: [
        L('s.sig', 0, 'SEARCH(P)', 'Find where P occurs:'),
        L('s.walk', 1, 'walk down from the root along P', 'Follow P down from the root.'),
        L('s.down', 2, 'edge matches: go on', 'Each edge must match P.'),
        L('s.miss', 2, 'mismatch or no edge: return none', 'If it does not, P is not in T.'),
        L('s.leaves', 1, 'return labels of leaves below', 'The leaves below say where P starts.'),
      ],
    },
    {
      op: 'count',
      lines: [
        L('c.sig', 0, 'COUNT(P)', 'Count how often P occurs:'),
        L('c.walk', 1, 'walk down from the root along P', 'Follow P down from the root.'),
        L('c.down', 2, 'edge matches: go on', 'Each edge must match P.'),
        L('c.miss', 2, 'mismatch or no edge: return 0', 'If it does not, the count is 0.'),
        L('c.for', 1, 'for each leaf below the walk', 'Visit the leaves below,'),
        L('c.inc', 2, 'count = count + 1', 'counting each one.'),
        L('c.ret', 1, 'return count', 'That is how often P occurs.'),
      ],
    },
    {
      op: 'repeat',
      lines: [
        L('r.sig', 0, 'LONGEST-REPEAT()', 'Find the longest repeated substring:'),
        L('r.for', 1, 'for each internal node u', 'Look at every internal node'),
        L('r.if', 2, 'if depth(u) > depth(best): best = u', 'and keep the deepest, in characters.'),
        L('r.ret', 1, 'return path label of best', 'Its path spells the repeat.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `T = ${q(s.text)}. Press Build to put every suffix of ${q(full(s.text))} into one compressed trie: the suffix tree.`;
}

export const initialVars = (s: S) => vars(s);

export function describe(s: S): string {
  if (!s.tree) return `Text ${s.text}. The suffix tree is not built yet.`;
  const k = counts(s.tree);
  return `Suffix tree of ${full(s.text)}: ${k.leaves} leaves and ${k.internal} internal nodes. As nested edge labels: ${bracket(s)}.`;
}
