import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, mark } from '../_recursion/kit';

export const MAX_VARS = 6;
export const MAX_OBJECTS = 6;
export const MAX_ITEMS = 8;
export const MAX_NAME = 6;

export interface Item {
  uid: number;
  v: number;
}

/** What a variable's box holds. */
export type Cell =
  | { kind: 'num'; v: number }
  /** A reference to a heap object (Python and Java). */
  | { kind: 'ref'; obj: number }
  /** A list stored in the variable itself (C++ values). */
  | { kind: 'list'; items: Item[] }
  /** Another name for a variable (a C++ reference). */
  | { kind: 'alias'; frame: number; name: string };

export interface Var {
  uid: number;
  name: string;
  cell: Cell;
}

export interface Frame {
  id: number;
  /** "main" or the call, e.g. "grow(a)". */
  title: string;
  vars: Var[];
}

export interface Obj {
  id: number;
  items: Item[];
  /** No variable refers to it any more. */
  garbage: boolean;
}

export interface MemState {
  frames: Frame[];
  heap: Obj[];
  next: number;
  /** Values, references and elements copied so far. */
  copied: number;
}

export interface MemSettings {
  [key: string]: Scalar;
  /** refs: Python and Java (variables hold references to objects). values: C++. */
  lang: 'refs' | 'values';
}

type S = MemState;
type Op = OpSpec<S, MemSettings, undefined>;
type MemStep = Step<S, undefined>;

export const defaults: MemSettings = { lang: 'refs' };

export function init(): S {
  return { frames: [{ id: 0, title: 'main', vars: [] }], heap: [], next: 1, copied: 0 };
}

// ----- Statements -----

export const FUNCTIONS = ['grow', 'reset', 'bump'] as const;
export const REF_FUNCTIONS = ['growRef', 'resetRef', 'bumpRef'] as const;
type Fn = (typeof FUNCTIONS)[number] | (typeof REF_FUNCTIONS)[number];
const RESERVED = new Set<string>([...FUNCTIONS, ...REF_FUNCTIONS, 'clear', 'append']);

export type Stmt =
  | { t: 'num'; name: string; v: number }
  | { t: 'list'; name: string; items: number[] }
  | { t: 'copy'; name: string; from: string }
  | { t: 'ref'; name: string; from: string }
  | { t: 'append'; name: string; v: number }
  | { t: 'set'; name: string; i: number; v: number }
  | { t: 'call'; fn: Fn; arg: string };

const NAME = '([a-z][a-z0-9_]*)';
const INT = '(-?\\d+)';

const USAGE =
  'Try x = 5, xs = [1, 2], ys = xs, ys.append(3), xs[0] = 9, grow(xs), reset(xs) or bump(x). In C++ mode also &r = x, growRef(xs), resetRef(xs) and bumpRef(x).';

function checkName(n: string): string | null {
  if (n.length > MAX_NAME) return `Keep names to ${MAX_NAME} letters or fewer.`;
  if (RESERVED.has(n)) return `${n} is taken: pick another name.`;
  return null;
}

function checkValue(v: number): string | null {
  return v >= -99 && v <= 999 ? null : 'Keep numbers from -99 to 999.';
}

/** Read one statement, or say what is wrong with it. */
export function readStmt(raw: Value | undefined): Stmt | string {
  const t = String(raw ?? '')
    .trim()
    .replace(/;$/, '')
    .replace(/\s+/g, ' ');
  let m: RegExpExecArray | null;
  let s: Stmt | null = null;
  if ((m = new RegExp(`^& ?${NAME} ?= ?${NAME}$`).exec(t)))
    s = { t: 'ref', name: m[1]!, from: m[2]! };
  else if ((m = new RegExp(`^${NAME} ?= ?${INT}$`).exec(t)))
    s = { t: 'num', name: m[1]!, v: Number(m[2]) };
  else if ((m = new RegExp(`^${NAME} ?= ?\\[ ?((?:-?\\d+ ?(?:, ?-?\\d+ ?)*)?)\\]$`).exec(t)))
    s = {
      t: 'list',
      name: m[1]!,
      items: m[2]!.trim() ? m[2]!.split(',').map((x) => Number(x.trim())) : [],
    };
  else if ((m = new RegExp(`^${NAME} ?= ?${NAME}$`).exec(t)))
    s = { t: 'copy', name: m[1]!, from: m[2]! };
  else if ((m = new RegExp(`^${NAME}\\.append\\( ?${INT} ?\\)$`).exec(t)))
    s = { t: 'append', name: m[1]!, v: Number(m[2]) };
  else if ((m = new RegExp(`^${NAME}\\[ ?(\\d+) ?\\] ?= ?${INT}$`).exec(t)))
    s = { t: 'set', name: m[1]!, i: Number(m[2]), v: Number(m[3]) };
  else if ((m = new RegExp(`^([a-zA-Z]+)\\( ?${NAME} ?\\)$`).exec(t))) {
    const fn = m[1]!;
    if (![...FUNCTIONS, ...REF_FUNCTIONS].includes(fn as Fn))
      return `There is no function ${fn} here. The functions are grow, reset and bump (and growRef, resetRef and bumpRef in C++ mode).`;
    s = { t: 'call', fn: fn as Fn, arg: m[2]! };
  }
  if (!s) return USAGE;
  if ('name' in s) {
    const bad = checkName(s.name);
    if (bad) return bad;
  }
  if (s.t === 'num' || s.t === 'append' || s.t === 'set') {
    const bad = checkValue(s.v);
    if (bad) return bad;
  }
  if (s.t === 'list') {
    if (s.items.length > MAX_ITEMS) return `Keep lists to ${MAX_ITEMS} items.`;
    for (const v of s.items) {
      const bad = checkValue(v);
      if (bad) return bad;
    }
  }
  return s;
}

/** The statement written one standard way, as the code tabs read it. */
export function stmtText(s: Stmt): string {
  switch (s.t) {
    case 'num':
      return `${s.name} = ${s.v}`;
    case 'list':
      return `${s.name} = [${s.items.join(', ')}]`;
    case 'copy':
      return `${s.name} = ${s.from}`;
    case 'ref':
      return `&${s.name} = ${s.from}`;
    case 'append':
      return `${s.name}.append(${s.v})`;
    case 'set':
      return `${s.name}[${s.i}] = ${s.v}`;
    case 'call':
      return `${s.fn}(${s.arg})`;
  }
}

// ----- Looking things up -----

const top = (s: S) => s.frames[s.frames.length - 1]!;

function findVar(s: S, frameId: number, name: string): Var | undefined {
  return s.frames.find((f) => f.id === frameId)?.vars.find((v) => v.name === name);
}

/** The variable a name stands for, following a C++ reference to what it refers to. */
function resolve(s: S, frameId: number, name: string): { frame: number; v: Var } | undefined {
  const v = findVar(s, frameId, name);
  if (!v) return undefined;
  if (v.cell.kind === 'alias') {
    const target = findVar(s, v.cell.frame, v.cell.name);
    return target && { frame: v.cell.frame, v: target };
  }
  return { frame: frameId, v };
}

const objOf = (s: S, id: number) => s.heap.find((o) => o.id === id)!;

export const listText = (items: Item[]) => `[${items.map((x) => x.v).join(', ')}]`;

/** What a variable holds, in words: "5", "[1, 2]", "a reference to [1, 2]". */
export function valueText(s: S, cell: Cell): string {
  switch (cell.kind) {
    case 'num':
      return String(cell.v);
    case 'list':
      return listText(cell.items);
    case 'ref':
      return listText(objOf(s, cell.obj).items);
    case 'alias': {
      const t = findVar(s, cell.frame, cell.name);
      return t ? valueText(s, t.cell) : '?';
    }
  }
}

// ----- Changing state (always by copying) -----

function setVar(s: S, frameId: number, v: Var): S {
  return {
    ...s,
    frames: s.frames.map((f) =>
      f.id !== frameId
        ? f
        : {
            ...f,
            vars: f.vars.some((x) => x.uid === v.uid)
              ? f.vars.map((x) => (x.uid === v.uid ? v : x))
              : [...f.vars, v],
          },
    ),
  };
}

function setObj(s: S, o: Obj): S {
  return { ...s, heap: s.heap.map((x) => (x.id === o.id ? o : x)) };
}

function newItems(s: S, values: number[]): [S, Item[]] {
  const items = values.map((v, i) => ({ uid: s.next + i, v }));
  return [{ ...s, next: s.next + values.length }, items];
}

/** Mark objects that no variable refers to as garbage. */
function sweep(s: S): S {
  const live = new Set<number>();
  for (const f of s.frames) for (const v of f.vars) if (v.cell.kind === 'ref') live.add(v.cell.obj);
  return { ...s, heap: s.heap.map((o) => (live.has(o.id) ? o : { ...o, garbage: true })) };
}

const liveObjects = (s: S) => s.heap.filter((o) => !o.garbage).length;

// ----- Narration helpers -----

function vars(s: S): Record<string, Scalar> {
  return {
    'stack frames': s.frames.length,
    'heap objects': liveObjects(s),
    garbage: s.heap.length - liveObjects(s),
    copied: s.copied,
  };
}

const varId = (v: Var) => `var-${v.uid}`;
const arrowId = (v: Var) => `arrow-${v.uid}`;
const objId = (id: number) => `obj-${id}`;

/** Marks for a variable's box and, for a reference, its arrow and the object. */
function varMarks(s: S, v: Var, role: Mark['role']): Mark[] {
  const out = [mark(varId(v), role)];
  if (v.cell.kind === 'ref') out.push(mark(arrowId(v), role), mark(objId(v.cell.obj), role));
  if (v.cell.kind === 'alias') {
    const t = findVar(s, v.cell.frame, v.cell.name);
    if (t) out.push(mark(varId(t), role));
  }
  return out;
}

function step(
  s: S,
  say: string,
  lines: string[],
  marks: Mark[] = [],
  level: 1 | 2 | 3 = 1,
): MemStep {
  return { state: s, marks, say, lines, vars: vars(s), level };
}

class Refusal {
  constructor(readonly say: string) {}
}

// ----- Statements, step by step -----

type Gen = Generator<MemStep, S, void>;

/** Store a number or a list into `name` in the top frame (declaring it if new). */
function* assign(s: S, name: string, value: Cell, how: string, line: string, refs: boolean): Gen {
  const frame = top(s);
  const existing = findVar(s, frame.id, name);
  if (!refs && existing) {
    // C++: the type is fixed, and a reference writes through to what it refers to.
    const target = resolve(s, frame.id, name)!;
    const want = value.kind === 'num' ? 'num' : 'list';
    if (target.v.cell.kind !== want)
      throw new Refusal(
        `In C++ a variable keeps its type: ${name} holds ${target.v.cell.kind === 'num' ? 'a number' : 'a list'}. Use a new name.`,
      );
    const next = setVar(s, target.frame, { ...target.v, cell: value });
    const through =
      existing.cell.kind === 'alias'
        ? ` ${name} is a reference, so this writes to ${target.v.name}.`
        : '';
    yield step(next, `${how}${through}`, [line], [mark(varId(target.v), 'new')]);
    return next;
  }
  if (!existing && frame.vars.length >= MAX_VARS)
    throw new Refusal(
      `This page keeps ${MAX_VARS} variables in a frame. Use clear to start again.`,
    );
  const v: Var = existing ? { ...existing, cell: value } : { uid: s.next, name, cell: value };
  let next = setVar(existing ? s : { ...s, next: s.next + 1 }, frame.id, v);
  next = sweep(next);
  const freed = next.heap.filter((o) => o.garbage && !s.heap.find((x) => x.id === o.id)?.garbage);
  const gone = freed.length
    ? ` Nothing refers to ${listText(freed[0]!.items)} any more, so it is garbage.`
    : '';
  yield step(next, `${how}${gone}`, freed.length ? [line, 'run.gc'] : [line], [
    ...varMarks(next, v, 'new'),
    ...freed.map((o) => mark(objId(o.id), 'stale')),
  ]);
  return next;
}

function* runStmt(s: S, st: Stmt, refs: boolean): Gen {
  const frame = top(s);
  const need = (name: string) => {
    const r = resolve(s, frame.id, name);
    if (!r) throw new Refusal(`${name} is not defined yet.`);
    return r;
  };
  const listOf = (name: string) => {
    const r = need(name);
    if (r.v.cell.kind === 'num') throw new Refusal(`${name} holds a number, not a list.`);
    return r;
  };

  switch (st.t) {
    case 'num':
      return yield* assign(
        s,
        st.name,
        { kind: 'num', v: st.v },
        `${st.name} = ${st.v}: the number goes straight into ${st.name}'s box.`,
        'run.num',
        refs,
      );

    case 'list': {
      if (refs) {
        if (liveObjects(s) >= MAX_OBJECTS)
          throw new Refusal(
            `This page keeps ${MAX_OBJECTS} lists on the heap. Use clear to start again.`,
          );
        const [s1, items] = newItems(s, st.items);
        const obj: Obj = { id: s1.next, items, garbage: false };
        const s2: S = { ...s1, next: s1.next + 1, heap: [...s1.heap, obj] };
        yield step(
          s2,
          `Make a new list ${listText(items)} on the heap.`,
          ['run.list'],
          [mark(objId(obj.id), 'new')],
          2,
        );
        return yield* assign(
          s2,
          st.name,
          { kind: 'ref', obj: obj.id },
          `${st.name} gets a reference to it: an arrow, not the list itself.`,
          'run.list',
          refs,
        );
      }
      const [s1, items] = newItems(s, st.items);
      return yield* assign(
        s1,
        st.name,
        { kind: 'list', items },
        `${st.name} = ${listText(items)}: in C++ the list's values live in ${st.name} itself.`,
        'run.list',
        refs,
      );
    }

    case 'copy': {
      const src = need(st.from);
      if (st.from === st.name) throw new Refusal(`${st.name} = ${st.name} changes nothing.`);
      const cell = src.v.cell;
      if (cell.kind === 'num') {
        const s1 = { ...s, copied: s.copied + 1 };
        return yield* assign(
          s1,
          st.name,
          { kind: 'num', v: cell.v },
          `${st.name} = ${st.from}: copy the number ${cell.v} into ${st.name}. The two boxes are separate from now on.`,
          'run.copy',
          refs,
        );
      }
      if (cell.kind === 'ref') {
        const s1 = { ...s, copied: s.copied + 1 };
        return yield* assign(
          s1,
          st.name,
          { kind: 'ref', obj: cell.obj },
          `${st.name} = ${st.from}: copy the reference, not the list. ${st.name} and ${st.from} now refer to the same list: they are aliases.`,
          'run.copy',
          refs,
        );
      }
      const items = (cell as { items: Item[] }).items;
      const [s1, copy] = newItems(
        s,
        items.map((x) => x.v),
      );
      const s2 = { ...s1, copied: s1.copied + items.length };
      return yield* assign(
        s2,
        st.name,
        { kind: 'list', items: copy },
        `${st.name} = ${st.from}: C++ copies all ${items.length} values. Changing one list later leaves the other alone.`,
        'run.copy',
        refs,
      );
    }

    case 'ref': {
      if (refs)
        throw new Refusal(
          'Python and Java have no references to variables. Switch the language to C++ to use &.',
        );
      if (findVar(s, frame.id, st.name))
        throw new Refusal(
          `A reference is bound once, when it is declared, and ${st.name} already exists.`,
        );
      if (frame.vars.length >= MAX_VARS)
        throw new Refusal(
          `This page keeps ${MAX_VARS} variables in a frame. Use clear to start again.`,
        );
      const target = need(st.from);
      const v: Var = {
        uid: s.next,
        name: st.name,
        cell: { kind: 'alias', frame: target.frame, name: target.v.name },
      };
      const next = setVar({ ...s, next: s.next + 1 }, frame.id, v);
      yield step(
        next,
        `&${st.name} = ${st.from}: ${st.name} is another name for ${target.v.name}. Nothing is copied, and anything done to ${st.name} happens to ${target.v.name}.`,
        ['run.ref'],
        varMarks(next, v, 'new'),
      );
      return next;
    }

    case 'append':
    case 'set': {
      const target = listOf(st.name);
      const cell = target.v.cell as Exclude<Cell, { kind: 'num' }>;
      const items =
        cell.kind === 'ref' ? objOf(s, cell.obj).items : (cell as { items: Item[] }).items;
      if (st.t === 'append' && items.length >= MAX_ITEMS)
        throw new Refusal(`This page keeps lists to ${MAX_ITEMS} items.`);
      if (st.t === 'set' && st.i >= items.length)
        throw new Refusal(
          `${st.name}[${st.i}] is out of range: ${st.name} has ${items.length} items.`,
        );
      const line = st.t === 'append' ? 'run.append' : 'run.set';
      // The new value gets a fresh uid, so the drawing shows it arriving.
      const touched = s.next;
      const fresh = { uid: touched, v: st.v };
      const changed =
        st.t === 'append' ? [...items, fresh] : items.map((x, i) => (i === st.i ? fresh : x));
      const s1: S = { ...s, next: s.next + 1 };
      const what = st.t === 'append' ? `append ${st.v}` : `set item ${st.i} to ${st.v}`;
      if (cell.kind === 'ref') {
        const own = findVar(s, frame.id, st.name)!;
        yield step(
          s,
          `${stmtText(st)}: follow ${st.name}'s arrow to the list on the heap.`,
          [line],
          varMarks(s, own, 'active'),
          2,
        );
        const next = setObj(s1, { ...objOf(s, cell.obj), items: changed });
        const others = sharers(next, cell.obj).filter((n) => n !== st.name);
        const also = others.length
          ? ` ${others.join(' and ')} ${others.length === 1 ? 'refers' : 'refer'} to the same list, so ${others.length === 1 ? 'it sees' : 'they see'} the change too.`
          : '';
        yield step(
          next,
          `${what[0]!.toUpperCase()}${what.slice(1)}. The list is now ${listText(changed)}.${also}`,
          [line],
          [mark(objId(cell.obj), 'new'), mark(`item-${touched}`, 'new')],
        );
        return next;
      }
      const next = setVar(s1, target.frame, {
        ...target.v,
        cell: { kind: 'list', items: changed },
      });
      const via =
        target.v.name !== st.name
          ? ` ${st.name} is a reference to ${target.v.name}, so the change lands there.`
          : '';
      yield step(
        next,
        `${stmtText(st)}: ${what} in ${target.v.name}'s own values: ${listText(changed)}.${via}`,
        [line],
        [mark(varId(target.v), 'new'), mark(`item-${touched}`, 'new')],
      );
      return next;
    }

    case 'call':
      return yield* call(s, st.fn, st.arg, refs);
  }
}

/** Names in any frame that refer to heap object `obj`. */
function sharers(s: S, obj: number): string[] {
  const out: string[] = [];
  for (const f of s.frames)
    for (const v of f.vars)
      if (v.cell.kind === 'ref' && v.cell.obj === obj)
        out.push(f.id === 0 ? v.name : `${v.name} (in ${f.title})`);
  return out;
}

function* call(s: S, fn: Fn, arg: string, refs: boolean): Gen {
  const byRef = fn.endsWith('Ref');
  if (refs && byRef)
    throw new Refusal(
      `Python and Java have no reference parameters. ${fn.slice(0, -3)}(${arg}) already gets a copy of the reference.`,
    );
  const base = (byRef ? fn.slice(0, -3) : fn) as 'grow' | 'reset' | 'bump';
  const frame = top(s);
  const src = resolve(s, frame.id, arg);
  if (!src) throw new Refusal(`${arg} is not defined yet.`);
  const wantsNum = base === 'bump';
  if (wantsNum !== (src.v.cell.kind === 'num'))
    throw new Refusal(
      `${fn} takes ${wantsNum ? 'a number' : 'a list'}, and ${arg} holds ${wantsNum ? 'a list' : 'a number'}.`,
    );
  const param = wantsNum ? 'n' : 'a';
  const before = valueText(s, src.v.cell);

  // 1. The call: a new frame, and the parameter gets the argument.
  let cell: Cell;
  let s1: S = s;
  let how: string;
  if (byRef) {
    cell = { kind: 'alias', frame: src.frame, name: src.v.name };
    how = `${param} is a reference to ${arg}: another name for the same variable. Nothing is copied.`;
  } else if (src.v.cell.kind === 'list') {
    const [s2, copy] = newItems(
      s,
      src.v.cell.items.map((x) => x.v),
    );
    s1 = { ...s2, copied: s2.copied + copy.length };
    cell = { kind: 'list', items: copy };
    how = `Pass by value: ${param} gets a copy of all ${copy.length} values of ${arg}.`;
  } else {
    cell = src.v.cell;
    s1 = { ...s, copied: s.copied + 1 };
    how =
      src.v.cell.kind === 'ref'
        ? `${param} gets a copy of the reference in ${arg}, so both point at the same list. (This is how Python and Java pass every argument.)`
        : `${param} gets a copy of the number ${valueText(s, src.v.cell)}.`;
  }
  const fid = s1.next;
  const pv: Var = { uid: fid + 1, name: param, cell };
  const callFrame: Frame = { id: fid, title: `${fn}(${param})`, vars: [pv] };
  let st: S = { ...s1, next: fid + 2, frames: [...s1.frames, callFrame] };
  yield step(
    st,
    `Call ${fn}(${arg}): push a new frame. ${how}`,
    ['run.call', `${base}.sig`],
    varMarks(st, pv, 'new'),
    2,
  );

  // 2. The body.
  if (base === 'grow') {
    st = yield* inner(st, { t: 'append', name: param, v: 0 }, refs);
  } else if (base === 'reset') {
    st = yield* inner(st, { t: 'list', name: param, items: [0] }, refs);
  } else {
    const n = (resolve(st, fid, param)!.v.cell as { v: number }).v;
    st = yield* inner(st, { t: 'num', name: param, v: n + 1 }, refs);
  }

  // 3. Return: pop the frame.
  const popped: S = sweep({ ...st, frames: st.frames.slice(0, -1) });
  const after = valueText(popped, resolve(popped, frame.id, arg)!.v.cell);
  const same = after === before;
  const freed = popped.heap.filter(
    (o) => o.garbage && !st.heap.find((x) => x.id === o.id)?.garbage,
  );
  const garbage = freed.length ? ` The list the function made is garbage now.` : '';
  const effect = same
    ? `${arg} is still ${before}: the function changed only its own ${param}.`
    : `${arg} is now ${after}: the change made through ${param} is visible to the caller.`;
  yield step(
    popped,
    `Return and pop ${fn}'s frame. ${effect}${garbage}`,
    [`${base}.ret`],
    [
      ...varMarks(popped, resolve(popped, frame.id, arg)!.v, same ? 'found' : 'new'),
      ...freed.map((o) => mark(objId(o.id), 'stale')),
    ],
  );
  return popped;
}

/** Run a statement of a function body, with its narration and the body's pseudocode line. */
function* inner(s: S, st: Stmt, refs: boolean): Gen {
  const fn = top(s).title.split('(')[0]!;
  const base = fn.replace(/Ref$/, '');
  const gen = runStmt(s, st, refs);
  let r = gen.next();
  while (!r.done) {
    const lines = r.value.lines.filter((l) => l === 'run.gc');
    yield {
      ...r.value,
      lines: [`${base}.body`, ...lines],
      level: 2,
      say: `In ${fn}: ${r.value.say[0]!.toLowerCase()}${r.value.say.slice(1)}`,
    };
    r = gen.next();
  }
  return r.value;
}

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s0, [raw], { settings }) {
    const st = readStmt(raw);
    if (typeof st === 'string') {
      yield step(s0, `${st} Nothing ran.`, []);
      return s0;
    }
    const refs = settings.lang !== 'values';
    // Garbage from the last statement is collected first.
    let s = s0;
    if (s.heap.some((o) => o.garbage)) {
      s = { ...s, heap: s.heap.filter((o) => !o.garbage) };
      yield step(s, 'The garbage collector frees the lists nothing refers to.', ['run.gc'], [], 2);
    }
    try {
      // Collect the steps first, so a refusal halfway through leaves nothing half done.
      const steps: MemStep[] = [];
      const gen = runStmt(s, st, refs);
      let r = gen.next();
      while (!r.done) {
        steps.push(r.value);
        r = gen.next();
      }
      yield* steps;
      return r.value;
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      yield step(s, `${e.say} Nothing changed.`, []);
      return s;
    }
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run() {
    const s = init();
    yield step(s, 'Start again: an empty main frame and an empty heap.', ['clear.all']);
    return s;
  },
};

export const ops = { run, clear };

export function pseudocode(settings: MemSettings): PseudoBlock[] {
  const refs = settings.lang !== 'values';
  const run = refs
    ? [
        L('run.num', 0, 'x = 5', 'A number goes into the variable itself.'),
        L('run.list', 0, 'xs = [1, 2]', 'A list goes on the heap; xs holds a reference to it.'),
        L('run.copy', 0, 'ys = xs', 'Copy what xs holds: for a list, that is the reference.'),
        L('run.append', 0, 'xs.append(v)', 'Change the list xs refers to.'),
        L('run.set', 0, 'xs[i] = v', 'Change one item of the list xs refers to.'),
        L('run.call', 0, 'f(xs)', 'Call f; its parameter gets a copy of what xs holds.'),
        L('run.gc', 0, '(no references left: garbage)', 'A list nothing refers to is freed later.'),
        L('run.ref', 0, '&r = x is C++ only', 'Python and Java have no references to variables.'),
      ]
    : [
        L('run.num', 0, 'int x = 5', 'A number goes into the variable.'),
        L('run.list', 0, 'vector<int> xs = {1, 2}', 'The list lives in xs itself.'),
        L('run.copy', 0, 'ys = xs', 'Copy every value: ys is a separate list.'),
        L('run.ref', 0, 'auto& r = x', 'r is another name for x; nothing is copied.'),
        L('run.append', 0, 'xs.push_back(v)', 'Add v to the end of xs.'),
        L('run.set', 0, 'xs[i] = v', 'Change one item of xs.'),
        L('run.call', 0, 'f(xs)', 'Call f; the parameter type decides copy or reference.'),
        L('run.gc', 0, '(nothing to collect)', 'Values die when their frame does.'),
      ];
  const fns = refs
    ? [
        L('grow.sig', 0, 'def grow(a):', 'grow gets a reference to a list,'),
        L('grow.body', 1, 'a.append(0)', 'and adds 0 to that list.'),
        L('grow.ret', 1, 'return', 'The caller sees the change.'),
        L('reset.sig', 0, 'def reset(a):', 'reset gets a reference to a list,'),
        L('reset.body', 1, 'a = [0]', 'and points its own a at a new list.'),
        L('reset.ret', 1, 'return', 'The caller still has the old list.'),
        L('bump.sig', 0, 'def bump(n):', 'bump gets a number,'),
        L('bump.body', 1, 'n = n + 1', 'and adds 1 to its own copy.'),
        L('bump.ret', 1, 'return n', 'The caller keeps its number unless it saves the result.'),
      ]
    : [
        L(
          'grow.sig',
          0,
          'void grow(vector<int> a)  // or growRef(vector<int>& a)',
          'grow copies the list; growRef shares it,',
        ),
        L('grow.body', 1, 'a.push_back(0);', 'and adds 0.'),
        L('grow.ret', 1, 'return;', 'Only growRef changes the caller.'),
        L(
          'reset.sig',
          0,
          'void reset(vector<int> a)  // or resetRef(vector<int>& a)',
          'reset copies the list; resetRef shares it,',
        ),
        L('reset.body', 1, 'a = {0};', 'and replaces its values with 0.'),
        L('reset.ret', 1, 'return;', 'Only resetRef changes the caller.'),
        L(
          'bump.sig',
          0,
          'int bump(int n)  // or bumpRef(int& n)',
          'bump copies the number; bumpRef shares it,',
        ),
        L('bump.body', 1, 'n = n + 1;', 'and adds 1.'),
        L('bump.ret', 1, 'return n;', 'Only bumpRef changes the caller.'),
      ];
  return [
    { op: 'run', lines: [...run, ...fns] },
    {
      op: 'clear',
      lines: [L('clear.all', 0, 'forget every variable', 'Start with empty memory.')],
    },
  ];
}

export function initialSay(_state: S, settings: MemSettings): string {
  return settings.lang === 'values'
    ? 'C++ mode: variables hold values, even whole lists, and & makes a reference. Type a statement such as xs = [1, 2] and press Run.'
    : 'Python and Java mode: numbers sit in their variables, lists live on the heap and variables refer to them. Type a statement such as xs = [1, 2] and press Run.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  const frames = state.frames.map((f) => {
    const vs = f.vars.map((v) => {
      const what =
        v.cell.kind === 'ref'
          ? `refers to list ${v.cell.obj}`
          : v.cell.kind === 'alias'
            ? `is a reference to ${v.cell.name}`
            : `= ${valueText(state, v.cell)}`;
      return `${v.name} ${what}`;
    });
    return `${f.title}: ${vs.length ? vs.join(', ') : 'no variables'}`;
  });
  const heap = state.heap.map(
    (o) => `list ${o.id} ${listText(o.items)}${o.garbage ? ' (garbage)' : ''}`,
  );
  return `Stack: ${frames.join('; ')}. Heap: ${heap.length ? heap.join(', ') : 'empty'}.`;
}

/** The main frame's variables as the code tabs print them: "x=5 xs=[1,2]". */
export function mainText(s: S): string {
  const main = s.frames[0]!;
  if (main.vars.length === 0) return '(empty)';
  return main.vars.map((v) => `${v.name}=${valueText(s, v.cell).replace(/ /g, '')}`).join(' ');
}
