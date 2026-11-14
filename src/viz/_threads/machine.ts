/**
 * The concurrency engine shared by the concurrency pages (race conditions, mutex, semaphores,
 * producer-consumer, deadlock, dining philosophers, readers and writers, barriers,
 * compare-and-swap). PLAN.md 21.5 item 3.
 *
 * A program is 1 to 6 threads (pages use 2 to 4), each a short list of steps on shared memory. One step is atomic:
 * it reads or writes at most one shared variable (compare-and-swap reads and writes one, as one
 * step). A scheduler picks which thread runs its next step; the pages let the learner be the
 * scheduler, run a given schedule, or try every interleaving.
 *
 * Semantics follow OSTEP (Arpaci-Dusseau, Operating Systems: Three Easy Pieces):
 * - Registers are per thread and start at 0; shared variables start at their declared values.
 * - lock(m): take m if it is free; otherwise the thread joins m's queue and blocks. A thread that
 *   locks a lock it already holds blocks too (locks are not reentrant): it waits for itself.
 *   unlock(m) by the holder hands m straight to the first thread in its queue (FIFO), whose
 *   lock(m) then returns, or frees it. Unlocking a lock the thread does not hold is a fault.
 * - wait(c, m) (Mesa semantics): needs m held; lets go of m (handing it on as unlock does) and
 *   sleeps on c. signal(c) wakes the first sleeper, broadcast(c) every sleeper, in order; a woken
 *   thread must get m back before wait returns, so it joins m's queue (or takes m if it is free).
 *   A signal with no sleeper is lost.
 * - P(s) takes one from s and blocks if the value went below 0; V(s) adds one and, if a thread
 *   is waiting, wakes the first, whose P then returns. So a negative value is minus the number of
 *   waiting threads, as in OSTEP and Downey's The Little Book of Semaphores.
 * - r = cas(x, a, b): if x equals a, set x to b and r to 1; otherwise r = 0 (one atomic step).
 * - A thread is done after its last step or a `done` step. A blocked thread cannot run; when no
 *   thread can run and some are not done, the program is stuck (deadlock, or a lost wake-up).
 *
 * Every function here is pure: a state is plain data (compare with toEqual), never changed in
 * place. The text form that pages and examples carry programs in is in parse.ts.
 *
 * API
 *   initState(p)                     the start: every thread at step 0, registers 0
 *   step(p, s, t)                    run one step of thread t: { ok: true, state, event } or
 *                                    { ok: false, reason: 'no-thread' | 'done' | 'blocked' |
 *                                    'fault', message } when t cannot run
 *   runnable(s), finished(s), stuck(s)
 *   run(p, schedule, from?)          the steps of a schedule (thread indices), stopping at the
 *                                    first step that cannot run
 *   interleavings(p, opts)           every schedule to the end, lowest thread first, up to a cap,
 *                                    with the final outcomes grouped
 *   countOutcomes(p, opts)           the same counts without listing schedules: a search over
 *                                    states, so it copes with millions of schedules
 *   findSchedule(p, goal, opts)      the first schedule (lowest thread first) whose final state
 *                                    meets `goal`, or null
 *   outcomeOf(p, s)                  the default outcome text: shared values, output, stuck
 *   stateKey(s)                      a string that identifies a state (the schedule left out)
 *   schedules(lengths)               how many interleavings threads of these lengths have when
 *                                    nothing blocks: (n1 + ... + nk)! / (n1! ... nk!)
 * Deadlock (the wait-for graph and its cycle) is in deadlock.ts; drawing helpers in page.ts.
 */

export type Rel = '==' | '!=' | '<' | '<=' | '>' | '>=';

/** A value a step reads: a register, a number, or a shared variable (one atomic read). */
export type Operand = { reg: string } | { num: number } | { mem: string };

interface Base {
  /** The step as the text form writes it, e.g. "r = count" or "lock(m)". */
  text: string;
}

export type Instr = Base &
  (
    | { kind: 'load'; reg: string; mem: string }
    | { kind: 'store'; mem: string; value: Operand }
    | { kind: 'set'; reg: string; value: Operand }
    | { kind: 'add'; reg: string; a: Operand; sign: 1 | -1; b: Operand }
    | { kind: 'compare'; reg: string; a: Operand; rel: Rel; b: Operand }
    | { kind: 'jump'; target: number; label: string; cond?: { a: Operand; rel: Rel; b: Operand } }
    | { kind: 'lock' | 'unlock'; name: string }
    | { kind: 'wait'; cond: string; lock: string }
    | { kind: 'signal' | 'broadcast'; cond: string }
    | { kind: 'P' | 'V'; name: string }
    | { kind: 'cas'; reg: string; mem: string; expect: Operand; value: Operand }
    | { kind: 'print'; what: Operand | { text: string } }
    | { kind: 'done' }
  );

export type InstrKind = Instr['kind'];

export interface Thread {
  name: string;
  code: Instr[];
  /** Label name -> index of the step it marks (code.length for a label at the end). */
  labels: Record<string, number>;
  /** The registers this thread uses, in order of first use. */
  regs: string[];
}

export interface Program {
  threads: Thread[];
  /** Shared variables in the order declared, with their start values. */
  shared: { name: string; init: number }[];
  /** Locks (mutexes), in order of first use. */
  locks: string[];
  sems: { name: string; init: number }[];
  /** Condition variables, in order of first use. */
  conds: string[];
}

export type Status = 'ready' | 'blocked' | 'done' | 'fault';

/** What a blocked thread waits for. */
export interface Waiting {
  kind: 'lock' | 'sem' | 'cond';
  name: string;
}

export interface ThreadState {
  /** Index of the next step. A blocked thread's pc stays on the step that blocked it. */
  pc: number;
  regs: Record<string, number>;
  status: Status;
  on?: Waiting;
  /** Why a faulted thread stopped. */
  fault?: string;
}

export interface MachineState {
  threads: ThreadState[];
  mem: Record<string, number>;
  /** holder: a thread index, or null when free; waiters in queue order. */
  locks: Record<string, { holder: number | null; waiters: number[] }>;
  sems: Record<string, { value: number; waiters: number[] }>;
  conds: Record<string, { waiters: number[] }>;
  /** Everything printed so far, oldest first. */
  out: { thread: number; text: string }[];
  /** The thread of every step taken so far. */
  schedule: number[];
}

/** What one step did, for narration and marks. */
export interface StepEvent {
  thread: number;
  /** Index of the step that ran, and the step. */
  pc: number;
  instr: Instr;
  /** One plain sentence: "T1 loads count = 0 into r." */
  say: string;
  /** Shared variables read and written. */
  read?: string;
  wrote?: string;
  /** For a store or a cas that wrote: the value the variable held before. */
  before?: number;
  /** The register this step set. */
  reg?: string;
  /** The step left this thread blocked. */
  blocked?: Waiting;
  /** Threads this step woke or handed a lock to (they can run again). */
  woke?: number[];
  /** A jump that was taken. */
  jumped?: boolean;
  /** The thread finished with this step. */
  done?: boolean;
  fault?: string;
}

export type StepResult =
  | { ok: true; state: MachineState; event: StepEvent }
  | { ok: false; reason: 'no-thread' | 'done' | 'blocked' | 'fault'; message: string };

/** Interleavings listed by `interleavings` unless the caller says otherwise. */
export const CAP = 2000;
/** A schedule stops after this many steps (programs with loops can spin for ever). */
export const MAX_STEPS = 60;
/** The outcome of a schedule stopped at the step limit. */
export const CUT_OFF = 'cut off';

const name = (p: Program, t: number) => p.threads[t]?.name ?? `T${t + 1}`;

export function initState(p: Program): MachineState {
  return {
    threads: p.threads.map((th) => ({
      pc: 0,
      regs: Object.fromEntries(th.regs.map((r) => [r, 0])),
      status: th.code.length ? 'ready' : 'done',
    })),
    mem: Object.fromEntries(p.shared.map((v) => [v.name, v.init])),
    locks: Object.fromEntries(p.locks.map((l) => [l, { holder: null, waiters: [] }])),
    sems: Object.fromEntries(p.sems.map((s) => [s.name, { value: s.init, waiters: [] }])),
    conds: Object.fromEntries(p.conds.map((c) => [c, { waiters: [] }])),
    out: [],
    schedule: [],
  };
}

function clone(s: MachineState): MachineState {
  const map = <T extends object>(o: Record<string, T>, f: (v: T) => T) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  return {
    threads: s.threads.map((t) => ({ ...t, regs: { ...t.regs } })),
    mem: { ...s.mem },
    locks: map(s.locks, (l) => ({ holder: l.holder, waiters: [...l.waiters] })),
    sems: map(s.sems, (v) => ({ value: v.value, waiters: [...v.waiters] })),
    conds: map(s.conds, (c) => ({ waiters: [...c.waiters] })),
    out: [...s.out],
    schedule: [...s.schedule],
  };
}

/** The threads that can take a step now, in index order. */
export function runnable(s: MachineState): number[] {
  const out: number[] = [];
  s.threads.forEach((t, i) => {
    if (t.status === 'ready') out.push(i);
  });
  return out;
}

/** Every thread is done or has faulted. */
export const finished = (s: MachineState): boolean =>
  s.threads.every((t) => t.status === 'done' || t.status === 'fault');

/** No thread can run, but some are still blocked: a deadlock or a wake-up that never comes. */
export const stuck = (s: MachineState): boolean =>
  s.threads.some((t) => t.status === 'blocked') && runnable(s).length === 0;

const relHolds = (a: number, rel: Rel, b: number): boolean =>
  rel === '=='
    ? a === b
    : rel === '!='
      ? a !== b
      : rel === '<'
        ? a < b
        : rel === '<='
          ? a <= b
          : rel === '>'
            ? a > b
            : a >= b;

/** Plain words for a comparison, for narration: "r == 0" reads "r is 0". */
export const REL_WORDS: Record<Rel, string> = {
  '==': 'is',
  '!=': 'is not',
  '<': 'is less than',
  '<=': 'is at most',
  '>': 'is more than',
  '>=': 'is at least',
};

/** The thread's next step moves on; past the last step, or at `done`, the thread is done. */
function advance(p: Program, s: MachineState, t: number, to?: number) {
  const th = s.threads[t]!;
  th.pc = to ?? th.pc + 1;
  delete th.on;
  th.status = th.pc >= p.threads[t]!.code.length ? 'done' : 'ready';
}

/** Hand lock m to the first thread in its queue (whose lock or wait then returns), or free it. */
function release(p: Program, s: MachineState, m: string): number | null {
  const lock = s.locks[m]!;
  const next = lock.waiters.shift();
  if (next === undefined) {
    lock.holder = null;
    return null;
  }
  lock.holder = next;
  advance(p, s, next);
  return next;
}

/** A thread woken from wait(c, m) needs m back: it takes m if free, or joins m's queue. */
function rejoin(p: Program, s: MachineState, w: number) {
  const instr = p.threads[w]!.code[s.threads[w]!.pc]!;
  const m = instr.kind === 'wait' ? instr.lock : '';
  const lock = s.locks[m]!;
  if (lock.holder === null) {
    lock.holder = w;
    advance(p, s, w);
  } else {
    lock.waiters.push(w);
    s.threads[w]!.on = { kind: 'lock', name: m };
  }
}

const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** Run one step of thread t. A thread that cannot run (blocked, done, faulted) says why. */
export function step(p: Program, s: MachineState, t: number): StepResult {
  const th = s.threads[t];
  if (!th) return { ok: false, reason: 'no-thread', message: `There is no thread ${t + 1}.` };
  const T = name(p, t);
  if (th.status === 'done')
    return { ok: false, reason: 'done', message: `${T} is done: it has no steps left.` };
  if (th.status === 'fault')
    return { ok: false, reason: 'fault', message: `${T} stopped with a fault: ${th.fault}` };
  if (th.status === 'blocked') {
    const on = th.on!;
    const what =
      on.kind === 'lock'
        ? `lock ${on.name}${holderText(p, s, on.name)}`
        : on.kind === 'sem'
          ? `semaphore ${on.name}`
          : `a signal on ${on.name}`;
    return { ok: false, reason: 'blocked', message: `${T} is blocked: it waits for ${what}.` };
  }

  const instr = p.threads[t]!.code[th.pc]!;
  const next = clone(s);
  next.schedule.push(t);
  const me = next.threads[t]!;
  const ev: StepEvent = { thread: t, pc: th.pc, instr, say: '' };
  const val = (o: Operand): number => {
    if ('num' in o) return o.num;
    if ('reg' in o) return me.regs[o.reg] ?? 0;
    ev.read = o.mem;
    return next.mem[o.mem] ?? 0;
  };
  const show = (o: Operand): string => ('num' in o ? String(o.num) : 'reg' in o ? o.reg : o.mem);
  const fault = (why: string): StepResult => {
    me.status = 'fault';
    me.fault = why;
    ev.fault = why;
    ev.say = `${T} faults: ${why}`;
    return { ok: true, state: next, event: ev };
  };

  switch (instr.kind) {
    case 'load': {
      const v = next.mem[instr.mem] ?? 0;
      me.regs[instr.reg] = v;
      ev.read = instr.mem;
      ev.reg = instr.reg;
      ev.say = `${T} loads ${instr.mem} = ${v} into its register ${instr.reg}.`;
      advance(p, next, t);
      break;
    }
    case 'store': {
      const v = val(instr.value);
      ev.before = next.mem[instr.mem] ?? 0;
      next.mem[instr.mem] = v;
      ev.wrote = instr.mem;
      ev.say =
        'reg' in instr.value
          ? `${T} stores ${instr.value.reg} = ${v} into ${instr.mem}.`
          : `${T} sets ${instr.mem} to ${v}.`;
      advance(p, next, t);
      break;
    }
    case 'set': {
      const v = val(instr.value);
      me.regs[instr.reg] = v;
      ev.reg = instr.reg;
      ev.say = `${T} sets ${instr.reg} = ${v}.`;
      advance(p, next, t);
      break;
    }
    case 'add': {
      const a = val(instr.a);
      const b = val(instr.b);
      const v = a + instr.sign * b;
      me.regs[instr.reg] = v;
      ev.reg = instr.reg;
      const op = instr.sign > 0 ? '+' : '-';
      ev.say = `${T} computes ${instr.reg} = ${a} ${op} ${b} = ${v}, in its own register.`;
      advance(p, next, t);
      break;
    }
    case 'compare': {
      const a = val(instr.a);
      const b = val(instr.b);
      const v = relHolds(a, instr.rel, b) ? 1 : 0;
      me.regs[instr.reg] = v;
      ev.reg = instr.reg;
      ev.say = `${T} compares ${show(instr.a)} ${instr.rel} ${show(instr.b)}: ${a} ${instr.rel} ${b} is ${v ? 'true' : 'false'}, so ${instr.reg} = ${v}.`;
      advance(p, next, t);
      break;
    }
    case 'jump': {
      if (!instr.cond) {
        ev.jumped = true;
        ev.say = `${T} goes to ${instr.label}.`;
        advance(p, next, t, instr.target);
        break;
      }
      const a = val(instr.cond.a);
      const b = val(instr.cond.b);
      const yes = relHolds(a, instr.cond.rel, b);
      const what = `${show(instr.cond.a)} ${instr.cond.rel} ${show(instr.cond.b)}`;
      ev.jumped = yes;
      ev.say = yes
        ? `${T} checks ${what}: ${a} ${instr.cond.rel} ${b} holds, so it goes to ${instr.label}.`
        : `${T} checks ${what}: ${a} ${instr.cond.rel} ${b} does not hold, so it goes on.`;
      advance(p, next, t, yes ? instr.target : undefined);
      break;
    }
    case 'lock': {
      const lock = next.locks[instr.name]!;
      if (lock.holder === null) {
        lock.holder = t;
        ev.say = `${T} locks ${instr.name}: it was free, so ${T} holds it now.`;
        advance(p, next, t);
      } else {
        lock.waiters.push(t);
        me.status = 'blocked';
        me.on = { kind: 'lock', name: instr.name };
        ev.blocked = me.on;
        ev.say =
          lock.holder === t
            ? `${T} tries to lock ${instr.name}, which it already holds. Locks are not reentrant, so ${T} waits for itself, for ever.`
            : `${T} tries to lock ${instr.name}, but ${name(p, lock.holder)} holds it, so ${T} waits.`;
      }
      break;
    }
    case 'unlock': {
      const lock = next.locks[instr.name]!;
      if (lock.holder !== t)
        return fault(
          lock.holder === null
            ? `it unlocks ${instr.name}, which is not locked.`
            : `it unlocks ${instr.name}, which ${name(p, lock.holder)} holds.`,
        );
      const to = release(p, next, instr.name);
      if (to !== null) ev.woke = [to];
      ev.say =
        to === null
          ? `${T} unlocks ${instr.name}. It is free now.`
          : `${T} unlocks ${instr.name} and hands it to ${name(p, to)}, the first in line.`;
      advance(p, next, t);
      break;
    }
    case 'wait': {
      const lock = next.locks[instr.lock]!;
      if (lock.holder !== t)
        return fault(`it waits on ${instr.cond} without holding ${instr.lock}.`);
      const to = release(p, next, instr.lock);
      next.conds[instr.cond]!.waiters.push(t);
      me.status = 'blocked';
      me.on = { kind: 'cond', name: instr.cond };
      ev.blocked = me.on;
      if (to !== null) ev.woke = [to];
      ev.say = `${T} waits on ${instr.cond}: it lets go of ${instr.lock}${to === null ? '' : ` (handing it to ${name(p, to)})`} and sleeps until a signal.`;
      break;
    }
    case 'signal':
    case 'broadcast': {
      const cv = next.conds[instr.cond]!;
      const woken = instr.kind === 'signal' ? cv.waiters.splice(0, 1) : cv.waiters.splice(0);
      for (const w of woken) rejoin(p, next, w);
      if (woken.length) ev.woke = woken;
      const who = list(woken.map((w) => name(p, w)));
      ev.say = woken.length
        ? `${T} ${instr.kind === 'signal' ? 'signals' : 'broadcasts on'} ${instr.cond} and wakes ${who}, which must get the lock back before its wait returns.`
        : `${T} ${instr.kind === 'signal' ? 'signals' : 'broadcasts on'} ${instr.cond}, but no thread is waiting, so the signal is lost.`;
      advance(p, next, t);
      break;
    }
    case 'P': {
      const sem = next.sems[instr.name]!;
      const was = sem.value;
      sem.value -= 1;
      if (sem.value < 0) {
        sem.waiters.push(t);
        me.status = 'blocked';
        me.on = { kind: 'sem', name: instr.name };
        ev.blocked = me.on;
        ev.say = `${T} calls P(${instr.name}): ${instr.name} goes from ${was} to ${sem.value}, below 0, so ${T} waits.`;
      } else {
        ev.say = `${T} calls P(${instr.name}): ${instr.name} goes from ${was} to ${sem.value}, and ${T} goes on.`;
        advance(p, next, t);
      }
      break;
    }
    case 'V': {
      const sem = next.sems[instr.name]!;
      const was = sem.value;
      sem.value += 1;
      const w = sem.waiters.shift();
      if (w !== undefined) {
        advance(p, next, w);
        ev.woke = [w];
      }
      ev.say =
        w === undefined
          ? `${T} calls V(${instr.name}): ${instr.name} goes from ${was} to ${sem.value}.`
          : `${T} calls V(${instr.name}): ${instr.name} goes from ${was} to ${sem.value}, and ${name(p, w)}, the first waiting, goes on.`;
      advance(p, next, t);
      break;
    }
    case 'cas': {
      const was = next.mem[instr.mem] ?? 0;
      const want = val(instr.expect);
      const v = val(instr.value);
      ev.read = instr.mem;
      ev.reg = instr.reg;
      if (was === want) {
        next.mem[instr.mem] = v;
        ev.wrote = instr.mem;
        ev.before = was;
        me.regs[instr.reg] = 1;
        ev.say = `${T} runs cas(${instr.mem}, ${want}, ${v}): ${instr.mem} is ${was}, as expected, so it becomes ${v} and ${instr.reg} = 1.`;
      } else {
        me.regs[instr.reg] = 0;
        ev.say = `${T} runs cas(${instr.mem}, ${want}, ${v}): ${instr.mem} is ${was}, not ${want}, so nothing changes and ${instr.reg} = 0.`;
      }
      advance(p, next, t);
      break;
    }
    case 'print': {
      const text = 'text' in instr.what ? instr.what.text : String(val(instr.what));
      next.out.push({ thread: t, text });
      ev.say = `${T} prints ${text}.`;
      advance(p, next, t);
      break;
    }
    case 'done': {
      me.status = 'done';
      ev.say = `${T} is done.`;
      break;
    }
  }
  if (me.status === 'done') ev.done = true;
  return { ok: true, state: next, event: ev };
}

function holderText(p: Program, s: MachineState, m: string): string {
  const h = s.locks[m]?.holder;
  return h === null || h === undefined ? '' : `, which ${name(p, h)} holds`;
}

export interface RunResult {
  state: MachineState;
  events: StepEvent[];
  /** The first step of the schedule that could not run, and why. */
  stopped?: { at: number; reason: string; message: string };
}

/** Run a schedule (thread indices, 0-based) from `from` (default the start). */
export function run(p: Program, schedule: number[], from = initState(p)): RunResult {
  let state = from;
  const events: StepEvent[] = [];
  for (let i = 0; i < schedule.length; i++) {
    const r = step(p, state, schedule[i]!);
    if (!r.ok) return { state, events, stopped: { at: i, reason: r.reason, message: r.message } };
    state = r.state;
    events.push(r.event);
  }
  return { state, events };
}

/** A key that identifies a state for memoizing: everything but the schedule. */
export function stateKey(s: MachineState): string {
  return JSON.stringify([s.threads, s.mem, s.locks, s.sems, s.conds, s.out]);
}

/** The default outcome: shared values, then what was printed, then whether it got stuck. */
export function outcomeOf(p: Program, s: MachineState): string {
  const parts = p.shared.map((v) => `${v.name} = ${s.mem[v.name]}`);
  if (s.out.length) parts.push(`printed ${s.out.map((o) => o.text).join(' ')}`);
  if (s.threads.some((t) => t.status === 'fault')) parts.push('fault');
  if (stuck(s)) parts.push('stuck');
  return parts.join(', ') || 'done';
}

export interface InterleavingOptions {
  /** Stop listing after this many schedules (default CAP). */
  cap?: number;
  /** Cut a schedule off after this many steps (default MAX_STEPS); it counts as CUT_OFF. */
  maxSteps?: number;
  /** Outcome of a final state (default outcomeOf). It must not depend on `schedule`. */
  outcome?: (s: MachineState) => string;
  /** Start here instead of at the start; schedules then list only the steps after it. */
  from?: MachineState;
}

export interface Outcome {
  outcome: string;
  count: number;
  /** The first schedule (lowest thread first) that ends this way. */
  first: number[];
}

export interface Interleavings {
  /** Every schedule to the end, in order (lowest thread first), at most `cap` of them. */
  runs: { schedule: number[]; outcome: string }[];
  /** The listed runs grouped by outcome, in order of first appearance. */
  outcomes: Outcome[];
  /** False when the cap stopped the listing: there are more schedules than `runs`. */
  complete: boolean;
}

/**
 * Every interleaving: at each state, try each thread that can run, lowest first, until no thread
 * can run (the end, or stuck) or the step limit. Blocked threads take no steps, so a schedule is
 * the order of the steps that ran. Lists at most `cap` schedules and says when it stopped early.
 */
export function interleavings(p: Program, opts: InterleavingOptions = {}): Interleavings {
  const cap = opts.cap ?? CAP;
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const outcome = opts.outcome ?? ((s: MachineState) => outcomeOf(p, s));
  const runs: Interleavings['runs'] = [];
  const groups = new Map<string, Outcome>();
  let complete = true;
  const path: number[] = [];
  const leaf = (o: string) => {
    runs.push({ schedule: [...path], outcome: o });
    const g = groups.get(o);
    if (g) g.count++;
    else groups.set(o, { outcome: o, count: 1, first: [...path] });
  };
  const visit = (s: MachineState) => {
    const ready = runnable(s);
    if (ready.length === 0) return leaf(outcome(s));
    if (path.length >= maxSteps) return leaf(CUT_OFF);
    for (const t of ready) {
      if (runs.length >= cap) {
        complete = false;
        return;
      }
      const r = step(p, s, t) as Extract<StepResult, { ok: true }>;
      path.push(t);
      visit(r.state);
      path.pop();
    }
  };
  visit(opts.from ?? initState(p));
  return { runs, outcomes: [...groups.values()], complete };
}

/**
 * How many schedules end in each outcome, counted over states rather than schedules: the
 * schedules into a state are added up once, so 17 million schedules cost a few thousand states.
 * Same options as `interleavings` (no cap). Outcomes come in order of first appearance.
 */
export function countOutcomes(
  p: Program,
  opts: Omit<InterleavingOptions, 'cap'> = {},
): { total: number; outcomes: { outcome: string; count: number }[] } {
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const outcome = opts.outcome ?? ((s: MachineState) => outcomeOf(p, s));
  const memo = new Map<string, Map<string, number>>();
  const order: string[] = [];
  const go = (s: MachineState, depth: number): Map<string, number> => {
    const ready = runnable(s);
    if (ready.length === 0 || depth >= maxSteps) {
      const o = ready.length ? CUT_OFF : outcome(s);
      if (!order.includes(o)) order.push(o);
      return new Map([[o, 1]]);
    }
    const key = `${depth}|${stateKey(s)}`;
    const known = memo.get(key);
    if (known) return known;
    const acc = new Map<string, number>();
    for (const t of ready) {
      const r = step(p, s, t) as Extract<StepResult, { ok: true }>;
      for (const [o, n] of go(r.state, depth + 1)) acc.set(o, (acc.get(o) ?? 0) + n);
    }
    memo.set(key, acc);
    return acc;
  };
  const counts = go(opts.from ?? initState(p), 0);
  const outcomes = order.map((o) => ({ outcome: o, count: counts.get(o) ?? 0 }));
  return { total: outcomes.reduce((a, o) => a + o.count, 0), outcomes };
}

/**
 * The first schedule, lowest thread first, that runs to a final state (no thread can run)
 * meeting `goal`; null if none does within the step limit. States already explored without
 * success are skipped, so this stays fast on large programs.
 */
export function findSchedule(
  p: Program,
  goal: (s: MachineState) => boolean,
  opts: Pick<InterleavingOptions, 'maxSteps' | 'from'> = {},
): number[] | null {
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const failed = new Set<string>();
  const path: number[] = [];
  const visit = (s: MachineState): boolean => {
    const ready = runnable(s);
    if (ready.length === 0) return goal(s);
    if (path.length >= maxSteps) return false;
    const key = `${path.length}|${stateKey(s)}`;
    if (failed.has(key)) return false;
    for (const t of ready) {
      const r = step(p, s, t) as Extract<StepResult, { ok: true }>;
      path.push(t);
      if (visit(r.state)) return true;
      path.pop();
    }
    failed.add(key);
    return false;
  };
  return visit(opts.from ?? initState(p)) ? [...path] : null;
}

/** Interleavings of threads with these step counts when nothing blocks: a multinomial. */
export function schedules(lengths: number[]): number {
  let total = 0;
  let ways = 1;
  for (const n of lengths) {
    // ways *= C(total + n, n), one factor at a time so it stays exact.
    for (let k = 1; k <= n; k++) ways = (ways * (total + k)) / k;
    total += n;
  }
  return Math.round(ways);
}
