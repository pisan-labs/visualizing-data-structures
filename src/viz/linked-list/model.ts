import type {
  Mark,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';

/** A node in memory. `next` is the uid of the node it points at, or null. */
export interface SNode {
  uid: number;
  value: Value;
  next: number | null;
}

export interface ListState {
  /**
   * Every node in memory, in drawing order. Between operations this is exactly the list, from
   * head to tail. During one it may also hold a node not linked in yet, or one just unlinked.
   */
  nodes: SNode[];
  head: number | null;
  /** Kept only when the tail-pointer setting is on. */
  tail: number | null;
  size: number;
  nextUid: number;
}

export interface ListSettings {
  [key: string]: Scalar;
  /** 'on': head and tail pointers. 'off': head only. */
  tail: 'on' | 'off';
}

export interface ListExtra {
  /** Local pointer variables of the running operation (prev, cur, next, new), by name. */
  ptrs?: Record<string, number | null>;
  /** Where to draw a null local pointer. Default: after the last node. */
  nullAt?: Record<string, 'before' | 'after'>;
  /** A node that has been made but is not linked into the list yet. */
  pending?: number;
}

type S = ListState;
type X = ListExtra;
type Op = OpSpec<S, ListSettings, X>;
type ListStep = Step<S, X>;

export const defaults: ListSettings = { tail: 'on' };

export const MAX_VALUE_LENGTH = 5;

/** Numbers stay numbers; anything else is a short string. */
export function parseListValue(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a value first.');
  if (/\s/.test(t)) return new Error('Type one value, with no spaces in it.');
  if (t.length > MAX_VALUE_LENGTH)
    return new Error(`Keep values to ${MAX_VALUE_LENGTH} characters.`);
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

export function init(): S {
  return { nodes: [], head: null, tail: null, size: 0, nextUid: 1 };
}

/** Narration form of a value: strings in quotes, numbers as they are. */
export function fmt(v: Value): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

export const nid = (uid: number) => `n${uid}`;
export const nextId = (uid: number) => `n${uid}.next`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

export function node(s: S, uid: number): SNode {
  const n = s.nodes.find((x) => x.uid === uid);
  if (!n) throw new Error(`no node ${uid}`);
  return n;
}

const val = (s: S, uid: number | null) => (uid === null ? 'null' : fmt(node(s, uid).value));

function setNext(s: S, uid: number, next: number | null): S {
  return { ...s, nodes: s.nodes.map((x) => (x.uid === uid ? { ...x, next } : x)) };
}

/** The uids of the list, from head, following next (stops if it ever loops). */
export function order(s: S): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let u = s.head; u !== null && !seen.has(u); u = node(s, u).next) {
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function values(s: S): Value[] {
  return order(s).map((u) => node(s, u).value);
}

/** "head → 10 → 20 → null", shortened in the middle for long lists. */
export function chain(s: S): string {
  const vs = values(s).map(fmt);
  const shown = vs.length > 8 ? [...vs.slice(0, 3), '…', ...vs.slice(-2)] : vs;
  return ['head', ...shown, 'null'].join(' → ');
}

/** Keep only the list, in list order: what memory looks like once the garbage is collected. */
function tidy(s: S): S {
  return { ...s, nodes: order(s).map((u) => node(s, u)) };
}

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { ...more, n: s.size };
}

/** Value of a local pointer for the variables panel: the value it points at, or null. */
const pv = (s: S, uid: number | null): Scalar => (uid === null ? null : node(s, uid).value);

interface StepOpts {
  marks?: Mark[];
  level?: 1 | 2 | 3;
  vars?: Record<string, Scalar>;
  ptrs?: Record<string, number | null>;
  nullAt?: Record<string, 'before' | 'after'>;
  pending?: number;
}

function st(state: S, say: string, lines: string[], o: StepOpts = {}): ListStep {
  const extra: X = {};
  if (o.ptrs) extra.ptrs = o.ptrs;
  if (o.nullAt) extra.nullAt = o.nullAt;
  if (o.pending !== undefined) extra.pending = o.pending;
  return {
    state,
    marks: o.marks ?? [],
    say,
    lines,
    vars: vars(state, o.vars),
    level: o.level ?? 2,
    extra,
  };
}

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

/** Checks an index argument. Returns an error message, or null when 0 <= i <= max. */
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

/** Error step for a bad index: mark the last node, or head when the list is empty. */
function indexError(s: S, op: string, args: string, why: string, lines: string[]): ListStep {
  const last = s.nodes.length ? s.nodes[s.nodes.length - 1]!.uid : null;
  return st(
    s,
    `${op}(${args}): ${why} Error: index out of range. The list does not change.`,
    lines,
    {
      marks: [last === null ? mark('p:head', 'error') : mark(nid(last), 'error')],
      level: 1,
    },
  );
}

const insertHead: Op = {
  label: 'Insert at head',
  arity: 1,
  *run(s0, [x], { settings }) {
    const value = x as Value;
    const v = fmt(value);
    const tailOn = settings.tail === 'on';
    const uid = s0.nextUid;
    const old = s0.head;
    const ptrs = { new: uid };
    let s: S = { ...s0, nodes: [{ uid, value, next: null }, ...s0.nodes], nextUid: uid + 1 };
    yield st(
      s,
      `insertHead(${v}): make a new node holding ${v}. Its next is null for now.`,
      ['insertHead.new'],
      { marks: [mark(nid(uid), 'new')], ptrs, pending: uid, vars: { x: value } },
    );

    s = setNext(s, uid, old);
    yield st(
      s,
      old === null
        ? 'new.next = head. head is null because the list is empty, so new.next stays null.'
        : `First new.next = head: the new node points at ${val(s, old)}, the current first node. head still points there too, so nothing is lost.`,
      ['insertHead.link'],
      { marks: [mark(nextId(uid), 'active')], ptrs, pending: uid, vars: { x: value } },
    );

    s = { ...s, head: uid };
    yield st(
      s,
      old === null
        ? `Then head = new. ${v} is the only node.`
        : `Then head = new. Doing this first would lose the only pointer to ${val(s, old)}, and the whole list with it.`,
      ['insertHead.head'],
      { marks: [mark('p:head', 'active')], ptrs, vars: { x: value } },
    );

    if (tailOn) {
      const empty = s.tail === null;
      yield st(
        s,
        empty
          ? 'Is tail null? Yes: the list was empty before this insert.'
          : `Is tail null? No, tail points at ${val(s, s.tail)}, so it stays.`,
        ['insertHead.check'],
        { marks: [mark('p:tail', 'active')], ptrs, level: 3, vars: { x: value } },
      );
      if (empty) {
        s = { ...s, tail: uid };
        yield st(s, `tail = new: ${v} is the first node and also the last.`, ['insertHead.tail'], {
          marks: [mark('p:tail', 'active')],
          ptrs,
          vars: { x: value },
        });
      }
    }

    s = { ...s, size: s.size + 1 };
    yield st(s, `n = ${s.size}. ${v} is the new first node: ${chain(s)}.`, ['insertHead.size'], {
      marks: [mark(nid(uid), 'done')],
      level: 1,
      vars: { x: value },
    });
    return s;
  },
};

/** Walk `cur` from head to the last node, one hop per step. Returns the last node's uid. */
function* walkToLast(
  s: S,
  op: string,
  ptrs: Record<string, number | null>,
  pending: number,
  value: Value,
): Generator<ListStep, number, void> {
  let cur = s.head!;
  let hops = 0;
  const more = () => ({ x: value, cur: pv(s, cur), hops });
  yield st(
    s,
    `No tail pointer, so we have to find the last node: start cur at head, ${val(s, cur)}.`,
    [`${op}.start`],
    { marks: [mark('p:cur', 'active')], ptrs: { ...ptrs, cur }, pending, vars: more() },
  );
  while (node(s, cur).next !== null) {
    yield st(s, `cur.next is not null, so ${val(s, cur)} is not the last node.`, [`${op}.loop`], {
      marks: [mark(nid(cur), 'compare')],
      ptrs: { ...ptrs, cur },
      pending,
      level: 3,
      vars: more(),
    });
    cur = node(s, cur).next!;
    hops++;
    yield st(
      s,
      `cur = cur.next: cur moves to ${val(s, cur)}. Hops so far: ${hops}.`,
      [`${op}.move`],
      {
        marks: [mark('p:cur', 'active'), mark(nid(cur), 'visit')],
        ptrs: { ...ptrs, cur },
        pending,
        vars: more(),
      },
    );
  }
  yield st(
    s,
    `cur.next is null, so ${val(s, cur)} is the last node. Finding it took ${plural(hops, 'hop')}; with a tail pointer it would take none.`,
    [`${op}.loop`],
    { marks: [mark(nid(cur), 'found')], ptrs: { ...ptrs, cur }, pending, vars: more() },
  );
  return cur;
}

const insertTail: Op = {
  label: 'Insert at tail',
  arity: 1,
  *run(s0, [x], { settings }) {
    const value = x as Value;
    const v = fmt(value);
    const tailOn = settings.tail === 'on';
    const uid = s0.nextUid;
    const ptrs: Record<string, number | null> = { new: uid };
    let s: S = { ...s0, nodes: [...s0.nodes, { uid, value, next: null }], nextUid: uid + 1 };
    yield st(
      s,
      `insertTail(${v}): make a new node holding ${v}. Its next is null, as the last node's must be.`,
      ['insertTail.new'],
      { marks: [mark(nid(uid), 'new')], ptrs, pending: uid, vars: { x: value } },
    );
    const empty = s.head === null;
    yield st(
      s,
      empty
        ? 'Is head null? Yes, the list is empty.'
        : `Is head null? No, the list has ${plural(s.size, 'node')}.`,
      ['insertTail.check'],
      { marks: [mark('p:head', 'active')], ptrs, pending: uid, level: 3, vars: { x: value } },
    );
    if (empty) {
      s = { ...s, head: uid };
      yield st(s, `head = new: ${v} becomes the first node.`, ['insertTail.head'], {
        marks: [mark('p:head', 'active')],
        ptrs,
        vars: { x: value },
      });
    } else if (tailOn) {
      const t = s.tail!;
      s = setNext(s, t, uid);
      yield st(
        s,
        `tail.next = new: the last node, ${val(s, t)}, now points at ${v}. tail took us straight there, no walking.`,
        ['insertTail.link'],
        { marks: [mark(nextId(t), 'active')], ptrs, vars: { x: value } },
      );
    } else {
      const last = yield* walkToLast(s, 'insertTail', ptrs, uid, value);
      s = setNext(s, last, uid);
      yield st(s, `cur.next = new: ${val(s, last)} now points at ${v}.`, ['insertTail.link'], {
        marks: [mark(nextId(last), 'active')],
        ptrs: { ...ptrs, cur: last },
        vars: { x: value, cur: pv(s, last) },
      });
    }
    if (tailOn) {
      s = { ...s, tail: uid };
      yield st(s, `tail = new: ${v} is the last node now.`, ['insertTail.tail'], {
        marks: [mark('p:tail', 'active')],
        ptrs,
        vars: { x: value },
      });
    }
    s = { ...s, size: s.size + 1 };
    yield st(s, `n = ${s.size}. ${v} is at the end: ${chain(s)}.`, ['insertTail.size'], {
      marks: [mark(nid(uid), 'done')],
      level: 1,
      vars: { x: value },
    });
    return s;
  },
};

const insertAt: Op = {
  label: 'Insert at index',
  arity: 2,
  *run(s0, [i, x], { settings }) {
    const value = x as Value;
    const v = x === undefined ? 'nothing' : fmt(value);
    const args = `${i === undefined ? '' : fmt(i)}, ${v}`;
    const bad = badIndex(i, s0.size);
    if (bad !== null) {
      yield indexError(s0, 'insertAt', args, bad, ['insertAt.check', 'insertAt.error']);
      return s0;
    }
    const index = i as number;
    const tailOn = settings.tail === 'on';
    const more = (o: Record<string, Scalar> = {}) => ({ i: index, x: value, ...o });
    yield st(
      s0,
      `insertAt(${args}): i = ${index} is between 0 and n = ${s0.size}, so it is valid.`,
      ['insertAt.check'],
      { level: 3, vars: more() },
    );

    const uid = s0.nextUid;
    const nodes = [...s0.nodes];
    nodes.splice(index, 0, { uid, value, next: null });
    let s: S = { ...s0, nodes, nextUid: uid + 1 };
    let ptrs: Record<string, number | null> = { new: uid };
    yield st(
      s,
      `Make a new node holding ${v}. It will end up at index ${index}.`,
      ['insertAt.new'],
      {
        marks: [mark(nid(uid), 'new')],
        ptrs,
        pending: uid,
        vars: more(),
      },
    );

    if (index === 0) {
      yield st(
        s,
        'i is 0, so the new node goes in front, just like insertHead.',
        ['insertAt.front'],
        {
          ptrs,
          pending: uid,
          level: 3,
          vars: more(),
        },
      );
      const old = s.head;
      s = setNext(s, uid, old);
      yield st(
        s,
        old === null
          ? 'new.next = head, which is null: the list is empty.'
          : `First new.next = head: the new node points at ${val(s, old)}. head still points there too.`,
        ['insertAt.link0'],
        { marks: [mark(nextId(uid), 'active')], ptrs, pending: uid, vars: more() },
      );
      s = { ...s, head: uid };
      yield st(
        s,
        old === null
          ? `Then head = new. ${v} is the only node.`
          : `Then head = new. In the other order we would lose the pointer to ${val(s, old)} and the rest of the list.`,
        ['insertAt.head'],
        { marks: [mark('p:head', 'active')], ptrs, vars: more() },
      );
    } else {
      yield st(
        s,
        `i is not 0, so first walk prev to the node before index ${index}.`,
        ['insertAt.front'],
        {
          ptrs,
          pending: uid,
          level: 3,
          vars: more(),
        },
      );
      let prev = s.head!;
      let hops = 0;
      ptrs = { new: uid, prev };
      yield st(s, `prev = head: prev starts at ${val(s, prev)}, index 0.`, ['insertAt.start'], {
        marks: [mark('p:prev', 'active')],
        ptrs,
        pending: uid,
        vars: more({ prev: pv(s, prev), hops }),
      });
      for (let k = 1; k < index; k++) {
        prev = node(s, prev).next!;
        hops++;
        ptrs = { new: uid, prev };
        yield st(
          s,
          `prev = prev.next: prev moves to ${val(s, prev)}, index ${k}. Hops so far: ${hops} of ${index - 1}.`,
          ['insertAt.loop', 'insertAt.move'],
          {
            marks: [mark('p:prev', 'active'), mark(nid(prev), 'visit')],
            ptrs,
            pending: uid,
            vars: more({ prev: pv(s, prev), hops }),
          },
        );
      }
      const after = node(s, prev).next;
      s = setNext(s, uid, after);
      yield st(
        s,
        after === null
          ? `First new.next = prev.next, which is null: ${val(s, prev)} is the last node, so the new node goes at the end.`
          : `First new.next = prev.next: the new node points at ${val(s, after)}. prev still points there too, so nothing is lost.`,
        ['insertAt.link1'],
        {
          marks: [mark(nextId(uid), 'active')],
          ptrs,
          pending: uid,
          vars: more({ prev: pv(s, prev), hops }),
        },
      );
      s = setNext(s, prev, uid);
      yield st(
        s,
        after === null
          ? `Then prev.next = new: ${val(s, prev)} points at ${v}.`
          : `Then prev.next = new: ${val(s, prev)} points at ${v}. The other order would lose ${val(s, after)} and everything after it.`,
        ['insertAt.link2'],
        { marks: [mark(nextId(prev), 'active')], ptrs, vars: more({ prev: pv(s, prev), hops }) },
      );
    }

    if (tailOn) {
      const atEnd = node(s, uid).next === null;
      yield st(
        s,
        atEnd
          ? 'Is new.next null? Yes: the new node is the last one.'
          : 'Is new.next null? No, so tail stays where it is.',
        ['insertAt.last'],
        { ptrs, level: 3, vars: more() },
      );
      if (atEnd) {
        s = { ...s, tail: uid };
        yield st(s, `tail = new: ${v} is the last node now.`, ['insertAt.tail'], {
          marks: [mark('p:tail', 'active')],
          ptrs,
          vars: more(),
        });
      }
    }
    s = { ...s, size: s.size + 1 };
    yield st(s, `n = ${s.size}. ${v} is at index ${index}: ${chain(s)}.`, ['insertAt.size'], {
      marks: [mark(nid(uid), 'done')],
      level: 1,
      vars: more(),
    });
    return s;
  },
};

/** Narration for the end of a removal: the node is garbage, then it is collected. */
function* collect(
  s: S,
  op: string,
  uid: number,
  value: Value,
  lines: string[],
  more: Record<string, Scalar>,
  locals: boolean,
  returned: Scalar = value,
): Generator<ListStep, S, void> {
  const v = fmt(value);
  const r = typeof returned === 'string' ? fmt(returned) : String(returned);
  if (locals) {
    yield st(
      s,
      `${op} returns ${r}. Its local pointers go away with it, so nothing points at the node that held ${v}: it is garbage.`,
      lines,
      { marks: [mark(nid(uid), 'remove')], vars: { ...more, returned } },
    );
  }
  const done = tidy(s);
  yield st(
    done,
    `${locals ? 'Removed' : `Returned ${r}`}. Java and Python reclaim the garbage node for us; in C++ we would delete it ourselves. Now ${chain(done)}.`,
    lines,
    { level: 1, vars: { ...more, returned } },
  );
  return done;
}

function emptyError(s: S, op: string): ListStep {
  return st(
    s,
    `${op}(): head is null, so the list is empty. There is nothing to remove.`,
    [`${op}.check`, `${op}.error`],
    { marks: [mark('p:head', 'error')], level: 1 },
  );
}

const removeHead: Op = {
  label: 'Remove head',
  arity: 0,
  *run(s0, _args, { settings }) {
    if (s0.head === null) {
      yield emptyError(s0, 'removeHead');
      return s0;
    }
    let s = s0;
    const old = s.head!;
    const value = node(s, old).value;
    const v = fmt(value);
    yield st(
      s,
      'removeHead(): is head null? No, so there is a node to remove.',
      ['removeHead.check'],
      {
        marks: [mark('p:head', 'active')],
        level: 3,
      },
    );
    yield st(s, `Save x = head.value = ${v}, the value we will return.`, ['removeHead.save'], {
      marks: [mark(nid(old), 'remove')],
      vars: { x: value },
    });
    const next = node(s, old).next;
    s = { ...s, head: next };
    const tailHolds = settings.tail === 'on' && next === null;
    yield st(
      s,
      next === null
        ? `head = head.next, which is null: the list is empty now.${tailHolds ? ' tail still points at the old node, though.' : ` Nothing points at ${v}'s node any more, so it is garbage.`}`
        : `head = head.next: head moves to ${val(s, next)}. Nothing points at ${v}'s node any more, so it is garbage.`,
      ['removeHead.move'],
      { marks: [mark('p:head', 'active')], vars: { x: value } },
    );
    if (settings.tail === 'on') {
      yield st(
        s,
        next === null
          ? 'Is head null now? Yes, so the list is empty and tail must not keep pointing at the old node.'
          : 'Is head null now? No, so tail stays.',
        ['removeHead.last'],
        { level: 3, vars: { x: value } },
      );
      if (next === null) {
        s = { ...s, tail: null };
        yield st(
          s,
          `tail = null. Now nothing points at ${v}'s node: it is garbage.`,
          ['removeHead.tail'],
          {
            marks: [mark('p:tail', 'active')],
            vars: { x: value },
          },
        );
      }
    }
    s = { ...s, size: s.size - 1 };
    return yield* collect(
      s,
      'removeHead',
      old,
      value,
      ['removeHead.size', 'removeHead.return'],
      { x: value },
      false,
    );
  },
};

const removeTail: Op = {
  label: 'Remove tail',
  arity: 0,
  *run(s0, _args, { settings }) {
    if (s0.head === null) {
      yield emptyError(s0, 'removeTail');
      return s0;
    }
    const tailOn = settings.tail === 'on';
    let s = s0;
    yield st(
      s,
      'removeTail(): is head null? No, so there is a node to remove.',
      ['removeTail.check'],
      {
        marks: [mark('p:head', 'active')],
        level: 3,
      },
    );
    const h = s.head!;
    if (node(s, h).next === null) {
      const value = node(s, h).value;
      const v = fmt(value);
      yield st(
        s,
        `Is head.next null? Yes: ${v} is the only node, so it is both first and last.`,
        ['removeTail.one'],
        { marks: [mark(nid(h), 'remove')], level: 2 },
      );
      yield st(s, `Save x = head.value = ${v}.`, ['removeTail.save1'], {
        marks: [mark(nid(h), 'remove')],
        vars: { x: value },
      });
      s = { ...s, head: null };
      yield st(
        s,
        `head = null.${tailOn ? '' : ` Nothing points at ${v}'s node now: it is garbage.`}`,
        ['removeTail.clear'],
        { marks: [mark('p:head', 'active')], vars: { x: value } },
      );
      if (tailOn) {
        s = { ...s, tail: null };
        yield st(
          s,
          `tail = null. Nothing points at ${v}'s node now: it is garbage.`,
          ['removeTail.clearTail'],
          {
            marks: [mark('p:tail', 'active')],
            vars: { x: value },
          },
        );
      }
      s = { ...s, size: s.size - 1 };
      return yield* collect(
        s,
        'removeTail',
        h,
        value,
        ['removeTail.size', 'removeTail.return'],
        { x: value },
        false,
      );
    }

    yield st(
      s,
      tailOn
        ? 'Is head.next null? No. To remove the last node we need the node before it, and tail cannot tell us which that is: nodes only point forward. So we walk.'
        : 'Is head.next null? No. We need the node before the last one, so we walk from head.',
      ['removeTail.one'],
      { level: 2 },
    );
    let prev = h;
    let hops = 0;
    const more = () => ({ prev: pv(s, prev), hops });
    yield st(s, `prev = head: prev starts at ${val(s, prev)}.`, ['removeTail.start'], {
      marks: [mark('p:prev', 'active')],
      ptrs: { prev },
      vars: more(),
    });
    const isSecondLast = (u: number) => node(s, node(s, u).next!).next === null;
    while (!isSecondLast(prev)) {
      yield st(
        s,
        tailOn
          ? `prev.next is ${val(s, node(s, prev).next)}, not tail, so keep going.`
          : `prev.next.next is not null, so ${val(s, node(s, prev).next)} is not the last node. Keep going.`,
        ['removeTail.loop'],
        { marks: [mark(nid(prev), 'compare')], ptrs: { prev }, level: 3, vars: more() },
      );
      prev = node(s, prev).next!;
      hops++;
      yield st(
        s,
        `prev = prev.next: prev moves to ${val(s, prev)}. Hops so far: ${hops}.`,
        ['removeTail.move'],
        {
          marks: [mark('p:prev', 'active'), mark(nid(prev), 'visit')],
          ptrs: { prev },
          vars: more(),
        },
      );
    }
    const last = node(s, prev).next!;
    const value = node(s, last).value;
    const v = fmt(value);
    yield st(
      s,
      tailOn
        ? `prev.next is tail, so prev (${val(s, prev)}) is the node before the last. That took ${plural(hops, 'hop')}, tail pointer or not.`
        : `prev.next.next is null, so prev (${val(s, prev)}) is the node before the last. That took ${plural(hops, 'hop')}.`,
      ['removeTail.loop'],
      {
        marks: [mark(nid(prev), 'found'), mark(nid(last), 'remove')],
        ptrs: { prev },
        vars: more(),
      },
    );
    yield st(s, `Save x = prev.next.value = ${v}.`, ['removeTail.save'], {
      marks: [mark(nid(last), 'remove')],
      ptrs: { prev },
      vars: { ...more(), x: value },
    });
    s = setNext(s, prev, null);
    yield st(
      s,
      tailOn
        ? `prev.next = null: ${val(s, prev)} is the end of the list now. tail still points at ${v}'s node, though.`
        : `prev.next = null: ${val(s, prev)} is the end of the list now. Nothing points at ${v}'s node: it is garbage.`,
      ['removeTail.unlink'],
      { marks: [mark(nextId(prev), 'active')], ptrs: { prev }, vars: { ...more(), x: value } },
    );
    if (tailOn) {
      s = { ...s, tail: prev };
      yield st(
        s,
        `tail = prev: tail moves back to ${val(s, prev)}. Nothing points at ${v}'s node now: it is garbage.`,
        ['removeTail.tail'],
        { marks: [mark('p:tail', 'active')], ptrs: { prev }, vars: { ...more(), x: value } },
      );
    }
    s = { ...s, size: s.size - 1 };
    return yield* collect(
      s,
      'removeTail',
      last,
      value,
      ['removeTail.size', 'removeTail.return'],
      { x: value, hops },
      false,
    );
  },
};

/**
 * Unlink cur (with prev just before it, or null when cur is the head), fix tail, and finish.
 * Shared by removeAt and removeValue, which differ only in how they find cur.
 */
function* unlink(
  s0: S,
  op: string,
  prev: number | null,
  cur: number,
  tailOn: boolean,
  more: Record<string, Scalar>,
  returnLines: string[],
  returned: Scalar,
): Generator<ListStep, S, void> {
  let s = s0;
  const ptrs = { prev, cur };
  const nullAt = { prev: 'before' as const };
  const after = node(s, cur).next;
  const value = node(s, cur).value;
  const v = fmt(value);
  const m = () => ({ ...more, prev: pv(s, prev), cur: pv(s, cur) });
  yield st(
    s,
    prev === null
      ? `Is prev null? Yes: ${v} is the first node, so head has to change.`
      : `Is prev null? No: ${val(s, prev)} comes before ${v}, so its next has to change.`,
    [`${op}.front`],
    { marks: [mark(nid(cur), 'remove')], ptrs, nullAt, level: 3, vars: m() },
  );
  if (prev === null) {
    s = { ...s, head: after };
    yield st(
      s,
      `head = cur.next: head moves to ${val(s, after)}. ${v} is out of the list, though cur still points at it.`,
      [`${op}.head`],
      { marks: [mark('p:head', 'active'), mark(nid(cur), 'remove')], ptrs, nullAt, vars: m() },
    );
  } else {
    s = setNext(s, prev, after);
    yield st(
      s,
      `prev.next = cur.next: ${val(s, prev)} now points past ${v}, at ${val(s, after)}. ${v} is out of the list, though cur still points at it.`,
      [`${op}.unlink`],
      { marks: [mark(nextId(prev), 'active'), mark(nid(cur), 'remove')], ptrs, nullAt, vars: m() },
    );
  }
  if (tailOn) {
    const wasTail = s.tail === cur;
    yield st(
      s,
      wasTail
        ? `Is cur the tail? Yes, so tail must move back to prev${prev === null ? ', which is null' : ''}.`
        : 'Is cur the tail? No, so tail stays.',
      [`${op}.last`],
      { ptrs, nullAt, level: 3, vars: m() },
    );
    if (wasTail) {
      s = { ...s, tail: prev };
      yield st(
        s,
        prev === null
          ? 'tail = prev = null: the list is empty now.'
          : `tail = prev: tail moves back to ${val(s, prev)}.`,
        [`${op}.tail`],
        { marks: [mark('p:tail', 'active')], ptrs, nullAt, vars: m() },
      );
    }
  }
  s = { ...s, size: s.size - 1 };
  yield st(s, `n = ${s.size}.`, [`${op}.size`], {
    marks: [mark(nid(cur), 'remove')],
    ptrs,
    nullAt,
    vars: m(),
  });
  return yield* collect(s, op, cur, value, returnLines, more, true, returned);
}

const removeAt: Op = {
  label: 'Remove at index',
  arity: 1,
  *run(s0, [i], { settings }) {
    const bad = badIndex(i, s0.size - 1);
    if (bad !== null) {
      yield indexError(s0, 'removeAt', i === undefined ? '' : fmt(i), bad, [
        'removeAt.check',
        'removeAt.error',
      ]);
      return s0;
    }
    const s = s0;
    const index = i as number;
    yield st(
      s,
      `removeAt(${index}): i = ${index} is between 0 and n - 1 = ${s.size - 1}, so it is valid.`,
      ['removeAt.check'],
      { level: 3, vars: { i: index } },
    );
    let prev: number | null = null;
    let cur = s.head!;
    let hops = 0;
    const nullAt = { prev: 'before' as const };
    const more = () => ({ i: index, prev: pv(s, prev), cur: pv(s, cur), hops });
    yield st(
      s,
      `prev = null and cur = head: cur starts at ${val(s, cur)}, index 0.`,
      ['removeAt.init'],
      {
        marks: [mark('p:cur', 'active')],
        ptrs: { prev, cur },
        nullAt,
        vars: more(),
      },
    );
    for (let k = 1; k <= index; k++) {
      prev = cur;
      cur = node(s, cur).next!;
      hops++;
      yield st(
        s,
        `prev = cur and cur = cur.next: prev is at ${val(s, prev)} and cur at ${val(s, cur)}, index ${k}. Hops: ${hops} of ${index}.`,
        ['removeAt.loop', 'removeAt.move'],
        {
          marks: [mark('p:prev', 'active'), mark('p:cur', 'active')],
          ptrs: { prev, cur },
          nullAt,
          vars: more(),
        },
      );
    }
    const value = node(s, cur).value;
    return yield* unlink(
      s,
      'removeAt',
      prev,
      cur,
      settings.tail === 'on',
      { i: index, hops, x: value },
      ['removeAt.return'],
      value,
    );
  },
};

const removeValue: Op = {
  label: 'Remove value',
  arity: 1,
  *run(s0, [x], { settings }) {
    const value = x as Value;
    const v = fmt(value);
    const s = s0;
    let prev: number | null = null;
    let cur: number | null = s.head;
    let comparisons = 0;
    const nullAt = { prev: 'before' as const, cur: 'after' as const };
    const more = () => ({ x: value, prev: pv(s, prev), cur: pv(s, cur), comparisons });
    yield st(
      s,
      cur === null
        ? `removeValue(${v}): prev = null and cur = head, which is null. The list is empty.`
        : `removeValue(${v}): prev = null and cur = head, at ${val(s, cur)}. Look for ${v} from the front.`,
      ['removeValue.init'],
      { marks: [mark('p:cur', 'active')], ptrs: { prev, cur }, nullAt, vars: more() },
    );
    while (cur !== null) {
      comparisons++;
      const hit = node(s, cur).value === value;
      yield st(
        s,
        hit
          ? `Is cur.value equal to ${v}? Yes, cur is at ${v}.`
          : `Is cur.value (${val(s, cur)}) equal to ${v}? No.`,
        ['removeValue.loop'],
        {
          marks: [mark(nid(cur), hit ? 'found' : 'compare')],
          ptrs: { prev, cur },
          nullAt,
          vars: more(),
        },
      );
      if (hit) break;
      prev = cur;
      cur = node(s, cur).next;
      yield st(
        s,
        cur === null
          ? `prev = cur and cur = cur.next: cur falls off the end of the list.`
          : `prev = cur and cur = cur.next: prev is at ${val(s, prev)}, cur at ${val(s, cur)}.`,
        ['removeValue.prev', 'removeValue.move'],
        {
          marks: [mark('p:prev', 'active'), mark('p:cur', 'active')],
          ptrs: { prev, cur },
          nullAt,
          level: 3,
          vars: more(),
        },
      );
    }
    yield st(
      s,
      cur === null ? 'Is cur null? Yes.' : 'Is cur null? No, so we found it.',
      ['removeValue.check'],
      { ptrs: { prev, cur }, nullAt, level: 3, vars: more() },
    );
    if (cur === null) {
      yield st(
        s,
        `${v} is not in the list (${plural(comparisons, 'comparison')}). Return false; the list does not change.`,
        ['removeValue.check', 'removeValue.none'],
        { level: 1, vars: { x: value, comparisons, returned: false } },
      );
      return s;
    }
    return yield* unlink(
      s,
      'removeValue',
      prev,
      cur,
      settings.tail === 'on',
      { x: value, comparisons },
      ['removeValue.return'],
      true,
    );
  },
};

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [x]) {
    const value = x as Value;
    const v = fmt(value);
    let cur = s.head;
    let i = 0;
    let comparisons = 0;
    const nullAt = { cur: 'after' as const };
    const more = () => ({ x: value, cur: pv(s, cur), i, comparisons });
    yield st(
      s,
      cur === null
        ? `search(${v}): cur = head, which is null. The list is empty.`
        : `search(${v}): start cur at head, ${val(s, cur)}, with i = 0.`,
      ['search.init'],
      { marks: [mark('p:cur', 'active')], ptrs: { cur }, nullAt, vars: more() },
    );
    while (cur !== null) {
      comparisons++;
      const hit = node(s, cur).value === value;
      yield st(
        s,
        hit
          ? `Is cur.value equal to ${v}? Yes!`
          : `Is cur.value (${val(s, cur)}) equal to ${v}? No.`,
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
      yield st(
        s,
        cur === null
          ? 'cur = cur.next, which is null: we fell off the end.'
          : `cur = cur.next: cur moves to ${val(s, cur)}, i = ${i}.`,
        ['search.move', 'search.inc'],
        { marks: [mark('p:cur', 'active')], ptrs: { cur }, nullAt, level: 3, vars: more() },
      );
    }
    yield st(
      s,
      `${v} is not in the list (${plural(comparisons, 'comparison')}). Return -1.`,
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
      yield indexError(s, 'get', i === undefined ? '' : fmt(i), bad, ['get.check', 'get.error']);
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
    let cur = s.head!;
    let hops = 0;
    const more = () => ({ i: index, cur: pv(s, cur), hops });
    yield st(
      s,
      `cur = head: cur starts at ${val(s, cur)}, index 0. A linked list has no shortcut to index ${index}; we follow ${plural(index, 'pointer')}.`,
      ['get.init'],
      { marks: [mark('p:cur', 'active')], ptrs: { cur }, vars: more() },
    );
    for (let k = 1; k <= index; k++) {
      cur = node(s, cur).next!;
      hops++;
      yield st(
        s,
        `cur = cur.next: cur moves to ${val(s, cur)}, index ${k}.`,
        ['get.loop', 'get.move'],
        {
          marks: [mark('p:cur', 'active'), mark(nid(cur), 'visit')],
          ptrs: { cur },
          vars: more(),
        },
      );
    }
    const value = node(s, cur).value;
    yield st(
      s,
      `Return cur.value = ${fmt(value)}. That took ${plural(hops, 'hop')}; an array would take none.`,
      ['get.return'],
      {
        marks: [mark(nid(cur), 'found')],
        ptrs: { cur },
        level: 1,
        vars: { ...more(), returned: value },
      },
    );
    return s;
  },
};

const reverse: Op = {
  label: 'Reverse',
  arity: 0,
  *run(s0, _args, { settings }) {
    const tailOn = settings.tail === 'on';
    let s = s0;
    let prev: number | null = null;
    let cur: number | null = s.head;
    let next: number | null = null;
    let reversed = 0;
    const nullAt = { prev: 'before' as const, cur: 'after' as const, next: 'after' as const };
    const ptrs = (withNext: boolean): Record<string, number | null> =>
      withNext ? { prev, cur, next } : { prev, cur };
    const more = () => ({ prev: pv(s, prev), cur: pv(s, cur), next: pv(s, next), reversed });
    yield st(
      s,
      cur === null
        ? 'reverse(): prev = null and cur = head, which is null. An empty list is its own reverse.'
        : `reverse(): prev = null and cur = head (${val(s, cur)}). We turn each next pointer around, one node at a time, from front to back.`,
      ['reverse.init'],
      {
        marks: [mark('p:cur', 'active'), mark('p:prev', 'active')],
        ptrs: ptrs(false),
        nullAt,
        vars: more(),
      },
    );
    if (tailOn && cur !== null) {
      s = { ...s, tail: cur };
      yield st(
        s,
        `tail = head: the first node, ${val(s, cur)}, will be the last one.`,
        ['reverse.tail'],
        {
          marks: [mark('p:tail', 'active')],
          ptrs: ptrs(false),
          nullAt,
          vars: more(),
        },
      );
    }
    let first = true;
    while (cur !== null) {
      yield st(s, 'Is cur null? No, so there is another node to turn around.', ['reverse.loop'], {
        ptrs: ptrs(!first),
        nullAt,
        level: 3,
        vars: more(),
      });
      next = node(s, cur).next;
      yield st(
        s,
        next === null
          ? `next = cur.next, which is null: ${val(s, cur)} is the last node.`
          : `next = cur.next: save ${val(s, next)} first. Once we change cur.next, next is the only way back to the rest of the list.`,
        ['reverse.save'],
        { marks: [mark('p:next', 'active')], ptrs: ptrs(true), nullAt, vars: more() },
      );
      s = setNext(s, cur, prev);
      reversed++;
      yield st(
        s,
        prev === null
          ? `cur.next = prev, which is null: ${val(s, cur)} will be the last node, so it points at nothing.`
          : `cur.next = prev: ${val(s, cur)} now points back at ${val(s, prev)}.`,
        ['reverse.flip'],
        { marks: [mark(nextId(cur), 'active')], ptrs: ptrs(true), nullAt, vars: more() },
      );
      prev = cur;
      yield st(s, `prev = cur: prev moves up to ${val(s, prev)}.`, ['reverse.prev'], {
        marks: [mark('p:prev', 'active')],
        ptrs: ptrs(true),
        nullAt,
        vars: more(),
      });
      cur = next;
      yield st(
        s,
        cur === null
          ? `cur = next, which is null. ${plural(reversed, 'node')} turned around.`
          : `cur = next: cur moves up to ${val(s, cur)}. ${plural(reversed, 'node')} turned around so far.`,
        ['reverse.cur'],
        { marks: [mark('p:cur', 'active')], ptrs: ptrs(true), nullAt, vars: more(), level: 1 },
      );
      first = false;
    }
    if (s0.head !== null) {
      yield st(s, 'Is cur null? Yes, every node has been turned around.', ['reverse.loop'], {
        ptrs: ptrs(true),
        nullAt,
        level: 3,
        vars: more(),
      });
    }
    s = { ...s, head: prev };
    yield st(
      s,
      prev === null
        ? 'head = prev, which is null. Nothing to do.'
        : `head = prev: head moves to ${val(s, prev)}, the old last node.`,
      ['reverse.head'],
      { marks: [mark('p:head', 'active')], ptrs: ptrs(s0.head !== null), nullAt, vars: more() },
    );
    const done = tidy(s);
    yield st(
      done,
      s0.head === null
        ? 'The list is still empty.'
        : `Reversed in one pass, ${plural(reversed, 'pointer')} changed and no node moved in memory. Redrawn from head: ${chain(done)}.`,
      ['reverse.head'],
      { level: 1, vars: { reversed } },
    );
    return done;
  },
};

export const ops = {
  insertHead,
  insertTail,
  insertAt,
  removeHead,
  removeTail,
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

export function pseudocode(settings: ListSettings): PseudoBlock[] {
  const on = settings.tail === 'on';
  const only = (cond: boolean, ...lines: PseudoLine[]) => (cond ? lines : []);
  return [
    {
      op: 'insertHead',
      lines: [
        L('insertHead.sig', 0, 'insertHead(x)', 'To insert x at the front:'),
        L('insertHead.new', 1, 'new = Node(x)', 'Make a new node holding x.'),
        L('insertHead.link', 1, 'new.next = head', 'Point it at the current first node.'),
        L('insertHead.head', 1, 'head = new', 'Make it the first node.'),
        ...only(
          on,
          L('insertHead.check', 1, 'if tail == null', 'If the list was empty,'),
          L('insertHead.tail', 2, 'tail = new', 'it is also the last node.'),
        ),
        L('insertHead.size', 1, 'n = n + 1', 'Count one more node.'),
      ],
    },
    {
      op: 'insertTail',
      lines: [
        L('insertTail.sig', 0, 'insertTail(x)', 'To insert x at the end:'),
        L('insertTail.new', 1, 'new = Node(x)', 'Make a new node holding x.'),
        L('insertTail.check', 1, 'if head == null', 'If the list is empty,'),
        L('insertTail.head', 2, 'head = new', 'it becomes the first node.'),
        L('insertTail.else', 1, 'else', 'Otherwise,'),
        ...(on
          ? [L('insertTail.link', 2, 'tail.next = new', 'hook it onto the last node.')]
          : [
              L('insertTail.start', 2, 'cur = head', 'start at the first node'),
              L('insertTail.loop', 2, 'while cur.next != null', 'and, until cur is the last node,'),
              L('insertTail.move', 3, 'cur = cur.next', 'step to the next node.'),
              L('insertTail.link', 2, 'cur.next = new', 'Hook the new node onto the last one.'),
            ]),
        ...only(on, L('insertTail.tail', 1, 'tail = new', 'The new node is the last one now.')),
        L('insertTail.size', 1, 'n = n + 1', 'Count one more node.'),
      ],
    },
    {
      op: 'insertAt',
      lines: [
        L('insertAt.sig', 0, 'insertAt(i, x)', 'To insert x so it ends up at index i:'),
        L('insertAt.check', 1, 'if i < 0 or i > n', 'If i is not a position from 0 to n,'),
        L('insertAt.error', 2, 'error "index out of range"', 'stop with an error.'),
        L('insertAt.new', 1, 'new = Node(x)', 'Make a new node holding x.'),
        L('insertAt.front', 1, 'if i == 0', 'If it goes in front,'),
        L('insertAt.link0', 2, 'new.next = head', 'point it at the first node'),
        L('insertAt.head', 2, 'head = new', 'and make it the first node.'),
        L('insertAt.else', 1, 'else', 'Otherwise,'),
        L('insertAt.start', 2, 'prev = head', 'start prev at the first node'),
        L('insertAt.loop', 2, 'repeat i - 1 times', 'and step forward i - 1 times'),
        L('insertAt.move', 3, 'prev = prev.next', 'to reach the node before index i.'),
        L('insertAt.link1', 2, 'new.next = prev.next', 'Point the new node at the one after prev,'),
        L('insertAt.link2', 2, 'prev.next = new', 'then point prev at the new node.'),
        ...only(
          on,
          L('insertAt.last', 1, 'if new.next == null', 'If the new node is the last one,'),
          L('insertAt.tail', 2, 'tail = new', 'move tail to it.'),
        ),
        L('insertAt.size', 1, 'n = n + 1', 'Count one more node.'),
      ],
    },
    {
      op: 'removeHead',
      lines: [
        L('removeHead.sig', 0, 'removeHead()', 'To remove the first node:'),
        L('removeHead.check', 1, 'if head == null', 'If the list is empty,'),
        L('removeHead.error', 2, 'error "list is empty"', 'stop with an error.'),
        L('removeHead.save', 1, 'x = head.value', 'Remember the first value.'),
        L('removeHead.move', 1, 'head = head.next', 'Make the second node the first.'),
        ...only(
          on,
          L('removeHead.last', 1, 'if head == null', 'If that emptied the list,'),
          L('removeHead.tail', 2, 'tail = null', 'there is no last node either.'),
        ),
        L('removeHead.size', 1, 'n = n - 1', 'Count one fewer node.'),
        L('removeHead.return', 1, 'return x', 'Hand back the value.'),
      ],
    },
    {
      op: 'removeTail',
      lines: [
        L('removeTail.sig', 0, 'removeTail()', 'To remove the last node:'),
        L('removeTail.check', 1, 'if head == null', 'If the list is empty,'),
        L('removeTail.error', 2, 'error "list is empty"', 'stop with an error.'),
        L('removeTail.one', 1, 'if head.next == null', 'If there is only one node,'),
        L('removeTail.save1', 2, 'x = head.value', 'remember its value'),
        L('removeTail.clear', 2, 'head = null', 'and empty the list.'),
        ...only(on, L('removeTail.clearTail', 2, 'tail = null', 'No last node either.')),
        L('removeTail.else', 1, 'else', 'Otherwise,'),
        L('removeTail.start', 2, 'prev = head', 'start prev at the first node'),
        on
          ? L(
              'removeTail.loop',
              2,
              'while prev.next != tail',
              'and, until the next node is the last,',
            )
          : L(
              'removeTail.loop',
              2,
              'while prev.next.next != null',
              'and, until the next node is the last,',
            ),
        L('removeTail.move', 3, 'prev = prev.next', 'step forward.'),
        L('removeTail.save', 2, 'x = prev.next.value', 'Remember the last value.'),
        L('removeTail.unlink', 2, 'prev.next = null', 'Cut the last node off.'),
        ...only(on, L('removeTail.tail', 2, 'tail = prev', 'prev is the last node now.')),
        L('removeTail.size', 1, 'n = n - 1', 'Count one fewer node.'),
        L('removeTail.return', 1, 'return x', 'Hand back the value.'),
      ],
    },
    {
      op: 'removeAt',
      lines: [
        L('removeAt.sig', 0, 'removeAt(i)', 'To remove the node at index i:'),
        L('removeAt.check', 1, 'if i < 0 or i >= n', 'If there is no node at index i,'),
        L('removeAt.error', 2, 'error "index out of range"', 'stop with an error.'),
        L(
          'removeAt.init',
          1,
          'prev = null; cur = head',
          'Start cur at the first node, prev before it.',
        ),
        L('removeAt.loop', 1, 'repeat i times', 'Step forward i times,'),
        L('removeAt.move', 2, 'prev = cur; cur = cur.next', 'keeping prev one node behind cur.'),
        L('removeAt.front', 1, 'if prev == null', 'If cur is the first node,'),
        L('removeAt.head', 2, 'head = cur.next', 'the next node becomes the first.'),
        L('removeAt.else', 1, 'else', 'Otherwise'),
        L('removeAt.unlink', 2, 'prev.next = cur.next', 'make prev skip over cur.'),
        ...only(
          on,
          L('removeAt.last', 1, 'if cur == tail', 'If cur was the last node,'),
          L('removeAt.tail', 2, 'tail = prev', 'prev is the last node now.'),
        ),
        L('removeAt.size', 1, 'n = n - 1', 'Count one fewer node.'),
        L('removeAt.return', 1, 'return cur.value', 'Hand back the removed value.'),
      ],
    },
    {
      op: 'removeValue',
      lines: [
        L('removeValue.sig', 0, 'removeValue(x)', 'To remove the first node holding x:'),
        L(
          'removeValue.init',
          1,
          'prev = null; cur = head',
          'Start cur at the first node, prev before it.',
        ),
        L(
          'removeValue.loop',
          1,
          'while cur != null and cur.value != x',
          'Until cur is past the end or holds x,',
        ),
        L('removeValue.prev', 2, 'prev = cur', 'move prev up to cur'),
        L('removeValue.move', 2, 'cur = cur.next', 'and cur to the next node.'),
        L('removeValue.check', 1, 'if cur == null', 'If we ran off the end,'),
        L('removeValue.none', 2, 'return false', 'x is not in the list.'),
        L('removeValue.front', 1, 'if prev == null', 'If cur is the first node,'),
        L('removeValue.head', 2, 'head = cur.next', 'the next node becomes the first.'),
        L('removeValue.else', 1, 'else', 'Otherwise'),
        L('removeValue.unlink', 2, 'prev.next = cur.next', 'make prev skip over cur.'),
        ...only(
          on,
          L('removeValue.last', 1, 'if cur == tail', 'If cur was the last node,'),
          L('removeValue.tail', 2, 'tail = prev', 'prev is the last node now.'),
        ),
        L('removeValue.size', 1, 'n = n - 1', 'Count one fewer node.'),
        L('removeValue.return', 1, 'return true', 'Report that x was removed.'),
      ],
    },
    {
      op: 'search',
      lines: [
        L('search.sig', 0, 'search(x)', 'To find the index of x:'),
        L('search.init', 1, 'cur = head; i = 0', 'Start at the first node, index 0.'),
        L('search.loop', 1, 'while cur != null', 'Until we run off the end:'),
        L('search.cmp', 2, 'if cur.value == x', 'if this node holds x,'),
        L('search.found', 3, 'return i', 'hand back its index.'),
        L('search.move', 2, 'cur = cur.next', 'Step to the next node'),
        L('search.inc', 2, 'i = i + 1', 'and count its index.'),
        L('search.none', 1, 'return -1', 'x is not in the list.'),
      ],
    },
    {
      op: 'get',
      lines: [
        L('get.sig', 0, 'get(i)', 'To read the value at index i:'),
        L('get.check', 1, 'if i < 0 or i >= n', 'If there is no node at index i,'),
        L('get.error', 2, 'error "index out of range"', 'stop with an error.'),
        L('get.init', 1, 'cur = head', 'Start at the first node.'),
        L('get.loop', 1, 'repeat i times', 'Step forward i times:'),
        L('get.move', 2, 'cur = cur.next', 'follow the next pointer.'),
        L('get.return', 1, 'return cur.value', 'Hand back the value there.'),
      ],
    },
    {
      op: 'reverse',
      lines: [
        L('reverse.sig', 0, 'reverse()', 'To reverse the list in place:'),
        L(
          'reverse.init',
          1,
          'prev = null; cur = head',
          'Start cur at the first node, with nothing behind it.',
        ),
        ...only(on, L('reverse.tail', 1, 'tail = head', 'The first node will end up last.')),
        L('reverse.loop', 1, 'while cur != null', 'For every node, front to back:'),
        L('reverse.save', 2, 'next = cur.next', 'remember the node after it,'),
        L('reverse.flip', 2, 'cur.next = prev', 'point it back at the node before it,'),
        L('reverse.prev', 2, 'prev = cur', 'move prev up'),
        L('reverse.cur', 2, 'cur = next', 'and move cur up.'),
        L('reverse.head', 1, 'head = prev', 'The old last node is the new first.'),
      ],
    },
  ];
}

export function initialSay(_state: S, settings: ListSettings): string {
  return settings.tail === 'on'
    ? 'An empty singly linked list: head and tail are both null. Each node will hold a value and a next pointer.'
    : 'An empty singly linked list with only a head pointer, which is null. Each node will hold a value and a next pointer.';
}

export function initialVars(state: S): Record<string, Scalar> {
  return vars(state);
}

/** Screen-reader summary of the list itself. */
export function describe(state: S, settings: ListSettings): string {
  if (state.head === null) {
    return settings.tail === 'on'
      ? 'Empty singly linked list: head and tail are null.'
      : 'Empty singly linked list: head is null.';
  }
  const tail =
    settings.tail === 'on' && state.tail !== null ? ` tail → ${val(state, state.tail)}.` : '';
  return `Singly linked list with ${plural(state.size, 'node')}: ${chain(state)}.${tail}`;
}
