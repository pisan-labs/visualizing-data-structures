import type {
  Mark,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { fmt } from '../linked-list/model';

/** A node in memory. `next` and `prev` are uids, or null. */
export interface DNode {
  uid: number;
  value: Value;
  next: number | null;
  prev: number | null;
  /** The sentinel holds no value; the list starts at its next and ends at its prev. */
  sentinel?: boolean;
}

export interface DState {
  /**
   * Every node in memory, in drawing order: the sentinel first (when there is one), then the
   * list. During an operation it may also hold a node not linked in yet, or one just removed.
   */
  nodes: DNode[];
  /** Plain lists only. */
  head: number | null;
  tail: number | null;
  /** The sentinel's uid, when the list has one. */
  nil: number | null;
  size: number;
  nextUid: number;
}

export interface DSettings {
  [key: string]: Scalar;
  /** 'on': one sentinel node, L.nil, as in CLRS. 'off': head and tail pointers. */
  sentinel: 'on' | 'off';
}

export interface DExtra {
  /** Local pointer variables (cur, succ, new, tmp), by name. */
  ptrs?: Record<string, number | null>;
  nullAt?: Record<string, 'before' | 'after'>;
  /** A node made but not linked in yet. */
  pending?: number;
}

type S = DState;
type X = DExtra;
type Op = OpSpec<S, DSettings, X>;
type DStep = Step<S, X>;
type Ptr = 'next' | 'prev';

export const defaults: DSettings = { sentinel: 'on' };

/** The sentinel always has uid 0. */
const NIL = 0;

export function init(settings: DSettings): S {
  if (settings.sentinel === 'on') {
    return {
      nodes: [{ uid: NIL, value: 'nil', next: NIL, prev: NIL, sentinel: true }],
      head: null,
      tail: null,
      nil: NIL,
      size: 0,
      nextUid: 1,
    };
  }
  return { nodes: [], head: null, tail: null, nil: null, size: 0, nextUid: 1 };
}

export const nid = (uid: number) => `n${uid}`;
const linkMark = (uid: number, f: Ptr) => `n${uid}.${f}`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export function node(s: S, uid: number): DNode {
  const n = s.nodes.find((x) => x.uid === uid);
  if (!n) throw new Error(`no node ${uid}`);
  return n;
}

/** How a node is named in narration: its value, or "nil" for the sentinel. */
const name = (s: S, uid: number | null) =>
  uid === null ? 'null' : node(s, uid).sentinel ? 'nil' : fmt(node(s, uid).value);

function set(s: S, uid: number, f: Ptr, to: number | null): S {
  return { ...s, nodes: s.nodes.map((x) => (x.uid === uid ? { ...x, [f]: to } : x)) };
}

/** First and last real nodes. */
const first = (s: S) => (s.nil !== null ? node(s, s.nil).next! : s.head);
const last = (s: S) => (s.nil !== null ? node(s, s.nil).prev! : s.tail);
/** The end marker: the sentinel, or null. */
const end = (s: S) => s.nil;

/** The uids of the list, front to back. */
export function order(s: S): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let u = first(s); u !== end(s) && u !== null && !seen.has(u); u = node(s, u).next) {
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function values(s: S): Value[] {
  return order(s).map((u) => node(s, u).value);
}

export function chain(s: S): string {
  const vs = values(s).map(fmt);
  const shown = vs.length > 8 ? [...vs.slice(0, 3), '…', ...vs.slice(-2)] : vs;
  return s.nil !== null
    ? ['nil', ...shown, 'nil'].join(' ⇄ ')
    : ['null', ...shown, 'null'].join(' ⇄ ');
}

/** Memory once the garbage is collected: the sentinel, then the list in order. */
function tidy(s: S): S {
  const keep = s.nil !== null ? [s.nil, ...order(s)] : order(s);
  return { ...s, nodes: keep.map((u) => node(s, u)) };
}

const pv = (s: S, uid: number | null): Scalar =>
  uid === null ? null : node(s, uid).sentinel ? 'nil' : node(s, uid).value;

interface StepOpts {
  marks?: Mark[];
  level?: 1 | 2 | 3;
  vars?: Record<string, Scalar>;
  ptrs?: Record<string, number | null>;
  nullAt?: Record<string, 'before' | 'after'>;
  pending?: number;
}

function st(state: S, say: string, lines: string[], o: StepOpts = {}): DStep {
  const extra: X = {};
  if (o.ptrs) extra.ptrs = o.ptrs;
  if (o.nullAt) extra.nullAt = o.nullAt;
  if (o.pending !== undefined) extra.pending = o.pending;
  return {
    state,
    marks: o.marks ?? [],
    say,
    lines,
    vars: { ...o.vars, n: state.size },
    level: o.level ?? 2,
    extra,
  };
}

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

function badIndex(i: Value | undefined, max: number): string | null {
  if (typeof i !== 'number' || !Number.isInteger(i))
    return `The index must be a whole number, and ${i === undefined ? 'none was given' : `${fmt(i)} is not`}.`;
  if (i < 0 || i > max)
    return max < 0
      ? `The list is empty, so there is no index ${i}.`
      : max === 0
        ? `i = ${i} is out of range: the only valid index is 0.`
        : `i = ${i} is out of range: it must be from 0 to ${max}.`;
  return null;
}

function indexError(s: S, op: string, args: string, why: string): DStep {
  const l = last(s);
  const target = l === null || l === s.nil ? (s.nil !== null ? nid(s.nil) : 'p:head') : nid(l);
  return st(
    s,
    `${op}(${args}): ${why} Error: index out of range. The list does not change.`,
    [`${op}.check`, `${op}.error`],
    { marks: [mark(target, 'error')], level: 1 },
  );
}

/**
 * Walk a pointer called `ptr` to index i from whichever end is nearer, one hop per step.
 * Returns the node's uid.
 */
function* walkTo(
  s: S,
  op: string,
  ptr: string,
  i: number,
  ctx: { ptrs: Record<string, number | null>; pending?: number; vars: Record<string, Scalar> },
): Generator<DStep, number, void> {
  const front = i < s.size / 2;
  const hops = front ? i : s.size - 1 - i;
  let cur = front ? first(s)! : last(s)!;
  const from = s.nil !== null ? (front ? 'nil.next' : 'nil.prev') : front ? 'head' : 'tail';
  const vars = (h: number) => ({ ...ctx.vars, [ptr]: pv(s, cur), hops: h });
  yield st(
    s,
    front
      ? `i = ${i} is in the front half (n = ${s.size}), so start ${ptr} at the front, ${from} (${name(s, cur)}), and walk forward ${plural(hops, 'hop')}.`
      : `i = ${i} is in the back half (n = ${s.size}), so start ${ptr} at the back, ${from} (${name(s, cur)}), and walk back ${plural(hops, 'hop')}. A singly linked list would need ${plural(i, 'hop')}.`,
    [`${op}.half`, front ? `${op}.front` : `${op}.back`],
    {
      marks: [mark(`p:${ptr}`, 'active')],
      ptrs: { ...ctx.ptrs, [ptr]: cur },
      pending: ctx.pending,
      vars: vars(0),
    },
  );
  for (let h = 1; h <= hops; h++) {
    cur = front ? node(s, cur).next! : node(s, cur).prev!;
    yield st(
      s,
      `${ptr} = ${ptr}.${front ? 'next' : 'prev'}: ${ptr} moves to ${name(s, cur)}, index ${front ? h : s.size - 1 - h}.`,
      [front ? `${op}.fwalk` : `${op}.bwalk`, front ? `${op}.fmove` : `${op}.bmove`],
      {
        marks: [mark(`p:${ptr}`, 'active'), mark(nid(cur), 'visit')],
        ptrs: { ...ctx.ptrs, [ptr]: cur },
        pending: ctx.pending,
        vars: vars(h),
      },
    );
  }
  return cur;
}

/** One pointer assignment as a step. */
interface Update {
  line: string;
  uid: number;
  field: Ptr;
  to: number | null;
  say: string;
}

const insertHead: Op = {
  label: 'Insert at head',
  arity: 1,
  *run(s0, [x]) {
    return yield* insertNear(s0, 'insertHead', x as Value, 'front');
  },
};

const insertTail: Op = {
  label: 'Insert at tail',
  arity: 1,
  *run(s0, [x]) {
    return yield* insertNear(s0, 'insertTail', x as Value, 'back');
  },
};

/** insertHead and insertTail: link a new node in at one end, four pointer updates. */
function* insertNear(
  s0: S,
  op: string,
  value: Value,
  where: 'front' | 'back',
): Generator<DStep, S, void> {
  const v = fmt(value);
  const uid = s0.nextUid;
  const fresh = { uid, value, next: null, prev: null };
  const nodes =
    where === 'front'
      ? [
          ...s0.nodes.slice(0, s0.nil !== null ? 1 : 0),
          fresh,
          ...s0.nodes.slice(s0.nil !== null ? 1 : 0),
        ]
      : [...s0.nodes, fresh];
  let s: S = { ...s0, nodes, nextUid: uid + 1 };
  const ptrs = { new: uid };
  const vars = { x: value };
  yield st(
    s,
    `${op}(${v}): make a new node holding ${v}. Both its pointers are null for now.`,
    [`${op}.new`],
    { marks: [mark(nid(uid), 'new')], ptrs, pending: uid, vars },
  );

  const front = where === 'front';
  const updates: Update[] = [];
  if (s.nil !== null) {
    const nil = s.nil;
    const nb = front ? node(s, nil).next! : node(s, nil).prev!;
    const empty = nb === nil;
    const nbName = empty ? 'nil itself (the list is empty)' : name(s, nb);
    if (front) {
      updates.push(
        {
          line: `${op}.setNext`,
          uid,
          field: 'next',
          to: nb,
          say: `new.next = nil.next: the new node points forward to ${nbName}.`,
        },
        {
          line: `${op}.setPrev`,
          uid,
          field: 'prev',
          to: nil,
          say: 'new.prev = nil: and back to the sentinel. The list itself has not changed yet.',
        },
        {
          line: `${op}.fixSucc`,
          uid: nb,
          field: 'prev',
          to: uid,
          say: empty
            ? 'nil.next.prev = new: nil.next is nil, so this sets nil.prev. The new node is also the last one.'
            : `nil.next.prev = new: ${nbName} points back at the new node. This has to come before the next update, while nil.next still means ${nbName}.`,
        },
        {
          line: `${op}.fixPred`,
          uid: nil,
          field: 'next',
          to: uid,
          say: `nil.next = new: the sentinel points forward to ${v}. It is linked in.`,
        },
      );
    } else {
      updates.push(
        {
          line: `${op}.setNext`,
          uid,
          field: 'next',
          to: nil,
          say: 'new.next = nil: the new node points forward to the sentinel, as the last node must.',
        },
        {
          line: `${op}.setPrev`,
          uid,
          field: 'prev',
          to: nb,
          say: `new.prev = nil.prev: and back to ${nbName}. The list itself has not changed yet.`,
        },
        {
          line: `${op}.fixPred`,
          uid: nb,
          field: 'next',
          to: uid,
          say: empty
            ? 'nil.prev.next = new: nil.prev is nil, so this sets nil.next. The new node is also the first one.'
            : `nil.prev.next = new: ${nbName} points forward to the new node. This has to come before the next update, while nil.prev still means ${nbName}.`,
        },
        {
          line: `${op}.fixSucc`,
          uid: nil,
          field: 'prev',
          to: uid,
          say: `nil.prev = new: the sentinel points back to ${v}. It is linked in.`,
        },
      );
    }
  } else {
    const nb = front ? s.head : s.tail;
    const empty = nb === null;
    if (front) {
      updates.push(
        {
          line: `${op}.setNext`,
          uid,
          field: 'next',
          to: nb,
          say: empty
            ? 'new.next = head, which is null: the list is empty.'
            : `new.next = head: the new node points forward to ${name(s, nb)}.`,
        },
        {
          line: `${op}.setPrev`,
          uid,
          field: 'prev',
          to: null,
          say: 'new.prev = null: nothing comes before the first node.',
        },
      );
    } else {
      updates.push(
        {
          line: `${op}.setPrev`,
          uid,
          field: 'prev',
          to: nb,
          say: empty
            ? 'new.prev = tail, which is null: the list is empty.'
            : `new.prev = tail: the new node points back to ${name(s, nb)}.`,
        },
        {
          line: `${op}.setNext`,
          uid,
          field: 'next',
          to: null,
          say: 'new.next = null: nothing comes after the last node.',
        },
      );
    }
  }

  for (const u of updates) {
    s = set(s, u.uid, u.field, u.to);
    const linked = s.nil !== null && u === updates[updates.length - 1];
    yield st(s, u.say, [u.line], {
      marks: [mark(linkMark(u.uid, u.field), 'active')],
      ptrs,
      pending: linked ? undefined : uid,
      vars,
    });
  }

  if (s.nil === null) {
    const nb = front ? s.head : s.tail;
    const endName = front ? 'head' : 'tail';
    const other = front ? 'tail' : 'head';
    yield st(
      s,
      nb === null
        ? `Is ${endName} null? Yes, the list is empty, so the new node is also the ${front ? 'last' : 'first'} one.`
        : `Is ${endName} null? No, so ${name(s, nb)} has to point ${front ? 'back' : 'forward'} to the new node.`,
      [`${op}.check`],
      { ptrs, pending: uid, level: 3, vars },
    );
    if (nb === null) {
      s = { ...s, [other]: uid };
      yield st(s, `${other} = new.`, [`${op}.empty`], {
        marks: [mark(`p:${other}`, 'active')],
        ptrs,
        pending: uid,
        vars,
      });
    } else {
      s = set(s, nb, front ? 'prev' : 'next', uid);
      yield st(
        s,
        front
          ? `head.prev = new: ${name(s, nb)} points back to ${v}. This has to happen while head still means ${name(s, nb)}.`
          : `tail.next = new: ${name(s, nb)} points forward to ${v}. This has to happen while tail still means ${name(s, nb)}.`,
        [`${op}.link`],
        {
          marks: [mark(linkMark(nb, front ? 'prev' : 'next'), 'active')],
          ptrs,
          pending: uid,
          vars,
        },
      );
    }
    s = { ...s, [endName]: uid };
    yield st(
      s,
      `${endName} = new: ${v} is the ${front ? 'first' : 'last'} node now.`,
      [`${op}.end`],
      {
        marks: [mark(`p:${endName}`, 'active')],
        ptrs,
        vars,
      },
    );
  }

  s = { ...s, size: s.size + 1 };
  yield st(
    s,
    `n = ${s.size}. ${v} is at the ${front ? 'front' : 'back'}: ${chain(s)}.`,
    [`${op}.size`],
    {
      marks: [mark(nid(uid), 'done')],
      level: 1,
      vars,
    },
  );
  return s;
}

const insertAt: Op = {
  label: 'Insert at index',
  arity: 2,
  *run(s0, [i, x]) {
    const value = x as Value;
    const v = x === undefined ? 'nothing' : fmt(value);
    const args = `${i === undefined ? '' : fmt(i)}, ${v}`;
    const bad = badIndex(i, s0.size);
    if (bad !== null) {
      yield indexError(s0, 'insertAt', args, bad);
      return s0;
    }
    const index = i as number;
    const vars = { i: index, x: value };
    yield st(
      s0,
      `insertAt(${args}): i = ${index} is between 0 and n = ${s0.size}, so it is valid.`,
      ['insertAt.check'],
      { level: 3, vars },
    );

    const uid = s0.nextUid;
    const nodes = [...s0.nodes];
    nodes.splice(index + (s0.nil !== null ? 1 : 0), 0, { uid, value, next: null, prev: null });
    let s: S = { ...s0, nodes, nextUid: uid + 1 };
    yield st(
      s,
      `Make a new node holding ${v}. It goes in front of the node now at index ${index}.`,
      ['insertAt.new'],
      { marks: [mark(nid(uid), 'new')], ptrs: { new: uid }, pending: uid, vars },
    );

    let succ: number | null;
    if (index === s.size) {
      succ = s.nil;
      yield st(
        s,
        s.nil !== null
          ? `i = n, so the new node goes at the end, just before the sentinel: succ = nil.`
          : `i = n, so the new node goes at the end, after tail. There is no node to put it in front of.`,
        // Without a sentinel there is no "succ = nil" line: the end case has its own branch.
        s.nil !== null ? ['insertAt.atEnd', 'insertAt.succNil'] : ['insertAt.atEnd'],
        { ptrs: { new: uid, succ }, nullAt: { succ: 'after' }, pending: uid, vars },
      );
    } else {
      yield st(
        s,
        `Find succ, the node at index ${index}. The new node goes just before it.`,
        ['insertAt.atEnd'],
        {
          ptrs: { new: uid },
          pending: uid,
          level: 3,
          vars,
        },
      );
      succ = yield* walkTo(s, 'insertAt', 'succ', index, {
        ptrs: { new: uid },
        pending: uid,
        vars,
      });
    }
    const ptrs = { new: uid, succ };
    const nullAt = { succ: 'after' as const };

    if (s.nil === null && succ === null) {
      // Plain list, at the end: the same as insertTail.
      const t = s.tail;
      s = set(s, uid, 'prev', t);
      yield st(
        s,
        t === null
          ? 'new.prev = tail, which is null: the list is empty.'
          : `new.prev = tail: the new node points back to ${name(s, t)}.`,
        ['insertAt.endPrev'],
        { marks: [mark(linkMark(uid, 'prev'), 'active')], ptrs, nullAt, pending: uid, vars },
      );
      yield st(s, 'new.next stays null: nothing comes after the last node.', ['insertAt.endNext'], {
        marks: [mark(linkMark(uid, 'next'), 'active')],
        ptrs,
        nullAt,
        pending: uid,
        vars,
      });
      if (t === null) {
        s = { ...s, head: uid };
        yield st(
          s,
          'tail is null, so the list was empty: head = new.',
          ['insertAt.endCheck', 'insertAt.endHead'],
          {
            marks: [mark('p:head', 'active')],
            ptrs,
            nullAt,
            pending: uid,
            vars,
          },
        );
      } else {
        s = set(s, t, 'next', uid);
        yield st(
          s,
          `tail.next = new: ${name(s, t)} points forward to ${v}.`,
          ['insertAt.endCheck', 'insertAt.endLink'],
          {
            marks: [mark(linkMark(t, 'next'), 'active')],
            ptrs,
            nullAt,
            pending: uid,
            vars,
          },
        );
      }
      s = { ...s, tail: uid };
      yield st(s, `tail = new: ${v} is the last node now.`, ['insertAt.endTail'], {
        marks: [mark('p:tail', 'active')],
        ptrs,
        nullAt,
        vars,
      });
    } else {
      const sc = succ ?? s.nil!;
      const pred = node(s, sc).prev;
      s = set(s, uid, 'next', sc);
      yield st(
        s,
        `new.next = succ: the new node points forward to ${name(s, sc)}.`,
        ['insertAt.setNext'],
        {
          marks: [mark(linkMark(uid, 'next'), 'active')],
          ptrs,
          nullAt,
          pending: uid,
          vars,
        },
      );
      s = set(s, uid, 'prev', pred);
      yield st(
        s,
        `new.prev = succ.prev: and back to ${name(s, pred)}. The new node's own pointers are set; the list has not changed yet.`,
        ['insertAt.setPrev'],
        { marks: [mark(linkMark(uid, 'prev'), 'active')], ptrs, nullAt, pending: uid, vars },
      );
      if (s.nil === null && pred === null) {
        s = { ...s, head: uid };
        yield st(
          s,
          'succ.prev is null: succ was the first node, so head = new.',
          ['insertAt.predNull', 'insertAt.head'],
          {
            marks: [mark('p:head', 'active')],
            ptrs,
            nullAt,
            pending: uid,
            vars,
          },
        );
      } else {
        s = set(s, pred!, 'next', uid);
        yield st(
          s,
          `succ.prev.next = new: ${name(s, pred)} points forward to ${v}. This comes before the last update, while succ.prev still means ${name(s, pred)}.`,
          s.nil === null ? ['insertAt.predNull', 'insertAt.predLink'] : ['insertAt.predLink'],
          { marks: [mark(linkMark(pred!, 'next'), 'active')], ptrs, nullAt, pending: uid, vars },
        );
      }
      s = set(s, sc, 'prev', uid);
      yield st(
        s,
        `succ.prev = new: ${name(s, sc)} points back to ${v}. It is linked in.`,
        ['insertAt.succPrev'],
        {
          marks: [mark(linkMark(sc, 'prev'), 'active')],
          ptrs,
          nullAt,
          vars,
        },
      );
    }
    s = { ...s, size: s.size + 1 };
    yield st(s, `n = ${s.size}. ${v} is at index ${index}: ${chain(s)}.`, ['insertAt.size'], {
      marks: [mark(nid(uid), 'done')],
      level: 1,
      vars,
    });
    return s;
  },
};

/**
 * Take cur out of the list: two updates route around it, then its own two pointers are
 * cleared. Then the garbage is shown and collected.
 */
function* unlink(
  s0: S,
  op: string,
  cur: number,
  vars: Record<string, Scalar>,
  returned: Scalar,
  extraPtrs: Record<string, number | null> = {},
): Generator<DStep, S, void> {
  let s = s0;
  const v = name(s, cur);
  const ptrs = { ...extraPtrs, cur };
  const pred = node(s, cur).prev;
  const succ = node(s, cur).next;
  if (s.nil !== null) {
    s = set(s, pred!, 'next', succ);
    yield st(
      s,
      `cur.prev.next = cur.next: ${name(s, pred)} now points forward past ${v}, to ${name(s, succ)}.`,
      [`${op}.plink`],
      { marks: [mark(linkMark(pred!, 'next'), 'active'), mark(nid(cur), 'remove')], ptrs, vars },
    );
    s = set(s, succ!, 'prev', pred);
    yield st(
      s,
      `cur.next.prev = cur.prev: ${name(s, succ)} now points back past ${v}, to ${name(s, pred)}. The list skips ${v} in both directions. No if statements: the sentinel is always there.`,
      [`${op}.nlink`],
      { marks: [mark(linkMark(succ!, 'prev'), 'active'), mark(nid(cur), 'remove')], ptrs, vars },
    );
  } else {
    if (pred === null) {
      s = { ...s, head: succ };
      yield st(
        s,
        `cur.prev is null: ${v} is the first node, so head = cur.next (${name(s, succ)}).`,
        [`${op}.pnull`, `${op}.phead`],
        { marks: [mark('p:head', 'active'), mark(nid(cur), 'remove')], ptrs, vars },
      );
    } else {
      s = set(s, pred, 'next', succ);
      yield st(
        s,
        `cur.prev.next = cur.next: ${name(s, pred)} now points forward past ${v}, to ${name(s, succ)}.`,
        [`${op}.pnull`, `${op}.plink`],
        { marks: [mark(linkMark(pred, 'next'), 'active'), mark(nid(cur), 'remove')], ptrs, vars },
      );
    }
    if (succ === null) {
      s = { ...s, tail: pred };
      yield st(
        s,
        `cur.next is null: ${v} is the last node, so tail = cur.prev (${name(s, pred)}).`,
        [`${op}.nnull`, `${op}.ntail`],
        { marks: [mark('p:tail', 'active'), mark(nid(cur), 'remove')], ptrs, vars },
      );
    } else {
      s = set(s, succ, 'prev', pred);
      yield st(
        s,
        `cur.next.prev = cur.prev: ${name(s, succ)} now points back past ${v}, to ${name(s, pred)}.`,
        [`${op}.nnull`, `${op}.nlink`],
        { marks: [mark(linkMark(succ, 'prev'), 'active'), mark(nid(cur), 'remove')], ptrs, vars },
      );
    }
  }
  s = set(s, cur, 'next', null);
  yield st(
    s,
    `cur.next = null. The list no longer needs ${v}'s pointers. Clearing them keeps the removed node from pointing into the list (Java's LinkedList does the same).`,
    [`${op}.clearNext`],
    { marks: [mark(linkMark(cur, 'next'), 'active'), mark(nid(cur), 'remove')], ptrs, vars },
  );
  s = set(s, cur, 'prev', null);
  yield st(
    s,
    'cur.prev = null. The node is cut loose; only cur still points at it.',
    [`${op}.clearPrev`],
    {
      marks: [mark(linkMark(cur, 'prev'), 'active'), mark(nid(cur), 'remove')],
      ptrs,
      vars,
    },
  );
  s = { ...s, size: s.size - 1 };
  const r = typeof returned === 'string' ? fmt(returned) : String(returned);
  yield st(
    s,
    `n = ${s.size}. ${op} returns ${r}, and cur goes away with it: nothing points at ${v}'s node, so it is garbage.`,
    [`${op}.size`, `${op}.return`],
    { marks: [mark(nid(cur), 'remove')], vars: { ...vars, returned } },
  );
  const done = tidy(s);
  yield st(
    done,
    `The garbage node is collected (in C++, delete it). Now ${chain(done)}.`,
    [`${op}.return`],
    {
      level: 1,
      vars: { ...vars, returned },
    },
  );
  return done;
}

function emptyError(s: S, op: string): DStep {
  return st(
    s,
    s.nil !== null
      ? `${op}(): cur is the sentinel, so the list is empty. There is nothing to remove.`
      : `${op}(): ${op === 'removeHead' ? 'head' : 'tail'} is null, so the list is empty. There is nothing to remove.`,
    [`${op}.check`, `${op}.error`],
    {
      marks: [
        mark(s.nil !== null ? nid(s.nil) : `p:${op === 'removeHead' ? 'head' : 'tail'}`, 'error'),
      ],
      level: 1,
    },
  );
}

function removeEnd(op: 'removeHead' | 'removeTail'): Op {
  const front = op === 'removeHead';
  return {
    label: front ? 'Remove head' : 'Remove tail',
    arity: 0,
    *run(s) {
      const cur = front ? first(s) : last(s);
      if (cur === null || cur === s.nil) {
        if (s.nil !== null) {
          yield st(
            s,
            `${op}(): cur = nil.${front ? 'next' : 'prev'}, which is the sentinel itself.`,
            [`${op}.cur`],
            {
              marks: [mark(nid(s.nil), 'compare')],
              level: 3,
            },
          );
        }
        yield emptyError(s, op);
        return s;
      }
      const from = s.nil !== null ? `nil.${front ? 'next' : 'prev'}` : front ? 'head' : 'tail';
      yield st(
        s,
        `${op}(): cur = ${from}, the ${front ? 'first' : 'last'} node (${name(s, cur)}). ${front ? '' : `No walking: ${from} and the prev pointers make the end as cheap as the front.`}`.trim(),
        [`${op}.cur`, `${op}.check`],
        { marks: [mark('p:cur', 'active')], ptrs: { cur }, vars: {} },
      );
      return yield* unlink(s, op, cur, { x: node(s, cur).value }, node(s, cur).value);
    },
  };
}

const removeAt: Op = {
  label: 'Remove at index',
  arity: 1,
  *run(s, [i]) {
    const bad = badIndex(i, s.size - 1);
    if (bad !== null) {
      yield indexError(s, 'removeAt', i === undefined ? '' : fmt(i), bad);
      return s;
    }
    const index = i as number;
    yield st(
      s,
      `removeAt(${index}): i = ${index} is between 0 and n - 1 = ${s.size - 1}, so it is valid.`,
      ['removeAt.check'],
      { level: 3, vars: { i: index } },
    );
    const cur = yield* walkTo(s, 'removeAt', 'cur', index, { ptrs: {}, vars: { i: index } });
    const value = node(s, cur).value;
    return yield* unlink(s, 'removeAt', cur, { i: index, x: value }, value);
  },
};

const removeValue: Op = {
  label: 'Remove value',
  arity: 1,
  *run(s, [x]) {
    const value = x as Value;
    const v = fmt(value);
    let cur: number | null = first(s);
    let comparisons = 0;
    const stop = end(s);
    const more = () => ({ x: value, cur: pv(s, cur), comparisons });
    const nullAt = { cur: 'after' as const };
    yield st(
      s,
      cur === stop
        ? `removeValue(${v}): cur = ${s.nil !== null ? 'nil.next, which is the sentinel' : 'head, which is null'}. The list is empty.`
        : `removeValue(${v}): start cur at the first node, ${name(s, cur)}.`,
      ['removeValue.init'],
      { marks: [mark('p:cur', 'active')], ptrs: { cur }, nullAt, vars: more() },
    );
    while (cur !== stop && cur !== null) {
      comparisons++;
      const hit = node(s, cur).value === value;
      yield st(
        s,
        hit
          ? `Is cur.value equal to ${v}? Yes.`
          : `Is cur.value (${name(s, cur)}) equal to ${v}? No.`,
        ['removeValue.loop'],
        { marks: [mark(nid(cur), hit ? 'found' : 'compare')], ptrs: { cur }, nullAt, vars: more() },
      );
      if (hit) break;
      cur = node(s, cur).next;
      yield st(s, `cur = cur.next: cur moves to ${name(s, cur)}.`, ['removeValue.move'], {
        marks: [mark('p:cur', 'active')],
        ptrs: { cur },
        nullAt,
        level: 3,
        vars: more(),
      });
    }
    if (cur === stop || cur === null) {
      yield st(
        s,
        `cur is ${s.nil !== null ? 'back at the sentinel' : 'null'}, so ${v} is not in the list (${plural(comparisons, 'comparison')}). Return false.`,
        ['removeValue.check', 'removeValue.none'],
        { ptrs: { cur }, nullAt, level: 1, vars: { ...more(), returned: false } },
      );
      return s;
    }
    yield st(
      s,
      `Found ${v}. With prev pointers there is no need for a trailing prev variable: cur.prev is right there.`,
      ['removeValue.check'],
      { marks: [mark(nid(cur), 'found')], ptrs: { cur }, level: 3, vars: more() },
    );
    return yield* unlink(s, 'removeValue', cur, { x: value, comparisons }, true);
  },
};

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [x]) {
    const value = x as Value;
    const v = fmt(value);
    let cur: number | null = first(s);
    let i = 0;
    let comparisons = 0;
    const stop = end(s);
    const nullAt = { cur: 'after' as const };
    const more = () => ({ x: value, cur: pv(s, cur), i, comparisons });
    yield st(
      s,
      cur === stop
        ? `search(${v}): cur = ${s.nil !== null ? 'nil.next, the sentinel itself' : 'head, which is null'}. The list is empty.`
        : `search(${v}): start cur at the first node, ${name(s, cur)}, with i = 0.`,
      ['search.init'],
      { marks: [mark('p:cur', 'active')], ptrs: { cur }, nullAt, vars: more() },
    );
    while (cur !== stop && cur !== null) {
      comparisons++;
      const hit = node(s, cur).value === value;
      yield st(
        s,
        hit
          ? `Is cur.value equal to ${v}? Yes!`
          : `Is cur.value (${name(s, cur)}) equal to ${v}? No.`,
        ['search.loop', 'search.cmp'],
        { marks: [mark(nid(cur), hit ? 'found' : 'compare')], ptrs: { cur }, nullAt, vars: more() },
      );
      if (hit) {
        yield st(
          s,
          `Found ${v} at index ${i} after ${plural(comparisons, 'comparison')}. Return ${i}.`,
          ['search.found'],
          {
            marks: [mark(nid(cur), 'found')],
            ptrs: { cur },
            level: 1,
            vars: { ...more(), returned: i },
          },
        );
        return s;
      }
      cur = node(s, cur).next;
      i++;
      yield st(s, `cur = cur.next: cur moves to ${name(s, cur)}, i = ${i}.`, ['search.move'], {
        marks: [mark('p:cur', 'active')],
        ptrs: { cur },
        nullAt,
        level: 3,
        vars: more(),
      });
    }
    yield st(
      s,
      `cur is ${s.nil !== null ? 'back at the sentinel' : 'null'}: ${v} is not in the list (${plural(comparisons, 'comparison')}). Return -1.`,
      ['search.loop', 'search.none'],
      { ptrs: { cur }, nullAt, level: 1, vars: { ...more(), returned: -1 } },
    );
    return s;
  },
};

const get: Op = {
  label: 'Get',
  arity: 1,
  *run(s, [i]) {
    const bad = badIndex(i, s.size - 1);
    if (bad !== null) {
      yield indexError(s, 'get', i === undefined ? '' : fmt(i), bad);
      return s;
    }
    const index = i as number;
    yield st(
      s,
      `get(${index}): i = ${index} is between 0 and n - 1 = ${s.size - 1}, so it is valid.`,
      ['get.check'],
      {
        level: 3,
        vars: { i: index },
      },
    );
    const cur = yield* walkTo(s, 'get', 'cur', index, { ptrs: {}, vars: { i: index } });
    const value = node(s, cur).value;
    yield st(s, `Return cur.value = ${fmt(value)}.`, ['get.return'], {
      marks: [mark(nid(cur), 'found')],
      ptrs: { cur },
      level: 1,
      vars: { i: index, cur: value, returned: value },
    });
    return s;
  },
};

const reverse: Op = {
  label: 'Reverse',
  arity: 0,
  *run(s0) {
    let s = s0;
    const sentinel = s.nil !== null;
    let cur: number | null = first(s);
    let tmp: number | null = null;
    // Nodes already turned around are marked done, so the reversed part stays visible.
    const turned: number[] = [];
    const stop = end(s);
    const nullAt = { cur: 'after' as const, tmp: 'after' as const };
    const ptrs = () => ({ cur, tmp });
    const more = () => ({ cur: pv(s, cur), tmp: pv(s, tmp), swapped: turned.length });
    const marks = (...m: Mark[]) => [...turned.map((u) => mark(nid(u), 'done')), ...m];
    yield st(
      s,
      cur === stop
        ? `reverse(): the list is empty${sentinel ? ', so only the sentinel is left to swap' : ''}.`
        : `reverse(): every node swaps its next and prev pointers. Start cur at the first node, ${name(s, cur)}.`,
      ['reverse.init'],
      { marks: [mark('p:cur', 'active')], ptrs: { cur }, nullAt, vars: more() },
    );
    while (cur !== stop && cur !== null) {
      tmp = node(s, cur).next;
      yield st(
        s,
        `tmp = cur.next: remember ${name(s, tmp)}, the way forward.`,
        ['reverse.loop', 'reverse.save'],
        { marks: marks(mark('p:tmp', 'active')), ptrs: ptrs(), nullAt, vars: more() },
      );
      s = set(s, cur, 'next', node(s, cur).prev);
      yield st(
        s,
        `cur.next = cur.prev: ${name(s, cur)}'s next now points back to ${name(s, node(s, cur).next)}.`,
        ['reverse.next'],
        { marks: marks(mark(linkMark(cur, 'next'), 'active')), ptrs: ptrs(), nullAt, vars: more() },
      );
      s = set(s, cur, 'prev', tmp);
      turned.push(cur);
      yield st(
        s,
        `cur.prev = tmp: and its prev points forward to ${name(s, tmp)}. ${name(s, cur)} is turned around, so the drawing turns it around too.`,
        ['reverse.prev'],
        { marks: marks(mark(linkMark(cur, 'prev'), 'active')), ptrs: ptrs(), nullAt, vars: more() },
      );
      cur = tmp;
      yield st(
        s,
        cur === stop || cur === null
          ? `cur = tmp: ${sentinel ? 'back at the sentinel' : 'cur is null'}. ${plural(turned.length, 'node')} turned around.`
          : `cur = tmp: cur moves to ${name(s, cur)}. ${plural(turned.length, 'node')} turned around so far.`,
        ['reverse.move'],
        { marks: marks(mark('p:cur', 'active')), ptrs: ptrs(), nullAt, vars: more(), level: 1 },
      );
    }
    if (sentinel) {
      const nil = s.nil!;
      const oldNext = node(s, nil).next;
      s = set(s, nil, 'next', node(s, nil).prev);
      s = set(s, nil, 'prev', oldNext);
      yield st(
        s,
        `Last, swap the sentinel's own pointers: nil.next is now ${name(s, node(s, nil).next)} and nil.prev is ${name(s, node(s, nil).prev)}.`,
        ['reverse.nil'],
        {
          marks: marks(
            mark(linkMark(nil, 'next'), 'active'),
            mark(linkMark(nil, 'prev'), 'active'),
          ),
          vars: more(),
        },
      );
    } else {
      const h = s.head;
      s = { ...s, head: s.tail, tail: h };
      yield st(
        s,
        `Last, swap head and tail: head is ${name(s, s.head)} and tail is ${name(s, s.tail)}.`,
        ['reverse.ends'],
        { marks: marks(mark('p:head', 'active'), mark('p:tail', 'active')), vars: more() },
      );
    }
    const done = tidy(s);
    yield st(
      done,
      s0.size === 0
        ? 'The list is still empty.'
        : `Reversed: ${plural(turned.length * 2, 'pointer')} swapped and no node moved. Redrawn from the front: ${chain(done)}.`,
      [sentinel ? 'reverse.nil' : 'reverse.ends'],
      { level: 1, vars: { swapped: turned.length } },
    );
    return done;
  },
};

export const ops = {
  insertHead,
  insertTail,
  insertAt,
  removeHead: removeEnd('removeHead'),
  removeTail: removeEnd('removeTail'),
  removeAt,
  removeValue,
  search,
  get,
  reverse,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

/** Walk lines for index i, from the nearer end. */
function walkLines(op: string, ptr: string, sentinel: boolean, indent: number): PseudoLine[] {
  const front = sentinel ? 'nil.next' : 'head';
  const back = sentinel ? 'nil.prev' : 'tail';
  return [
    L(`${op}.half`, indent, 'if i < n / 2', 'If i is in the front half,'),
    L(`${op}.front`, indent + 1, `${ptr} = ${front}`, 'start at the first node'),
    L(`${op}.fwalk`, indent + 1, 'repeat i times', 'and step forward i times;'),
    L(`${op}.fmove`, indent + 2, `${ptr} = ${ptr}.next`, 'follow next.'),
    L(`${op}.belse`, indent, 'else', 'Otherwise'),
    L(`${op}.back`, indent + 1, `${ptr} = ${back}`, 'start at the last node'),
    L(`${op}.bwalk`, indent + 1, 'repeat n - 1 - i times', 'and step back n - 1 - i times;'),
    L(`${op}.bmove`, indent + 2, `${ptr} = ${ptr}.prev`, 'follow prev.'),
  ];
}

/** Unlink lines for cur. */
function unlinkLines(op: string, sentinel: boolean): PseudoLine[] {
  const tail = [
    L(`${op}.clearNext`, 1, 'cur.next = null', 'Cut the removed node loose:'),
    L(`${op}.clearPrev`, 1, 'cur.prev = null', 'both of its pointers.'),
    L(`${op}.size`, 1, 'n = n - 1', 'Count one fewer node.'),
  ];
  if (sentinel) {
    return [
      L(`${op}.plink`, 1, 'cur.prev.next = cur.next', 'The node before cur skips forward over it.'),
      L(`${op}.nlink`, 1, 'cur.next.prev = cur.prev', 'The node after cur skips back over it.'),
      ...tail,
    ];
  }
  return [
    L(`${op}.pnull`, 1, 'if cur.prev == null', 'If cur is the first node,'),
    L(`${op}.phead`, 2, 'head = cur.next', 'the next node becomes the first.'),
    L(`${op}.pelse`, 1, 'else', 'Otherwise'),
    L(`${op}.plink`, 2, 'cur.prev.next = cur.next', 'the node before cur skips forward over it.'),
    L(`${op}.nnull`, 1, 'if cur.next == null', 'If cur is the last node,'),
    L(`${op}.ntail`, 2, 'tail = cur.prev', 'the node before it becomes the last.'),
    L(`${op}.nelse`, 1, 'else', 'Otherwise'),
    L(`${op}.nlink`, 2, 'cur.next.prev = cur.prev', 'the node after cur skips back over it.'),
    ...tail,
  ];
}

export function pseudocode(settings: DSettings): PseudoBlock[] {
  const sn = settings.sentinel === 'on';
  const insertEnd = (op: string, front: boolean): PseudoBlock => {
    const sig = L(`${op}.sig`, 0, `${op}(x)`, `To insert x at the ${front ? 'front' : 'back'}:`);
    const mk = L(`${op}.new`, 1, 'new = Node(x)', 'Make a new node holding x.');
    const size = L(`${op}.size`, 1, 'n = n + 1', 'Count one more node.');
    if (sn && front) {
      return {
        op,
        lines: [
          sig,
          mk,
          L(`${op}.setNext`, 1, 'new.next = nil.next', 'Point it forward to the first node'),
          L(`${op}.setPrev`, 1, 'new.prev = nil', 'and back to the sentinel.'),
          L(`${op}.fixSucc`, 1, 'nil.next.prev = new', 'The first node points back to it,'),
          L(`${op}.fixPred`, 1, 'nil.next = new', 'then the sentinel points forward to it.'),
          size,
        ],
      };
    }
    if (sn) {
      return {
        op,
        lines: [
          sig,
          mk,
          L(`${op}.setNext`, 1, 'new.next = nil', 'Point it forward to the sentinel'),
          L(`${op}.setPrev`, 1, 'new.prev = nil.prev', 'and back to the last node.'),
          L(`${op}.fixPred`, 1, 'nil.prev.next = new', 'The last node points forward to it,'),
          L(`${op}.fixSucc`, 1, 'nil.prev = new', 'then the sentinel points back to it.'),
          size,
        ],
      };
    }
    const end = front ? 'head' : 'tail';
    const other = front ? 'tail' : 'head';
    const own = front
      ? [
          L(`${op}.setNext`, 1, 'new.next = head', 'Point it forward to the first node'),
          L(`${op}.setPrev`, 1, 'new.prev = null', 'and back to nothing.'),
        ]
      : [
          L(`${op}.setPrev`, 1, 'new.prev = tail', 'Point it back to the last node'),
          L(`${op}.setNext`, 1, 'new.next = null', 'and forward to nothing.'),
        ];
    return {
      op,
      lines: [
        sig,
        mk,
        ...own,
        L(`${op}.check`, 1, `if ${end} == null`, 'If the list is empty,'),
        L(
          `${op}.empty`,
          2,
          `${other} = new`,
          `the new node is also the ${front ? 'last' : 'first'}.`,
        ),
        L(`${op}.else`, 1, 'else', 'Otherwise'),
        L(
          `${op}.link`,
          2,
          front ? 'head.prev = new' : 'tail.next = new',
          front
            ? 'the old first node points back to it.'
            : 'the old last node points forward to it.',
        ),
        L(`${op}.end`, 1, `${end} = new`, `It is the ${front ? 'first' : 'last'} node now.`),
        size,
      ],
    };
  };

  const insertAtLines: PseudoLine[] = [
    L('insertAt.sig', 0, 'insertAt(i, x)', 'To insert x so it ends up at index i:'),
    L('insertAt.check', 1, 'if i < 0 or i > n', 'If i is not a position from 0 to n,'),
    L('insertAt.error', 2, 'error "index out of range"', 'stop with an error.'),
    L('insertAt.new', 1, 'new = Node(x)', 'Make a new node holding x.'),
    L('insertAt.atEnd', 1, 'if i == n', 'If it goes at the end,'),
  ];
  if (sn) {
    insertAtLines.push(
      L('insertAt.succNil', 2, 'succ = nil', 'it goes just before the sentinel.'),
      L('insertAt.else', 1, 'else', 'Otherwise find succ, the node at index i:'),
      ...walkLines('insertAt', 'succ', true, 2),
      L('insertAt.setNext', 1, 'new.next = succ', 'Point the new node forward to succ'),
      L('insertAt.setPrev', 1, 'new.prev = succ.prev', 'and back to the node before succ.'),
      L('insertAt.predLink', 1, 'succ.prev.next = new', 'That node points forward to it,'),
      L('insertAt.succPrev', 1, 'succ.prev = new', 'then succ points back to it.'),
    );
  } else {
    insertAtLines.push(
      L('insertAt.endPrev', 2, 'new.prev = tail', 'point it back to the last node;'),
      L('insertAt.endNext', 2, 'new.next = null', 'nothing comes after it.'),
      L('insertAt.endCheck', 2, 'if tail == null', 'If the list is empty'),
      L('insertAt.endHead', 3, 'head = new', 'it is also the first node,'),
      L('insertAt.endElse', 2, 'else', 'otherwise'),
      L('insertAt.endLink', 3, 'tail.next = new', 'the old last node points forward to it.'),
      L('insertAt.endTail', 2, 'tail = new', 'It is the last node now.'),
      L('insertAt.else', 1, 'else', 'Otherwise find succ, the node at index i:'),
      ...walkLines('insertAt', 'succ', false, 2),
      L('insertAt.setNext', 2, 'new.next = succ', 'Point the new node forward to succ'),
      L('insertAt.setPrev', 2, 'new.prev = succ.prev', 'and back to the node before succ.'),
      L('insertAt.predNull', 2, 'if succ.prev == null', 'If succ was the first node,'),
      L('insertAt.head', 3, 'head = new', 'the new node is the first now,'),
      L('insertAt.predElse', 2, 'else', 'otherwise'),
      L(
        'insertAt.predLink',
        3,
        'succ.prev.next = new',
        'the node before succ points forward to it.',
      ),
      L('insertAt.succPrev', 2, 'succ.prev = new', 'Then succ points back to it.'),
    );
  }
  insertAtLines.push(L('insertAt.size', 1, 'n = n + 1', 'Count one more node.'));

  const removeEndBlock = (op: string, front: boolean): PseudoBlock => ({
    op,
    lines: [
      L(`${op}.sig`, 0, `${op}()`, `To remove the ${front ? 'first' : 'last'} node:`),
      L(
        `${op}.cur`,
        1,
        `cur = ${sn ? (front ? 'nil.next' : 'nil.prev') : front ? 'head' : 'tail'}`,
        `cur is the ${front ? 'first' : 'last'} node.`,
      ),
      L(`${op}.check`, 1, sn ? 'if cur == nil' : 'if cur == null', 'If there is none,'),
      L(`${op}.error`, 2, 'error "list is empty"', 'stop with an error.'),
      ...unlinkLines(op, sn),
      L(`${op}.return`, 1, 'return cur.value', 'Hand back its value.'),
    ],
  });

  const stop = sn ? 'nil' : 'null';
  return [
    insertEnd('insertHead', true),
    insertEnd('insertTail', false),
    { op: 'insertAt', lines: insertAtLines },
    removeEndBlock('removeHead', true),
    removeEndBlock('removeTail', false),
    {
      op: 'removeAt',
      lines: [
        L('removeAt.sig', 0, 'removeAt(i)', 'To remove the node at index i:'),
        L('removeAt.check', 1, 'if i < 0 or i >= n', 'If there is no node at index i,'),
        L('removeAt.error', 2, 'error "index out of range"', 'stop with an error.'),
        ...walkLines('removeAt', 'cur', sn, 1),
        ...unlinkLines('removeAt', sn),
        L('removeAt.return', 1, 'return cur.value', 'Hand back its value.'),
      ],
    },
    {
      op: 'removeValue',
      lines: [
        L('removeValue.sig', 0, 'removeValue(x)', 'To remove the first node holding x:'),
        L('removeValue.init', 1, `cur = ${sn ? 'nil.next' : 'head'}`, 'Start at the first node.'),
        L(
          'removeValue.loop',
          1,
          `while cur != ${stop} and cur.value != x`,
          'Until we are past the end or at x,',
        ),
        L('removeValue.move', 2, 'cur = cur.next', 'step forward.'),
        L('removeValue.check', 1, `if cur == ${stop}`, 'If we ran off the end,'),
        L('removeValue.none', 2, 'return false', 'x is not in the list.'),
        ...unlinkLines('removeValue', sn),
        L('removeValue.return', 1, 'return true', 'Report that x was removed.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('search.sig', 0, 'search(x)', 'To find the index of x:'),
        L(
          'search.init',
          1,
          `cur = ${sn ? 'nil.next' : 'head'}; i = 0`,
          'Start at the first node, index 0.',
        ),
        L('search.loop', 1, `while cur != ${stop}`, 'Until we run off the end:'),
        L('search.cmp', 2, 'if cur.value == x', 'if this node holds x,'),
        L('search.found', 3, 'return i', 'hand back its index.'),
        L('search.move', 2, 'cur = cur.next; i = i + 1', 'Step forward and count.'),
        L('search.none', 1, 'return -1', 'x is not in the list.'),
      ],
    },
    {
      op: 'get',
      lines: [
        L('get.sig', 0, 'get(i)', 'To read the value at index i:'),
        L('get.check', 1, 'if i < 0 or i >= n', 'If there is no node at index i,'),
        L('get.error', 2, 'error "index out of range"', 'stop with an error.'),
        ...walkLines('get', 'cur', sn, 1),
        L('get.return', 1, 'return cur.value', 'Hand back the value there.'),
      ],
    },
    {
      op: 'reverse',
      lines: [
        L('reverse.sig', 0, 'reverse()', 'To reverse the list in place:'),
        L('reverse.init', 1, `cur = ${sn ? 'nil.next' : 'head'}`, 'Start at the first node.'),
        L('reverse.loop', 1, `while cur != ${stop}`, 'For every node, front to back:'),
        L('reverse.save', 2, 'tmp = cur.next', 'remember the way forward,'),
        L('reverse.next', 2, 'cur.next = cur.prev', 'point next backward'),
        L('reverse.prev', 2, 'cur.prev = tmp', 'and prev forward,'),
        L('reverse.move', 2, 'cur = tmp', 'then move on.'),
        sn
          ? L('reverse.nil', 1, 'swap nil.next and nil.prev', 'The sentinel turns around too.')
          : L(
              'reverse.ends',
              1,
              'swap head and tail',
              'The first node is the last now, and the other way round.',
            ),
      ],
    },
  ];
}

export function initialSay(_state: S, settings: DSettings): string {
  return settings.sentinel === 'on'
    ? 'An empty doubly linked list with a sentinel, nil. Its next and prev point to itself: nil.next is the first node and nil.prev the last, so an empty list has no null pointers at all.'
    : 'An empty doubly linked list: head and tail are both null. Each node will have a next and a prev pointer.';
}

export function initialVars(state: S): Record<string, Scalar> {
  return { n: state.size };
}

export function describe(state: S, settings: DSettings): string {
  const sn = settings.sentinel === 'on';
  if (state.size === 0 && order(state).length === 0) {
    return sn
      ? 'Empty doubly linked list: the sentinel nil points to itself both ways.'
      : 'Empty doubly linked list: head and tail are null.';
  }
  return `Doubly linked list with ${plural(state.size, 'node')}${sn ? ' and a sentinel' : ''}: ${chain(state)}.`;
}
