/**
 * Producer-consumer: a bounded buffer of size 1 or 2 (n counts the items in it), one producer P1
 * and two consumers C1 and C2, each moving one item. Three ways to synchronize, as a setting:
 *   while  a mutex m and two condition variables, as in OSTEP: the producer waits on room while
 *          the buffer is full and signals item; a consumer waits on item while it is empty and
 *          signals room. The check sits in a while loop (goto t).
 *   if     the same with if: under Mesa semantics a woken thread does not run at once, so another
 *          consumer can take the item first, and the woken one takes from an empty buffer.
 *   sem    two counting semaphores (spaces, items) and the mutex, as in OSTEP and Downey.
 * The buffer can start with an item in it: then two items meet two consumers and every run ends.
 * With an empty start there is one item for two consumers, so one consumer always ends up waiting,
 * which is fine; with `if`, some runs take an item that is not there.
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

export type Sync = 'while' | 'if' | 'sem';

export interface PcSettings {
  [key: string]: string | number | boolean | null;
  sync: Sync;
  /** Buffer size, 1 or 2. */
  size: number;
  /** Items in the buffer at the start, 0 or 1. */
  start: number;
}

export const defaults: PcSettings = { sync: 'while', size: 1, start: 1 };

export type PcState = ThreadsState;

export const syncOf = (s: PcSettings): Sync =>
  s.sync === 'if' || s.sync === 'sem' ? s.sync : 'while';
export const sizeOf = (s: PcSettings) => (Number(s.size) >= 2 ? 2 : 1);
export const startOf = (s: PcSettings) => (Number(s.start) >= 1 ? 1 : 0);

/** The steps of the producer (t = 0) or a consumer. */
export function threadSteps(sync: Sync, size: number, producer: boolean): string[] {
  if (sync === 'sem')
    return producer
      ? ['P(spaces)', 'lock(m)', 'r = n + 1', 'n = r', 'unlock(m)', 'V(items)']
      : ['P(items)', 'lock(m)', 'r = n - 1', 'n = r', 'unlock(m)', 'V(spaces)'];
  const loop = sync === 'while';
  const [check, cv, other, go, change] = producer
    ? [`r = n < ${size}`, 'room', 'item', 'p', 'r = n + 1']
    : ['r = n > 0', 'item', 'room', 'g', 'r = n - 1'];
  return [
    'lock(m)',
    `${loop ? 't: ' : ''}${check}`,
    `if r goto ${go}`,
    `wait(${cv}, m)`,
    ...(loop ? ['goto t'] : []),
    `${go}: ${change}`,
    'n = r',
    `signal(${other})`,
    'unlock(m)',
  ];
}

export function programText(settings: PcSettings): string {
  const sync = syncOf(settings);
  const size = sizeOf(settings);
  const start = startOf(settings);
  return [
    `shared n = ${start}`,
    ...(sync === 'sem' ? [`sem spaces = ${size - start}, items = ${start}`] : []),
    'thread P1',
    ...threadSteps(sync, size, true).map((x) => `  ${x}`),
    ...['C1', 'C2'].flatMap((c) => [
      `thread ${c}`,
      ...threadSteps(sync, size, false).map((x) => `  ${x}`),
    ]),
  ].join('\n');
}

const programs = new Map<string, Program>();
export function program(settings: PcSettings): Program {
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

const name = (p: Program, t: number) => p.threads[t]!.name;

/** The step index of each thread's store (n = r): past it, the thread has moved its item. */
const storeAt = (p: Program, t: number) => p.threads[t]!.code.findIndex((i) => i.kind === 'store');

/** Threads that took from an empty buffer or put into a full one: their r went out of range. */
export function broken(p: Program, s: MachineState, size: number): number[] {
  return s.threads.flatMap((x, t) => {
    if (x.pc <= storeAt(p, t)) return [];
    const r = x.regs.r ?? 0;
    return t === 0 ? (r > size ? [t] : []) : r < 0 ? [t] : [];
  });
}

/** How many times threads went to sleep (wait, or a P that blocked) and woke up to check again. */
export function counts(p: Program, m: MachineState): { sleeps: number; rechecks: number } {
  let s = initState(p);
  let sleeps = 0;
  let rechecks = 0;
  for (const t of m.schedule) {
    const r = step(p, s, t);
    if (!r.ok) break;
    const ins = r.event.instr;
    if (r.event.blocked && (ins.kind === 'wait' || ins.kind === 'P')) sleeps++;
    if (ins.kind === 'jump' && !ins.cond) rechecks++;
    s = r.state;
  }
  return { sleeps, rechecks };
}

export function vars(p: Program, s: MachineState, settings: PcSettings): Record<string, Scalar> {
  const c = counts(p, s);
  const v: Record<string, Scalar> = { n: s.mem.n ?? 0, size: sizeOf(settings) };
  for (const x of p.sems) v[x.name] = s.sems[x.name]!.value;
  v.sleeps = c.sleeps;
  if (syncOf(settings) === 'while') v.rechecks = c.rechecks;
  v.steps = s.schedule.length;
  return v;
}

/** The consumers still waiting at the end, for the outcome. */
const waiting = (p: Program, s: MachineState) =>
  s.threads.flatMap((x, t) => (x.status === 'blocked' ? [name(p, t)] : []));

export function outcome(p: Program, s: MachineState, settings: PcSettings): string {
  const n = s.mem.n ?? 0;
  const bad = broken(p, s, sizeOf(settings));
  if (bad.length)
    return `n = ${n}: ${bad.map((t) => name(p, t)).join(', ')} ${bad[0] === 0 ? 'overfilled' : 'took nothing'}`;
  const w = stuck(s) ? waiting(p, s) : [];
  return w.length ? `n = ${n}, ${list(w)} ${w.length > 1 ? 'wait' : 'waits'}` : `n = ${n}`;
}

export const good = (o: string) => !/took nothing|overfilled/.test(o);

export function narrate(
  p: Program,
  before: MachineState,
  ev: StepEvent,
  after: MachineState,
  settings: PcSettings,
): string[] {
  const parts: string[] = [];
  const t = ev.thread;
  const T = name(p, t);
  const size = sizeOf(settings);
  const sync = syncOf(settings);
  const i = ev.instr;
  const n = after.mem.n ?? 0;
  if (i.kind === 'compare') {
    const yes = (after.threads[t]!.regs.r ?? 0) === 1;
    parts.push(
      t === 0
        ? yes
          ? `n = ${before.mem.n}: there is room for an item.`
          : `n = ${before.mem.n}: the buffer is full, so ${T} must wait for room.`
        : yes
          ? `n = ${before.mem.n}: there is an item to take.`
          : `n = ${before.mem.n}: the buffer is empty, so ${T} must wait for an item.`,
    );
  }
  if (i.kind === 'wait')
    parts.push(
      t === 0
        ? 'It sleeps until a consumer makes room.'
        : 'It sleeps until the producer puts an item.',
    );
  if ((i.kind === 'signal' || i.kind === 'broadcast') && ev.woke?.length) {
    const w = name(p, ev.woke[0]!);
    parts.push(
      sync === 'if'
        ? `When ${w} runs again it will not look at n again: with if, it goes straight on to ${ev.woke[0] === 0 ? 'put' : 'take'}.`
        : `When ${w} runs again it checks n again, because by then another thread may have changed it.`,
    );
  }
  if (i.kind === 'jump' && !i.cond)
    parts.push(`The while loop: ${T} checks n again before it goes on.`);
  if (i.kind === 'store') {
    if (n < 0)
      parts.push(
        `n = ${n}: ${T} took an item that was not there. It checked n before it went to sleep, and another consumer took the item while ${T} waited for the lock.`,
      );
    else if (n > size) parts.push(`n = ${n}: more items than the buffer holds.`);
    else
      parts.push(
        t === 0
          ? `${T} puts an item: n = ${n} of ${size}.`
          : `${T} takes an item: n = ${n} of ${size}.`,
      );
  }
  if (i.kind === 'P' && ev.blocked)
    parts.push(
      i.name === 'items'
        ? `No items: ${T} waits until the producer’s V(items).`
        : `No spaces: ${T} waits until a consumer’s V(spaces).`,
    );
  return parts;
}

export function ending(p: Program, s: MachineState, settings: PcSettings): string {
  const n = s.mem.n ?? 0;
  const bad = broken(p, s, sizeOf(settings));
  if (bad.length)
    return `No thread can run, and n = ${n}: ${list(bad.map((t) => name(p, t)))} took an item that was not there. That is the bug the while loop prevents.`;
  if (stuck(s)) {
    const w = waiting(p, s);
    return `No thread can run: ${list(w)} ${w.length > 1 ? 'wait' : 'waits'} for an item that will never come. ${startOf(settings) === 0 ? 'There was one item for two consumers, so one of them has to wait: that is not a bug. A real producer would put another item later.' : ''}`.trim();
  }
  return `Every thread is done: n = ${n}. Every item that went in came out once.`;
}

/** The kit's marks, with n in error when it leaves the range 0 to size. */
function marks(_p: Program, ev: StepEvent, after: MachineState, settings: PcSettings): Mark[] {
  const m = stepMarks(ev);
  const n = after.mem.n ?? 0;
  if (ev.instr.kind === 'store' && (n < 0 || n > sizeOf(settings))) {
    const k = m.findIndex((x) => x.id === varId('n'));
    if (k >= 0) m[k] = { id: varId('n'), role: 'error' };
  }
  return m;
}

const PLAIN: Record<string, string> = {
  'r = n < 1': 'Is there room? r = 1 if n < 1.',
  'r = n < 2': 'Is there room? r = 1 if n < 2.',
  'r = n > 0': 'Is there an item? r = 1 if n > 0.',
  'if r goto p': 'If there is room, go and put.',
  'if r goto g': 'If there is an item, go and take it.',
  'wait(room, m)': 'Let go of m and sleep until there is room; then take m back.',
  'wait(item, m)': 'Let go of m and sleep until there is an item; then take m back.',
  'goto t': 'Check again: the while loop.',
  'r = n + 1': 'One more item, in the register.',
  'r = n - 1': 'One item fewer, in the register.',
  'n = r': 'Write the new count back to n.',
  'signal(item)': 'Wake a consumer sleeping on item, if there is one.',
  'signal(room)': 'Wake the producer sleeping on room, if it is.',
  'P(spaces)': 'Take a free space; wait if there is none.',
  'P(items)': 'Take an item’s place; wait if there are none.',
  'V(items)': 'One more item: wake a waiting consumer.',
  'V(spaces)': 'One more free space: wake the producer if it waits.',
};

export const spec: ThreadsSpec<PcSettings, PcState> = {
  program,
  outcome: (p, s, settings) => outcome(p, s, settings),
  good: (o) => good(o),
  verdict: (o) => (good(o) ? 'ok' : 'bug'),
  endsWith: (o) => {
    const bug = /^(n = -?\d+): (.*)$/.exec(o);
    if (bug) return `with ${bug[1]} (${bug[2]})`;
    const w = /^(n = -?\d+), (.*) waits?$/.exec(o);
    return w ? `with ${w[1]} and ${w[2]} still waiting` : `with ${o}`;
  },
  rank: (o) => (good(o) ? 0 : 1) * 10 + (o.includes('wait') ? 1 : 0),
  narrate,
  marks: (p, ev, after, settings) => marks(p, ev, after, settings),
  vars: (p, m, settings) => vars(p, m, settings),
  lanes: 3,
  ending,
  startText: (p, settings) =>
    `n = ${startOf(settings)}${p.sems.length ? `, ${p.sems.map((x) => `${x.name} = ${x.init}`).join(', ')}` : ''}, m is free`,
  head: (p, t, settings) => {
    const sync = syncOf(settings);
    const how =
      sync === 'sem'
        ? 'with semaphores'
        : sync === 'if'
          ? 'waiting in an if'
          : 'waiting in a while loop';
    return t === 0
      ? {
          text: `${name(p, t)}: put an item (${how})`,
          plain: `${name(p, t)} puts one item, ${how}:`,
        }
      : {
          text: `${name(p, t)}: take an item (${how})`,
          plain: `${name(p, t)} takes one item, ${how}:`,
        };
  },
  plain: (_p, _t, _k, instr) => PLAIN[instr.text.replace(/^\w: /, '')],
};

export const ops = threadsOps(spec);

export const pseudocode = (settings: PcSettings) =>
  threadsPseudocode(spec, settings, {
    text: 'tally[n, who waits] += 1',
    plain: 'count one more schedule that ends this way.',
  });

export function init(settings: PcSettings): PcState {
  return { m: initState(program(settings)) };
}

export function initialSay(_s: PcState, settings: PcSettings): string {
  const sync = syncOf(settings);
  const size = sizeOf(settings);
  const start = startOf(settings);
  const buf = `A buffer of size ${size} holds ${start === 0 ? 'nothing' : 'one item'}. P1 puts one item; C1 and C2 each take one${start === 0 ? ', so one of them will have to wait' : ''}.`;
  if (sync === 'sem')
    return `${buf} spaces counts the free places and items the full ones; the mutex m guards n. Be the scheduler.`;
  return `${buf} The producer waits on room while the buffer is full, a consumer waits on item while it is empty, and each signals the other. The check sits in ${sync === 'while' ? 'a while loop' : 'an if'}. Be the scheduler${sync === 'if' ? ' and make a consumer take an item that is not there' : ''}.`;
}

export const initialVars = (s: PcState, settings: PcSettings) =>
  vars(program(settings), s.m, settings);
