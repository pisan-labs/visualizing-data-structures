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

/** One data block. The uid follows the block when its data changes. */
export interface Block {
  uid: number;
  data: string;
}

export interface MerkleState {
  blocks: Block[];
  /** hashes[level][i]: level 0 are the leaves' hashes, the last level is the root. */
  hashes: string[][];
  nextUid: number;
}

export interface MerkleSettings {
  [key: string]: Scalar;
  /** promote: a node with no partner moves up unchanged. duplicate: it is paired with itself. */
  odd: 'promote' | 'duplicate';
}

export interface ProofItem {
  /** Which side the sibling is on, or null when the node had no partner (promoted). */
  side: 'L' | 'R' | null;
  hash: string;
  level: number;
}

export interface MerkleExtra {
  /** Nodes whose hash is out of date, as "level-i". */
  stale?: string[];
  /** The proof being built or checked, and how much of it has been used. */
  proof?: { leaf: number; items: ProofItem[]; used: number; computed?: string; data?: string };
  arg?: { label: string; text: string };
  /** The old root, while the path is being recomputed. */
  oldRoot?: string;
}

type S = MerkleState;
type X = MerkleExtra;
type Op = OpSpec<S, MerkleSettings, X>;
type MStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const MAX_BLOCKS = 8;
export const MAX_DATA = 6;

export const defaults: MerkleSettings = { odd: 'promote' };

export function init(): S {
  return { blocks: [], hashes: [], nextUid: 1 };
}

const mark = (id: string, role: MarkRole): Mark => ({ id, role });
export const hashId = (level: number, i: number) => `h-${level}-${i}`;
export const blockId = (i: number) => `blk-${i}`;
export const proofId = (k: number) => `proof-${k}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------
// The hash: FNV-1a over the characters, 32 bits, folded to 16 bits and shown as 4 hex digits.
// A teaching hash, small enough to read: it is not cryptographic, and collisions are easy.

export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const folded = ((h >>> 16) ^ (h & 0xffff)) >>> 0;
  return folded.toString(16).padStart(4, '0');
}

/** The hash of a parent: H(left || right), or the child itself when promoted. */
function parentHash(level: string[], i: number, odd: MerkleSettings['odd']): string {
  const a = level[2 * i]!;
  const b = level[2 * i + 1];
  if (b !== undefined) return hash(a + b);
  return odd === 'duplicate' ? hash(a + a) : a;
}

/** All levels for these blocks, leaves first. */
export function computeLevels(blocks: string[], odd: MerkleSettings['odd']): string[][] {
  if (blocks.length === 0) return [];
  const levels = [blocks.map(hash)];
  while (levels[levels.length - 1]!.length > 1) {
    const prev = levels[levels.length - 1]!;
    levels.push(
      Array.from({ length: Math.ceil(prev.length / 2) }, (_, i) => parentHash(prev, i, odd)),
    );
  }
  return levels;
}

export const rootOf = (s: S) => (s.hashes.length ? s.hashes[s.hashes.length - 1]![0]! : null);

// ---------------------------------------------------------------------------------------------
// Arguments

const INT = /^-?\d+$/;

export function parseData(raw: Value): string | Error {
  const t = String(raw).trim();
  if (!t) return new Error('Type a block of data, such as tx1.');
  if (t.length > MAX_DATA) return new Error(`Keep a block to ${MAX_DATA} characters so it fits.`);
  if (!/^[\x21-\x7e]+$/.test(t))
    return new Error('Use letters, digits and punctuation, no spaces.');
  return t;
}

export function parseBlocks(raw: Value): string[] | Error {
  const tokens = String(raw)
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length === 0) return new Error('Type the blocks, such as a b c d.');
  if (tokens.length > MAX_BLOCKS) return new Error(`At most ${MAX_BLOCKS} blocks fit.`);
  const out: string[] = [];
  for (const t of tokens) {
    const d = parseData(t);
    if (d instanceof Error) return new Error(`"${t}": ${d.message}`);
    out.push(d);
  }
  return out;
}

export function parseIndex(raw: Value): number | Error {
  const t = String(raw).trim();
  if (!INT.test(t)) return new Error('A block number is a whole number, such as 2.');
  return Number(t);
}

// ---------------------------------------------------------------------------------------------

interface Ctx {
  blocks: Block[];
  hashes: string[][];
  nextUid: number;
  odd: MerkleSettings['odd'];
  extra: X;
  vars: Record<string, Scalar>;
  computed: number;
}

function ctx(s: S, st: MerkleSettings, vars: Record<string, Scalar> = {}): Ctx {
  return {
    blocks: s.blocks.map((b) => ({ ...b })),
    hashes: s.hashes.map((l) => [...l]),
    nextUid: s.nextUid,
    odd: st.odd === 'duplicate' ? 'duplicate' : 'promote',
    extra: {},
    vars,
    computed: 0,
  };
}

function snap(c: Ctx): S {
  return {
    blocks: c.blocks.map((b) => ({ ...b })),
    hashes: c.hashes.map((l) => [...l]),
    nextUid: c.nextUid,
  };
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): MStep {
  const state = snap(c);
  const root = rootOf(state);
  return {
    state,
    marks,
    say,
    lines,
    vars: {
      blocks: state.blocks.length,
      height: state.hashes.length - 1,
      root: root ?? '–',
      ...c.vars,
      'hashes computed': c.computed,
    },
    level,
    extra: {
      ...c.extra,
      stale: c.extra.stale ? [...c.extra.stale] : undefined,
      proof: c.extra.proof ? { ...c.extra.proof, items: [...c.extra.proof.items] } : undefined,
    },
  };
}

function* refuse(
  s: S,
  st: MerkleSettings,
  say: string,
  line: string,
  arg: { label: string; text: string },
) {
  const c = ctx(s, st);
  c.extra.arg = arg;
  yield step(c, say, [line], 1, [mark('arg-box', 'error')]);
  return s;
}

/**
 * Bring every hash up to date with the blocks, level by level from the leaves, one step per node
 * that changes. `old` is what the tree held before; a node that is new or differs is recomputed.
 */
function* recompute(c: Ctx, why: string): Generator<MStep, void, void> {
  const target = computeLevels(
    c.blocks.map((b) => b.data),
    c.odd,
  );
  // Resize the drawn levels to the new shape, keeping old hashes where nodes still exist.
  const old = c.hashes;
  c.hashes = target.map((lvl, k) => lvl.map((_, i) => old[k]?.[i] ?? '····'));
  c.extra.stale = [];
  target.forEach((lvl, k) =>
    lvl.forEach((h, i) => {
      if (c.hashes[k]![i] !== h) c.extra.stale!.push(`${k}-${i}`);
    }),
  );
  if (c.extra.stale.length === 0) return;
  yield step(
    c,
    `${why} The dashed nodes are out of date: every hash on the way up to the root depends on the change.`,
    ['rc.mark'],
    2,
    c.extra.stale.map((key) => {
      const [k, i] = key.split('-').map(Number);
      return mark(hashId(k!, i!), 'stale');
    }),
  );
  for (let k = 0; k < target.length; k++) {
    for (let i = 0; i < target[k]!.length; i++) {
      const key = `${k}-${i}`;
      if (!c.extra.stale.includes(key)) continue;
      const h = target[k]![i]!;
      c.hashes[k]![i] = h;
      c.extra.stale = c.extra.stale.filter((x) => x !== key);
      if (k === 0) {
        c.computed += 1;
        const b = c.blocks[i]!;
        yield step(c, `Leaf ${i}: H("${b.data}") = ${h}.`, ['rc.leaf'], 3, [
          mark(hashId(0, i), 'new'),
          mark(blockId(i), 'active'),
        ]);
        continue;
      }
      const below = target[k - 1]!;
      const a = below[2 * i]!;
      const b = below[2 * i + 1];
      const kids = [mark(hashId(k - 1, 2 * i), 'compare')];
      if (b !== undefined) kids.push(mark(hashId(k - 1, 2 * i + 1), 'compare'));
      const top = k === target.length - 1;
      let say: string;
      if (b !== undefined) {
        c.computed += 1;
        say = `H(${a} ‖ ${b}) = ${h}`;
      } else if (c.odd === 'duplicate') {
        c.computed += 1;
        say = `${a} has no partner, so pair it with itself: H(${a} ‖ ${a}) = ${h}`;
      } else say = `${a} has no partner, so it moves up unchanged`;
      yield step(
        c,
        `${say}.${top ? ` That is the new root.` : ''}`,
        [b === undefined && c.odd === 'promote' ? 'rc.promote' : 'rc.node'],
        top ? 2 : 3,
        [mark(hashId(k, i), top ? 'found' : 'new'), ...kids],
      );
    }
  }
  delete c.extra.stale;
}

// ---------------------------------------------------------------------------------------------

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [raw], { settings }) {
    const blocks = parseBlocks(raw!);
    if (blocks instanceof Error)
      return yield* refuse(s, settings, `build: ${blocks.message}`, 'bd.sig', {
        label: 'blocks',
        text: String(raw),
      });
    const c = ctx(s, settings);
    c.blocks = blocks.map((data) => ({ uid: c.nextUid++, data }));
    c.hashes = [];
    yield* recompute(
      c,
      `build(${blocks.join(' ')}): hash each block into a leaf, then hash each pair of children into their parent, up to a single root.`,
    );
    yield step(
      c,
      `The root ${rootOf(snap(c))} sums up all ${plural(blocks.length, 'block')}: change any byte of any block and it changes. ${plural(c.computed, 'hash', 'hashes')} computed.`,
      ['bd.sig'],
      1,
      [mark(hashId(c.hashes.length - 1, 0), 'found')],
    );
    return snap(c);
  },
};

const update: Op = {
  label: 'Change block',
  arity: 2,
  *run(s, [rawI, rawD], { settings }) {
    const name = `update(${String(rawI)}, ${String(rawD)})`;
    const i = parseIndex(rawI!);
    if (i instanceof Error)
      return yield* refuse(s, settings, `${name}: ${i.message}`, 'up.sig', {
        label: 'i',
        text: String(rawI),
      });
    const d = parseData(rawD!);
    if (d instanceof Error)
      return yield* refuse(s, settings, `${name}: ${d.message}`, 'up.sig', {
        label: 'data',
        text: String(rawD),
      });
    if (i < 0 || i >= s.blocks.length)
      return yield* refuse(
        s,
        settings,
        s.blocks.length === 0
          ? `${name}: there are no blocks yet. Build the tree first.`
          : `${name}: the blocks are numbered 0 to ${s.blocks.length - 1}.`,
        'up.sig',
        { label: 'i', text: String(i) },
      );
    const c = ctx(s, settings, { i });
    const before = rootOf(s)!;
    c.extra.oldRoot = before;
    c.vars['old root'] = before;
    const was = c.blocks[i]!.data;
    c.blocks[i]!.data = d;
    yield* recompute(c, `${name}: block ${i} changes from "${was}" to "${d}".`);
    const after = rootOf(snap(c))!;
    yield step(
      c,
      after === before
        ? `The root is still ${after}: the data did not change.`
        : `The root changed from ${before} to ${after}, after ${plural(c.computed, 'hash', 'hashes')}: one per level, never the whole tree. Anyone holding the old root can tell the data changed.`,
      ['up.sig'],
      1,
      [mark(hashId(c.hashes.length - 1, 0), 'found'), mark(blockId(i), 'active')],
    );
    return snap(c);
  },
};

const append: Op = {
  label: 'Append block',
  arity: 1,
  *run(s, [raw], { settings }) {
    const d = parseData(raw!);
    if (d instanceof Error)
      return yield* refuse(s, settings, `append: ${d.message}`, 'ap.sig', {
        label: 'data',
        text: String(raw),
      });
    if (s.blocks.length >= MAX_BLOCKS)
      return yield* refuse(
        s,
        settings,
        `append(${d}): at most ${MAX_BLOCKS} blocks fit in the drawing.`,
        'ap.sig',
        {
          label: 'data',
          text: d,
        },
      );
    const c = ctx(s, settings);
    const before = rootOf(s);
    if (before) {
      c.extra.oldRoot = before;
      c.vars['old root'] = before;
    }
    c.blocks.push({ uid: c.nextUid++, data: d });
    yield* recompute(c, `append(${d}): a new block ${c.blocks.length - 1} and a new leaf.`);
    yield step(
      c,
      `The root is now ${rootOf(snap(c))}. Only the path from the new leaf to the root was hashed: ${plural(c.computed, 'hash', 'hashes')}.`,
      ['ap.sig'],
      1,
      [mark(hashId(c.hashes.length - 1, 0), 'found')],
    );
    return snap(c);
  },
};

/** The sibling hashes from leaf i up to the root. */
export function proofFor(hashes: string[][], i: number, odd: MerkleSettings['odd']): ProofItem[] {
  const items: ProofItem[] = [];
  let p = i;
  for (let k = 0; k < hashes.length - 1; k++) {
    const lvl = hashes[k]!;
    const sib = p ^ 1;
    if (sib < lvl.length) items.push({ side: sib < p ? 'L' : 'R', hash: lvl[sib]!, level: k });
    else if (odd === 'duplicate') items.push({ side: 'R', hash: lvl[p]!, level: k });
    else items.push({ side: null, hash: '', level: k });
    p >>= 1;
  }
  return items;
}

function* proveAndCheck(
  s: S,
  st: MerkleSettings,
  i: number,
  data: string,
  name: string,
  tamper: boolean,
): Generator<MStep, S, void> {
  const c = ctx(s, st, { i });
  const items = proofFor(c.hashes, i, c.odd);
  const root = rootOf(s)!;
  c.extra.proof = { leaf: i, items: [], used: 0, data };
  yield step(
    c,
    `${name}: to show that ${tamper ? `"${data}" is block ${i}` : `block ${i}, "${data}", is in the tree`}, send the sibling of every node on the path from leaf ${i} to the root. That is the proof.`,
    ['pf.sig'],
    2,
    [mark(hashId(0, i), 'active'), mark(blockId(i), 'active')],
  );
  // Collect the proof one level at a time.
  let p = i;
  for (let k = 0; k < items.length; k++) {
    const it = items[k]!;
    c.extra.proof.items.push(it);
    const sib = p ^ 1;
    yield step(
      c,
      it.side === null
        ? `Level ${k}: the node on the path has no sibling and was moved up as it is. Nothing to send.`
        : sib < c.hashes[k]!.length
          ? `Level ${k}: the sibling on the ${it.side === 'L' ? 'left' : 'right'} is ${it.hash}. Add it to the proof.`
          : `Level ${k}: no sibling, so the node was paired with itself: send its own hash, ${it.hash}.`,
      ['pf.sib'],
      2,
      [
        ...(it.side !== null && sib < c.hashes[k]!.length ? [mark(hashId(k, sib), 'visit')] : []),
        mark(hashId(k, p), 'active'),
        ...(it.side !== null ? [mark(proofId(k), 'visit')] : []),
      ],
    );
    p >>= 1;
  }
  const size = items.filter((it) => it.side !== null).length;
  c.vars['proof size'] = size;
  // Verify: start from the claimed data and fold the proof in.
  let h = hash(data);
  c.computed += 1;
  c.extra.proof.computed = h;
  yield step(
    c,
    `Verify, as someone who has only the root ${root}, the data and the ${plural(size, 'hash', 'hashes')} of the proof: start with H("${data}") = ${h}.`,
    ['vf.start'],
    2,
    [mark('computed', 'active')],
  );
  for (let k = 0; k < items.length; k++) {
    const it = items[k]!;
    c.extra.proof.used = k + 1;
    if (it.side === null) {
      yield step(
        c,
        `Level ${k}: no sibling, so the hash moves up unchanged: ${h}.`,
        ['vf.fold'],
        3,
        [mark('computed', 'active')],
      );
      continue;
    }
    const next = it.side === 'L' ? hash(it.hash + h) : hash(h + it.hash);
    c.computed += 1;
    yield step(
      c,
      it.side === 'L'
        ? `Level ${k}: the sibling is on the left: H(${it.hash} ‖ ${h}) = ${next}.`
        : `Level ${k}: the sibling is on the right: H(${h} ‖ ${it.hash}) = ${next}.`,
      ['vf.fold'],
      2,
      [mark(proofId(k), 'visit'), mark('computed', 'active')],
    );
    h = next;
    c.extra.proof.computed = h;
  }
  const ok = h === root;
  c.vars.verified = ok ? 'yes' : 'no';
  yield step(
    c,
    ok
      ? `${h} equals the root ${root}: block ${i} is in the tree. ${plural(size, 'hash', 'hashes')} in the proof, about log₂ n, instead of all ${plural(s.blocks.length, 'block')}.`
      : `${h} is not the root ${root}: rejected. "${data}" is not block ${i}, and no one can make up a proof that says it is, short of breaking the hash.`,
    ['vf.check'],
    1,
    [
      mark('computed', ok ? 'found' : 'error'),
      mark(hashId(c.hashes.length - 1, 0), ok ? 'found' : 'error'),
    ],
  );
  return s;
}

const prove: Op = {
  label: 'Prove block',
  arity: 1,
  *run(s, [raw], { settings }) {
    const i = parseIndex(raw!);
    if (i instanceof Error)
      return yield* refuse(s, settings, `prove(${String(raw)}): ${i.message}`, 'pf.sig', {
        label: 'i',
        text: String(raw),
      });
    if (i < 0 || i >= s.blocks.length)
      return yield* refuse(
        s,
        settings,
        s.blocks.length === 0
          ? `prove(${i}): build the tree first.`
          : `prove(${i}): the blocks are numbered 0 to ${s.blocks.length - 1}.`,
        'pf.sig',
        { label: 'i', text: String(i) },
      );
    return yield* proveAndCheck(s, settings, i, s.blocks[i]!.data, `prove(${i})`, false);
  },
};

const verify: Op = {
  label: 'Check a claim',
  arity: 2,
  *run(s, [rawI, rawD], { settings }) {
    const name = `verify(${String(rawI)}, ${String(rawD)})`;
    const i = parseIndex(rawI!);
    if (i instanceof Error)
      return yield* refuse(s, settings, `${name}: ${i.message}`, 'pf.sig', {
        label: 'i',
        text: String(rawI),
      });
    const d = parseData(rawD!);
    if (d instanceof Error)
      return yield* refuse(s, settings, `${name}: ${d.message}`, 'pf.sig', {
        label: 'data',
        text: String(rawD),
      });
    if (i < 0 || i >= s.blocks.length)
      return yield* refuse(
        s,
        settings,
        s.blocks.length === 0
          ? `${name}: build the tree first.`
          : `${name}: the blocks are numbered 0 to ${s.blocks.length - 1}.`,
        'pf.sig',
        { label: 'i', text: String(i) },
      );
    return yield* proveAndCheck(s, settings, i, d, name, true);
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = ctx({ blocks: [], hashes: [], nextUid: s.nextUid }, settings);
    yield step(c, 'clear(): no blocks, no tree.', ['clr.reset'], 1, []);
    return snap(c);
  },
};

export const ops = { build, update, append, prove, verify, clear };

// ---------------------------------------------------------------------------------------------

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: MerkleSettings): PseudoBlock[] {
  const dup = st.odd === 'duplicate';
  const recompute = [
    L('rc.sig', 0, 'rehash(path)', 'To bring the hashes up to date:'),
    L(
      'rc.mark',
      1,
      'every node above a changed block is stale',
      'everything above the change is out of date.',
    ),
    L('rc.leaf', 1, 'leaf.hash = H(block)', 'Hash the block into its leaf,'),
    L(
      'rc.node',
      1,
      'node.hash = H(left.hash ‖ right.hash)',
      'then each parent from its two children.',
    ),
    L(
      'rc.promote',
      1,
      dup
        ? 'no right child: node.hash = H(left.hash ‖ left.hash)'
        : 'no right child: node.hash = left.hash',
      dup ? 'A lone child is paired with itself.' : 'A lone child moves up as it is.',
    ),
  ];
  const proof = [
    L('pf.sig', 0, 'proof(i)', 'To prove block i is in the tree:'),
    L(
      'pf.sib',
      1,
      'for each node on the path from leaf i up: send its sibling’s hash and side',
      'send the sibling of each node on the path.',
    ),
    L('vf.start', 0, 'verify(data, proof, root): h = H(data)', 'To check it: hash the data,'),
    L(
      'vf.fold',
      1,
      'for each (side, s) in proof: h = side == L ? H(s ‖ h) : H(h ‖ s)',
      'combine it with each sibling in the right order,',
    ),
    L('vf.check', 1, 'return h == root', 'and compare the result with the root.'),
  ];
  return [
    {
      op: 'build',
      lines: [L('bd.sig', 0, 'build(blocks)', 'To build the tree from the blocks:'), ...recompute],
    },
    {
      op: 'update',
      lines: [L('up.sig', 0, 'update(i, data)', 'To change block i:'), ...recompute],
    },
    {
      op: 'append',
      lines: [L('ap.sig', 0, 'append(data)', 'To add a block at the end:'), ...recompute],
    },
    { op: 'prove', lines: proof },
    { op: 'verify', lines: proof },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To start over:'),
        L('clr.reset', 1, 'blocks = []', 'drop every block.'),
      ],
    },
  ];
}

export function initialSay(_s: S, st: MerkleSettings): string {
  return `An empty Merkle tree. Build one from a few blocks of data. A node with no partner ${st.odd === 'duplicate' ? 'is paired with itself, as in Bitcoin' : 'moves up unchanged'}. The hash here is a 16-bit toy, shown in hex, so you can read it.`;
}

export function initialVars(): Record<string, Scalar> {
  return { blocks: 0, height: -1, root: '–', 'hashes computed': 0 };
}

export function describe(s: S): string {
  if (s.blocks.length === 0) return 'An empty Merkle tree.';
  return `A Merkle tree over ${plural(s.blocks.length, 'block')}: ${s.blocks.map((b) => b.data).join(', ')}. The leaf hashes are ${s.hashes[0]!.join(', ')}. The root is ${rootOf(s)}.`;
}
