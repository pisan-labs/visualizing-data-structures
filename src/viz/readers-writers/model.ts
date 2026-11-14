/**
 * Readers and writers: one writer W and 2 or 3 readers R1.. share a room. Readers may read
 * together; the writer must be alone. Downey's read-write lock (The Little Book of Semaphores):
 * a lock m guards a count n of the readers inside, and a semaphore room (his roomEmpty) that
 * starts at 1. The first reader in takes room, which locks the writer out; the last reader out
 * gives it back (Downey calls the pair a lightswitch). The writer takes room for itself. Three
 * variants, as a setting:
 *   mutex      the naive design: one lock m for everyone, so readers cannot share
 *   readers    the lightswitch (readers first): a stream of readers can keep the writer waiting,
 *              because a reader who comes after the writer still gets in while others read
 *   turnstile  Downey's no-starve version: a semaphore turn that every reader passes through
 *              (P then V) and the writer holds while it waits, so readers who come after the
 *              writer wait behind it
 * Each thread runs once. Hidden shared variables keep what the outcome needs, so it depends on
 * the state only: mx, the highest n (the most readers in at once), wq (the writer has come and
 * not yet written) and ov (a reader who came while the writer waited got in first). The machine is src/viz/_threads; rows, operations and the
 * tally are src/viz/_threads3.
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

export type Variant = 'mutex' | 'readers' | 'turnstile';

export interface RwSettings {
  [key: string]: string | number | boolean | null;
  variant: Variant;
  readers: number;
}

export const defaults: RwSettings = { variant: 'readers', readers: 2 };

export type RwState = RowsState;

export const variantOf = (s: RwSettings): Variant =>
  s.variant === 'mutex' || s.variant === 'turnstile' ? s.variant : 'readers';
export const readersOf = (s: RwSettings) => (Number(s.readers) >= 3 ? 3 : 2);

/** What each row does, for the narration. */
export type Kind =
  | 'turnstile'
  | 'add'
  | 'first'
  | 'read'
  | 'sub'
  | 'last'
  | 'lock'
  | 'unlock'
  | 'Pturn'
  | 'Proom'
  | 'write'
  | 'Vturn'
  | 'Vroom';

interface KRow extends RowSpec {
  kind: Kind;
}

/**
 * The read, and the bookkeeping for the outcome: a reader who arrived while the writer was
 * waiting (lt, copied from wq when it arrived) and reads while the writer still waits got in
 * first (ov = 1). The hidden shared variables wq, mx and ov keep the outcome in the state.
 */
const READ = ['if lt == 0 goto e', 'if wq == 0 goto e', 'ov = 1', 'e:'];

function readerRows(v: Variant): KRow[] {
  if (v === 'mutex')
    return [
      {
        kind: 'lock',
        text: 'lock(m)',
        plain: 'Take lock m, or wait in line: one thread in the room at a time.',
        steps: ['lt = wq', 'lock(m)'],
      },
      { kind: 'read', text: 'read', plain: 'Read, alone.', steps: READ },
      {
        kind: 'unlock',
        text: 'unlock(m)',
        plain: 'Let go of m; the next in line gets it.',
      },
    ];
  const rows: KRow[] = [
    {
      kind: 'add',
      text: 'n += 1',
      plain: 'Take lock m and add 1 to n, the readers inside; m stays held.',
      code: [
        { text: 'lock(m)', plain: 'Take lock m, which guards n.' },
        { text: 'n += 1', plain: 'One more reader.', indent: 1 },
      ],
      steps: [
        ...(v === 'readers' ? ['lt = wq'] : []),
        'lock(m)',
        'r = n + 1',
        'n = r',
        'if r <= mx goto z',
        'mx = r',
        'z:',
      ],
    },
    {
      kind: 'first',
      text: '1st: P(room)',
      plain: 'The first reader in takes room; then let go of m.',
      code: [
        {
          text: 'if n == 1: P(room)',
          plain: 'The first reader in takes room, locking the writer out (or waits while the writer is in).',
          indent: 1,
        },
        { text: 'unlock(m)', plain: 'Let go of m.', indent: 0 },
      ],
      steps: ['if r != 1 goto in', 'P(room)', 'in: unlock(m)'],
    },
    { kind: 'read', text: 'read', plain: 'Read; other readers may be reading too.', steps: READ },
    {
      kind: 'sub',
      text: 'n -= 1',
      plain: 'Leave: take lock m and take 1 from n; m stays held.',
      code: [
        { text: 'lock(m)', plain: 'Take lock m again.' },
        { text: 'n -= 1', plain: 'One reader fewer.', indent: 1 },
      ],
      steps: ['lock(m)', 'r = n - 1', 'n = r'],
    },
    {
      kind: 'last',
      text: 'last: V(room)',
      plain: 'The last reader out gives room back; then let go of m.',
      code: [
        {
          text: 'if n == 0: V(room)',
          plain: 'The last reader out gives room back, letting a writer in.',
          indent: 1,
        },
        { text: 'unlock(m)', plain: 'Let go of m.', indent: 0 },
      ],
      steps: ['if r goto out', 'V(room)', 'out: unlock(m)'],
    },
  ];
  if (v === 'readers') return rows;
  return [
    {
      kind: 'turnstile',
      text: 'turnstile',
      plain: 'Pass the turnstile: P(turn), then V(turn) at once; wait here while the writer holds it.',
      code: [
        { text: 'P(turn)', plain: 'Wait at the turnstile while a writer holds it.' },
        { text: 'V(turn)', plain: 'Let the next one through.', indent: 0 },
      ],
      steps: ['lt = wq', 'P(turn)', 'V(turn)'],
    },
    ...rows,
  ];
}

function writerRows(v: Variant): KRow[] {
  if (v === 'mutex')
    return [
      {
        kind: 'lock',
        text: 'lock(m)',
        plain: 'Take lock m, or wait in line.',
        steps: ['wq = 1', 'lock(m)'],
      },
      { kind: 'write', text: 'write', plain: 'Write, alone.', steps: ['wq = 0'] },
      { kind: 'unlock', text: 'unlock(m)', plain: 'Let go of m.' },
    ];
  const proom: KRow = {
    kind: 'Proom',
    text: 'P(room)',
    plain: 'Take room, or wait until the last reader gives it back.',
    steps: [...(v === 'readers' ? ['wq = 1'] : []), 'P(room)'],
  };
  const write: KRow = { kind: 'write', text: 'write', plain: 'Write, alone in the room.', steps: ['wq = 0'] };
  const vroom: KRow = {
    kind: 'Vroom',
    text: 'V(room)',
    plain: 'Give room back: a waiting reader or writer can go in.',
    steps: ['V(room)'],
  };
  if (v === 'readers') return [proom, write, vroom];
  return [
    {
      kind: 'Pturn',
      text: 'P(turn)',
      plain: 'Take the turnstile: readers who come now wait behind it.',
      steps: ['wq = 1', 'P(turn)'],
    },
    proom,
    write,
    {
      kind: 'Vturn',
      text: 'V(turn)',
      plain: 'Open the turnstile again.',
      steps: ['V(turn)'],
    },
    vroom,
  ];
}

export function threadRows(v: Variant, k: number): { name: string; rows: KRow[] }[] {
  return [
    { name: 'W', rows: writerRows(v) },
    ...Array.from({ length: k }, (_, t) => ({ name: `R${t + 1}`, rows: readerRows(v) })),
  ];
}

export function macro(settings: RwSettings): Macro {
  const v = variantOf(settings);
  const decls = [
    v === 'mutex' ? 'shared wq = 0, ov = 0' : 'shared n = 0, mx = 0, wq = 0, ov = 0',
    ...(v === 'mutex' ? [] : [v === 'turnstile' ? 'sem room = 1, turn = 1' : 'sem room = 1']),
  ];
  return buildMacro(
    decls,
    threadRows(v, readersOf(settings)).map((th) => ({
      name: th.name,
      rows: th.rows.map(({ kind: _kind, ...r }) => r),
    })),
  );
}

const kindCache = new Map<string, Kind[][]>();
export const kinds = (settings: RwSettings, t: number): Kind[] => {
  const key = `${variantOf(settings)}|${readersOf(settings)}`;
  let all = kindCache.get(key);
  if (!all) {
    all = threadRows(variantOf(settings), readersOf(settings)).map((th) =>
      th.rows.map((r) => r.kind),
    );
    kindCache.set(key, all);
  }
  return all[t]!;
};

/** The writer is the first lane, so the step buttons are the same for 2 or 3 readers. */
const isWriter = (_mac: Macro, t: number) => t === 0;

/** Thread t is in the room: past its way in, and not yet on its way out. */
export function inside(mac: Macro, s: MachineState, t: number, settings: RwSettings): boolean {
  const ks = kinds(settings, t);
  const row = rowNow(mac, s, t);
  // The writer is in from its write until its last step gives room (or m) back.
  if (isWriter(mac, t)) return row >= ks.indexOf('write') && row < ks.length;
  const at = ks.indexOf('read');
  const leave = at + 1;
  if (row === at) return true;
  return row === leave && s.threads[t]!.pc === mac.rows[t]![leave]!.from;
}

/** The outcome's two facts, from the hidden variables: the most readers in at once (n's
 * highest value; 1 with the one lock), and whether a reader who came while the writer waited got
 * in first. */
export function history(s: MachineState) {
  return { most: s.mem.mx ?? 1, overtaken: (s.mem.ov ?? 0) === 1, waiting: (s.mem.wq ?? 0) === 1 };
}

const name = (mac: Macro, t: number) => mac.p.threads[t]!.name;

export function outcome(_mac: Macro, s: MachineState): string {
  const h = history(s);
  const at = h.most <= 1 ? '1 at a time' : `${h.most} at once`;
  return h.overtaken ? `${at}, W overtaken` : at;
}

export function vars(mac: Macro, st: RwState, settings: RwSettings): Record<string, Scalar> {
  const s = st.m;
  const k = mac.p.threads.length;
  const ins = Array.from({ length: k }, (_, t) => t).filter((t) => inside(mac, s, t, settings));
  const h = history(s);
  const v: Record<string, Scalar> = {
    inside: ins.length ? ins.map((t) => name(mac, t)).join(' ') : 'nobody',
    most: variantOf(settings) === 'mutex' ? 1 : h.most,
    'W waits': h.waiting ? 'yes' : 'no',
    overtaken: h.overtaken ? 'yes' : 'no',
    steps: st.sched.length,
  };
  return v;
}

export function display(settings: RwSettings): Display {
  const mac = macro(settings);
  return {
    shared: ['n'],
    regs: () => [],
    notes: ['reading', 'writing'],
    note: (t, s) =>
      inside(mac, s, t, settings) ? (isWriter(mac, t) ? 'writing' : 'reading') : undefined,
  };
}

const semWas = (s: MachineState, x: string) => s.sems[x]?.value ?? 0;

export function say(
  mac: Macro,
  before: MachineState,
  events: StepEvent[],
  after: MachineState,
  settings: RwSettings,
  row: number,
): string {
  const t = events[0]!.thread;
  const T = name(mac, t);
  const kind = kinds(settings, t)[row]!;
  const last = events.at(-1)!;
  const blocked = last.blocked;
  const resumed = before.threads[t]!.pc > mac.rows[t]![row]!.from;
  const n = after.mem.n ?? 0;
  const holder = (l: string) => {
    const h = before.locks[l]?.holder;
    return h === null || h === undefined ? 'another thread' : name(mac, h);
  };
  const woke = events.flatMap((e) => e.woke ?? []).map((w) => name(mac, w));
  const wokeText = woke.length ? `, and ${list(woke)}, waiting, goes on` : '';
  switch (kind) {
    case 'turnstile':
      if (blocked) return `${T} is stopped at the turnstile: W holds turn, so ${T} waits behind it.`;
      if (resumed) return `${T} gets through the turnstile and lets the next one through (V(turn)).`;
      return `${T} passes the turnstile: P(turn), then V(turn) at once.`;
    case 'add':
      if (blocked) return `${T} wants to add itself to n, but ${holder('m')} holds m, so ${T} waits.`;
      return `${resumed ? `${T} has m now` : `${T} takes m`} and adds 1 to n: n = ${n}.`;
    case 'first': {
      if (resumed) return `${T} has room now. It lets go of m and goes in.`;
      const first = (after.threads[t]!.regs.r ?? 0) === 1;
      if (!first)
        return `${T} is not the first reader in (n = ${n}), so it skips P(room), lets go of m and goes in.`;
      if (blocked)
        return `${T} is the first reader in, so it calls P(room), but the writer has the room: room goes to ${semWas(after, 'room')} and ${T} waits, still holding m.`;
      return `${T} is the first reader in, so it takes room (room = ${semWas(after, 'room')}): the writer is locked out. It lets go of m and goes in.`;
    }
    case 'read': {
      const ins = mac.p.threads
        .map((_, u) => u)
        .filter((u) => u !== t && inside(mac, after, u, settings))
        .map((u) => name(mac, u));
      return `${T} reads${ins.length ? `, with ${list(ins)} inside too` : ''}.`;
    }
    case 'sub':
      if (blocked) return `${T} is done reading, but ${holder('m')} holds m, so ${T} waits to take itself off n.`;
      return `${resumed ? `${T} has m now` : `${T} is done reading. It takes m`} and takes 1 from n: n = ${n}.`;
    case 'last': {
      const r = after.threads[t]!.regs.r ?? 0;
      return r === 0
        ? `${T} is the last reader out (n = 0), so it gives room back: room goes from ${semWas(before, 'room')} to ${semWas(after, 'room')}${wokeText}. Then it lets go of m.`
        : `${T} is not the last one out (n = ${r}), so it leaves room alone and lets go of m${wokeText}.`;
    }
    case 'lock':
      if (blocked) return `${T} wants the room, but ${holder('m')} holds m, so ${T} waits in line.`;
      return resumed
        ? `${T} has m now and goes in.`
        : `${T} takes m and goes in: nobody else can.`;
    case 'unlock':
      return `${T} leaves and lets go of m${woke.length ? `, and ${list(woke)}, first in line, takes it` : ''}.`;
    case 'Pturn':
      if (blocked) return `${T} waits for the turnstile.`;
      return `W takes the turnstile (turn = 0): readers who come now wait behind it.`;
    case 'Proom':
      if (blocked)
        return `W calls P(room), but readers are inside: room goes to ${semWas(after, 'room')} and W waits for the last one out.`;
      return resumed ? 'W has the room now.' : `W takes room (room = ${semWas(after, 'room')}): it has the room to itself.`;
    case 'write':
      return 'W writes, alone in the room.';
    case 'Vturn':
      return `W opens the turnstile: turn goes from ${semWas(before, 'turn')} to ${semWas(after, 'turn')}${wokeText}.`;
    case 'Vroom':
      return `W leaves and gives room back: room goes from ${semWas(before, 'room')} to ${semWas(after, 'room')}${wokeText}.`;
  }
}

export function narrate(
  mac: Macro,
  before: MachineState,
  events: StepEvent[],
  after: MachineState,
): string[] {
  if (history(after).overtaken && !history(before).overtaken)
    return [
      `${name(mac, events[0]!.thread)} came while W was waiting, and still got in first: as long as readers keep coming while one is inside, the writer waits.`,
    ];
  return [];
}

export function ending(mac: Macro, s: MachineState, settings: RwSettings): string {
  const h = history(s);
  const at =
    variantOf(settings) === 'mutex' || h.most <= 1
      ? 'Readers went in one at a time'
      : `Up to ${h.most} readers were in at once`;
  void mac;
  return `Everyone is done. ${at}, and the writer was always alone.${h.overtaken ? ' A reader who came while the writer waited got in before it.' : ''}`;
}

export const spec: RowsSpec<RwSettings, RwState> = {
  macro,
  display,
  outcome: (mac, s) => outcome(mac, s),
  good: (o) => !o.includes('overtaken'),
  verdict: (o) => (o.includes('overtaken') ? 'unfair' : 'ok'),
  rank: (o) => (o.includes('overtaken') ? 10 : 0) + (Number(/^(\d)/.exec(o)?.[1]) || 0),
  say,
  narrate: (mac, before, events, after) => narrate(mac, before, events, after),
  vars,
  lanes: 4,
  ending,
  startText: (_mac, settings) =>
    variantOf(settings) === 'mutex'
      ? 'm is free'
      : `n = 0, room = 1${variantOf(settings) === 'turnstile' ? ', turn = 1' : ''}`,
  head: (mac, t, settings) => {
    const T = name(mac, t);
    const v = variantOf(settings);
    if (isWriter(mac, t))
      return v === 'turnstile'
        ? { text: 'W: write', plain: 'The writer holds the turnstile while it waits for the room:' }
        : { text: 'W: write', plain: 'The writer needs the room to itself:' };
    return v === 'mutex'
      ? { text: `${T}: read`, plain: `${T} takes the one lock, like everyone:` }
      : { text: `${T}: read`, plain: `${T} goes in through the lightswitch: first in locks, last out unlocks:` };
  },
};

export const ops = rowsOps(spec);

export const pseudocode = (settings: RwSettings) =>
  rowsPseudocode(spec, settings, {
    text: 'tally[most at once, overtaken] += 1',
    plain: 'count one more schedule that ends this way.',
  });

export function init(settings: RwSettings): RwState {
  return { m: initState(macro(settings).p), sched: [] };
}

export function initialSay(_s: RwState, settings: RwSettings): string {
  const k = readersOf(settings);
  const v = variantOf(settings);
  if (v === 'mutex')
    return `${k} readers and a writer share one lock m: whoever holds it is alone in the room. Safe, but readers wait for each other even though reading together would be fine.`;
  if (v === 'turnstile')
    return `${k} readers and a writer. The readers share the room through the lightswitch (n and m, then room), and everyone passes a turnstile first. The writer holds the turnstile while it waits, so readers who come after it wait too. Try to keep the writer out.`;
  return `${k} readers and a writer. Readers keep a count n of the readers inside, guarded by lock m. The first reader in takes the semaphore room; the last one out gives it back. The writer takes room for itself. Let a reader in, start the writer, then send in another reader.`;
}

export const initialVars = (s: RwState, settings: RwSettings) =>
  vars(macro(settings), s, settings);
