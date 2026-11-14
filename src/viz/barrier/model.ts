/**
 * Barriers: no thread goes on until every thread has arrived. Three problems, as a setting:
 *   barrier   Downey's barrier for 3 threads (The Little Book of Semaphores): a count guarded by
 *             a lock m, and a semaphore b that starts at 0. The third to arrive calls V(b); each
 *             thread then passes the turnstile, P(b) then V(b), and goes on.
 *   reusable  the same threads go round twice, so the barrier must work again: Downey's two-phase
 *             barrier with preloaded turnstiles. The last to arrive opens b1 three times; the last
 *             to leave opens b2 three times, so nobody can lap the others.
 *   group     a grouping problem of our own: a car leaves with one driver and two riders. Three
 *             riders want a ride. The driver opens two seats (V(seat) twice) and waits for both
 *             riders to get in (P(in) twice), then tells them to go (V(go) twice). The rider
 *             without a seat waits for the next car.
 * With "naive" on: no barrier at all; for the reusable barrier, the one-shot barrier in a loop;
 * for the car, riders leave as soon as they are in.
 *
 * The lines under m hold no step that can wait, so each such section is one row and runs as one
 * step: nobody could ever see m held, so the machine steps leave the lock out and the pseudocode
 * keeps it. Hidden shared variables keep what the outcome needs, so it depends on the state
 * only: a (arrivals, with rounds), ins (riders in) and e1, e2.. (that thread went on too early).
 * The machine is src/viz/_threads; rows, operations and the
 * tally are src/viz/_threads3.
 */
import type { Scalar } from '../../engine/types';
import { initState, type MachineState, type StepEvent } from '../_threads/machine';
import { buildMacro, longestRun, rowNow, type Macro, type RowSpec } from '../_threads3/macro';
import {
  list,
  rowsOps,
  rowsPseudocode,
  type Display,
  type RowsSpec,
  type RowsState,
} from '../_threads3/page';

export type Problem = 'barrier' | 'reusable' | 'group';

export interface BarrierSettings {
  [key: string]: string | number | boolean | null;
  problem: Problem;
  naive: boolean;
}

export const defaults: BarrierSettings = { problem: 'barrier', naive: false };

export type BarrierState = RowsState;

export const problemOf = (s: BarrierSettings): Problem =>
  s.problem === 'reusable' || s.problem === 'group' ? s.problem : 'barrier';
const naiveOf = (s: BarrierSettings) => s.naive === true;

/** What each row does, for the narration. */
export type Kind =
  | 'arrive'
  | 'last'
  | 'P'
  | 'V'
  | 'go'
  | 'leave'
  | 'again'
  | 'seats'
  | 'waitIn'
  | 'sendGo'
  | 'seat'
  | 'in'
  | 'waitGo';

interface KRow extends RowSpec {
  kind: Kind;
}

const arrive = (reusable: boolean): KRow => ({
  kind: 'arrive',
  text: 'count += 1',
  plain: reusable
    ? 'Holding m: add 1 to count; the third to arrive opens b1 for all three.'
    : 'Holding m: add 1 to count, and keep the new count in r.',
  code: [
    { text: 'lock(m)', plain: 'Take the lock that guards count.' },
    {
      text: 'count += 1; r = count',
      plain: 'One more has arrived; r is my place in line.',
      indent: 1,
    },
    ...(reusable
      ? [
          {
            text: 'if r == 3: V(b1) three times',
            plain: 'The third to arrive opens the first turnstile for all three.',
            indent: 1,
          },
        ]
      : []),
    { text: 'unlock(m)', plain: 'Let go of m.', indent: 0 },
  ],
  steps: [
    ...(reusable ? ['top: q = a + 1', 'a = q', 'need = need + 3'] : []),
    'r = count + 1',
    'count = r',
    ...(reusable ? ['if r != 3 goto u', 'V(b1)', 'V(b1)', 'V(b1)', 'u:'] : []),
  ],
});

/**
 * Go on, and note it if it is too early: flag e<t> is set when fewer than all have arrived
 * (count < 3; with rounds, arrivals a < need, 3 per round so far; for the car, fewer than two
 * riders in).
 */
const goRow = (t: number, ready: string): KRow => ({
  kind: 'go',
  text: 'go',
  plain: 'Past the barrier: go on.',
  steps: [`if ${ready} goto g`, `e${t + 1} = 1`, 'g:'],
});

function barrierRows(naive: boolean, t: number): KRow[] {
  if (naive) return [arrive(false), goRow(t, 'count >= 3')];
  return [
    arrive(false),
    {
      kind: 'last',
      text: 'if last: V(b)',
      plain: 'The third to arrive opens the turnstile.',
      code: [{ text: 'if r == 3: V(b)', plain: 'The third to arrive opens the turnstile.' }],
      steps: ['if r != 3 goto w', 'V(b)', 'w:'],
    },
    { kind: 'P', text: 'P(b)', plain: 'Wait at the turnstile until it is open.' },
    { kind: 'V', text: 'V(b)', plain: 'Open it again for the next one: a turnstile.' },
    goRow(t, 'count >= 3'),
  ];
}

const again: KRow = {
  kind: 'again',
  text: 'again',
  plain: 'Go round once more (two rounds in all).',
  code: [{ text: 'repeat once more', plain: 'Go round once more (two rounds in all).' }],
  steps: ['if need < 6 goto top'],
};

function reusableRows(naive: boolean, t: number): KRow[] {
  if (naive) {
    const rows = barrierRows(false, t);
    return [
      {
        ...rows[0]!,
        steps: ['top: q = a + 1', 'a = q', 'need = need + 3', 'r = count + 1', 'count = r'],
      },
      ...rows.slice(1, -1),
      goRow(t, 'a >= need'),
      again,
    ];
  }
  return [
    arrive(true),
    { kind: 'P', text: 'P(b1)', plain: 'Wait at the first turnstile until it is open.' },
    goRow(t, 'a >= need'),
    {
      kind: 'leave',
      text: 'count -= 1',
      plain: 'Holding m: take 1 from count; the last to leave opens b2 for all three.',
      code: [
        { text: 'lock(m)', plain: 'Take the lock again.' },
        { text: 'count -= 1; r = count', plain: 'One fewer at the barrier.', indent: 1 },
        {
          text: 'if r == 0: V(b2) three times',
          plain: 'The last to leave opens the second turnstile for all three.',
          indent: 1,
        },
        { text: 'unlock(m)', plain: 'Let go of m.', indent: 0 },
      ],
      steps: ['r = count - 1', 'count = r', 'if r goto v', 'V(b2)', 'V(b2)', 'V(b2)', 'v:'],
    },
    { kind: 'P', text: 'P(b2)', plain: 'Wait at the second turnstile until it is open.' },
    again,
  ];
}

function driverRows(naive: boolean): KRow[] {
  const rows: KRow[] = [
    {
      kind: 'seats',
      text: '2×V(seat)',
      plain: 'Open two seats.',
      code: [{ text: 'V(seat); V(seat)', plain: 'Open two seats.' }],
      steps: ['V(seat)', 'V(seat)'],
    },
    {
      kind: 'waitIn',
      text: '2×P(in)',
      plain: 'Wait until both riders are in.',
      code: [{ text: 'P(in); P(in)', plain: 'Wait until both riders are in.' }],
      steps: ['P(in)', 'P(in)'],
    },
  ];
  if (!naive)
    rows.push({
      kind: 'sendGo',
      text: '2×V(go)',
      plain: 'Tell both riders to go.',
      code: [{ text: 'V(go); V(go)', plain: 'Tell both riders to go.' }],
      steps: ['V(go)', 'V(go)'],
    });
  rows.push(goRow(0, 'ins >= 2'));
  return rows;
}

function riderRows(naive: boolean, t: number): KRow[] {
  return [
    { kind: 'seat', text: 'P(seat)', plain: 'Take a seat, or wait for a car with one free.' },
    {
      kind: 'in',
      text: 'V(in)',
      plain: 'Tell the driver I am in.',
      steps: ['q = ins + 1', 'ins = q', 'V(in)'],
    },
    ...(naive
      ? []
      : [{ kind: 'waitGo' as const, text: 'P(go)', plain: 'Wait for the driver to say go.' }]),
    goRow(t, 'ins >= 2'),
  ];
}

export function threadRows(settings: BarrierSettings): { name: string; rows: KRow[] }[] {
  const problem = problemOf(settings);
  const naive = naiveOf(settings);
  if (problem === 'group')
    return [
      { name: 'D', rows: driverRows(naive) },
      ...[1, 2, 3].map((k) => ({ name: `R${k}`, rows: riderRows(naive, k) })),
    ];
  return [0, 1, 2].map((t) => ({
    name: `T${t + 1}`,
    rows: problem === 'reusable' ? reusableRows(naive, t) : barrierRows(naive, t),
  }));
}

export function macro(settings: BarrierSettings): Macro {
  const problem = problemOf(settings);
  const naive = naiveOf(settings);
  const decls =
    problem === 'group'
      ? [
          'shared ins = 0, e1 = 0, e2 = 0, e3 = 0, e4 = 0',
          naive ? 'sem seat = 0, in = 0' : 'sem seat = 0, in = 0, go = 0',
        ]
      : [
          `shared count = 0${problem === 'reusable' ? ', a = 0' : ''}, e1 = 0, e2 = 0, e3 = 0`,
          ...(problem === 'reusable' && !naive
            ? ['sem b1 = 0, b2 = 0']
            : naive && problem === 'barrier'
              ? []
              : ['sem b = 0']),
        ];
  return buildMacro(
    decls,
    threadRows(settings).map((th) => ({
      name: th.name,
      rows: th.rows.map(({ kind: _k, ...r }) => r),
    })),
  );
}

const kindCache = new Map<string, Kind[][]>();
export function kinds(settings: BarrierSettings, t: number): Kind[] {
  const key = `${problemOf(settings)}|${naiveOf(settings)}`;
  let all = kindCache.get(key);
  if (!all) {
    all = threadRows(settings).map((th) => th.rows.map((r) => r.kind));
    kindCache.set(key, all);
  }
  return all[t]!;
}

const name = (mac: Macro, t: number) => mac.p.threads[t]!.name;

/** Who went on too early (their hidden flag), and who has gone on (past the go row). */
export function departures(mac: Macro, s: MachineState, settings: BarrierSettings) {
  const n = mac.p.threads.length;
  const early: number[] = [];
  const gone: number[] = [];
  for (let t = 0; t < n; t++) {
    if ((s.mem[`e${t + 1}`] ?? 0) === 1) early.push(t);
    const go = kinds(settings, t).indexOf('go');
    if (rowNow(mac, s, t) > go) gone.push(t);
  }
  return { early, gone };
}

/** The riders with a seat: past P(seat). */
export function seated(mac: Macro, s: MachineState): number[] {
  return mac.p.threads.map((_, t) => t).filter((t) => t > 0 && rowNow(mac, s, t) > 0);
}

export function outcome(mac: Macro, s: MachineState, settings: BarrierSettings): string {
  const d = departures(mac, s, settings);
  const late = d.early.length ? `${list(d.early.map((t) => name(mac, t)))} went early` : '';
  if (problemOf(settings) === 'group') {
    const riders = seated(mac, s).map((t) => name(mac, t));
    const car = `D + ${riders.join(' ')}`;
    return late ? `${car}, ${late}` : car;
  }
  return late || 'all waited';
}

export const good = (o: string) => !o.includes('early');

export function vars(
  mac: Macro,
  st: BarrierState,
  settings: BarrierSettings,
): Record<string, Scalar> {
  const s = st.m;
  const d = departures(mac, s, settings);
  const v: Record<string, Scalar> = {};
  const problem = problemOf(settings);
  if (problem === 'group') {
    v.seated =
      seated(mac, s)
        .map((t) => name(mac, t))
        .join(' ') || 'nobody';
    v.in = s.mem.ins ?? 0;
  } else v.arrived = problem === 'reusable' ? (s.mem.a ?? 0) : (s.mem.count ?? 0);
  if (problem !== 'reusable')
    v.gone = d.gone.length ? d.gone.map((t) => name(mac, t)).join(' ') : 'nobody';
  v.early = d.early.length ? d.early.map((t) => name(mac, t)).join(' ') : 'nobody';
  v.steps = st.sched.length;
  return v;
}

export const display = (settings: BarrierSettings): Display =>
  problemOf(settings) === 'group'
    ? { shared: [], regs: () => [] }
    : { shared: ['count'], regs: () => ['r'] };

const semv = (s: MachineState, x: string) => s.sems[x]?.value ?? 0;

export function say(
  mac: Macro,
  before: MachineState,
  events: StepEvent[],
  after: MachineState,
  settings: BarrierSettings,
  row: number,
): string {
  const t = events[0]!.thread;
  const T = name(mac, t);
  const kind = kinds(settings, t)[row]!;
  const blocked = events.at(-1)!.blocked;
  const resumed = before.threads[t]!.pc > mac.rows[t]![row]!.from;
  const woke = events.flatMap((e) => e.woke ?? []).map((w) => name(mac, w));
  const wokeText = woke.length
    ? `, and ${list(woke)}, waiting, ${woke.length > 1 ? 'go' : 'goes'} on`
    : '';
  const r = after.threads[t]!.regs.r ?? 0;
  const count = after.mem.count ?? 0;
  const sem = (i: StepEvent) => (i.instr.kind === 'P' || i.instr.kind === 'V' ? i.instr.name : '');
  switch (kind) {
    case 'arrive': {
      const opened = events.filter((e) => e.instr.kind === 'V').length;
      return `${T} arrives: holding m, it adds 1 to count, so count = ${count} and r = ${r}.${opened ? ` It is the third, so it opens b1 three times (b1 = ${semv(after, 'b1')})${wokeText}.` : ''}`;
    }
    case 'last':
      return r === 3
        ? `${T} is the third to arrive (r = 3), so it opens the turnstile: b goes from ${semv(before, 'b')} to ${semv(after, 'b')}${wokeText}.`
        : `${T} is number ${r} of 3, so it does not open the turnstile.`;
    case 'P': {
      const x = sem(events.at(-1)!);
      if (blocked)
        return `${T} calls P(${x}): ${x} goes to ${semv(after, x)}, so ${T} waits${x === 'b2' ? ' for the last one to leave' : ' for the others to arrive'}.`;
      if (resumed) return `${T} is through.`;
      return `${T} calls P(${x}): ${x} goes from ${semv(before, x)} to ${semv(after, x)}, and ${T} passes.`;
    }
    case 'V':
      return `${T} calls V(b), letting the next one through: b goes from ${semv(before, 'b')} to ${semv(after, 'b')}${wokeText}.`;
    case 'go':
      return `${T} goes on.`;
    case 'leave': {
      const opened = events.some((e) => e.instr.kind === 'V');
      return `${T} leaves: holding m, it takes 1 from count, so count = ${count}.${opened ? ` It is the last to leave, so it opens b2 three times (b2 = ${semv(after, 'b2')})${wokeText}.` : ''}`;
    }
    case 'again':
      return after.threads[t]!.status === 'done'
        ? `${T} has been round twice: it is done.`
        : `${T} goes round again, to the barrier a second time.`;
    case 'seats':
      return `D opens two seats: seat goes from ${semv(before, 'seat')} to ${semv(after, 'seat')}${wokeText}.`;
    case 'waitIn':
      if (blocked)
        return resumed || events.length > 1
          ? `One rider is in; D waits for the other: in goes to ${semv(after, 'in')}.`
          : `D waits for the riders to get in: in goes to ${semv(after, 'in')}.`;
      return `D has both riders in: in is ${semv(after, 'in')}.`;
    case 'sendGo':
      return `D tells the riders to go: go goes from ${semv(before, 'go')} to ${semv(after, 'go')}${wokeText}.`;
    case 'seat':
      if (blocked)
        return `${T} wants a seat, but none is free: seat goes to ${semv(after, 'seat')}, and ${T} waits.`;
      return `${T} takes a seat: seat goes from ${semv(before, 'seat')} to ${semv(after, 'seat')}.`;
    case 'in':
      return `${T} gets in and tells the driver: in goes from ${semv(before, 'in')} to ${semv(after, 'in')}${wokeText}.`;
    case 'waitGo':
      if (blocked) return `${T} waits for the driver’s go: go goes to ${semv(after, 'go')}.`;
      return `${T} has the driver’s go: go goes from ${semv(before, 'go')} to ${semv(after, 'go')}.`;
  }
}

export function narrate(
  mac: Macro,
  before: MachineState,
  events: StepEvent[],
  after: MachineState,
  settings: BarrierSettings,
): string[] {
  const was = departures(mac, before, settings).early;
  const now = departures(mac, after, settings).early;
  if (now.length > was.length) {
    const T = name(mac, events[0]!.thread);
    return [
      problemOf(settings) === 'group'
        ? `But the car is not full: ${T} left before both riders were in.`
        : `But not everyone has arrived${problemOf(settings) === 'reusable' ? ' for this round' : ''}: ${T} went on too early.`,
    ];
  }
  return [];
}

export function ending(mac: Macro, s: MachineState, settings: BarrierSettings): string {
  const d = departures(mac, s, settings);
  if (problemOf(settings) === 'group') {
    const riders = seated(mac, s).map((t) => name(mac, t));
    const left = mac.p.threads
      .map((_, t) => t)
      .filter((t) => t > 0 && !seated(mac, s).includes(t))
      .map((t) => name(mac, t));
    return `The car has gone with D, ${list(riders)}${d.early.length ? `, though ${list(d.early.map((t) => name(mac, t)))} left before it was full` : ''}. ${list(left)} waits for the next car.`;
  }
  return d.early.length
    ? `Everyone is done, but ${list(d.early.map((t) => name(mac, t)))} went on before all had arrived.`
    : `Everyone is done, and nobody went on before all three had arrived${problemOf(settings) === 'reusable' ? ', in either round' : ''}.`;
}

export const spec: RowsSpec<BarrierSettings, BarrierState> = {
  macro,
  display,
  outcome,
  good: (o) => good(o),
  verdict: (o) => (good(o) ? 'ok' : 'early'),
  rank: (o) => (good(o) ? 0 : 10) + o.length / 100,
  say,
  narrate,
  vars,
  lanes: 4,
  ending,
  // Each round a thread takes its 6 rows once and can block at each P once: 8 steps a round.
  bound: (mac) => longestRun(mac) ?? mac.p.threads.length * 2 * 8,
  startText: (mac, settings) =>
    [
      ...(problemOf(settings) === 'group' ? [] : ['count = 0']),
      ...mac.p.sems.map((x) => `${x.name} = 0`),
    ].join(', '),
  endsWith: (o) => {
    const early = /^(?:D \+ \w+ \w+, )?(.+) went early$/.exec(o)?.[1];
    const car = /^D \+ (\w+) (\w+)/.exec(o);
    const inCar = car ? `with ${car[1]} and ${car[2]} in the car` : '';
    if (car) return early ? `${inCar}, ${early} leaving early` : inCar;
    return early ? `with ${early} going on early` : 'with nobody going on early';
  },
  head: (mac, t, settings) => {
    const T = name(mac, t);
    const problem = problemOf(settings);
    if (problem === 'group')
      return t === 0
        ? {
            text: 'D: the driver',
            plain: 'The driver opens two seats, waits for two riders, and goes:',
          }
        : { text: `${T}: a rider`, plain: `${T} takes a seat, gets in, and waits for the driver:` };
    return problem === 'reusable'
      ? { text: `${T}: twice round`, plain: `${T} meets the others at the barrier, twice:` }
      : {
          text: `${T}: meet, then go`,
          plain: `${T} waits until all three have arrived, then goes on:`,
        };
  },
};

export const ops = rowsOps(spec);

export const pseudocode = (settings: BarrierSettings) =>
  rowsPseudocode(spec, settings, {
    text: 'tally[outcome] += 1',
    plain: 'count one more schedule that ends this way.',
  });

export function init(settings: BarrierSettings): BarrierState {
  return { m: initState(macro(settings).p), sched: [] };
}

export function initialSay(_s: BarrierState, settings: BarrierSettings): string {
  const problem = problemOf(settings);
  const naive = naiveOf(settings);
  if (problem === 'group')
    return naive
      ? 'A car leaves with one driver and two riders, and three riders want a ride. Here the riders leave as soon as they are in, without waiting for the driver. Make one leave before the car is full.'
      : 'A car leaves with one driver and two riders, and three riders want a ride. D opens two seats, waits until two riders are in, then tells them to go. Which two get the ride is up to you.';
  if (problem === 'reusable')
    return naive
      ? 'Three threads go round twice, using the one-shot barrier both times. After the first round the turnstile is left open. Make a thread go on in round two before the others arrive.'
      : 'Three threads go round twice, meeting at the barrier each time. The third to arrive opens b1 for all three; the last to leave opens b2 for all three. Try to make one lap the others.';
  return naive
    ? 'Three threads each add 1 to count and go on, with no barrier. Make one go on before the others arrive.'
    : 'Three threads each add 1 to count, then wait at the barrier. The third to arrive opens the turnstile b, and each thread lets the next one through. Try to get a thread past it early.';
}

export const initialVars = (s: BarrierState, settings: BarrierSettings) =>
  vars(macro(settings), s, settings);
