import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  drawCallTree,
  layoutCallTree,
  padBounds,
  type CallState,
  type CallTreeOptions,
  type TreeCall,
  type TreeDirection,
} from '../../layouts/calls';
import type { Scene } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  asPart,
  drawLines,
  dropPart,
  part,
  pickReadable,
  sideParts,
  stackParts,
  txt,
  type Part,
} from '../_numbers/draw';
import {
  combineText,
  describe,
  PART_TEXT,
  schoolbook,
  type KaraSettings,
  type KaraState,
  type KCall,
} from './model';

const NOTE = 15;

/** What the running call (or the first, when done) is working on, line by line. */
function workLines(s: KaraState): { text: string; role?: MarkRole; bold?: boolean }[] {
  if (!s.calls.length) return [{ text: 'x·y', bold: true }];
  const c: KCall = s.calls[(s.current ?? 1) - 1]!;
  const got = s.got[c.id] ?? {};
  const out: { text: string; role?: MarkRole; bold?: boolean }[] = [
    { text: `${c.x}·${c.y}`, bold: true, role: s.current ? 'active' : 'found' },
  ];
  if (c.m === 0) {
    out.push({ text: 'base case: multiply directly' }, { text: `= ${c.result}`, role: 'found' });
    return out;
  }
  out.push(
    { text: `m = ${c.m}: a = ${c.a}, b = ${c.b}` },
    { text: `       c = ${c.c}, d = ${c.d}` },
  );
  const v = (k: keyof typeof got) => (got[k] === undefined ? '?' : String(got[k]));
  out.push({ text: `z2 = a·c = ${v('ac')}` });
  if (s.split === 'four') {
    out.push({ text: `a·d = ${v('ad')}` }, { text: `b·c = ${v('bc')}` });
  }
  out.push({ text: `z0 = b·d = ${v('bd')}` });
  if (s.split === 'three')
    out.push({ text: `(a+b)(c+d) = ${c.a + c.b}·${c.c + c.d} = ${v('sum')}` });
  const ready =
    s.split === 'three'
      ? got.ac !== undefined && got.bd !== undefined && got.sum !== undefined
      : ['ac', 'ad', 'bc', 'bd'].every((k) => got[k as keyof typeof got] !== undefined);
  if (ready && s.returned.includes(c.id)) {
    const t = combineText(c, got, s.split);
    out.push({ text: `z1 = ${t.z1}` }, { text: `= ${c.result}`, role: 'found', bold: true });
  } else out.push({ text: 'z1 = ?' }, { text: '' });
  return out;
}

export function view(
  step: Step<KaraState, undefined>,
  _settings: KaraSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const label = (c: KCall) => `${c.x}·${c.y}`;
  const finished: TreeCall[] = s.calls.map((c) => ({
    id: String(c.id),
    parent: c.parent === null ? null : String(c.parent),
    label: label(c),
    value: `=${c.result}`,
    state: 'done',
  }));
  // The calls waiting on the running one: its ancestors.
  const open = new Set<number>();
  for (let id = s.current; id !== null; id = s.calls[id - 1]!.parent) open.add(id);
  const done = new Set(s.returned);
  const now: TreeCall[] = s.calls.slice(0, s.made).map((c) => {
    const state: CallState = c.id === s.current ? 'current' : done.has(c.id) ? 'done' : 'open';
    return {
      id: String(c.id),
      parent: c.parent === null ? null : String(c.parent),
      label: label(c),
      value: done.has(c.id) ? `=${c.result}` : undefined,
      state: open.has(c.id) && c.id !== s.current ? 'open' : state,
    };
  });

  const root = s.calls[0];
  const title = root ? `${PART_TEXT.root}: ${root.x}·${root.y}` : 'Karatsuba';
  const head = part([txt('k-title', 0, 18, title, 16, { weight: 'bold' })], {
    x: 0,
    y: 0,
    w: title.length * 16 * 0.6,
    h: 26,
  });
  const lines = workLines(s);
  const counts = root
    ? [{ text: `digit products: ${s.digitMults} (schoolbook ${schoolbook(root.x, root.y)})` }]
    : [];
  const notes = drawLines('k-note', 0, 0, [...lines, ...counts], NOTE, { room: 12, gap: 1.4 });
  const notePart = part(notes.shapes, notes.bounds);

  const treePart = (direction: TreeDirection, size: number, twoLines: boolean): Part => {
    if (!s.calls.length) return { shapes: [], w: 0, h: 0 };
    const opts: CallTreeOptions = {
      size,
      gap: direction === 'right' ? 3 : 6,
      levelGap: direction === 'down' ? size * 4 : undefined,
      twoLines,
      boxH: direction === 'down' ? undefined : twoLines ? 2.25 : 1.5,
      direction,
      padX: 0.5,
      columnGap: size * 1.2,
    };
    const layout = layoutCallTree(finished, opts);
    const shapes = drawCallTree(layout, now, { roles });
    return part(shapes, layout.bounds);
  };
  const options: (ReturnType<typeof stackParts> & { font: number })[] = [];
  // A big tree grows right on a tall phone stage, one line per box, so its rows pack closer.
  for (const [dir, size, two] of [
    ['down', 15, true],
    ['right', 15, true],
    ['right', 15, false],
    ['right', 13, false],
    ['down', 13, true],
  ] as [TreeDirection, number, boolean][]) {
    const tree = treePart(dir, size, two);
    const main = asPart(stackParts([head, tree], 10));
    const font = Math.min(NOTE, Math.round(size * 0.92 * 10) / 10);
    options.push({ ...sideParts([main, dropPart(notePart, ZOOM_DROP)], 28), font });
    options.push({ ...stackParts([main, notePart], 16), font });
  }
  const place = pickReadable(stage, options);
  return { shapes: place.shapes, bounds: padBounds(place.bounds, 12), label: describe(s) };
}
