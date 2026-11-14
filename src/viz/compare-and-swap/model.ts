/**
 * Compare-and-swap, lock-free. cas(x, a, b) is one atomic step: if x still equals a, set it to b
 * and report success; otherwise change nothing and report failure. Three programs, as a setting:
 *   counter  2 or 3 threads add 1 to n by load, compute, cas, and retry from the load when the
 *            cas fails. Every interleaving ends with the right count; the price is retries, which
 *            each thread counts in a register.
 *   plain    the same threads with a plain store instead of the cas: the race of
 *            /race-condition/, where updates are lost. The naive program, to compare.
 *   aba      a tiny lock-free stack A → B → C. T1 pops by reading top and top.next, then
 *            cas(top, old, next). T2 pops twice and pushes its first node back, so top goes A, B,
 *            C, A. If that happens between T1's reads and its cas, the cas sees A and succeeds,
 *            and puts back B, which T2 has: the ABA problem. T2's pops and push are one step each
 *            here; only T1 is slowed down.
 * Nodes are numbers in the machine (0 none, 1 A, 2 B, 3 C), letters on the page. The machine is
 * src/viz/_threads; rows, operations and the tally are src/viz/_threads3.
 */
import type { Scalar } from '../../engine/types';
import { initState, type MachineState, type StepEvent } from '../_threads/machine';
import { buildMacro, rowNow, type Macro, type RowSpec } from '../_threads3/macro';
import {
  list,
  rowsOps,
  rowsPseudocode,
  type Display,
  type RowsSpec,
  type RowsState,
} from '../_threads3/page';

export type CasProgram = 'counter' | 'plain' | 'aba';

export interface CasSettings {
  [key: string]: string | number | boolean | null;
  program: CasProgram;
  threads: number;
}

export const defaults: CasSettings = { program: 'counter', threads: 2 };

export type CasState = RowsState;

export const programOf = (s: CasSettings): CasProgram =>
  s.program === 'plain' || s.program === 'aba' ? s.program : 'counter';
export const threadsOf = (s: CasSettings) =>
  programOf(s) === 'aba' ? 2 : Number(s.threads) >= 3 ? 3 : 2;

const T = (t: number) => `T${t + 1}`;

/** Node letters: 0 is none. */
export const NODE = ['-', 'A', 'B', 'C'];
export const node = (v: number) => NODE[v] ?? '?';
const NEXT = ['', 'an', 'bn', 'cn'];
/** The next field of each node, as the page writes it. */
export const NEXT_NAMES: Record<string, string> = { an: 'A.next', bn: 'B.next', cn: 'C.next' };

function counterRows(cas: boolean): RowSpec[] {
  const rows: RowSpec[] = [
    { text: 'r = n', plain: 'Read the shared count n into r.', steps: ['top: r = n'] },
    { text: 's = r + 1', plain: 'Compute the new value in s, in the register only.' },
  ];
  if (!cas)
    return [...rows, { text: 'n = s', plain: 'Write s back to n, whatever n is now.' }];
  return [
    ...rows,
    {
      text: 'cas(n, r, s)',
      plain: 'If n still equals r, set it to s (ok = 1); if not, change nothing (ok = 0).',
      code: [
        {
          text: 'ok = cas(n, r, s)',
          plain: 'If n still equals r, set it to s (ok = 1); if not, change nothing (ok = 0).',
        },
      ],
      steps: ['ok = cas(n, r, s)'],
    },
    {
      text: 'if !ok: retry',
      plain: 'If the swap failed, count a retry and start again from the read.',
      code: [
        { text: 'if ok == 0:', plain: 'If the swap failed (another thread changed n):' },
        { text: 'retries += 1; go back to r = n', plain: 'count a retry and read n again.' },
      ],
      steps: ['if ok goto out', 'retries = retries + 1', 'goto top', 'out:'],
    },
  ];
}

/**
 * x = pop(), as one step: read top, read its next field, set top to it. (The machine has no
 * pointers, so the step tries each node; a thread may have 20 machine steps, so T2's rows are
 * written short. T2's first pop gets A or B, and only A or B is pushed back.)
 */
function popSteps(x: string, k: string): string[] {
  return [
    `${x} = top`,
    'nx = bn',
    `if ${x} == 2 goto ${k}z`,
    'nx = an',
    `if ${x} == 1 goto ${k}z`,
    'nx = cn',
    `${k}z: top = nx`,
  ];
}

export function abaRows(t: number): RowSpec[] {
  if (t === 0)
    return [
      { text: 'old = top', plain: 'Read the top node into old.', steps: ['again: old = top'] },
      {
        text: 'nxt = old.next',
        plain: 'Read the node under it (old’s next field) into nxt.',
        steps: [
          'if old == 1 goto ra',
          'if old == 2 goto rb',
          'nxt = cn',
          'goto rz',
          'ra: nxt = an',
          'goto rz',
          'rb: nxt = bn',
          'rz:',
        ],
      },
      {
        text: 'cas(top, old, nxt)',
        plain: 'If top is still old, set it to nxt (ok = 1): the pop. If not, change nothing.',
        code: [
          {
            text: 'ok = cas(top, old, nxt)',
            plain: 'If top is still old, set it to nxt (ok = 1): the pop. If not, change nothing.',
          },
        ],
        steps: ['ok = cas(top, old, nxt)'],
      },
      {
        text: 'if !ok: retry',
        plain: 'If the swap failed, count a retry and start again.',
        code: [
          { text: 'if ok == 0:', plain: 'If the swap failed (top changed):' },
          { text: 'retries += 1; go back to old = top', plain: 'count a retry and start again.' },
        ],
        steps: ['if ok goto out', 'retries = retries + 1', 'goto again', 'out:'],
      },
    ];
  return [
    {
      text: 'a = pop()',
      plain: 'Pop the top node into a, in one step: top becomes its next.',
      steps: popSteps('a', 'p'),
    },
    {
      text: 'b = pop()',
      plain: 'Pop the next one into b, the same way.',
      steps: popSteps('b', 'q'),
    },
    {
      text: 'push(a)',
      plain: 'Push a back, in one step: a.next = top, then top = a.',
      steps: ['tp = top', 'if a == 2 goto ub', 'an = tp', 'goto uz', 'ub: bn = tp', 'uz: top = a'],
    },
  ];
}

export function macro(settings: CasSettings): Macro {
  const program = programOf(settings);
  const k = threadsOf(settings);
  if (program === 'aba')
    return buildMacro(['shared top = 1, an = 2, bn = 3, cn = 0'], [
      { name: 'T1', rows: abaRows(0) },
      { name: 'T2', rows: abaRows(1) },
    ]);
  return buildMacro(
    ['shared n = 0'],
    Array.from({ length: k }, (_, t) => ({ name: T(t), rows: counterRows(program === 'counter') })),
  );
}

export const display = (settings: CasSettings): Display =>
  programOf(settings) === 'aba'
    ? {
        names: NEXT_NAMES,
        regs: (t) => (t === 0 ? ['old', 'nxt', 'ok', 'retries'] : ['a', 'b']),
        format: (name, v) =>
          name === 'ok' || name === 'retries' ? String(v) : node(v),
      }
    : {};

/** The stack from top, following next fields (a node seen twice stops it). */
export function stack(s: MachineState): number[] {
  const out: number[] = [];
  let x = s.mem.top ?? 0;
  while (x > 0 && !out.includes(x) && out.length < 4) {
    out.push(x);
    x = s.mem[NEXT[x]!] ?? 0;
  }
  return out;
}

/** Nodes each thread has popped and still has: T1's after its cas worked, T2's a and b. */
export function taken(mac: Macro, s: MachineState): { t1: number[]; t2: number[] } {
  const t1 = s.threads[0]!;
  const done1 = t1.status === 'done' && (t1.regs.ok ?? 0) === 1;
  const row2 = rowNow(mac, s, 1);
  const r2 = s.threads[1]!.regs;
  const t2 = [...(row2 >= 1 && row2 < 3 ? [r2.a ?? 0] : []), ...(row2 >= 2 ? [r2.b ?? 0] : [])];
  return { t1: done1 ? [t1.regs.old ?? 0] : [], t2 };
}

/** Nodes on the stack that a thread has taken: the ABA damage. */
export function damaged(mac: Macro, s: MachineState): number[] {
  const on = stack(s);
  const { t1, t2 } = taken(mac, s);
  return on.filter((x) => t1.includes(x) || t2.includes(x));
}

const letters = (xs: number[]) => (xs.length ? xs.map(node).join(' ') : 'empty');

export const retriesOf = (s: MachineState) =>
  s.threads.reduce((a, t) => a + (t.regs.retries ?? 0), 0);

export function outcome(mac: Macro, s: MachineState, settings: CasSettings): string {
  const program = programOf(settings);
  if (program === 'aba') {
    const d = damaged(mac, s);
    return `stack ${letters(stack(s))}${d.length ? ` (${letters(d)} is T2’s)` : ''}`;
  }
  const n = s.mem.n ?? 0;
  if (program === 'plain') return `n = ${n}`;
  const r = retriesOf(s);
  void mac;
  return `n = ${n}, ${r} ${r === 1 ? 'retry' : 'retries'}`;
}

export function good(o: string, mac: Macro, settings: CasSettings): boolean {
  const program = programOf(settings);
  if (program === 'aba') return !o.includes('(');
  const n = Number(/^n = (\d+)/.exec(o)?.[1] ?? -1);
  void mac;
  return n === threadsOf(settings);
}

export function vars(mac: Macro, st: CasState, settings: CasSettings): Record<string, Scalar> {
  const s = st.m;
  const v: Record<string, Scalar> = {};
  if (programOf(settings) === 'aba') {
    v.top = node(s.mem.top ?? 0);
    v.stack = letters(stack(s));
    v.retries = retriesOf(s);
    const d = damaged(mac, s);
    v.aba = d.length ? `${letters(d)} is in two places` : 'no';
  } else {
    v.n = s.mem.n ?? 0;
    if (programOf(settings) === 'counter') v.retries = retriesOf(s);
    v.done = s.threads.filter((x) => x.status === 'done').length;
  }
  v.steps = st.sched.length;
  return v;
}

/** A node in a sentence: its letter, or "none". */
const word = (v: number) => (v === 0 ? 'none' : node(v));

export function say(
  mac: Macro,
  before: MachineState,
  events: StepEvent[],
  after: MachineState,
  settings: CasSettings,
  row: number,
): string {
  const ev = events[0]!;
  const t = ev.thread;
  const name = T(t);
  const program = programOf(settings);
  const regs = after.threads[t]!.regs;
  if (program !== 'aba') {
    if (ev.instr.kind === 'load') return `${name} reads n = ${regs.r} into r.`;
    if (ev.instr.kind === 'add') return `${name} computes s = ${regs.r} + 1 = ${regs.s}, in its own register.`;
    if (ev.instr.kind === 'store')
      return `${name} writes s = ${regs.s} into n${ev.before === regs.s ? '' : `, over ${ev.before}`}.`;
    if (ev.instr.kind === 'cas') return ev.say;
    // The retry row.
    return regs.ok
      ? `${name}’s swap worked, so ${name} is done.`
      : `${name}’s swap failed: another thread changed n after ${name} read it. ${name} starts again from the read (retries = ${regs.retries}).`;
  }
  if (t === 0) {
    if (row === 0) return `T1 reads top = ${node(regs.old ?? 0)} into old.`;
    if (row === 1)
      return `T1 reads old.next: ${node(regs.old ?? 0)}.next = ${word(regs.nxt ?? 0)}, so nxt = ${word(regs.nxt ?? 0)}.`;
    if (row === 2) {
      const was = before.mem.top ?? 0;
      return regs.ok
        ? `T1 runs cas(top, ${word(regs.old ?? 0)}, ${word(regs.nxt ?? 0)}): top is ${word(was)}, as expected, so top becomes ${word(regs.nxt ?? 0)} and ok = 1.`
        : `T1 runs cas(top, ${word(regs.old ?? 0)}, ${word(regs.nxt ?? 0)}): top is ${word(was)}, not ${word(regs.old ?? 0)}, so nothing changes and ok = 0.`;
    }
    return regs.ok
      ? `T1’s swap worked: it popped ${node(regs.old ?? 0)}.`
      : `T1’s swap failed: top changed after T1 read it. T1 starts again (retries = ${regs.retries}).`;
  }
  const top0 = word(before.mem.top ?? 0);
  const top1 = word(after.mem.top ?? 0);
  if (row === 0 || row === 1) {
    const x = row === 0 ? regs.a : regs.b;
    return `T2 pops ${node(x ?? 0)}: top goes from ${top0} to ${top1}, and T2 has ${node(x ?? 0)} now.`;
  }
  return `T2 pushes ${node(regs.a ?? 0)} back: ${node(regs.a ?? 0)}.next = ${top0}, and top goes from ${top0} to ${top1}.`
    .replace('top goes from none', 'top goes from empty');
}

export function narrate(
  mac: Macro,
  before: MachineState,
  events: StepEvent[],
  after: MachineState,
  settings: CasSettings,
  row: number,
): string[] {
  const t = events[0]!.thread;
  if (programOf(settings) === 'aba') {
    if (t === 0 && row === 2 && after.threads[0]!.regs.ok) {
      const d = damaged(mac, after);
      if (d.length)
        return [
          `But top changed while T1 was not looking, and changed back: ABA. ${letters(d)} is on the stack again, though T2 popped it and still has it.`,
        ];
    }
    return [];
  }
  if (programOf(settings) === 'plain') {
    const ev = events[0]!;
    const was = before.mem.n ?? 0;
    const now = after.mem.n ?? 0;
    if (ev.instr.kind === 'store' && now !== was + 1)
      return [
        now === was
          ? `n is still ${now}: ${T(t)} read n before another thread wrote it, so that thread’s update is lost.`
          : `n goes down from ${was} to ${now}: ${T(t)} read n long ago, and the updates since are lost.`,
      ];
  }
  void mac;
  return [];
}

export function ending(mac: Macro, s: MachineState, settings: CasSettings): string {
  const program = programOf(settings);
  if (program === 'aba') {
    const d = damaged(mac, s);
    return d.length
      ? `Every thread is done. The stack is ${letters(stack(s))}, and ${letters(d)} on it belongs to T2: the stack is broken.`
      : `Every thread is done. The stack is ${letters(stack(s))}, and nobody else has a node on it.`;
  }
  const k = threadsOf(settings);
  const n = s.mem.n ?? 0;
  if (program === 'plain')
    return n === k
      ? `Every thread is done: n = ${n}, right this time.`
      : `Every thread is done: n = ${n}, not ${k}. ${k - n} ${k - n === 1 ? 'update was' : 'updates were'} lost.`;
  const r = retriesOf(s);
  return `Every thread is done: n = ${n}, right, ${r === 0 ? 'with no retries' : `after ${r} ${r === 1 ? 'retry' : 'retries'}`}.`;
}

export const spec: RowsSpec<CasSettings, CasState> = {
  macro,
  display,
  outcome,
  good,
  verdict: (o, mac, settings) =>
    good(o, mac, settings) ? 'ok' : programOf(settings) === 'aba' ? 'ABA' : 'lost',
  rank: (o) => {
    const m = /(\d+) retr/.exec(o);
    if (m) return Number(m[1]);
    const n = /^n = (\d+)/.exec(o);
    if (n) return -Number(n[1]);
    return o.includes('(') ? 9 : 'ABC'.indexOf(o.at(-1) ?? 'A');
  },
  say,
  narrate,
  vars,
  lanes: 3,
  // A thread's cas fails only when another thread's cas worked since its read: with k threads,
  // at most k tries of 4 rows each. T1 on the stack fails at most once per change T2 makes.
  bound: (_mac, settings) =>
    programOf(settings) === 'aba' ? 4 * 4 + 3 : 4 * threadsOf(settings) ** 2,
  ending,
  startText: (_mac, settings) =>
    programOf(settings) === 'aba' ? 'the stack is A B C' : 'n = 0',
  head: (_mac, t, settings) => {
    const program = programOf(settings);
    if (program === 'aba')
      return t === 0
        ? { text: 'T1: pop()', plain: 'T1 pops one node, lock-free:' }
        : { text: 'T2: pop, pop, push', plain: 'T2 pops two nodes and pushes the first back:' }
    return program === 'plain'
      ? { text: `${T(t)}: n = n + 1`, plain: `${T(t)} adds 1 to n with a plain store:` }
      : { text: `${T(t)}: n = n + 1, lock-free`, plain: `${T(t)} adds 1 to n with compare-and-swap:` };
  },
};

export const ops = rowsOps(spec);

export const pseudocode = (settings: CasSettings) =>
  rowsPseudocode(spec, settings, {
    text: 'tally[outcome] += 1',
    plain: 'count one more schedule that ends this way.',
  });

export function init(settings: CasSettings): CasState {
  return { m: initState(macro(settings).p), sched: [] };
}

export function initialSay(_s: CasState, settings: CasSettings): string {
  const program = programOf(settings);
  const k = threadsOf(settings);
  if (program === 'aba')
    return 'A stack A → B → C, and two threads. T1 pops: it reads top and top.next, then swaps top to next if top has not changed. T2 pops twice and pushes its first node back. Make T2 run between T1’s reads and its swap.';
  if (program === 'plain')
    return `${k} threads each add 1 to n with a plain store: read, add, write. Nothing checks whether n changed in between. Try to lose an update.`;
  return `${k} threads each add 1 to n without a lock: read n, compute n + 1, and swap it in only if n is still what they read. If not, they try again. Try to make n come out wrong. You can’t, but you can make threads retry.`;
}

export const initialVars = (s: CasState, settings: CasSettings) =>
  vars(macro(settings), s, settings);

export { list };
