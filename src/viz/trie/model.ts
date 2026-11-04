import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { trieEdgeId, trieNodeId } from '../../layouts/trie';
import { and, plural, readWord } from '../_trie/words';

export interface TrieNode {
  uid: number;
  /** The letter on the edge into this node; '' for the root. */
  ch: string;
  /** A word ends at this node. */
  end: boolean;
  /** Children, in alphabetical order of their letters. */
  kids: number[];
  parent: number | null;
}

export interface TrieState {
  nodes: Record<number, TrieNode>;
  root: number;
  nextUid: number;
}

export interface TrieSettings {
  [key: string]: Scalar;
  /** prune: delete removes the nodes that no longer lead to a word. lazy: it only unmarks. */
  delete: 'prune' | 'lazy';
}

export interface TrieExtra {
  /** The word or prefix being processed, drawn as letter cells above the trie. `at` is the
   * letter being looked at (the word's length once every letter is done). */
  arg?: { name: 'word' | 'prefix'; text: string; at: number; bad?: boolean };
  /** Nodes visited so far. */
  path?: number[];
  /** Nodes the startsWith walk has visited so far. */
  seen?: number[];
  /** Words startsWith has written so far. */
  output?: string[];
  /** A node made in this step: it slides out of its parent. */
  fresh?: number;
}

type S = TrieState;
type X = TrieExtra;
type Op = OpSpec<S, TrieSettings, X>;
type TrieStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: TrieSettings = { delete: 'prune' };

export const ROOT = 0;

export function init(): S {
  return {
    nodes: { [ROOT]: { uid: ROOT, ch: '', end: false, kids: [], parent: null } },
    root: ROOT,
    nextUid: 1,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (i: number) => `arg-${i}`;
const nodeMark = (u: number, role: Mark['role']) => mark(trieNodeId(u), role);
const edgeMark = (u: number, role: Mark['role']) => mark(trieEdgeId(u), role);

// ---------------------------------------------------------------------------------------------
// Reading a state

export function childOf(s: S, u: number, ch: string): number | null {
  return s.nodes[u]!.kids.find((k) => s.nodes[k]!.ch === ch) ?? null;
}

/** The letters on the path from the root down to u. */
export function prefixOf(s: S, u: number): string {
  let out = '';
  for (let x: number | null = u; x !== null; x = s.nodes[x]!.parent) out = s.nodes[x]!.ch + out;
  return out;
}

/** Every word in the subtree of u, in alphabetical order (a preorder walk, children a to z). */
export function wordsBelow(s: S, u: number, prefix = prefixOf(s, u)): string[] {
  const out: string[] = [];
  const walk = (x: number, p: string) => {
    const n = s.nodes[x]!;
    if (n.end) out.push(p);
    for (const k of n.kids) walk(k, p + s.nodes[k]!.ch);
  };
  walk(u, prefix);
  return out;
}

export const wordsOf = (s: S) => wordsBelow(s, s.root, '');
export const nodeCount = (s: S) => Object.keys(s.nodes).length;

export function heightOf(s: S): number {
  const h = (u: number): number => Math.max(0, ...s.nodes[u]!.kids.map((k) => 1 + h(k)));
  return h(s.root);
}

/** Readouts on every step: words stored, nodes (the root included) and height. */
function counts(s: S): Record<string, Scalar> {
  return { words: wordsOf(s).length, nodes: nodeCount(s), height: heightOf(s) };
}

const where = (s: S, u: number) => (u === s.root ? 'root' : prefixOf(s, u));

// ---------------------------------------------------------------------------------------------
// A working copy. Operations change it and yield snapshots.

class Work {
  nodes: Record<number, TrieNode>;
  root: number;
  nextUid: number;

  constructor(s: S) {
    this.nodes = Object.fromEntries(
      Object.entries(s.nodes).map(([k, n]) => [k, { ...n, kids: [...n.kids] }]),
    );
    this.root = s.root;
    this.nextUid = s.nextUid;
  }

  snap(): S {
    const nodes = Object.fromEntries(
      Object.entries(this.nodes).map(([k, n]) => [k, { ...n, kids: [...n.kids] }]),
    ) as Record<number, TrieNode>;
    return { nodes, root: this.root, nextUid: this.nextUid };
  }

  n(u: number): TrieNode {
    return this.nodes[u]!;
  }

  child(u: number, ch: string): number | null {
    return this.n(u).kids.find((k) => this.n(k).ch === ch) ?? null;
  }

  /** A new child of u on an edge labeled ch, kept in alphabetical order. */
  add(u: number, ch: string): number {
    const uid = this.nextUid++;
    this.nodes[uid] = { uid, ch, end: false, kids: [], parent: u };
    const kids = this.n(u).kids;
    const at = kids.findIndex((k) => this.n(k).ch > ch);
    kids.splice(at < 0 ? kids.length : at, 0, uid);
    return uid;
  }

  /** Take leaf u out of the trie. */
  remove(u: number): void {
    const p = this.n(u).parent!;
    this.n(p).kids = this.n(p).kids.filter((k) => k !== u);
    delete this.nodes[u];
  }
}

// ---------------------------------------------------------------------------------------------
// Steps

interface Ctx {
  W: Work;
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
): TrieStep {
  const state = c.W.snap();
  const extra: X = { ...c.extra, ...more };
  if (extra.arg) extra.arg = { ...extra.arg };
  if (extra.path) extra.path = [...extra.path];
  if (extra.seen) extra.seen = [...extra.seen];
  if (extra.output) extra.output = [...extra.output];
  return { state, marks, say, lines, vars: { ...counts(state), ...c.vars }, level, extra };
}

/** A step that reports a bad argument and changes nothing. */
function* badArg(s: S, name: string, raw: Value | undefined, err: Error, line: string) {
  const c: Ctx = {
    W: new Work(s),
    extra: { arg: { name: 'word', text: String(raw ?? ''), at: 0, bad: true } },
    vars: {},
  };
  yield step(c, `${name}(${String(raw ?? '')}): ${err.message} The trie is unchanged.`, [line], 1, [
    mark('arg-bad', 'error'),
  ]);
  return s;
}

/**
 * Walk down from the root along the letters of w, one step per letter that has an edge. Stops
 * at the first letter with no edge. Returns the node reached and how many letters matched.
 */
function* descend(
  c: Ctx,
  w: string,
  lines: string[],
  level: Level,
): Generator<TrieStep, { x: number; matched: number }, void> {
  const W = c.W;
  let x = W.root;
  const path = [x];
  c.extra.path = path;
  for (let i = 0; i < w.length; i++) {
    const ch = w[i]!;
    c.extra.arg!.at = i;
    c.vars.c = ch;
    const y = W.child(x, ch);
    if (y === null) return { x, matched: i };
    x = y;
    path.push(x);
    c.vars.x = where(W, x);
    yield step(c, `Letter ${ch}: there is an edge ${ch}, so follow it down.`, lines, level, [
      mark(cellId(i), 'active'),
      edgeMark(x, 'active'),
      nodeMark(x, 'active'),
    ]);
  }
  c.extra.arg!.at = w.length;
  delete c.vars.c;
  return { x, matched: w.length };
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s, [raw]) {
    const w = readWord(raw);
    if (w instanceof Error) return yield* badArg(s, 'insert', raw, w, 'ins.sig');
    const W = new Work(s);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'word', text: w, at: 0 } },
      vars: { word: w, x: 'root' },
    };
    yield step(
      c,
      `insert(${w}): start at the root. Take the letters one at a time: follow the edge for each letter, or make one.`,
      ['ins.init'],
      2,
      [nodeMark(W.root, 'active')],
      { path: [W.root] },
    );
    const path = [W.root];
    c.extra.path = path;
    let x = W.root;
    let added = 0;
    for (let i = 0; i < w.length; i++) {
      const ch = w[i]!;
      c.extra.arg!.at = i;
      c.vars.c = ch;
      const y = W.child(x, ch);
      if (y !== null) {
        x = y;
        path.push(x);
        c.vars.x = where(W, x);
        yield step(
          c,
          `Letter ${ch}: there is already an edge ${ch}, so follow it down.`,
          ['ins.loop', 'ins.test', 'ins.down'],
          2,
          [mark(cellId(i), 'active'), edgeMark(x, 'active'), nodeMark(x, 'active')],
        );
      } else {
        x = W.add(x, ch);
        added += 1;
        path.push(x);
        c.vars.x = where(W, x);
        yield step(
          c,
          `Letter ${ch}: no edge ${ch} here. Add a new node on an edge labeled ${ch} and go down to it.`,
          ['ins.loop', 'ins.test', 'ins.new', 'ins.down'],
          2,
          [mark(cellId(i), 'active'), edgeMark(x, 'active'), nodeMark(x, 'new')],
          { fresh: x },
        );
      }
    }
    c.extra.arg!.at = w.length;
    delete c.vars.c;
    if (W.n(x).end) {
      yield step(
        c,
        `insert(${w}): every letter had an edge, and this node already ends a word. ${w} was in the trie already, so nothing changes.`,
        ['ins.check', 'ins.dup'],
        1,
        [nodeMark(x, 'found')],
      );
      return s;
    }
    W.n(x).end = true;
    const longer = wordsBelow(W, x).filter((v) => v !== w);
    const made =
      added > 0
        ? `It took ${plural(added, 'new node')}.`
        : longer.length
          ? `No new nodes: the path was already there, because ${w} is a prefix of ${and(longer.slice(0, 3))}.`
          : 'No new nodes: a lazy delete had left the path behind.';
    yield step(
      c,
      `Mark this node as the end of a word, which draws a second ring around it. ${w} is in the trie. ${made}`,
      ['ins.check', 'ins.mark'],
      1,
      [nodeMark(x, 'done')],
    );
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// search

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [raw]) {
    const w = readWord(raw);
    if (w instanceof Error) return yield* badArg(s, 'search', raw, w, 'srch.sig');
    const W = new Work(s);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'word', text: w, at: 0 } },
      vars: { word: w, x: 'root' },
    };
    yield step(
      c,
      `search(${w}): start at the root and follow the letters.`,
      ['srch.init'],
      2,
      [nodeMark(W.root, 'active')],
      { path: [W.root] },
    );
    const { x, matched } = yield* descend(c, w, ['srch.loop', 'srch.test', 'srch.down'], 2);
    if (matched < w.length) {
      const ch = w[matched]!;
      c.vars.found = false;
      yield step(
        c,
        `Letter ${ch}: there is no edge ${ch} from ${x === W.root ? 'the root' : `the node for ${prefixOf(W, x)}`}. No word in the trie starts with ${w.slice(0, matched + 1)}, so ${w} is not there.`,
        ['srch.loop', 'srch.test', 'srch.miss'],
        1,
        [mark(cellId(matched), 'error'), nodeMark(x, 'error')],
      );
      return s;
    }
    const end = W.n(x).end;
    c.vars.found = end;
    if (end) {
      yield step(
        c,
        `Every letter matched, and this node ends a word (it has the second ring). ${w} is in the trie.`,
        ['srch.end'],
        1,
        [nodeMark(x, 'found')],
      );
    } else {
      const longer = wordsBelow(W, x);
      yield step(
        c,
        longer.length
          ? `Every letter matched, but this node does not end a word. ${w} is only a prefix of ${and(longer.length > 3 ? [...longer.slice(0, 3), 'more'] : longer)}, so search returns false.`
          : `Every letter matched, but this node does not end a word, and no word ends below it: a lazy delete left it behind. search returns false.`,
        ['srch.end'],
        1,
        [nodeMark(x, 'error')],
      );
    }
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// delete

const del: Op = {
  label: 'Delete',
  arity: 1,
  *run(s, [raw], { settings }) {
    const w = readWord(raw);
    if (w instanceof Error) return yield* badArg(s, 'delete', raw, w, 'del.sig');
    const W = new Work(s);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'word', text: w, at: 0 } },
      vars: { word: w, x: 'root' },
    };
    yield step(
      c,
      `delete(${w}): first find it, as search does.`,
      ['del.init'],
      2,
      [nodeMark(W.root, 'active')],
      { path: [W.root] },
    );
    const found = yield* descend(c, w, ['del.loop', 'del.test', 'del.down'], 2);
    let x = found.x;
    if (found.matched < w.length) {
      const ch = w[found.matched]!;
      yield step(
        c,
        `Letter ${ch}: there is no edge ${ch} here, so ${w} is not in the trie. Nothing to delete.`,
        ['del.loop', 'del.test', 'del.miss'],
        1,
        [mark(cellId(found.matched), 'error'), nodeMark(x, 'error')],
      );
      return s;
    }
    if (!W.n(x).end) {
      yield step(
        c,
        wordsBelow(W, x).length
          ? `Every letter matched, but this node does not end a word: ${w} is only a prefix of other words. Nothing to delete.`
          : `Every letter matched, but this node does not end a word: ${w} is not in the trie. Nothing to delete.`,
        ['del.notend', 'del.miss2'],
        1,
        [nodeMark(x, 'error')],
      );
      return s;
    }
    W.n(x).end = false;
    c.extra.path = [];
    if (settings.delete === 'lazy') {
      const dead = W.n(x).kids.length === 0;
      yield step(
        c,
        `Clear the end mark, and that is all a lazy delete does. ${w} is gone${dead ? `, but its nodes stay, although no word ends below them now` : ''}.`,
        ['del.notend', 'del.unmark'],
        1,
        [nodeMark(x, 'done')],
      );
      return W.snap();
    }
    yield step(
      c,
      `Clear the end mark: no word ends here now. Then walk back up, removing nodes that no longer lead to a word.`,
      ['del.notend', 'del.unmark'],
      2,
      [nodeMark(x, 'active')],
    );
    let removed = 0;
    c.vars.removed = 0;
    while (x !== W.root && W.n(x).kids.length === 0 && !W.n(x).end) {
      const p = W.n(x).parent!;
      const ch = W.n(x).ch;
      c.vars.x = where(W, x);
      yield step(
        c,
        `The node for ${prefixOf(W, x)} has no children and ends no word, so it leads nowhere. Remove it and its edge ${ch}.`,
        ['del.loop2', 'del.parent', 'del.cut', 'del.up'],
        2,
        [nodeMark(x, 'remove'), edgeMark(x, 'error')],
      );
      W.remove(x);
      removed += 1;
      c.vars.removed = removed;
      x = p;
    }
    c.vars.x = where(W, x);
    const why =
      x === W.root
        ? 'Back at the root, so stop.'
        : W.n(x).end
          ? `The node for ${prefixOf(W, x)} ends the word ${prefixOf(W, x)}, so stop.`
          : `The node for ${prefixOf(W, x)} still leads to ${and(wordsBelow(W, x).slice(0, 3))}, so stop.`;
    yield step(
      c,
      `${why} ${w} is gone, ${removed ? `with ${plural(removed, 'node')} removed` : 'but every node stays, because the others still need them'}.`,
      ['del.loop2'],
      1,
      [nodeMark(x, x === W.root ? 'active' : 'found')],
    );
    return W.snap();
  },
};

// ---------------------------------------------------------------------------------------------
// startsWith

const startsWith: Op = {
  label: 'Starts with',
  arity: 1,
  *run(s, [raw]) {
    const p = readWord(raw);
    if (p instanceof Error) return yield* badArg(s, 'startsWith', raw, p, 'pre.sig');
    const W = new Work(s);
    const c: Ctx = {
      W,
      extra: { arg: { name: 'prefix', text: p, at: 0 } },
      vars: { prefix: p, x: 'root' },
    };
    yield step(
      c,
      `startsWith(${p}): walk down the letters of the prefix, then collect every word below.`,
      ['pre.init'],
      2,
      [nodeMark(W.root, 'active')],
      { path: [W.root] },
    );
    const { x, matched } = yield* descend(c, p, ['pre.loop', 'pre.test', 'pre.down'], 2);
    if (matched < p.length) {
      const ch = p[matched]!;
      c.vars.returned = 'none';
      yield step(
        c,
        `Letter ${ch}: there is no edge ${ch} here, so no word starts with ${p}. The list is empty.`,
        ['pre.loop', 'pre.test', 'pre.none'],
        1,
        [mark(cellId(matched), 'error'), nodeMark(x, 'error')],
      );
      return s;
    }
    const output: string[] = [];
    const visited: number[] = [];
    c.extra.output = output;
    c.extra.seen = visited;
    yield step(
      c,
      `Every word that starts with ${p} is below this node. Visit them in preorder, children in alphabetical order, and write down each word that ends.`,
      ['pre.out', 'pre.collect'],
      2,
      [nodeMark(x, 'active')],
    );
    function* collect(u: number, word: string): Generator<TrieStep, void, void> {
      visited.push(u);
      c.vars.s = word;
      if (W.n(u).end) {
        output.push(word);
        yield step(c, `${word} ends here: write it down.`, ['col.end', 'col.add'], 2, [
          nodeMark(u, 'found'),
          mark(`out-${output.length - 1}`, 'new'),
        ]);
      } else {
        yield step(c, `No word ends at ${word}; keep going down.`, ['col.end'], 3, [
          nodeMark(u, 'active'),
        ]);
      }
      for (const k of W.n(u).kids) yield* collect(k, word + W.n(k).ch);
    }
    yield* collect(x, p);
    delete c.vars.s;
    c.vars.returned = output.join(' ') || 'none';
    yield step(
      c,
      output.length
        ? `${plural(output.length, 'word starts', 'words start')} with ${p}: ${output.join(', ')}. They come out in alphabetical order because the children are visited a to z.`
        : `Nothing below the node for ${p} ends a word. The list is empty.`,
      ['pre.ret'],
      1,
      [nodeMark(x, 'found')],
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// clear

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const empty = init();
    const n = nodeCount(s) - 1;
    yield {
      state: { ...empty, nextUid: s.nextUid },
      marks: [],
      say:
        n === 0
          ? 'clear(): the trie is already empty: just the root.'
          : `clear(): drop every node but the root (${plural(n, 'node')}). The trie is empty.`,
      lines: ['clear.reset'],
      vars: counts(empty),
      level: 1,
    } satisfies TrieStep;
    return { ...empty, nextUid: s.nextUid };
  },
};

export const ops = { insert, search, delete: del, startsWith, clear };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: TrieSettings): PseudoBlock[] {
  const prune = settings.delete === 'prune';
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(word)', 'To insert a word:'),
        L('ins.init', 1, 'x = root', 'start at the root.'),
        L('ins.loop', 1, 'for each letter c of word', 'Take the letters one at a time:'),
        L('ins.test', 2, 'if x.child[c] == nil', 'if there is no edge for the letter,'),
        L('ins.new', 3, 'x.child[c] = new Node()', 'add a node on a new edge with that letter;'),
        L('ins.down', 2, 'x = x.child[c]', 'go down the edge.'),
        L('ins.check', 1, 'if x.end', 'If a word already ends at the last node,'),
        L('ins.dup', 2, 'return  // already there', 'stop: the word is already in the trie.'),
        L('ins.mark', 1, 'x.end = true', 'Mark the node as the end of a word.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('srch.sig', 0, 'search(word)', 'To look for a word:'),
        L('srch.init', 1, 'x = root', 'start at the root.'),
        L('srch.loop', 1, 'for each letter c of word', 'Take the letters one at a time:'),
        L('srch.test', 2, 'if x.child[c] == nil', 'if there is no edge for the letter,'),
        L('srch.miss', 3, 'return false', 'the word is not there.'),
        L('srch.down', 2, 'x = x.child[c]', 'Otherwise go down the edge.'),
        L('srch.end', 1, 'return x.end', 'Found only if a word ends at the last node.'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(word)', 'To delete a word:'),
        L('del.init', 1, 'x = root', 'start at the root.'),
        L('del.loop', 1, 'for each letter c of word', 'Follow the letters, as search does:'),
        L('del.test', 2, 'if x.child[c] == nil', 'if there is no edge for the letter,'),
        L('del.miss', 3, 'return  // not there', 'stop: the word is not there.'),
        L('del.down', 2, 'x = x.child[c]', 'Otherwise go down the edge.'),
        L('del.notend', 1, 'if not x.end', 'If no word ends at the last node,'),
        L('del.miss2', 2, 'return  // only a prefix', 'stop: the word is not there.'),
        L(
          'del.unmark',
          1,
          prune ? 'x.end = false' : 'x.end = false  // lazy: nothing else',
          prune ? 'Clear the end mark.' : 'Clear the end mark and stop. The nodes stay.',
        ),
        ...(prune
          ? [
              L(
                'del.loop2',
                1,
                'while x ≠ root and x has no children and not x.end',
                'While the node leads nowhere (no children, no word ends there):',
              ),
              L('del.parent', 2, 'p = x.parent', 'remember its parent,'),
              L('del.cut', 2, 'remove x from p.child', 'cut the node off,'),
              L('del.up', 2, 'x = p', 'and move up to the parent.'),
            ]
          : []),
      ],
    },
    {
      op: 'startsWith',
      lines: [
        L('pre.sig', 0, 'startsWith(prefix)', 'To list the words that start with a prefix:'),
        L('pre.init', 1, 'x = root', 'start at the root.'),
        L('pre.loop', 1, 'for each letter c of prefix', 'Follow the letters of the prefix:'),
        L('pre.test', 2, 'if x.child[c] == nil', 'if there is no edge for the letter,'),
        L('pre.none', 3, 'return []', 'no word starts with the prefix.'),
        L('pre.down', 2, 'x = x.child[c]', 'Otherwise go down the edge.'),
        L('pre.out', 1, 'out = []', 'Start an empty list.'),
        L('pre.collect', 1, 'collect(x, prefix, out)', 'Collect every word below this node.'),
        L('pre.ret', 1, 'return out', 'Hand back the list.'),
        L('col.sig', 0, 'collect(x, s, out)', 'To collect the words below x (s spells x):'),
        L('col.end', 1, 'if x.end', 'if a word ends at x,'),
        L('col.add', 2, 'append s to out', 'write it down.'),
        L('col.kids', 1, 'for each child y of x, a to z', 'Then, for each child in letter order,'),
        L('col.rec', 2, 'collect(y, s + y.letter, out)', 'collect the words below it.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clear.sig', 0, 'clear()', 'To empty the trie:'),
        L('clear.reset', 1, 'root = new Node()', 'start over with a lone root.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'An empty trie: just the root. Each edge will carry one letter, and a word is the path of letters from the root to a node with a second ring.';
}

export function initialVars(state: S) {
  return counts(state);
}

/** Screen-reader summary. */
export function describe(state: S): string {
  const words = wordsOf(state);
  if (nodeCount(state) === 1) return 'An empty trie: just the root.';
  const list = words.length ? `: ${words.join(', ')}` : '';
  return `A trie with ${plural(words.length, 'word')} in ${plural(nodeCount(state), 'node')}, height ${heightOf(state)}${list}.`;
}
