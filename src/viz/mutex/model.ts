/**
 * A mutex (a lock) around count = count + 1: the race of /race-condition/ with lock(m) before the
 * load and unlock(m) after the store. A thread that finds m held waits in line (first come,
 * first served: unlock hands m straight to the first in line), so no two threads are
 * ever between their load and their store at once, and every interleaving ends with the right
 * count. Settings put the mistakes beside it: no lock, a lock around the store only, and a thread
 * that forgets to unlock (the program gets stuck). The machine is src/viz/_threads; the
 * operations and the tally come from src/viz/_threads2.
 */
import type { Mark, Scalar } from '../../engine/types';
import { varId } from '../../layouts/lanes';
import {
  initState,
  step,
  stuck,
  type MachineState,
  type Program,
  type StepEvent,
} from '../_threads/machine';
import { stepMarks } from '../_threads/page';
import { parseProgram } from '../_threads/parse';
import {
  list,
  threadsOps,
  threadsPseudocode,
  type ThreadsSpec,
  type ThreadsState,
} from '../_threads2/page';

export type LockMode = 'lock' | 'store' | 'forget' | 'none';

export interface MutexSettings {
  [key: string]: string | number | boolean | null;
  /** 2 or 3 threads. */
  threads: number;
  /** Where the lock goes: around the increment (the fix), around the store only, T1 forgets
   * to unlock, or no lock at all (the race). */
  lock: LockMode;
}

export const defaults: MutexSettings = { threads: 2, lock: 'lock' };

export type MutexState = ThreadsState;

const clampThreads = (n: number) => (n >= 3 ? 3 : 2);
const modeOf = (s: MutexSettings): LockMode =>
  s.lock === 'store' || s.lock === 'forget' || s.lock === 'none' ? s.lock : 'lock';

/** Thread t's steps under a setting. */
export function threadSteps(mode: LockMode, t: number): string[] {
  const inc = ['r = count', 'r = r + 1', 'count = r'];
  if (mode === 'none') return inc;
  if (mode === 'store') return [...inc.slice(0, 2), 'lock(m)', 'count = r', 'unlock(m)'];
  if (mode === 'forget' && t === 0) return ['lock(m)', ...inc];
  return ['lock(m)', ...inc, 'unlock(m)'];
}

export function programText(settings: MutexSettings): string {
  const k = clampThreads(settings.threads);
  const mode = modeOf(settings);
  return [
    'shared count = 0',
    ...Array.from({ length: k }, (_, t) => [
      `thread T${t + 1}`,
      ...threadSteps(mode, t).map((x) => `  ${x}`),
    ]).flat(),
  ].join('\n');
}

const programs = new Map<string, Program>();
export function program(settings: MutexSettings): Program {
  const key = programText(settings);
  let p = programs.get(key);
  if (!p) {
    const parsed = parseProgram(key);
    if (parsed instanceof Error) throw parsed;
    p = parsed;
    programs.set(key, p);
  }
  return p;
}

export const expected = (p: Program) => p.threads.length;

/** The index of each thread's store (count = r). */
const storeAt = (p: Program, t: number) => p.threads[t]!.code.findIndex((i) => i.kind === 'store');

/** Increments finished: threads past their store. */
export function stores(p: Program, s: MachineState): number {
  return s.threads.filter((x, t) => x.pc > storeAt(p, t)).length;
}

export const lost = (p: Program, s: MachineState) => stores(p, s) - (s.mem.count ?? 0);

/** Threads between their load and their store: holding a copy of count not yet written back. */
export function inFlight(p: Program, s: MachineState): number[] {
  return s.threads.flatMap((x, t) => {
    const load = p.threads[t]!.code.findIndex((i) => i.kind === 'load');
    return x.pc > load && x.pc <= storeAt(p, t) ? [t] : [];
  });
}

/**
 * Contention, from the schedule so far: how many lock calls found m held (waits), and how many
 * steps the threads spent waiting in line, added up (waited: each step taken while a thread waits
 * counts once for every waiting thread).
 */
export function contention(p: Program, m: MachineState): { waits: number; waited: number } {
  let s = initState(p);
  let waits = 0;
  let waited = 0;
  for (const t of m.schedule) {
    waited += s.threads.filter((x) => x.status === 'blocked').length;
    const r = step(p, s, t);
    if (!r.ok) break;
    if (r.event.blocked) waits++;
    s = r.state;
  }
  return { waits, waited };
}

export function vars(p: Program, s: MachineState): Record<string, Scalar> {
  const c = contention(p, s);
  return {
    count: s.mem.count ?? 0,
    expected: expected(p),
    finished: stores(p, s),
    lost: lost(p, s),
    steps: s.schedule.length,
    waits: c.waits,
    waited: c.waited,
  };
}

export function outcome(_p: Program, s: MachineState): string {
  const c = s.mem.count ?? 0;
  return stuck(s) ? `stuck at count = ${c}` : `count = ${c}`;
}

const T = (t: number) => `T${t + 1}`;

export function narrate(p: Program, before: MachineState, ev: StepEvent, after: MachineState) {
  const parts: string[] = [];
  const t = ev.thread;
  const kind = ev.instr.kind;
  if (kind === 'load') {
    const others = inFlight(p, before).filter((o) => o !== t);
    if (others.length)
      parts.push(
        `${list(others.map(T))} ${others.length > 1 ? 'have' : 'has'} loaded count too and not stored it yet, so an increment will be lost.`,
      );
    else if (after.locks.m?.holder === t)
      parts.push(`${T(t)} holds m, so no other thread can reach its load until ${T(t)} unlocks.`);
  }
  if (kind === 'store') {
    const v = after.mem.count!;
    const was = ev.before ?? 0;
    const done = stores(p, after);
    if (v <= was) {
      const wiped = was - v + 1;
      parts.push(
        `count was already ${was}, so this store wipes out ${wiped === 1 ? 'an increment' : `${wiped} increments`}: ${done} ${done === 1 ? 'increment is' : 'increments are'} finished, but count is ${v}.`,
      );
    }
  }
  if (ev.blocked) {
    const line = after.locks.m!.waiters;
    parts.push(
      line.length > 1
        ? `The line for m is now ${line.map(T).join(', ')}, first come, first served.`
        : `${T(t)} takes no more steps until m is handed to it.`,
    );
  }
  if (kind === 'unlock' && ev.woke?.length) {
    const w = ev.woke[0]!;
    parts.push(`${T(w)}’s lock(m) returns without a step of its own: it holds m and goes on.`);
  }
  if (ev.done && after.locks.m?.holder === t)
    parts.push(
      `${T(t)} is done but never unlocked m, so m stays held by a thread that will never run again.`,
    );
  return parts;
}

export function ending(p: Program, s: MachineState): string {
  const c = s.mem.count ?? 0;
  const e = expected(p);
  if (stuck(s)) {
    const h = s.locks.m!.holder;
    const waiting = s.locks.m!.waiters.map(T);
    return `No thread can run: ${list(waiting)} ${waiting.length > 1 ? 'wait' : 'waits'} for m, which ${h === null ? 'nobody' : T(h)} holds${h !== null && s.threads[h]!.status === 'done' ? ' and will never unlock' : ''}. The program is stuck, with count = ${c}.`;
  }
  return c === e
    ? `Every thread is done: count = ${c}, as expected. No update was lost.`
    : `Every thread is done: count = ${c}, not ${e}. ${e - c === 1 ? 'One update was' : `${e - c} updates were`} lost.`;
}

/** The kit's marks, with count in error when a store loses an increment. */
function marks(_p: Program, ev: StepEvent, after: MachineState): Mark[] {
  const m = stepMarks(ev);
  if (ev.instr.kind === 'store' && (after.mem.count ?? 0) <= (ev.before ?? 0)) {
    const i = m.findIndex((x) => x.id === varId('count'));
    if (i >= 0) m[i] = { id: varId('count'), role: 'error' };
  }
  return m;
}

const rankOf = (o: string) => {
  const c = Number(/count = (-?\d+)/.exec(o)?.[1] ?? 0);
  return (o.startsWith('stuck') ? 100 : 0) + c;
};

export const spec: ThreadsSpec<MutexSettings, MutexState> = {
  program,
  outcome,
  good: (o, p) => o === `count = ${expected(p)}`,
  verdict: (o, p) => (o.startsWith('stuck') ? '' : o === `count = ${expected(p)}` ? 'ok' : 'lost'),
  endsWith: (o) => (o.startsWith('stuck') ? o : `with ${o}`),
  rank: rankOf,
  narrate,
  marks,
  vars: (p, m) => vars(p, m),
  lanes: 3,
  ending,
  startText: () => 'count = 0, m is free',
  head: (p, t, settings) => {
    const mode = modeOf(settings);
    const th = p.threads[t]!;
    const what =
      mode === 'none'
        ? { text: 'count = count + 1', plain: 'adds 1 to count, with no lock:' }
        : mode === 'store'
          ? {
              text: 'count = count + 1, store locked',
              plain: 'adds 1 to count, locking only the store:',
            }
          : mode === 'forget' && t === 0
            ? {
                text: 'lock; count = count + 1 (no unlock)',
                plain: 'locks m, adds 1 to count, and forgets to unlock:',
              }
            : {
                text: 'lock; count = count + 1; unlock',
                plain: 'adds 1 to count while it holds m:',
              };
    return { text: `${th.name}: ${what.text}`, plain: `${th.name} ${what.plain}` };
  },
};

export const ops = threadsOps(spec);

export const pseudocode = (settings: MutexSettings) =>
  threadsPseudocode(spec, settings, {
    text: 'tally[final count] += 1',
    plain: 'count one more schedule that ends with this count (or stuck).',
  });

export function init(settings: MutexSettings): MutexState {
  return { m: initState(program(settings)) };
}

export function initialSay(_s: MutexState, settings: MutexSettings): string {
  const p = program(settings);
  const k = p.threads.length;
  const mode = modeOf(settings);
  const intro = `${k} threads each add 1 to count: load, add, store.`;
  if (mode === 'none')
    return `${intro} No lock: this is the race of the race-condition page. Step the threads, or try every interleaving, and compare with the lock.`;
  if (mode === 'store')
    return `${intro} Each locks m around the store only. Try to lose an update anyway: the load happens before the lock.`;
  if (mode === 'forget')
    return `${intro} Each holds m around all three, except that T1 forgets to unlock. Step T1 to the end, then try another thread.`;
  return `${intro} Each takes lock m first and lets go after the store, so a second thread that wants m waits in line. Be the scheduler and try to lose an update.`;
}

export const initialVars = (s: MutexState, settings: MutexSettings) => vars(program(settings), s.m);
