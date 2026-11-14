/**
 * Dining philosophers: n philosophers (3 or 4; the classic five make lanes too small to read) sit
 * at a round table with one fork between each pair. Philosopher Pi picks up its left fork fi,
 * then its right fork f(i+1) (wrapping round), eats, and puts both down. Each fork is a lock.
 * Run every philosopher's first step and each holds its left fork and waits for its right one,
 * which its neighbour holds: a cycle in the wait-for graph, as on /deadlock/. Two fixes, as a
 * setting:
 *   order   the last philosopher picks up its right fork first. Then every philosopher takes
 *           the lower-numbered of its forks first: one global order, so no cycle can form.
 *   waiter  a semaphore that starts at n - 1 (Downey's footman): at most n - 1 philosophers
 *           reach for forks at once, so one of them always gets both.
 * The machine is src/viz/_threads; rows, operations and the tally are src/viz/_threads3.
 */
import type { Scalar } from '../../engine/types';
import { deadlockCycle, waitFor } from '../_threads/deadlock';
import { initState, stuck, type MachineState, type StepEvent } from '../_threads/machine';
import { buildMacro, mfind, rowNow, type Macro, type RowSpec } from '../_threads3/macro';
import { list, rowsOps, rowsPseudocode, type RowsSpec, type RowsState } from '../_threads3/page';

export type Fix = 'none' | 'order' | 'waiter';

export interface DiningSettings {
  [key: string]: string | number | boolean | null;
  philosophers: number;
  fix: Fix;
}

export const defaults: DiningSettings = { philosophers: 3, fix: 'none' };

export type DiningState = RowsState;

export const countOf = (s: DiningSettings) => (Number(s.philosophers) >= 4 ? 4 : 3);
export const fixOf = (s: DiningSettings): Fix =>
  s.fix === 'order' || s.fix === 'waiter' ? s.fix : 'none';

const P = (t: number) => `P${t + 1}`;
/** Fork names: f1 is P1's left fork; P1's right fork is f2. */
export const fork = (i: number) => `f${i + 1}`;
export const leftOf = (n: number, t: number) => t;
export const rightOf = (n: number, t: number) => (t + 1) % n;

/** The forks philosopher t picks up, in its order: [first, second]. */
export function forkOrder(n: number, fix: Fix, t: number): [number, number] {
  const l = leftOf(n, t);
  const r = rightOf(n, t);
  return fix === 'order' && t === n - 1 ? [r, l] : [l, r];
}

const side = (n: number, t: number, f: number) => (f === leftOf(n, t) ? 'left' : 'right');

export function threadRows(n: number, fix: Fix, t: number): RowSpec[] {
  const [a, b] = forkOrder(n, fix, t);
  const rows: RowSpec[] = [
    {
      text: `lock(${fork(a)})`,
      plain: `Pick up ${fork(a)}, the ${side(n, t, a)} fork, or wait until it is free.`,
    },
    {
      text: `lock(${fork(b)})`,
      plain: `Pick up ${fork(b)}, the ${side(n, t, b)} fork, or wait until it is free.`,
    },
    { text: 'eat', plain: 'Eat, holding both forks.', steps: [`print("${P(t)}")`] },
    {
      text: `unlock(${fork(b)})`,
      plain: `Put ${fork(b)} down; a neighbour waiting for it takes it.`,
    },
    {
      text: `unlock(${fork(a)})`,
      plain: `Put ${fork(a)} down; a neighbour waiting for it takes it.`,
    },
  ];
  if (fix !== 'waiter') return rows;
  return [
    {
      text: 'P(waiter)',
      plain: `Ask the waiter for a seat: wait if ${n - 1} are already at the table.`,
    },
    ...rows,
    { text: 'V(waiter)', plain: 'Leave the table: the waiter seats the next one waiting.' },
  ];
}

export function macro(settings: DiningSettings): Macro {
  const n = countOf(settings);
  const fix = fixOf(settings);
  return buildMacro(
    fix === 'waiter' ? [`sem waiter = ${n - 1}`] : [],
    Array.from({ length: n }, (_, t) => ({ name: P(t), rows: threadRows(n, fix, t) })),
  );
}

/** Who holds each fork (a thread index, or null). */
export const holders = (s: MachineState, n: number) =>
  Array.from({ length: n }, (_, i) => s.locks[fork(i)]?.holder ?? null);

/** Philosophers holding both their forks: eating, or about to put them down. */
export function eating(s: MachineState, n: number): number[] {
  const h = holders(s, n);
  return Array.from({ length: n }, (_, t) => t).filter(
    (t) => h[leftOf(n, t)] === t && h[rightOf(n, t)] === t,
  );
}

/** Who has eaten, in order. */
export const ate = (s: MachineState) => s.out.map((o) => o.thread);

/** The wait-for cycle written from its lowest philosopher: "P1 → P2 → P3 → P1". */
export function cycleText(c: number[]): string {
  const i = c.indexOf(Math.min(...c));
  const r = [...c.slice(i), ...c.slice(0, i)];
  return [...r, r[0]!].map(P).join(' → ');
}

export function outcome(_mac: Macro, s: MachineState): string {
  if (!stuck(s)) return 'all ate';
  return deadlockCycle(s) ? 'deadlock' : 'stuck';
}

const names = (ts: number[]) => (ts.length ? ts.map(P).join(' ') : 'nobody');

export function vars(
  mac: Macro,
  st: DiningState,
  settings: DiningSettings,
): Record<string, Scalar> {
  const s = st.m;
  const n = countOf(settings);
  const c = deadlockCycle(s);
  const v: Record<string, Scalar> = {
    eating: names(eating(s, n)),
    ate: names(ate(s)),
    waiting: s.threads.filter((x) => x.status === 'blocked').length,
    cycle: c ? cycleText(c) : 'none',
  };
  if (fixOf(settings) === 'waiter') v.waiter = s.sems.waiter!.value;
  v.steps = st.sched.length;
  void mac;
  return v;
}

/** The machine's sentences, in the table's words. */
export function say(
  mac: Macro,
  before: MachineState,
  events: StepEvent[],
  after: MachineState,
  settings: DiningSettings,
): string {
  const n = countOf(settings);
  return events
    .map((ev) => {
      const t = ev.thread;
      const i = ev.instr;
      const T = P(t);
      if (i.kind === 'lock') {
        const f = Number(i.name.slice(1)) - 1;
        const which = `${i.name}, ${side(n, t, f) === 'left' ? 'its left fork' : 'its right fork'}`;
        if (ev.blocked) {
          const h = before.locks[i.name]!.holder!;
          return `${T} reaches for ${which}, but ${P(h)} has it, so ${T} waits.`;
        }
        const both = eating(after, n).includes(t);
        return `${T} picks up ${which}.${both ? ` ${T} has both forks now.` : ''}`;
      }
      if (i.kind === 'unlock') {
        const to = ev.woke?.[0];
        return to === undefined
          ? `${T} puts ${i.name} down.`
          : `${T} puts ${i.name} down, and ${P(to)}, waiting for it, picks it up.${eating(after, n).includes(to) ? ` ${P(to)} has both forks now.` : ''}`;
      }
      if (i.kind === 'print') return `${T} eats.`;
      if (i.kind === 'P') {
        const was = before.sems.waiter!.value;
        const now = after.sems.waiter!.value;
        return ev.blocked
          ? `${T} asks the waiter for a seat: waiter goes from ${was} to ${now}, below 0. ${n - 1} philosophers are at the table already, so ${T} waits.`
          : `${T} asks the waiter for a seat: waiter goes from ${was} to ${now}, and ${T} sits down.`;
      }
      if (i.kind === 'V') {
        const to = ev.woke?.[0];
        const was = before.sems.waiter!.value;
        return `${T} leaves the table: waiter goes from ${was} to ${after.sems.waiter!.value}${to === undefined ? '.' : `, and ${P(to)}, the first waiting, sits down.`}`;
      }
      return ev.say;
    })
    .join(' ');
}

/** Every way on from here ends in deadlock. */
export const doomed = (mac: Macro, m: MachineState) =>
  !stuck(m) && mfind(mac, (x) => !stuck(x), { from: m }) === null;

export function narrate(
  mac: Macro,
  before: MachineState,
  events: StepEvent[],
  after: MachineState,
): string[] {
  const ev = events.at(-1)!;
  const parts: string[] = [];
  if (ev.blocked?.kind === 'lock') {
    const c = deadlockCycle(after);
    const h = after.locks[ev.blocked.name]!.holder!;
    parts.push(
      c
        ? `Each philosopher on ${cycleText(c)} holds one fork and waits for the next one’s: a cycle in the wait-for graph, so none of them can ever eat. Deadlock.`
        : `In the wait-for graph that is an edge ${P(ev.thread)} → ${P(h)}.`,
    );
  }
  if (ev.instr.kind === 'lock' && !ev.blocked && doomed(mac, after) && !doomed(mac, before))
    parts.push('From here, every schedule ends in deadlock: each next pick-up waits.');
  return parts;
}

export function ending(_mac: Macro, s: MachineState, settings: DiningSettings): string {
  const n = countOf(settings);
  if (!stuck(s)) return `Every philosopher has eaten: ${ate(s).map(P).join(', ')}, in that order.`;
  const c = deadlockCycle(s);
  if (c)
    return `Nobody can eat, so nobody ever puts a fork down: they wait for ever.${c.length < n ? ' The others wait behind the cycle.' : ''}`;
  const edges = waitFor(s).edges.map(([a, b, l]) => `${P(a)} waits for ${l}, which ${P(b)} holds`);
  return `Nobody can go on: ${edges.join('; ')}.`;
}

export const spec: RowsSpec<DiningSettings, DiningState> = {
  macro,
  display: (settings) => ({
    locks: [],
    drawnLocks: Array.from({ length: countOf(settings) }, (_, i) => fork(i)),
    sems: fixOf(settings) === 'waiter' ? ['waiter'] : [],
  }),
  outcome: (mac, s) => outcome(mac, s),
  good: (o) => o === 'all ate',
  verdict: (o) => (o === 'all ate' ? 'ok' : 'stuck'),
  endsWith: (o) =>
    o === 'all ate' ? 'with every philosopher fed' : o === 'deadlock' ? 'in deadlock' : `${o}`,
  rank: (o) => (o === 'all ate' ? 0 : 1),
  say: (mac, before, events, after, settings) => say(mac, before, events, after, settings),
  narrate: (mac, before, events, after) => narrate(mac, before, events, after),
  vars,
  lanes: 4,
  ending,
  startText: (_mac, settings) =>
    `every fork is on the table${fixOf(settings) === 'waiter' ? `, waiter = ${countOf(settings) - 1}` : ''}`,
  head: (_mac, t, settings) => {
    const n = countOf(settings);
    const [a, b] = forkOrder(n, fixOf(settings), t);
    return {
      text: `${P(t)}: ${fork(a)}, then ${fork(b)}`,
      plain: `${P(t)} picks up its ${side(n, t, a)} fork ${fork(a)}, then its ${side(n, t, b)} fork ${fork(b)}, eats, and puts them down:`,
    };
  },
};

export const ops = rowsOps(spec);

export const pseudocode = (settings: DiningSettings) =>
  rowsPseudocode(spec, settings, {
    text: 'tally[fed or deadlock] += 1',
    plain: 'count one more schedule that ends this way.',
  });

export function init(settings: DiningSettings): DiningState {
  return { m: initState(macro(settings).p), sched: [] };
}

export function initialSay(_s: DiningState, settings: DiningSettings): string {
  const n = countOf(settings);
  const fix = fixOf(settings);
  if (fix === 'order')
    return `${n} philosophers, ${n} forks. ${n === 3 ? 'P1 and P2 pick' : 'P1, P2 and P3 pick'} up the left fork first; P${n} picks up its right fork, f1, first. Try to make them all wait. You can’t.`;
  if (fix === 'waiter')
    return `${n} philosophers, ${n} forks, and a waiter who lets at most ${n - 1} sit at the table (a semaphore that starts at ${n - 1}). Everyone still picks up the left fork first. Try to deadlock them.`;
  return `${n} philosophers sit round a table with a fork between each pair. Each picks up the left fork, then the right one, eats, and puts both down. Step each philosopher once and see what happens.`;
}

export const initialVars = (s: DiningState, settings: DiningSettings) =>
  vars(macro(settings), s, settings);

/** Row index of a philosopher's eat step. */
export const eatRow = (fix: Fix) => (fix === 'waiter' ? 3 : 2);

export { rowNow, P as philosopher, list };
