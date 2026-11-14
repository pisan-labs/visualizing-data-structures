/**
 * The text form of a thread program, so pages and examples can carry programs as text.
 *
 *   shared count = 0, flag = 0     shared variables and their start values
 *   sem s = 1                      a semaphore and its start value (several: sem a = 0, b = 1)
 *   thread T1                      the steps that follow belong to T1 (a colon after it is fine)
 *     r = count                    load: a register gets a shared variable
 *     r = r + 1                    add (or -): registers, numbers, at most one shared variable
 *     count = r                    store: a shared variable gets a register or a number
 *     r = 5, r = s                 set a register
 *     c = r < 3                    compare (== != < <= > >=): c = 1 if it holds, else 0
 *   top: if r != 0 goto top        jump if; `if r goto L` jumps when r is not 0; `goto L`
 *     lock(m), unlock(m)           a mutex (declared by its use)
 *     wait(c, m), signal(c), broadcast(c)   a condition variable with its mutex
 *     P(s), V(s)                   a semaphore (declared with `sem`)
 *     ok = cas(x, 0, 1)            compare-and-swap: x = 1 if it was 0; ok = 1 if it did
 *     print(r), print("ping")      print a value or a word
 *     done                         the thread stops here (it also stops after its last step)
 *
 * Steps are one per line or separated by `;`, so a program fits on one line. `#` starts a
 * comment. A label (`top:`) marks the next step, and may stand on its own line. Names are a
 * letter or _, then letters, digits or _ (at most 12). Any name in a thread that is not shared,
 * a lock, a condition variable or a semaphore is that thread's register; registers start at 0.
 * The parentheses of lock(m) and the rest may be left out: `lock m`, `wait c, m`, `P s`.
 * A step touches shared memory at most once: `count = count + 1` is refused, because it is
 * three steps.
 *
 *   parseProgram(text)    Program, or an Error whose message names the line
 *   formatProgram(p)      text; parseProgram(formatProgram(p)) equals p
 */
import type { Instr, Operand, Program, Rel, Thread } from './machine';

export const MAX_THREADS = 6;
export const MAX_STEPS_PER_THREAD = 20;
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,11}$/;
const KEYWORDS = new Set([
  'thread',
  'shared',
  'sem',
  'if',
  'goto',
  'lock',
  'unlock',
  'wait',
  'signal',
  'broadcast',
  'P',
  'V',
  'cas',
  'print',
  'done',
]);
const RELS: Rel[] = ['==', '!=', '<=', '>=', '<', '>'];

type Tok = { k: 'name' | 'num' | 'str' | 'op'; v: string };

function tokenize(line: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const rest = line.slice(i);
    const m =
      /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest) ??
      /^-?\d+/.exec(rest) ??
      /^"[^"]*"/.exec(rest) ??
      /^(==|!=|<=|>=|[<>=+\-,():])/.exec(rest);
    if (!m) return `"${c}" is not part of a step.`;
    const v = m[0];
    // A minus sign after a value is subtraction, not part of a number: r = r -1.
    const prev = out.at(-1);
    if (/^-\d/.test(v) && prev && (prev.k === 'name' || prev.k === 'num' || prev.v === ')')) {
      out.push({ k: 'op', v: '-' });
      i++;
      continue;
    }
    out.push({
      k: /^[A-Za-z_]/.test(v) ? 'name' : /^-?\d/.test(v) ? 'num' : v[0] === '"' ? 'str' : 'op',
      v,
    });
    i += v.length;
  }
  return out;
}

interface Names {
  shared: Set<string>;
  sems: Set<string>;
  locks: Set<string>;
  conds: Set<string>;
}

class Line {
  i = 0;
  constructor(readonly toks: Tok[]) {}
  peek(o = 0) {
    return this.toks[this.i + o];
  }
  take(v?: string): Tok | undefined {
    const t = this.toks[this.i];
    if (!t || (v !== undefined && t.v !== v)) return undefined;
    this.i++;
    return t;
  }
  get done() {
    return this.i >= this.toks.length;
  }
}

/** Parse a program, or say what is wrong and on which line. */
export function parseProgram(text: string): Program | Error {
  const lines = text
    .split('\n')
    .flatMap((l, n) =>
      l
        .replace(/#.*/, '')
        .split(';')
        .map((src) => ({ n: n + 1, src: src.trim() })),
    )
    .filter((l) => l.src);
  const at = (n: number, msg: string) =>
    new Error(text.trim().includes('\n') ? `Line ${n}: ${msg}` : msg);
  const names: Names = {
    shared: new Set(),
    sems: new Set(),
    locks: new Set(),
    conds: new Set(),
  };
  const shared: Program['shared'] = [];
  const sems: Program['sems'] = [];
  const locks: string[] = [];
  const conds: string[] = [];
  const tokens: { n: number; toks: Tok[] }[] = [];

  // Pass 1: tokens, declarations, and which names are locks and condition variables.
  for (const l of lines) {
    const toks = tokenize(l.src);
    if (typeof toks === 'string') return at(l.n, toks);
    const first = toks[0]!.v;
    if (first === 'shared' || first === 'sem') {
      const err = declare(toks.slice(1), first, names, shared, sems);
      if (err) return at(l.n, err);
      continue;
    }
    tokens.push({ n: l.n, toks });
    const kw = toks[0]!.k === 'name' && toks[1]?.v === ':' ? toks[2]?.v : first;
    const args = toks.filter((t) => t.k === 'name').map((t) => t.v);
    const use = (set: Set<string>, list: string[], x: string | undefined) => {
      if (x && !set.has(x)) {
        set.add(x);
        list.push(x);
      }
    };
    const after = args.slice(args.indexOf(kw ?? '') + 1);
    if (kw === 'lock' || kw === 'unlock') use(names.locks, locks, after[0]);
    if (kw === 'wait') {
      use(names.conds, conds, after[0]);
      use(names.locks, locks, after[1]);
    }
    if (kw === 'signal' || kw === 'broadcast') use(names.conds, conds, after[0]);
  }
  for (const x of names.locks)
    if (names.conds.has(x) || names.shared.has(x) || names.sems.has(x))
      return new Error(`${x} is a lock, so it cannot also be a variable or a semaphore.`);
  for (const x of names.conds)
    if (names.shared.has(x) || names.sems.has(x))
      return new Error(`${x} is a condition variable, so it cannot also be a variable.`);

  // Pass 2: the threads and their steps.
  const threads: Thread[] = [];
  const pending: { thread: number; instr: number; label: string; n: number }[] = [];
  let cur: Thread | null = null;
  for (const { n, toks } of tokens) {
    const line = new Line(toks);
    if (line.peek()!.v === 'thread') {
      line.take();
      const t = line.take();
      if (!t || !NAME.test(t.v) || KEYWORDS.has(t.v)) return at(n, 'Name the thread: thread T1.');
      line.take(':');
      if (!line.done) return at(n, 'Put the steps on the lines after "thread".');
      if (threads.some((th) => th.name === t.v)) return at(n, `There are two threads ${t.v}.`);
      if (threads.length === MAX_THREADS) return at(n, `At most ${MAX_THREADS} threads.`);
      cur = { name: t.v, code: [], labels: {}, regs: [] };
      threads.push(cur);
      continue;
    }
    if (!cur) return at(n, 'Start with "thread T1", then its steps.');
    // Labels.
    while (line.peek()?.k === 'name' && line.peek(1)?.v === ':') {
      const label = line.take()!.v;
      if (KEYWORDS.has(label)) return at(n, `${label} cannot be a label.`);
      if (label in cur.labels) return at(n, `${cur.name} has two labels ${label}.`);
      cur.labels[label] = cur.code.length;
      line.take(':');
    }
    if (line.done) continue;
    if (cur.code.length === MAX_STEPS_PER_THREAD)
      return at(n, `At most ${MAX_STEPS_PER_THREAD} steps in a thread.`);
    const instr = parseStep(line, names, cur);
    if (typeof instr === 'string') return at(n, instr);
    if (instr.kind === 'jump')
      pending.push({ thread: threads.length - 1, instr: cur.code.length, label: instr.label, n });
    cur.code.push(instr);
  }
  if (threads.length === 0) return new Error('Write at least one thread: thread T1, then steps.');
  for (const j of pending) {
    const th = threads[j.thread]!;
    const target = th.labels[j.label];
    if (target === undefined) return at(j.n, `${th.name} has no label ${j.label}.`);
    (th.code[j.instr] as Extract<Instr, { kind: 'jump' }>).target = target;
  }
  return { threads, shared, locks, sems, conds };
}

function declare(
  toks: Tok[],
  kind: 'shared' | 'sem',
  names: Names,
  shared: Program['shared'],
  sems: Program['sems'],
): string | null {
  const line = new Line(toks);
  do {
    const v = line.take();
    if (!v || v.k !== 'name' || !NAME.test(v.v) || KEYWORDS.has(v.v))
      return kind === 'shared' ? 'Write shared count = 0.' : 'Write sem s = 1.';
    if (names.shared.has(v.v) || names.sems.has(v.v)) return `${v.v} is declared twice.`;
    if (!line.take('=')) return `Give ${v.v} a start value: ${v.v} = 0.`;
    const num = line.take();
    if (!num || num.k !== 'num') return `Give ${v.v} a whole number to start with.`;
    if (kind === 'shared') {
      names.shared.add(v.v);
      shared.push({ name: v.v, init: Number(num.v) });
    } else {
      names.sems.add(v.v);
      sems.push({ name: v.v, init: Number(num.v) });
    }
  } while (line.take(','));
  return line.done
    ? null
    : `Separate the ${kind === 'shared' ? 'variables' : 'semaphores'} with commas.`;
}

function parseStep(line: Line, names: Names, th: Thread): Instr | string {
  let sharedRefs = 0;
  const reg = (x: string): string | null => {
    if (!NAME.test(x)) return `${x} is too long a name.`;
    if (KEYWORDS.has(x)) return `${x} is a keyword.`;
    if (names.locks.has(x) || names.conds.has(x) || names.sems.has(x))
      return `${x} is not a value: it is a ${names.locks.has(x) ? 'lock' : names.conds.has(x) ? 'condition variable' : 'semaphore'}.`;
    if (!th.regs.includes(x)) th.regs.push(x);
    return null;
  };
  const operand = (): Operand | string => {
    const t = line.take();
    if (!t) return 'A value is missing.';
    if (t.k === 'num') return { num: Number(t.v) };
    if (t.k !== 'name') return `"${t.v}" is not a value.`;
    if (names.shared.has(t.v)) {
      sharedRefs++;
      return { mem: t.v };
    }
    const e = reg(t.v);
    return e ?? { reg: t.v };
  };
  const show = (o: Operand) => ('num' in o ? String(o.num) : 'reg' in o ? o.reg : o.mem);
  const end = (instr: Instr): Instr | string => {
    if (!line.done) return `Unexpected "${line.peek()!.v}" after ${instr.text}.`;
    if (sharedRefs > 1)
      return `${instr.text} touches shared memory more than once. Split it into steps: load into a register, compute, store.`;
    return instr;
  };
  /** name, or (name), or (a, b) for the primitives. */
  const args = (n: number): string[] | string => {
    const paren = Boolean(line.take('('));
    const out: string[] = [];
    for (let k = 0; k < n; k++) {
      if (k > 0 && !line.take(',')) return `Separate the names with a comma.`;
      const t = line.take();
      if (!t || t.k !== 'name' || !NAME.test(t.v) || KEYWORDS.has(t.v)) return 'A name is missing.';
      out.push(t.v);
    }
    if (paren && !line.take(')')) return 'A ")" is missing.';
    return out;
  };

  const first = line.peek()!;
  if (first.v === 'goto') {
    line.take();
    const l = line.take();
    if (!l || l.k !== 'name') return 'Say where to go: goto top.';
    return end({ kind: 'jump', label: l.v, target: -1, text: `goto ${l.v}` });
  }
  if (first.v === 'if') {
    line.take();
    const a = operand();
    if (typeof a === 'string') return a;
    let cond: { a: Operand; rel: Rel; b: Operand };
    let shown: string;
    const rel = line.peek()?.v as Rel | undefined;
    if (rel && RELS.includes(rel)) {
      line.take();
      const b = operand();
      if (typeof b === 'string') return b;
      cond = { a, rel, b };
      shown = `${show(a)} ${rel} ${show(b)}`;
    } else {
      cond = { a, rel: '!=', b: { num: 0 } };
      shown = show(a);
    }
    if (!line.take('goto')) return 'Write if r == 0 goto top.';
    const l = line.take();
    if (!l || l.k !== 'name') return 'Say where to go: if r == 0 goto top.';
    return end({ kind: 'jump', label: l.v, target: -1, cond, text: `if ${shown} goto ${l.v}` });
  }
  if (first.v === 'lock' || first.v === 'unlock') {
    line.take();
    const a = args(1);
    if (typeof a === 'string') return a;
    return end({ kind: first.v, name: a[0]!, text: `${first.v}(${a[0]})` });
  }
  if (first.v === 'wait') {
    line.take();
    const a = args(2);
    if (typeof a === 'string') return 'Write wait(c, m): the condition variable, then its lock.';
    return end({ kind: 'wait', cond: a[0]!, lock: a[1]!, text: `wait(${a[0]}, ${a[1]})` });
  }
  if (first.v === 'signal' || first.v === 'broadcast') {
    line.take();
    const a = args(1);
    if (typeof a === 'string') return a;
    return end({ kind: first.v, cond: a[0]!, text: `${first.v}(${a[0]})` });
  }
  if (first.v === 'P' || first.v === 'V') {
    line.take();
    const a = args(1);
    if (typeof a === 'string') return a;
    if (!names.sems.has(a[0]!)) return `Declare the semaphore first: sem ${a[0]} = 1.`;
    return end({ kind: first.v, name: a[0]!, text: `${first.v}(${a[0]})` });
  }
  if (first.v === 'print') {
    line.take();
    const paren = Boolean(line.take('('));
    const t = line.peek();
    let instr: Instr;
    if (t?.k === 'str') {
      line.take();
      const word = t.v.slice(1, -1);
      if (!word || word.length > 12) return 'Print a word of 1 to 12 characters.';
      instr = { kind: 'print', what: { text: word }, text: `print("${word}")` };
    } else {
      const o = operand();
      if (typeof o === 'string') return o;
      instr = { kind: 'print', what: o, text: `print(${show(o)})` };
    }
    if (paren && !line.take(')')) return 'A ")" is missing.';
    return end(instr);
  }
  if (first.v === 'done') {
    line.take();
    return end({ kind: 'done', text: 'done' });
  }

  // Assignments.
  const dest = line.take()!;
  if (dest.k !== 'name' || !line.take('='))
    return `"${dest.v}" does not start a step. Steps look like r = count or lock(m).`;
  const toShared = names.shared.has(dest.v);
  if (!toShared) {
    const e = reg(dest.v);
    if (e) return e;
  } else sharedRefs++;
  if (line.peek()?.v === 'cas') {
    line.take();
    if (toShared) return 'cas puts its answer in a register: ok = cas(x, 0, 1).';
    if (!line.take('(')) return 'Write ok = cas(x, 0, 1).';
    const x = line.take();
    if (!x || !names.shared.has(x.v)) return 'cas works on a shared variable: ok = cas(x, 0, 1).';
    if (!line.take(',')) return 'Write ok = cas(x, 0, 1).';
    const a = operand();
    if (typeof a === 'string') return a;
    if (!line.take(',')) return 'Write ok = cas(x, 0, 1).';
    const b = operand();
    if (typeof b === 'string') return b;
    if (!line.take(')')) return 'A ")" is missing.';
    if (sharedRefs > 0) return 'The values in cas are registers or numbers.';
    return end({
      kind: 'cas',
      reg: dest.v,
      mem: x.v,
      expect: a,
      value: b,
      text: `${dest.v} = cas(${x.v}, ${show(a)}, ${show(b)})`,
    });
  }
  const a = operand();
  if (typeof a === 'string') return a;
  const op = line.peek()?.v;
  if (op === '+' || op === '-' || RELS.includes(op as Rel)) {
    line.take();
    const b = operand();
    if (typeof b === 'string') return b;
    if (toShared)
      return sharedRefs > 1
        ? `${dest.v} = ${show(a)} ${op} ${show(b)} touches shared memory more than once. Split it into steps: load into a register, compute, store.`
        : `${dest.v} is shared, so it can only be stored: compute in a register first.`;
    const text = `${dest.v} = ${show(a)} ${op} ${show(b)}`;
    if (op === '+' || op === '-')
      return end({ kind: 'add', reg: dest.v, a, sign: op === '+' ? 1 : -1, b, text });
    return end({ kind: 'compare', reg: dest.v, a, rel: op as Rel, b, text });
  }
  const text = `${dest.v} = ${show(a)}`;
  // A shared value on the right is a second touch of shared memory, which end() refuses.
  if (toShared) return end({ kind: 'store', mem: dest.v, value: a, text });
  if ('mem' in a) return end({ kind: 'load', reg: dest.v, mem: a.mem, text });
  return end({ kind: 'set', reg: dest.v, value: a, text });
}

/** The program as text, one step per line, labels on the step they mark. */
export function formatProgram(p: Program): string {
  const out: string[] = [];
  if (p.shared.length)
    out.push(`shared ${p.shared.map((v) => `${v.name} = ${v.init}`).join(', ')}`);
  if (p.sems.length) out.push(`sem ${p.sems.map((v) => `${v.name} = ${v.init}`).join(', ')}`);
  for (const th of p.threads) {
    out.push(`thread ${th.name}`);
    const labelsAt = (i: number) =>
      Object.entries(th.labels)
        .filter(([, k]) => k === i)
        .map(([l]) => `${l}: `)
        .join('');
    th.code.forEach((instr, i) => out.push(`  ${labelsAt(i)}${instr.text}`));
    const tail = labelsAt(th.code.length);
    if (tail) out.push(`  ${tail.trim()}`);
  }
  return out.join('\n');
}
