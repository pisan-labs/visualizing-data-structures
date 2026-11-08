import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step } from '../../engine/types';
import { andList, mark, plural } from '../_dp/kit';
import { depthOf, intervalsFromArg, type Interval } from '../_intervals/kit';

export const MAX_LECTURES = 10;

export interface HeapEntry {
  /** When the room is free again. */
  end: number;
  room: number;
}

export interface PartState {
  lects: Interval[];
  /** Lecture ids in the order drawn in the waiting rows: as typed, then by start time. */
  order: number[];
  /** By id − 1: the room a lecture got, 1-based, or null. */
  room: (number | null)[];
  /** A binary min-heap of rooms by the time they are free (ties: the lower room number). */
  heap: HeapEntry[];
}

export interface PartSettings {
  [key: string]: Scalar;
  /** Half-open [s, f): a lecture can start when another ends; or closed [s, f]: it cannot. */
  touch: 'share' | 'conflict';
}

export interface PartExtra {
  /** The lecture being placed. */
  at?: number;
  /** The time and size of the deepest moment, shown at the end. */
  depth?: { at: number; depth: number };
}

type S = PartState;
type X = PartExtra;
type Op = OpSpec<S, PartSettings, X>;
type PartStep = Step<S, X>;
type Gen = Generator<PartStep, S, void>;

export const defaults: PartSettings = { touch: 'share' };

export const START: Interval[] = [
  [9, 11],
  [9, 13],
  [9, 11],
  [11, 13],
  [11, 14],
  [13, 15],
  [14, 16],
  [14, 16],
  [15, 17],
  [16, 18],
].map(([s, f], k) => ({ id: k + 1, s: s!, f: f! }));

export function stateFor(lects: Interval[]): S {
  return { lects, order: lects.map((l) => l.id), room: lects.map(() => null), heap: [] };
}

export const init = (): S => stateFor(START);

export const lectId = (id: number) => `lect-${id}`;
export const heapId = (k: number) => `heap-${k}`;
export const name = (id: number) => `L${id}`;

const less = (a: HeapEntry, b: HeapEntry) => a.end < b.end || (a.end === b.end && a.room < b.room);

export function heapPush(h: HeapEntry[], e: HeapEntry): void {
  h.push(e);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(h[i]!, h[p]!)) break;
    [h[i], h[p]] = [h[p]!, h[i]!];
    i = p;
  }
}

export function heapPop(h: HeapEntry[]): HeapEntry {
  const top = h[0]!;
  const last = h.pop()!;
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && less(h[l]!, h[m]!)) m = l;
      if (r < h.length && less(h[r]!, h[m]!)) m = r;
      if (m === i) break;
      [h[i], h[m]] = [h[m]!, h[i]!];
      i = m;
    }
  }
  return top;
}

export const sortedByStart = (lects: Interval[]) =>
  [...lects].sort((a, b) => a.s - b.s || a.id - b.id);

const span = (l: Interval, closed: boolean) => `${name(l.id)} [${l.s}, ${l.f}${closed ? ']' : ')'}`;

const schedule: Op = {
  label: 'Schedule',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const closed = settings.touch === 'conflict';
    const lects = st.lects;
    const order = sortedByStart(lects).map((l) => l.id);
    const room: (number | null)[] = lects.map(() => null);
    const heap: HeapEntry[] = [];
    let rooms = 0;
    const state = (): S => ({ lects, order, room: [...room], heap: heap.map((e) => ({ ...e })) });
    const vars = () => ({ n: lects.length, rooms, 'heap size': heap.length });
    yield {
      state: state(),
      marks: [],
      say: `Sort the lectures by start time: ${andList(order.map(name))}. The heap will hold the rooms in use, keyed by when each is free again.`,
      lines: ['p.sort'],
      vars: vars(),
      level: 2,
    };
    for (const id of order) {
      const l = lects[id - 1]!;
      const top = heap[0];
      const free = top !== undefined && (closed ? top.end < l.s : top.end <= l.s);
      if (top !== undefined)
        yield {
          state: state(),
          marks: [mark(lectId(id), 'active'), mark(heapId(0), 'compare')],
          say: `${span(l, closed)} starts at ${l.s}. The room free soonest is R${top.room}, free at ${top.end}: ${free ? (top.end === l.s ? `just in time${closed ? '' : ', since a lecture may start when another ends'}` : 'free already') : top.end === l.s && closed ? 'that is the same moment, which counts as a clash here' : 'still busy'}.`,
          lines: ['p.loop', 'p.peek'],
          vars: vars(),
          level: 3,
          extra: { at: id },
        };
      let r: number;
      let say: string;
      if (free) {
        const e = heapPop(heap);
        r = e.room;
        say = `Put ${name(id)} in R${r}, and push R${r} back with its new free time, ${l.f}.`;
      } else {
        rooms++;
        r = rooms;
        say =
          top === undefined
            ? `${span(l, closed)} starts first: open room R1. Push it on the heap, free at ${l.f}.`
            : `Every room is busy at ${l.s}, so open room R${r}. Push it on the heap, free at ${l.f}.`;
      }
      room[id - 1] = r;
      heapPush(heap, { end: l.f, room: r });
      yield {
        state: state(),
        marks: [mark(lectId(id), free ? 'found' : 'new')],
        say,
        lines: free ? ['p.loop', 'p.reuse', 'p.push'] : ['p.loop', 'p.open', 'p.push'],
        vars: vars(),
        level: 2,
        extra: { at: id },
      };
    }
    const end = state();
    const d = depthOf(lects, closed);
    const at = lects.filter((b) =>
      closed ? b.s <= d.at && d.at <= b.f : b.s <= d.at && d.at < b.f,
    );
    yield {
      state: end,
      marks: at.map((l) => mark(lectId(l.id), 'compare')),
      say: `${plural(rooms, 'room')}. At time ${d.at}, ${plural(d.depth, 'lecture')} (${andList(at.map((l) => name(l.id)))}) are on at once, so no schedule can use fewer: the depth is ${d.depth}, and greedy meets it.`,
      lines: ['p.ret'],
      vars: { ...vars(), depth: d.depth },
      level: 1,
      extra: { depth: d },
    };
    return end;
  },
};

const load: Op = {
  label: 'Load lectures',
  arity: 1,
  *run(st, [arg]): Gen {
    const lects = intervalsFromArg(arg, MAX_LECTURES, 'lecture');
    if (typeof lects === 'string') {
      yield {
        state: st,
        marks: [],
        say: `The lectures stay as they were. ${lects}`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const next = stateFor(lects);
    yield {
      state: next,
      marks: [],
      say: `${plural(lects.length, 'lecture')}, each from its start to its finish. Every lecture needs a room. Press Schedule.`,
      lines: [],
      vars: { n: lects.length },
      level: 1,
    };
    return next;
  },
};

export const ops = { load, schedule };

const Ln = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PartSettings): PseudoBlock[] {
  const closed = settings.touch === 'conflict';
  return [
    {
      op: 'schedule',
      lines: [
        Ln(
          'p.sig',
          0,
          'partition(lectures)',
          'To give every lecture a room, using as few rooms as possible:',
        ),
        Ln(
          'p.sort',
          1,
          'sort the lectures by start time; H = empty min-heap',
          'put them in order of start time, with no rooms yet.',
        ),
        Ln('p.loop', 1, 'for each lecture l in that order', 'For each lecture:'),
        Ln(
          'p.peek',
          2,
          closed
            ? 'if H not empty and min(H).free < l.start'
            : 'if H not empty and min(H).free <= l.start',
          closed
            ? 'if the room free soonest is free before it starts,'
            : 'if the room free soonest is free by the time it starts,',
        ),
        Ln('p.reuse', 3, 'r = extractMin(H); put l in r', 'use that room;'),
        Ln('p.open', 2, 'else open a new room r', 'otherwise open a new room.'),
        Ln(
          'p.push',
          2,
          'insert r into H, free at l.finish',
          'Either way, the room is busy until the lecture finishes.',
        ),
        Ln(
          'p.ret',
          1,
          'return the rooms   // as many as the depth',
          'The number of rooms equals the most lectures on at once.',
        ),
      ],
    },
  ];
}

export function initialSay(st: S): string {
  return `${plural(st.lects.length, 'lecture')}, each from its start to its finish. Every one needs a room, and two lectures in one room cannot overlap. How few rooms will do? Press Schedule, or type new lectures.`;
}

export const initialVars = (st: S) => ({ n: st.lects.length });

export function describe(st: S): string {
  const parts = st.order.map((id) => {
    const l = st.lects[id - 1]!;
    const r = st.room[id - 1];
    return `${name(id)} from ${l.s} to ${l.f}${r ? ` in room ${r}` : ''}`;
  });
  const heap = st.heap.length
    ? ` Heap: ${st.heap.map((e) => `R${e.room} free at ${e.end}`).join(', ')}.`
    : '';
  return `Lectures: ${parts.join('; ')}.${heap}`;
}
