/**
 * Paged attention (Kwon et al. 2023, the vLLM paper): the KV cache of every request lives in
 * fixed-size blocks taken from one pool, the way an operating system pages memory. Each request
 * (a sequence) has a block table that maps its logical blocks (tokens 1 to B, B + 1 to 2B, ...)
 * to physical blocks anywhere in the pool. Only a slot's position matters here, so a slot shows
 * the position of the token whose key and value it holds.
 *
 *   add(n)      a request with a prompt of n tokens: ⌈n / B⌉ blocks popped off the free list
 *   step        every running request writes one more token; a request gets a new block only
 *               when its last block is full
 *   finish(X)   request X is done: every block's reference count drops by one, and a block no
 *               one uses goes back on the free list
 *   fork(X)     parallel sampling: a new request that starts from X's prompt and tokens. With
 *               sharing on, it points at X's blocks and their reference counts go up; the first
 *               write to a shared, partly filled block copies it first (copy-on-write). With
 *               sharing off, every block is copied at once.
 *
 * The pool always holds 48 slots: 24 blocks of 2, 12 of 4 or 6 of 8. The free list is a stack:
 * a block is popped off the top and a freed block is pushed back on top, so the block freed last
 * is the next one used. When a request needs a block and none is free, it waits that step
 * (vLLM would preempt the newest request instead).
 *
 * Settings
 *   block    tokens per block, B: '2', '4' (the default) or '8'
 *   sharing  true: a fork shares its parent's blocks, with reference counts and copy-on-write
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';

export type BlockSetting = '2' | '4' | '8';

export interface PagedSettings {
  [key: string]: Scalar;
  block: BlockSetting;
  sharing: boolean;
}

export const defaults: PagedSettings = { block: '4', sharing: true };

/** Slots in the pool, whatever the block size. */
export const POOL_SLOTS = 48;
/** The longest a request may get, prompt included: what a contiguous layout reserves. */
export const MAX_LEN = 16;
/** Requests running at once. */
export const MAX_SEQS = 6;
export const NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const sizeOf = (settings: PagedSettings): number => Number(settings.block);
export const blocksOf = (settings: PagedSettings): number => POOL_SLOTS / sizeOf(settings);

export interface Block {
  /** How many block tables point at this block; 0 when it is free. */
  ref: number;
  /** The positions (1-based) of the tokens it holds, in slot order. */
  tokens: number[];
}

export interface Seq {
  name: string;
  /** Logical block i is physical block table[i]. */
  table: number[];
  /** Tokens so far, prompt included. */
  len: number;
  prompt: number;
  /** The request it was forked from. */
  parent?: string;
}

export interface PagedState {
  blocks: Block[];
  /** The free list, top first: free[0] is the next block handed out. */
  free: number[];
  /** Running requests, oldest first. */
  seqs: Seq[];
  /** Names handed out so far (A is the first). */
  named: number;
  /** Blocks copied so far: copy-on-write, or a fork without sharing. */
  copies: number;
}

export interface PagedExtra {
  /** A block just copied: its tokens slide in from the block they were copied from. */
  copied?: { from: number; to: number };
}

type S = PagedState;
type X = PagedExtra;
type Op = OpSpec<S, PagedSettings, X>;
type PStep = Step<S, X>;

export function init(settings: PagedSettings): S {
  const n = blocksOf(settings);
  return {
    blocks: Array.from({ length: n }, () => ({ ref: 0, tokens: [] })),
    free: Array.from({ length: n }, (_, i) => i),
    seqs: [],
    named: 0,
    copies: 0,
  };
}

const clone = (s: S): S => ({
  ...s,
  blocks: s.blocks.map((b) => ({ ref: b.ref, tokens: [...b.tokens] })),
  free: [...s.free],
  seqs: s.seqs.map((q) => ({ ...q, table: [...q.table] })),
});

/** A new state with `f` applied: earlier steps keep the states they showed. */
function edit(s: S, f: (t: S) => void): S {
  const t = clone(s);
  f(t);
  return t;
}

export const seqOf = (s: S, name: string): Seq | undefined => s.seqs.find((q) => q.name === name);

// ---------------------------------------------------------------------------------------------
// Readouts

export const blocksInUse = (s: S): number => s.blocks.filter((b) => b.ref > 0).length;
/** Tokens the pool holds: a shared block counts once. */
export const storedTokens = (s: S): number =>
  s.blocks.reduce((t, b) => t + (b.ref > 0 ? b.tokens.length : 0), 0);
/** Tokens the requests have: a shared token counts once per request that reads it. */
export const totalTokens = (s: S): number => s.seqs.reduce((t, q) => t + q.len, 0);
/** Slots handed out but empty: only ever in a request's last block. */
export const wasted = (s: S, settings: PagedSettings): number =>
  blocksInUse(s) * sizeOf(settings) - storedTokens(s);
/** The same requests, each in one contiguous piece of MAX_LEN slots, nothing shared. */
export const wastedContiguous = (s: S): number => s.seqs.length * MAX_LEN - totalTokens(s);

export function vars(s: S, settings: PagedSettings): Record<string, Scalar> {
  return {
    requests: s.seqs.length,
    tokens: totalTokens(s),
    'blocks in use': blocksInUse(s),
    'free blocks': s.free.length,
    'wasted slots': wasted(s, settings),
    'wasted if contiguous': wastedContiguous(s),
    'shared blocks': s.blocks.filter((b) => b.ref > 1).length,
    'copied blocks': s.copies,
  };
}

// ---------------------------------------------------------------------------------------------
// Words

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A", "A and D", "A, C and D". */
export function list(xs: readonly (string | number)[]): string {
  const s = xs.map(String);
  if (s.length <= 1) return s.join('');
  return `${s.slice(0, -1).join(', ')} and ${s.at(-1)}`;
}

export const tableText = (q: Seq): string => `[${q.table.join(', ')}]`;

/** Who points at block p, oldest first. */
export const readersOf = (s: S, p: number): string[] =>
  s.seqs.filter((q) => q.table.includes(p)).map((q) => q.name);

/** Tokens a to b, or token a. */
const span = (tokens: readonly number[]) =>
  tokens.length === 1
    ? `token ${tokens[0]}`
    : `tokens ${tokens[0]} ${tokens.length === 2 ? 'and' : 'to'} ${tokens.at(-1)}`;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
/** Every slot of block p, and its header. */
export const blockMarks = (p: number, size: number, role: Mark['role']): Mark[] => [
  ...Array.from({ length: size }, (_, i) => mark(`b-${p}-${i}`, role)),
  mark(`b-${p}-h`, role),
];
const entryMark = (name: string, i: number, role: Mark['role']) => mark(`t-${name}-${i}`, role);
const rowMarks = (q: Seq, role: Mark['role']) => [
  mark(`t-${q.name}`, role),
  ...q.table.map((_, i) => entryMark(q.name, i, role)),
];

function refuse(s: S, settings: PagedSettings, say: string): PStep {
  return { state: s, marks: [], say, lines: [], level: 1, vars: vars(s, settings) };
}

/** Read a prompt length, or say what is wrong. */
export function parseLength(v: Value | undefined): number | string {
  const n = typeof v === 'number' ? v : /^\s*\d+\s*$/.test(String(v ?? '')) ? Number(v) : NaN;
  if (!Number.isInteger(n))
    return `Add takes a prompt length: a whole number of tokens from 1 to ${MAX_LEN}, such as 5.`;
  if (n < 1 || n > MAX_LEN)
    return `A prompt here has 1 to ${MAX_LEN} tokens (${MAX_LEN} is the longest a request may get).`;
  return n;
}

/** Read a request's letter, or say what is wrong. */
export function parseName(s: S, v: Value | undefined, what: string): string | { error: string } {
  const running = s.seqs.length
    ? ` Running now: ${list(s.seqs.map((q) => q.name))}.`
    : ' No request is running.';
  const name = String(v ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]$/.test(name))
    return { error: `${what} takes a request's letter, such as A.${running}` };
  if (!seqOf(s, name)) return { error: `There is no running request ${name}.${running}` };
  return name;
}

// ---------------------------------------------------------------------------------------------
// Operations

const addOp: Op = {
  label: 'Add',
  arity: 1,
  *run(s, args, { settings }) {
    const n = parseLength(args[0]);
    if (typeof n === 'string') {
      yield refuse(s, settings, n);
      return s;
    }
    if (s.seqs.length >= MAX_SEQS) {
      yield refuse(s, settings, `This toy runs at most ${MAX_SEQS} requests at once. Finish one first.`);
      return s;
    }
    if (s.named >= NAMES.length) {
      yield refuse(s, settings, 'All 26 letters are used. Start a new example to add more.');
      return s;
    }
    const B = sizeOf(settings);
    const need = Math.ceil(n / B);
    if (need > s.free.length) {
      yield refuse(
        s,
        settings,
        `A prompt of ${plural(n, 'token')} needs ${plural(need, 'block')} of ${B}, and ${s.free.length === 0 ? 'none is' : `only ${s.free.length} ${s.free.length === 1 ? 'is' : 'are'}`} free. A real server keeps the request waiting until enough blocks are free.`,
      );
      return s;
    }
    const name = NAMES[s.named]!;
    let state = edit(s, (t) => {
      t.named++;
      t.seqs.push({ name, table: [], len: 0, prompt: n });
    });
    for (let k = 0; k < need; k++) {
      const p = state.free[0]!;
      const tokens = Array.from({ length: Math.min(B, n - k * B) }, (_, i) => k * B + i + 1);
      state = edit(state, (t) => {
        t.free.shift();
        t.blocks[p] = { ref: 1, tokens };
        const q = seqOf(t, name)!;
        q.table.push(p);
        q.len += tokens.length;
      });
      const q = seqOf(state, name)!;
      yield {
        state,
        marks: [
          ...blockMarks(p, B, 'new'),
          entryMark(name, k, 'new'),
          mark(`t-${name}`, 'active'),
        ],
        say: `${k === 0 ? `Request ${name} arrives with a prompt of ${plural(n, 'token')}. ` : ''}Pop block ${p} off the free list for ${name}'s logical block ${k}, and write ${span(tokens)} into it.${tokens.length < B ? ` ${plural(B - tokens.length, 'slot')} ${B - tokens.length === 1 ? 'stays' : 'stay'} empty until ${name} writes more.` : ''}`,
        lines: k === 0 ? ['a-sig', 'a-pop', 'a-write'] : ['a-pop', 'a-write'],
        level: 2,
        vars: vars(state, settings),
      };
      if (q.len === n) break;
    }
    const q = seqOf(state, name)!;
    const empty = need * B - n;
    yield {
      state,
      marks: rowMarks(q, 'found'),
      say: `${name}'s block table is ${tableText(q)}: ${plural(need, 'block')} for ${plural(n, 'token')}, ${empty === 0 ? 'with no slot empty' : `with ${plural(empty, 'slot')} empty in the last`}. A contiguous layout would reserve all ${MAX_LEN} slots now and leave ${MAX_LEN - n} empty.`,
      lines: ['a-ret'],
      level: 1,
      vars: vars(state, settings),
    };
    return state;
  },
};

const stepOp: Op = {
  label: 'Step',
  arity: 0,
  *run(s, _args, { settings }) {
    if (!s.seqs.length) {
      yield refuse(
        s,
        settings,
        'No request is running. Type a prompt length, such as 5, and press Add.',
      );
      return s;
    }
    const B = sizeOf(settings);
    let state = s;
    const wrote: string[] = [];
    const full: string[] = [];
    const stalled: string[] = [];
    let fresh = 0;
    let copied = 0;
    for (const { name } of s.seqs) {
      const q = seqOf(state, name)!;
      if (q.len >= MAX_LEN) {
        full.push(name);
        continue;
      }
      const k = q.table.length - 1;
      const last = q.table[k]!;
      const blk = state.blocks[last]!;
      const isFull = blk.tokens.length === B;
      const shared = !isFull && blk.ref > 1;
      if ((isFull || shared) && !state.free.length) {
        stalled.push(name);
        yield {
          state,
          marks: [mark(`t-${name}`, 'error'), entryMark(name, k, 'error')],
          say: `${name} needs ${isFull ? 'a new block' : 'a block to copy into'}, and the free list is empty, so ${name} waits this step. (vLLM would preempt the newest request: evict all of its blocks and swap them out or recompute them later.)`,
          lines: isFull ? ['s-full', 's-pop'] : ['s-shared', 's-copy'],
          level: 2,
          vars: vars(state, settings),
        };
        continue;
      }
      if (isFull) {
        const p = state.free[0]!;
        state = edit(state, (t) => {
          t.free.shift();
          t.blocks[p] = { ref: 1, tokens: [] };
          seqOf(t, name)!.table.push(p);
        });
        fresh++;
        yield {
          state,
          marks: [
            ...blockMarks(p, B, 'new'),
            entryMark(name, k + 1, 'new'),
            mark(`t-${name}`, 'active'),
          ],
          say: `${name}'s last block, ${last}, is full. Pop block ${p} off the free list for logical block ${k + 1}.`,
          lines: ['s-loop', 's-full', 's-pop'],
          level: 2,
          vars: vars(state, settings),
        };
      } else if (shared) {
        const p = state.free[0]!;
        const others = readersOf(state, last).filter((r) => r !== name);
        state = edit(state, (t) => {
          t.free.shift();
          t.blocks[p] = { ref: 1, tokens: [...blk.tokens] };
          t.blocks[last]!.ref--;
          seqOf(t, name)!.table[k] = p;
          t.copies++;
        });
        copied++;
        yield {
          state,
          marks: [
            ...blockMarks(p, B, 'new'),
            ...blockMarks(last, B, 'visit'),
            entryMark(name, k, 'new'),
            mark(`t-${name}`, 'active'),
          ],
          say: `${name} would write into block ${last}, but ${list(others)} ${others.length === 1 ? 'reads' : 'read'} it too (reference count ${blk.ref}). Copy on write: pop block ${p}, copy ${span(blk.tokens)} into it, and point ${name}'s logical block ${k} at ${p}. Block ${last}'s count drops to ${blk.ref - 1}.`,
          lines: ['s-loop', 's-shared', 's-copy'],
          level: 2,
          vars: vars(state, settings),
          extra: { copied: { from: last, to: p } },
        };
      }
      const now = seqOf(state, name)!;
      const p = now.table.at(-1)!;
      const slot = state.blocks[p]!.tokens.length;
      state = edit(state, (t) => {
        const r = seqOf(t, name)!;
        r.len++;
        t.blocks[p]!.tokens.push(r.len);
      });
      wrote.push(name);
      const ref = state.blocks[p]!.ref;
      yield {
        state,
        marks: [
          mark(`b-${p}-${slot}`, 'new'),
          entryMark(name, now.table.length - 1, 'active'),
          mark(`t-${name}`, 'active'),
        ],
        say: `${name} writes token ${now.len + 1} into block ${p}, slot ${slot + 1} of ${B}.${!isFull && !shared && ref === 1 && slot > 0 ? ' There was room, so no block is needed.' : ''}`,
        lines: ['s-loop', 's-write'],
        level: 3,
        vars: vars(state, settings),
      };
    }

    const parts = [
      wrote.length
        ? `${list(wrote)} ${wrote.length === 1 ? 'wrote one token' : 'each wrote one token'}`
        : 'No request wrote a token',
      fresh ? `${plural(fresh, 'new block')}` : '',
      copied ? `${plural(copied, 'block')} copied on write` : '',
    ].filter(Boolean);
    const notes = [
      full.length
        ? `${list(full)} ${full.length === 1 ? 'is' : 'are'} at the maximum length, ${MAX_LEN} tokens: finish ${full.length === 1 ? 'it' : 'them'} to free the blocks.`
        : '',
      stalled.length
        ? `${list(stalled)} waited for a free block: finish a request to free some.`
        : '',
    ].filter(Boolean);
    const sum =
      parts.length > 1 ? `${parts[0]}; ${parts.slice(1).join(' and ')}.` : `${parts[0]}.`;
    yield {
      state,
      marks: wrote.flatMap((n) => [mark(`t-${n}`, 'found')]),
      say: `Step done. ${sum} ${blocksInUse(state)} of ${state.blocks.length} blocks are in use, with ${wasted(state, settings) === 0 ? 'no slot' : plural(wasted(state, settings), 'slot')} wasted.${notes.length ? ` ${notes.join(' ')}` : ''}`,
      lines: ['s-ret'],
      level: 1,
      vars: vars(state, settings),
    };
    return state;
  },
};

const finishOp: Op = {
  label: 'Finish',
  arity: 1,
  *run(s, args, { settings }) {
    const name = parseName(s, args[0], 'Finish');
    if (typeof name !== 'string') {
      yield refuse(s, settings, name.error);
      return s;
    }
    const B = sizeOf(settings);
    const q = seqOf(s, name)!;
    let state = s;
    const freed: number[] = [];
    const kept: number[] = [];
    // Last block first, so the first block ends up on top of the free list.
    for (let k = q.table.length - 1; k >= 0; k--) {
      const p = q.table[k]!;
      const ref = state.blocks[p]!.ref - 1;
      state = edit(state, (t) => {
        t.blocks[p]!.ref = ref;
        if (ref === 0) {
          t.blocks[p]!.tokens = [];
          t.free.unshift(p);
        }
        // The table lets go of the block: what is left are full blocks.
        const r = seqOf(t, name)!;
        r.table.pop();
        r.len = r.table.length * B;
      });
      (ref === 0 ? freed : kept).push(p);
      const others = readersOf(state, p).filter((r) => r !== name);
      yield {
        state,
        marks: [
          ...blockMarks(p, B, ref === 0 ? 'remove' : 'visit'),
          mark(`t-${name}`, 'remove'),
          ...(ref === 0 ? [mark(`f-${p}`, 'new')] : []),
        ],
        say:
          ref === 0
            ? `${k === q.table.length - 1 ? `${name} is done. ` : ''}Block ${p}: its reference count drops to 0, so no one uses it. Push it on the free list.`
            : `${k === q.table.length - 1 ? `${name} is done. ` : ''}Block ${p}: its reference count drops to ${ref}. ${list(others)} still ${others.length === 1 ? 'reads' : 'read'} it, so it stays.`,
        lines: ref === 0 ? ['f-sig', 'f-loop', 'f-dec', 'f-push'] : ['f-loop', 'f-dec'],
        level: 2,
        vars: vars(state, settings),
      };
    }
    state = edit(state, (t) => {
      t.seqs = t.seqs.filter((r) => r.name !== name);
    });
    yield {
      state,
      marks: freed.flatMap((p) => [mark(`f-${p}`, 'found')]),
      say: `${name} is gone. ${freed.length ? `${plural(freed.length, 'block')} went back on the free list (${list(freed)})` : 'No block went back on the free list'}${kept.length ? `; ${plural(kept.length, 'block')} stayed, because another request still reads ${kept.length === 1 ? 'it' : 'them'}` : ''}. ${state.free.length} of ${state.blocks.length} blocks are free.`,
      lines: ['f-ret'],
      level: 1,
      vars: vars(state, settings),
    };
    return state;
  },
};

const forkOp: Op = {
  label: 'Fork',
  arity: 1,
  *run(s, args, { settings }) {
    const name = parseName(s, args[0], 'Fork');
    if (typeof name !== 'string') {
      yield refuse(s, settings, name.error);
      return s;
    }
    if (s.seqs.length >= MAX_SEQS) {
      yield refuse(s, settings, `This toy runs at most ${MAX_SEQS} requests at once. Finish one first.`);
      return s;
    }
    if (s.named >= NAMES.length) {
      yield refuse(s, settings, 'All 26 letters are used. Start a new example to add more.');
      return s;
    }
    const B = sizeOf(settings);
    const q = seqOf(s, name)!;
    const child = NAMES[s.named]!;
    if (!settings.sharing && q.table.length > s.free.length) {
      yield refuse(
        s,
        settings,
        `Without sharing, a fork copies all of ${name}'s ${plural(q.table.length, 'block')}, and only ${s.free.length} ${s.free.length === 1 ? 'is' : 'are'} free. Turn sharing on, or finish a request first.`,
      );
      return s;
    }
    let state = edit(s, (t) => {
      t.named++;
      t.seqs.push({
        name: child,
        table: settings.sharing ? [...q.table] : [],
        len: settings.sharing ? q.len : 0,
        prompt: q.prompt,
        parent: name,
      });
      // A shared block has one more reader at once, so the counts always match the tables.
      if (settings.sharing) for (const p of q.table) t.blocks[p]!.ref++;
    });
    if (settings.sharing) {
      const kid = seqOf(state, child)!;
      yield {
        state,
        marks: [...rowMarks(kid, 'new'), ...rowMarks(q, 'active')],
        say: `Fork ${name} for parallel sampling: ${child} is a second answer to the same prompt. Its block table is a copy of ${name}'s, ${tableText(kid)}: the same physical blocks, nothing copied in the pool.`,
        lines: ['k-sig', 'k-table'],
        level: 2,
        vars: vars(state, settings),
      };
      const shared = q.table.filter((p) => state.blocks[p]!.ref > 1);
      const last = state.blocks[q.table.at(-1)!]!;
      yield {
        state,
        marks: [...q.table.flatMap((p) => blockMarks(p, B, 'found')), ...rowMarks(kid, 'found')],
        say: `Add one to the reference count of each of those ${plural(shared.length, 'block')}: ${list(q.table.map((p) => `${p} (${state.blocks[p]!.ref})`))}. ${child} costs no new memory yet.${last.tokens.length < B ? ` The last block is not full, so the first of ${name} and ${child} to write a token will copy it first.` : ' The last block is full, so both will get new blocks of their own as they write.'}`,
        lines: ['k-ref'],
        level: 1,
        vars: vars(state, settings),
      };
      return state;
    }
    for (const [k, from] of q.table.entries()) {
      const p = state.free[0]!;
      state = edit(state, (t) => {
        t.free.shift();
        t.blocks[p] = { ref: 1, tokens: [...t.blocks[from]!.tokens] };
        const kid = seqOf(t, child)!;
        kid.table.push(p);
        kid.len += t.blocks[from]!.tokens.length;
        t.copies++;
      });
      yield {
        state,
        marks: [
          ...blockMarks(p, B, 'new'),
          ...blockMarks(from, B, 'visit'),
          entryMark(child, k, 'new'),
          mark(`t-${child}`, 'active'),
        ],
        say: `${k === 0 ? `Fork ${name} for parallel sampling, without sharing: ${child} gets its own copy of everything. ` : ''}Pop block ${p} and copy block ${from} into it (${span(state.blocks[from]!.tokens)}).`,
        lines: k === 0 ? ['k-sig', 'k-loop', 'k-copy'] : ['k-loop', 'k-copy'],
        level: 2,
        vars: vars(state, settings),
        extra: { copied: { from, to: p } },
      };
    }
    const kid = seqOf(state, child)!;
    yield {
      state,
      marks: rowMarks(kid, 'found'),
      say: `${child}'s block table is ${tableText(kid)}: ${plural(kid.table.length, 'block')} copied, the same tokens as ${name} held twice. With sharing, the fork would have cost no block at all.`,
      lines: ['k-ret'],
      level: 1,
      vars: vars(state, settings),
    };
    return state;
  },
};

export const ops = { add: addOp, step: stepOp, finish: finishOp, fork: forkOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PagedSettings): PseudoBlock[] {
  const B = sizeOf(settings);
  const add = [
    L('a-sig', 0, 'ADD(prompt of n tokens)', 'A new request arrives with n tokens of prompt:'),
    L(
      'a-pop',
      1,
      `for each of the ⌈n / ${B}⌉ blocks: p = POP(free); ref[p] = 1; append p to table`,
      `take a block off the free list for every ${B} tokens,`,
    ),
    L('a-write', 1, 'write the next tokens’ keys and values into p', 'and fill it with them.'),
    L('a-ret', 1, 'return table', 'Its block table lists where its tokens are.'),
  ];
  const step = [
    L('s-sig', 0, 'STEP()', 'Every running request writes one more token:'),
    L('s-loop', 1, 'for each running request r:', 'for each request, oldest first,'),
    L('s-full', 2, 'if r’s last block is full:', 'if its last block has no room left,'),
    L(
      's-pop',
      3,
      'p = POP(free); ref[p] = 1; append p to r.table',
      'take a new block off the free list;',
    ),
    ...(settings.sharing
      ? [
          L(
            's-shared',
            2,
            'else if ref[last] > 1:',
            'if another request also reads its last block,',
          ),
          L(
            's-copy',
            3,
            'p = POP(free); copy last into p; ref[last] −= 1; r.table[−1] = p',
            'copy that block first and use the copy.',
          ),
        ]
      : []),
    L('s-write', 2, 'write r’s new key and value into r.table[−1]', 'Then write the token in.'),
    L('s-ret', 1, 'return', 'Every request is one token longer.'),
  ];
  const finish = [
    L('f-sig', 0, 'FINISH(r)', 'A request is done:'),
    L('f-loop', 1, 'for each p in r.table, last first:', 'for each of its blocks, last first,'),
    L('f-dec', 2, 'ref[p] −= 1', 'one fewer request reads it;'),
    L('f-push', 2, 'if ref[p] = 0: PUSH(free, p)', 'if no one does, it goes back on the free list.'),
    L('f-ret', 1, 'remove r', 'The request is gone.'),
  ];
  const fork = settings.sharing
    ? [
        L('k-sig', 0, 'FORK(r)', 'Start a second answer to the same prompt:'),
        L('k-table', 1, 'c.table = copy of r.table', 'it gets a copy of the block table,'),
        L(
          'k-ref',
          1,
          'for each p in r.table: ref[p] += 1',
          'and every block has one more reader. Nothing is copied yet.',
        ),
      ]
    : [
        L('k-sig', 0, 'FORK(r)', 'Start a second answer to the same prompt:'),
        L('k-loop', 1, 'for each p in r.table:', 'for each of the request’s blocks,'),
        L(
          'k-copy',
          2,
          'q = POP(free); copy p into q; append q to c.table',
          'take a free block and copy the block into it.',
        ),
        L('k-ret', 1, 'return c.table', 'The new request has its own copy of everything.'),
      ];
  return [
    { op: 'add', lines: add },
    { op: 'step', lines: step },
    { op: 'finish', lines: finish },
    { op: 'fork', lines: fork },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, settings: PagedSettings): string {
  return `An empty pool: ${s.blocks.length} blocks of ${sizeOf(settings)} slots, ${POOL_SLOTS} slots in all, every block on the free list. Type a prompt length, such as 5, and press Add. Step makes every request one token longer.`;
}

export const initialVars = (s: S, settings: PagedSettings) => vars(s, settings);

export function describe(s: S, settings: PagedSettings): string {
  const running = s.seqs.length
    ? s.seqs
        .map((q) => `${q.name} (${plural(q.len, 'token')}, blocks ${q.table.join(' ')})`)
        .join('; ')
    : 'no requests';
  const shared = s.blocks.filter((b) => b.ref > 1).length;
  return `Pool of ${s.blocks.length} blocks of ${sizeOf(settings)}: ${running}. ${s.free.length} free${s.free.length ? `, next ${s.free.slice(0, 4).join(' ')}` : ''}.${shared ? ` ${plural(shared, 'block')} shared.` : ''}`;
}
