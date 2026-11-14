/**
 * What a concurrency page needs between the machine (machine.ts) and the lanes drawing
 * (src/layouts/lanes.ts): pseudocode from a program, the lanes input from a state, marks for a
 * step, and a screen-reader summary.
 *
 *   lineId(t, k)                 pseudocode line id of step k of thread t: "t1.0" (threads from 1)
 *   threadBlock(p, t, op, head?) a pseudocode block for thread t under operation `op`: one line
 *                                per step, with the step's text and a plain-English line
 *   plainStep(instr)             the plain-English line of a step: "Copy count into r."
 *   lanesInput(p, s, extra?)     the input drawLanes takes; extra adds panels and output room
 *   stepMarks(event)             marks for a step that ran: the step, what it read and wrote,
 *                                a lock or semaphore it used, threads it woke
 *   noteFor(s, t)                a lane's note: ready, done, "waits for m", "sleeps on c"
 *   describeMachine(p, s)        one paragraph for screen readers
 */
import type { Mark, PseudoBlock, PseudoLine } from '../../engine/types';
import {
  condId,
  laneId,
  lockId,
  pcId,
  regId,
  semId,
  stepId,
  varId,
  type LanesInput,
} from '../../layouts/lanes';
import {
  REL_WORDS,
  type Instr,
  type MachineState,
  type Operand,
  type Program,
  type StepEvent,
} from './machine';

export const lineId = (t: number, k: number) => `t${t + 1}.${k}`;

const op = (o: Operand) => ('num' in o ? String(o.num) : 'reg' in o ? o.reg : o.mem);

export function plainStep(i: Instr): string {
  switch (i.kind) {
    case 'load':
      return `Copy shared ${i.mem} into the register ${i.reg}.`;
    case 'store':
      return 'reg' in i.value
        ? `Write ${i.value.reg} back to shared ${i.mem}.`
        : `Set shared ${i.mem} to ${op(i.value)}.`;
    case 'set':
      return `Set ${i.reg} to ${op(i.value)}.`;
    case 'add':
      return 'reg' in i.a && i.a.reg === i.reg && 'num' in i.b
        ? `${i.sign > 0 ? 'Add' : 'Subtract'} ${i.b.num} ${i.sign > 0 ? 'to' : 'from'} ${i.reg}, in the register only.`
        : `Set ${i.reg} to ${op(i.a)} ${i.sign > 0 ? 'plus' : 'minus'} ${op(i.b)}.`;
    case 'compare':
      return `Set ${i.reg} to 1 if ${op(i.a)} ${REL_WORDS[i.rel]} ${op(i.b)}, else 0.`;
    case 'jump':
      return i.cond
        ? `If ${op(i.cond.a)} ${REL_WORDS[i.cond.rel]} ${op(i.cond.b)}, go to ${i.label}.`
        : `Go to ${i.label}.`;
    case 'lock':
      return `Take lock ${i.name}, or wait in line until it is free.`;
    case 'unlock':
      return `Let go of lock ${i.name}; the next in line gets it.`;
    case 'wait':
      return `Let go of ${i.lock} and sleep on ${i.cond} until a signal, then take ${i.lock} back.`;
    case 'signal':
      return `Wake one thread sleeping on ${i.cond}, if there is one.`;
    case 'broadcast':
      return `Wake every thread sleeping on ${i.cond}.`;
    case 'P':
      return `Take one from ${i.name}; wait if it goes below 0.`;
    case 'V':
      return `Add one to ${i.name}; wake a waiting thread if there is one.`;
    case 'cas':
      return `If ${i.mem} is ${op(i.expect)}, set it to ${op(i.value)} (${i.reg} = 1); else change nothing (${i.reg} = 0).`;
    case 'print':
      return `Print ${'text' in i.what ? i.what.text : op(i.what)}.`;
    case 'done':
      return 'Stop: this thread is done.';
  }
}

/**
 * Pseudocode for thread t, under operation `op` (the op that steps it). `head` is an optional
 * first line, e.g. { text: 'T1: count = count + 1', plain: 'T1 adds 1 to count, in three steps:' }.
 */
export function threadBlock(
  p: Program,
  t: number,
  opName: string,
  head?: { text: string; plain: string },
): PseudoBlock {
  const th = p.threads[t]!;
  const lines: PseudoLine[] = [];
  if (head) lines.push({ id: `t${t + 1}.head`, indent: 0, ...head });
  th.code.forEach((instr, k) => {
    const labels = Object.entries(th.labels)
      .filter(([, at]) => at === k)
      .map(([l]) => `${l}: `)
      .join('');
    lines.push({
      id: lineId(t, k),
      indent: head ? 1 : 0,
      text: `${labels}${instr.text}`,
      plain: plainStep(instr),
    });
  });
  return { op: opName, lines };
}

/** A lane's note: what the thread is doing, in a few words. */
export function noteFor(s: MachineState, t: number): string {
  const th = s.threads[t]!;
  if (th.status === 'done') return 'done';
  if (th.status === 'fault') return 'fault';
  if (th.status === 'blocked') {
    const on = th.on!;
    return on.kind === 'lock'
      ? `waits for ${on.name}`
      : on.kind === 'sem'
        ? `waits on ${on.name}`
        : `sleeps on ${on.name}`;
  }
  return 'ready';
}

export interface LanesExtra {
  panels?: LanesInput['panels'];
  /** Show the printed words (default: when the program prints anything). */
  output?: boolean;
}

const prints = (p: Program) => p.threads.some((t) => t.code.some((i) => i.kind === 'print'));

/** The lanes drawing's input for a state. */
export function lanesInput(p: Program, s: MachineState, extra: LanesExtra = {}): LanesInput {
  const n = (t: number) => p.threads[t]!.name;
  return {
    threads: p.threads.map((th, t) => {
      const ts = s.threads[t]!;
      return {
        name: th.name,
        steps: th.code.map((instr, k) => {
          const labels = Object.entries(th.labels)
            .filter(([, at]) => at === k)
            .map(([l]) => `${l}: `)
            .join('');
          return `${labels}${instr.text}`;
        }),
        pc: ts.pc,
        status: ts.status,
        note: noteFor(s, t),
        regs: th.regs.map((r) => ({ name: r, value: String(ts.regs[r] ?? 0) })),
      };
    }),
    shared: p.shared.map((v) => ({ name: v.name, value: String(s.mem[v.name] ?? 0) })),
    locks: p.locks.map((l) => {
      const st = s.locks[l]!;
      return {
        name: l,
        holder: st.holder === null ? null : n(st.holder),
        waiters: st.waiters.map(n),
      };
    }),
    sems: p.sems.map((x) => {
      const st = s.sems[x.name]!;
      return { name: x.name, value: String(st.value), waiters: st.waiters.map(n) };
    }),
    conds: p.conds.map((c) => ({ name: c, waiters: s.conds[c]!.waiters.map(n) })),
    output: (extra.output ?? prints(p)) ? s.out.map((o) => o.text) : undefined,
    panels: extra.panels,
    schedule: s.schedule.map(n),
  };
}

/**
 * Marks for a step that ran: the step active, a shared
 * variable it wrote active and one it read compare, its register new, a lock or semaphore it
 * used active, the arrow of a thread it blocked compare, and threads it woke found.
 */
export function stepMarks(event: StepEvent): Mark[] {
  const t = event.thread;
  const marks: Mark[] = [{ id: stepId(t, event.pc), role: event.fault ? 'error' : 'active' }];
  if (event.wrote) marks.push({ id: varId(event.wrote), role: 'active' });
  else if (event.read) marks.push({ id: varId(event.read), role: 'compare' });
  if (event.reg) marks.push({ id: regId(t, event.reg), role: 'new' });
  const i = event.instr;
  if (i.kind === 'lock' || i.kind === 'unlock') marks.push({ id: lockId(i.name), role: 'active' });
  if (i.kind === 'wait') {
    marks.push({ id: condId(i.cond), role: 'active' });
    marks.push({ id: lockId(i.lock), role: 'active' });
  }
  if (i.kind === 'signal' || i.kind === 'broadcast')
    marks.push({ id: condId(i.cond), role: 'active' });
  if (i.kind === 'P' || i.kind === 'V') marks.push({ id: semId(i.name), role: 'active' });
  if (event.blocked) marks.push({ id: pcId(t), role: 'compare' });
  for (const w of event.woke ?? []) marks.push({ id: laneId(w), role: 'found' });
  return marks;
}

/** One paragraph for screen readers. */
export function describeMachine(p: Program, s: MachineState): string {
  const threads = p.threads.map((th, t) => {
    const ts = s.threads[t]!;
    const regs = th.regs.map((r) => `${r} = ${ts.regs[r] ?? 0}`).join(', ');
    const where =
      ts.status === 'done'
        ? 'done'
        : `next step ${ts.pc + 1}, ${th.code[ts.pc]?.text ?? 'end'}${ts.status === 'ready' ? '' : ` (${noteFor(s, t)})`}`;
    return `${th.name}: ${where}${regs ? `; ${regs}` : ''}.`;
  });
  const mem = p.shared.map((v) => `${v.name} = ${s.mem[v.name]}`).join(', ');
  const locks = p.locks.map((l) => {
    const h = s.locks[l]!.holder;
    return `lock ${l} ${h === null ? 'free' : `held by ${p.threads[h]!.name}`}`;
  });
  const sems = p.sems.map((x) => `semaphore ${x.name} = ${s.sems[x.name]!.value}`);
  const out = s.out.length ? [`printed ${s.out.map((o) => o.text).join(' ')}`] : [];
  const shared = [mem, ...locks, ...sems, ...out].filter(Boolean).join('; ');
  const steps = s.schedule.length
    ? `${s.schedule.length} steps so far: ${s.schedule.map((t) => p.threads[t]!.name).join(' ')}.`
    : 'No steps yet.';
  return `${threads.join(' ')} ${shared ? `Shared: ${shared}.` : ''} ${steps}`
    .replace(/\s+/g, ' ')
    .trim();
}
