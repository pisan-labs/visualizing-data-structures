/**
 * The board: one row per list (A, B, C, D), named on the left, and the out row where a merge
 * builds its result after the dummy head. With two lists the out row sits between A and B, so
 * the links from the result back into either list stay short; with more it sits at the bottom.
 * The naive approach draws the array of copies (vals) above the out row instead.
 *
 * Nodes are [value | next] boxes drawn with src/layouts/linked.ts's parts. A node keeps its slot
 * until it is taken, then moves to the out row, so the animation follows the node. a and b sit
 * left of the fronts of the two lists being merged; tail (and, at the end, head) under the out
 * row. A row too long for the stage wraps onto more lines, its last link routed down to the next.
 * Every row reserves the slots it needs for the whole operation, so the camera holds still.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  boxExit,
  drawLink,
  drawNode,
  fieldAnchor,
  linkId,
  NODE,
  nullText,
  pointerText,
  type Box,
  type Pt,
} from '../../layouts/linked';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ARRAY, drawArray, heading, nid } from '../_lists2/kit';
import {
  DUMMY,
  listValues,
  NAMES,
  type MExtra,
  type MSettings,
  type MState,
  type Slots,
} from './model';

const W = NODE.single.value + NODE.single.field;
const H = NODE.single.h;
const GAP = 26;
const PITCH = W + GAP;
const X0 = 76;
const TOP = 46;
/** Line pitch of a list row, and of the out row (room under it for tail and head). */
const LINE = 60;
const OUT_LINE = 84;
const ARRAY_X = 76;
const ARRAY_ROOM = ARRAY.h + ARRAY.below + 18;
const RIGHT = 24;

type Band =
  | { kind: 'row'; r: number; slots: number }
  | { kind: 'out'; slots: number }
  | { kind: 'array'; cells: number };

/** The bands top to bottom. */
function bands(extra: MExtra, rows: number[], approach: string): Band[] {
  const list: Band[] = rows.map((slots, r) => ({ kind: 'row', r, slots }));
  const out: Band[] = extra.frame.out ? [{ kind: 'out', slots: extra.frame.out }] : [];
  const arr: Band[] = extra.frame.array ? [{ kind: 'array', cells: extra.frame.array }] : [];
  if (approach !== 'naive' && rows.length === 2 && out.length)
    return [list[0]!, ...out, list[1]!];
  return [...list, ...arr, ...out];
}

const linesOf = (slots: number, cols: number) => Math.max(1, Math.ceil(slots / cols));

function sizeFor(bs: Band[], cols: number): Bounds {
  let h = TOP;
  let w = X0 + Math.max(1, Math.min(cols, maxSlots(bs))) * PITCH - GAP + RIGHT;
  for (const b of bs) {
    if (b.kind === 'array') {
      h += ARRAY_ROOM;
      w = Math.max(w, ARRAY_X + b.cells * ARRAY.pitch + RIGHT);
    } else h += linesOf(b.slots, cols) * (b.kind === 'out' ? OUT_LINE : LINE);
  }
  return { x: 0, y: 0, w, h: h + 4 };
}

const maxSlots = (bs: Band[]) =>
  Math.max(1, ...bs.map((b) => (b.kind === 'array' ? 0 : b.slots)));

/** One line when that draws text at least 0.8 of its size, else whichever of 4 to 6 is largest. */
function colsFor(bs: Band[], stage?: StageSize): number {
  const one = maxSlots(bs);
  if (!stage) return one;
  const b = sizeFor(bs, one);
  if (Math.min(stage.w / b.w, stage.h / b.h) >= 0.8) return one;
  return pickLayout(
    stage,
    [4, 5, 6].map((cols) => ({ cols, bounds: sizeFor(bs, cols) })),
  ).cols;
}

export function view(step: Step<MState, MExtra>, settings: MSettings, stage?: StageSize): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const extra: MExtra = step.extra ?? {
    heading: '',
    rows: state.lists.map((h) => orderOf(state, h)),
    ptrs: {},
    frame: { rows: state.lists.map((h) => orderOf(state, h).length), out: 0, array: 0 },
  };
  const reserved = extra.rows.map((r, i) => Math.max(r.length, extra.frame.rows[i] ?? 0, 1));
  const bs = bands(extra, reserved, String(settings.approach));
  const cols = colsFor(bs, stage);
  const size = sizeFor(bs, cols);
  const shapes: Shape[] = [];
  if (extra.heading) shapes.push(heading(extra.heading, roles.get('ask')));

  // Where every slot is.
  const boxes = new Map<number, Box>();
  /** Row key ('r0'.., 'out') and slot of each uid, for routing. */
  const where = new Map<number, { band: string; c: number; line: number; col: number }>();
  const slotBox = (top: number, pitch: number, c: number): Box => ({
    x: X0 + (c % cols) * PITCH,
    y: top + Math.floor(c / cols) * pitch,
    w: W,
    h: H,
  });
  let y = TOP;
  const rowTop = new Map<string, number>();
  let arrayTop = 0;
  for (const b of bs) {
    if (b.kind === 'array') {
      arrayTop = y + 12;
      y += ARRAY_ROOM;
      continue;
    }
    const key = b.kind === 'out' ? 'out' : `r${b.r}`;
    const pitch = b.kind === 'out' ? OUT_LINE : LINE;
    rowTop.set(key, y);
    const slots: Slots = b.kind === 'out' ? (extra.out ?? []) : (extra.rows[b.r] ?? []);
    slots.forEach((u, c) => {
      if (u === null) return;
      boxes.set(u, slotBox(y, pitch, c));
      where.set(u, { band: key, c, line: Math.floor(c / cols), col: c % cols });
    });
    // The row's name.
    shapes.push({
      kind: 'text',
      id: `name-${key}`,
      x: 12,
      y: y + H / 2 + 6,
      text: b.kind === 'out' ? 'out' : NAMES[b.r]!,
      size: 16,
      anchor: 'start',
      weight: 'bold',
      cls: 'label',
    });
    y += linesOf(b.slots, cols) * pitch;
  }

  // Nodes.
  for (const n of state.nodes) {
    const box = boxes.get(n.uid);
    if (!box) continue;
    shapes.push(
      ...drawNode(
        n.uid === DUMMY
          ? { id: nid(n.uid), text: 'dummy', sentinel: true }
          : { id: nid(n.uid), text: String(n.value) },
        box,
        'single',
        roles,
      ),
    );
  }

  // Links.
  const rightEdge = X0 + cols * PITCH - GAP;
  for (const n of state.nodes) {
    const box = boxes.get(n.uid);
    if (!box) continue;
    const id = linkId(nid(n.uid), 'next');
    const role = roles.get(id);
    const { p } = fieldAnchor('single', box, false, 'next');
    const target = n.next === null ? undefined : boxes.get(n.next);
    if (!target) {
      const cx = box.x + NODE.single.value + NODE.single.field / 2;
      const cy = box.y + H / 2;
      shapes.push(
        ...drawLink(
          id,
          [
            { x: cx - 7, y: cy + 11 },
            { x: cx + 7, y: cy - 11 },
          ],
          { role, head: false },
        ),
      );
      continue;
    }
    shapes.push({
      kind: 'circle',
      id: `${id}:dot`,
      x: p.x,
      y: p.y,
      r: 3.5,
      cls: 'arrowhead',
      role,
      z: 1.6,
    });
    const from = where.get(n.uid)!;
    const to = where.get(n.next!)!;
    let pts: Pt[];
    if (from.band === to.band && to.c === from.c + 1 && to.line === from.line) {
      pts = [p, { x: target.x, y: p.y }];
    } else if (from.band === to.band && to.c === from.c + 1) {
      // Wrap to the next line: out right, down the gap, back left, in from the left.
      const yGap = box.y + H + (from.band === 'out' ? OUT_LINE : LINE) / 2 - 6;
      const xR = rightEdge + 12;
      const xL = X0 - 12;
      const cy = target.y + H / 2;
      pts = [p, { x: xR, y: p.y }, { x: xR, y: yGap }, { x: xL, y: yGap }, { x: xL, y: cy }, { x: target.x, y: cy }];
    } else {
      pts = [p, boxExit(target, p, 1)];
    }
    shapes.push(...drawLink(id, pts, { role }));
  }

  // a and b: left of the fronts of the pair being merged.
  if (extra.pair) {
    extra.pair.forEach((r, i) => {
      const name = i === 0 ? 'a' : 'b';
      const u = extra.ptrs[name] ?? null;
      const top = rowTop.get(`r${r}`)!;
      const role = roles.get(`p:${name}`);
      const box = u === null ? undefined : boxes.get(u);
      const cy = (box ? box.y : top) + H / 2;
      // Left of the front node, or pointing at "null" at the row's start.
      const right = box ? box.x : X0;
      if (!box) shapes.push(nullText(`null-${name}`, X0 + 18, cy - 1, role));
      shapes.push(pointerText(`p:${name}`, name, right - 36, cy + 5, role));
      shapes.push({
        kind: 'arrow',
        id: `p:${name}:a`,
        x1: right - 28,
        y1: cy,
        x2: right - (box ? 1 : 4),
        y2: cy,
        role,
        z: 1.4,
      });
    });
  }

  // tail and head: under their node in the out row.
  for (const name of ['tail', 'head']) {
    if (!(name in extra.ptrs)) continue;
    const u = extra.ptrs[name] ?? null;
    const box = u === null ? undefined : boxes.get(u);
    const role = roles.get(`p:${name}`);
    const top = rowTop.get('out') ?? rowTop.get('r0')!;
    const b = box ?? { x: X0, y: top, w: W, h: H };
    const cx = b.x + b.w / 2;
    if (!box) shapes.push(nullText(`null-${name}`, cx, b.y + H / 2, role));
    shapes.push(pointerText(`p:${name}`, name, cx, b.y + H + 33, role));
    shapes.push({
      kind: 'arrow',
      id: `p:${name}:a`,
      x1: cx,
      y1: b.y + H + 19,
      x2: cx,
      y2: b.y + H + 1,
      role,
      z: 1.4,
    });
  }

  // The naive approach's array.
  if (extra.frame.array) {
    const centre = (u: number) => {
      const b = boxes.get(u);
      return b && { x: b.x + 21, y: b.y + H / 2 };
    };
    shapes.push(
      ...drawArray({
        x0: ARRAY_X,
        y: arrayTop,
        size: extra.frame.array,
        cells: extra.array?.cells ?? [],
        roles,
        name: 'vals',
        lifted: extra.array?.lifted,
        from: centre,
      }),
    );
  }

  return { shapes, bounds: size, label: label(state, extra) };
}

function orderOf(s: MState, head: number | null): Slots {
  const next = new Map(s.nodes.map((n) => [n.uid, n.next]));
  const out: number[] = [];
  for (let u = head; u !== null && !out.includes(u); u = next.get(u) ?? null) out.push(u);
  return out;
}

function label(state: MState, extra: MExtra): string {
  const value = new Map(state.nodes.map((n) => [n.uid, n.value]));
  const text = (slots: Slots) =>
    slots.filter((u): u is number => u !== null).map((u) => (u === DUMMY ? 'dummy' : value.get(u)));
  const parts: string[] = [];
  if (extra.heading) parts.push(`${extra.heading}.`);
  extra.rows.forEach((r, i) => {
    const vs = text(r);
    if (vs.length || !extra.out) parts.push(`${NAMES[i]}: ${vs.length ? vs.join(', ') : 'empty'}.`);
  });
  if (extra.out) parts.push(`Out: ${text(extra.out).join(', ') || 'empty'}.`);
  const cells = extra.array?.cells.filter((c) => c !== null) ?? [];
  if (extra.array) parts.push(`vals holds ${cells.length ? cells.map((c) => c!.value).join(', ') : 'nothing yet'}.`);
  if (!parts.length) parts.push(listValues(state).map((l, i) => `${NAMES[i]}: ${l.join(', ') || 'empty'}`).join('. '));
  return parts.join(' ');
}
