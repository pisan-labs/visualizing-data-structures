/**
 * Semaphores: a counter with two operations, P (take one, wait if there is none) and V (give one
 * back, waking a waiter), as Dijkstra named them and as OSTEP and Downey's Little Book of
 * Semaphores draw them: the value goes below 0 to count the waiting threads. Three of Downey's
 * patterns, each a setting:
 *   limit  a semaphore that starts at k lets at most k threads inside at once (a multiplex);
 *          each thread prints "in" when it enters and "out" when it leaves
 *   first  a semaphore that starts at 0 makes T2 wait until T1 has printed (signaling)
 *   turns  two semaphores, one starting at 1, make two threads take turns (ping, pong)
 * With "Use the semaphores" off, the same threads run with no P and no V: the naive program.
 * The machine is src/viz/_threads; the operations and the tally come from src/viz/_threads2.
 */
import type { Scalar } from '../../engine/types';
import { initState, type MachineState, type Program, type StepEvent } from '../_threads/machine';
import { parseProgram } from '../_threads/parse';
import {
  list,
  threadsOps,
  threadsPseudocode,
  type ThreadsSpec,
  type ThreadsState,
} from '../_threads2/page';

export type Pattern = 'limit' | 'first' | 'turns';

export interface SemSettings {
  [key: string]: string | number | boolean | null;
  pattern: Pattern;
  /** Run the program with its P and V steps (the pattern) or without them (the naive one). */
  sync: boolean;
  /** limit: how many threads may be inside at once (the semaphore's start value). */
  room: number;
}

export const defaults: SemSettings = { pattern: 'limit', sync: true, room: 2 };

export type SemState = ThreadsState;

export const patternOf = (s: SemSettings): Pattern =>
  s.pattern === 'first' || s.pattern === 'turns' ? s.pattern : 'limit';
export const roomOf = (s: SemSettings) => Math.min(3, Math.max(1, Math.round(Number(s.room) || 2)));

/** The words a pattern prints when it works: limit has no single right order. */
export const rightOrder: Record<Exclude<Pattern, 'limit'>, string> = {
  first: 'one two',
  turns: 'ping pong ping pong',
};

/** Thread t's steps. */
export function threadSteps(pattern: Pattern, sync: boolean, t: number): string[] {
  const keep = (steps: string[]) => (sync ? steps : steps.filter((x) => !/^[PV]\(/.test(x)));
  if (pattern === 'limit') return keep(['P(s)', 'print("in")', 'print("out")', 'V(s)']);
  if (pattern === 'first')
    return keep(t === 0 ? ['print("one")', 'V(a)'] : ['P(a)', 'print("two")']);
  const [mine, theirs, word] = t === 0 ? ['a', 'b', 'ping'] : ['b', 'a', 'pong'];
  const turn = [`P(${mine})`, `print("${word}")`, `V(${theirs})`];
  return keep([...turn, ...turn]);
}

export function programText(settings: SemSettings): string {
  const pattern = patternOf(settings);
  const sync = settings.sync !== false;
  const k = pattern === 'limit' ? 3 : 2;
  const sems =
    pattern === 'limit'
      ? `sem s = ${roomOf(settings)}`
      : pattern === 'first'
        ? 'sem a = 0'
        : 'sem a = 1, b = 0';
  return [
    ...(sync ? [sems] : []),
    ...Array.from({ length: k }, (_, t) => [
      `thread T${t + 1}`,
      ...threadSteps(pattern, sync, t).map((x) => `  ${x}`),
    ]).flat(),
  ].join('\n');
}

const programs = new Map<string, Program>();
export function program(settings: SemSettings): Program {
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

/** limit: threads that have printed "in" and not "out", now and at most so far. */
export function inside(s: MachineState): { now: number[]; most: number } {
  const now: number[] = [];
  let most = 0;
  const cur = new Set<number>();
  for (const o of s.out) {
    if (o.text === 'in') cur.add(o.thread);
    if (o.text === 'out') cur.delete(o.thread);
    most = Math.max(most, cur.size);
  }
  now.push(...[...cur].sort((a, b) => a - b));
  return { now, most };
}

const printed = (s: MachineState) => s.out.map((o) => o.text).join(' ');

export function vars(p: Program, s: MachineState, settings: SemSettings): Record<string, Scalar> {
  const v: Record<string, Scalar> = {};
  for (const x of p.sems) v[x.name] = s.sems[x.name]!.value;
  if (patternOf(settings) === 'limit') {
    const ins = inside(s);
    v.inside = ins.now.length;
    v.most = ins.most;
    v.room = roomOf(settings);
  }
  v.steps = s.schedule.length;
  return v;
}

export function outcome(_p: Program, s: MachineState, settings: SemSettings): string {
  if (patternOf(settings) === 'limit') return `at most ${inside(s).most} inside`;
  return printed(s) || 'nothing printed';
}

export function good(o: string, settings: SemSettings): boolean {
  const pattern = patternOf(settings);
  if (pattern === 'limit') {
    const most = Number(/\d+/.exec(o)?.[0] ?? 0);
    return most <= roomOf(settings);
  }
  return o === rightOrder[pattern];
}

const T = (t: number) => `T${t + 1}`;

export function narrate(
  p: Program,
  before: MachineState,
  ev: StepEvent,
  after: MachineState,
  settings: SemSettings,
): string[] {
  const pattern = patternOf(settings);
  const parts: string[] = [];
  const t = ev.thread;
  const i = ev.instr;
  if (pattern === 'limit') {
    const room = roomOf(settings);
    if (i.kind === 'P' && !ev.blocked) {
      const v = after.sems.s!.value;
      parts.push(
        v === 0
          ? `That was the last free place: the next thread to call P(s) waits.`
          : `s counts the free places: ${v} left.`,
      );
    }
    if (i.kind === 'P' && ev.blocked)
      parts.push(
        `${room === 1 ? 'One thread is' : `${room} threads are`} past P(s) already; ${T(t)} waits until one of them calls V(s).`,
      );
    if (i.kind === 'print') {
      const now = inside(after).now;
      parts.push(
        now.length
          ? `Inside now: ${list(now.map(T))}${settings.sync !== false ? `, ${now.length} of at most ${room}` : ''}.`
          : 'Nobody is inside now.',
      );
      if (settings.sync === false && now.length > 2)
        parts.push('With nothing to stop them, all three are inside at once.');
    }
  }
  if (pattern === 'first') {
    if (i.kind === 'P' && ev.blocked)
      parts.push('T2 cannot print until T1 has printed one and called V(a).');
    if (i.kind === 'P' && !ev.blocked)
      parts.push('a was 1: T1 has already printed and signaled, so T2 does not wait.');
    if (i.kind === 'V' && !ev.woke?.length)
      parts.push('Nobody is waiting yet, but a = 1 remembers the signal: T2’s P(a) will not wait.');
    if (i.kind === 'print' && settings.sync === false && after.out.length === 1 && t === 1)
      parts.push('T2 printed first: nothing made it wait for T1.');
  }
  if (pattern === 'turns') {
    if (i.kind === 'P' && ev.blocked)
      parts.push(`It is not ${T(t)}’s turn: it waits for the other thread’s V(${i.name}).`);
    if (i.kind === 'V' && ev.woke?.length) parts.push(`Now it is ${T(ev.woke[0]!)}’s turn.`);
    if (i.kind === 'print' && settings.sync === false) {
      const words = after.out.map((o) => o.text);
      const k = words.length - 1;
      if (k > 0 && words[k] === words[k - 1]) parts.push(`${words[k]} twice in a row: no turns.`);
    }
  }
  void p;
  void before;
  return parts;
}

export function ending(p: Program, s: MachineState, settings: SemSettings): string {
  const pattern = patternOf(settings);
  if (s.threads.some((x) => x.status === 'blocked')) {
    const waiting = s.threads.flatMap((x, t) => (x.status === 'blocked' ? [T(t)] : []));
    return `No thread can run: ${list(waiting)} ${waiting.length > 1 ? 'wait' : 'waits'} for a V that will never come. The program is stuck.`;
  }
  if (pattern === 'limit') {
    const most = inside(s).most;
    return settings.sync !== false
      ? `Every thread is done. At most ${most} ${most === 1 ? 'was' : 'were'} inside at once, and the limit was ${roomOf(settings)}.`
      : `Every thread is done. ${most} ${most === 1 ? 'was' : 'were'} inside at once at the most: nothing kept them out.`;
  }
  const out = printed(s);
  const right = rightOrder[pattern];
  void p;
  return out === right
    ? `Every thread is done: it printed ${out}, in the right order.`
    : `Every thread is done: it printed ${out}, not ${right}.`;
}

export const spec: ThreadsSpec<SemSettings, SemState> = {
  program,
  outcome: (p, s, settings) => outcome(p, s, settings),
  good: (o, _p, settings) => good(o, settings),
  verdict: (o, _p, settings) =>
    good(o, settings) ? 'ok' : patternOf(settings) === 'limit' ? 'too many' : 'wrong',
  endsWith: (o) => (o.startsWith('at most') ? `with ${o}` : `printing ${o}`),
  rank: (o) => {
    const most = /^at most (\d+)/.exec(o);
    return most ? Number(most[1]) : 0;
  },
  narrate,
  vars: (p, m, settings) => vars(p, m, settings),
  lanes: 3,
  ending,
  startText: (p) =>
    p.sems.length
      ? `${p.sems.map((x) => `${x.name} = ${x.init}`).join(', ')}, nothing printed`
      : 'nothing printed',
  head: (p, t, settings) => {
    const pattern = patternOf(settings);
    const name = p.threads[t]!.name;
    if (pattern === 'limit')
      return {
        text: `${name}: enter, then leave`,
        plain: `${name} enters, prints in and out, and leaves:`,
      };
    if (pattern === 'first')
      return t === 0
        ? { text: `${name}: print one, then signal`, plain: `${name} prints one and lets T2 go:` }
        : {
            text: `${name}: wait, then print two`,
            plain: `${name} waits for T1, then prints two:`,
          };
    return {
      text: `${name}: two turns`,
      plain: `${name} takes two turns, waiting for the other thread each time:`,
    };
  },
  plain: (_p, t, _k, instr, settings) => {
    const pattern = patternOf(settings);
    if (instr.kind === 'P')
      return pattern === 'limit'
        ? 'Take a free place; wait if there is none (s goes below 0).'
        : pattern === 'first'
          ? 'Wait until T1 has signaled (a goes below 0 if not yet).'
          : `Wait for my turn: take one from ${instr.name}.`;
    if (instr.kind === 'V')
      return pattern === 'limit'
        ? 'Give the place back; wake a waiting thread if there is one.'
        : pattern === 'first'
          ? 'Signal T2: add one to a, and wake T2 if it waits.'
          : `Give the turn to T${t === 0 ? 2 : 1}: add one to ${instr.name}.`;
    return undefined;
  },
};

export const ops = threadsOps(spec);

export const pseudocode = (settings: SemSettings) =>
  threadsPseudocode(spec, settings, {
    text: 'tally[outcome] += 1',
    plain: 'count one more schedule that ends this way.',
  });

export function init(settings: SemSettings): SemState {
  return { m: initState(program(settings)) };
}

export function initialSay(_s: SemState, settings: SemSettings): string {
  const pattern = patternOf(settings);
  const sync = settings.sync !== false;
  if (pattern === 'limit') {
    const room = roomOf(settings);
    return sync
      ? `Three threads each enter a room, print in, print out and leave. The semaphore s starts at ${room}: P(s) takes a place and V(s) gives it back, so at most ${room} ${room === 1 ? 'thread is' : 'threads are'} inside at once. Step the threads and try to get a third one in.`
      : 'Three threads each enter a room, print in, print out and leave, with no semaphore. Nothing keeps them out: try to get all three inside at once.';
  }
  if (pattern === 'first')
    return sync
      ? 'T1 prints one, T2 prints two. The semaphore a starts at 0, so T2’s P(a) waits until T1’s V(a): one always comes first. Try to make T2 print first.'
      : 'T1 prints one and T2 prints two, with no semaphore. Either can go first.';
  return sync
    ? 'T1 prints ping twice and T2 prints pong twice. Semaphore a is T1’s turn (it starts at 1) and b is T2’s (it starts at 0): each thread waits for its turn and then hands the turn over. Try to break the alternation.'
    : 'T1 prints ping twice and T2 prints pong twice, with no semaphores. Nothing makes them take turns.';
}

export const initialVars = (s: SemState, settings: SemSettings) =>
  vars(program(settings), s.m, settings);
