import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  MAX_LISTED_BITS,
  bin,
  describe,
  full,
  setText,
  type BitExtra,
  type BitSettings,
  type BitState,
} from './model';

const CELL = 42;
const ROW = 54;
const X0 = 130;
const TOP = 60;
const MAX_ROWS = 3;
/** Two tall columns rather than four wide ones, so the drawing stays legible on a phone. */
const LIST_COLS = 2;
const LIST_ROWS = (1 << MAX_LISTED_BITS) / LIST_COLS;
const LIST_PITCH = 21;
const LIST_SIZE = 13;
/** Room for "= 255" right of a row, and the returned value's box past it. */
const DEC_W = 70;
const OUT_GAP = 90;
/** With each row's name above it (a narrow stage), the rows start here and are this far apart. */
const X0_ABOVE = 44;
const NAME_H = 16;

/**
 * Where the parts go. usual: the returned value right of the rows, the list of subsets under
 * them. beside (a wide, short stage): the list right of everything. under: the returned value
 * under the rows, so the drawing is only as wide as the rows. above (a narrow stage): as under,
 * with each row's name above it instead of left of it, so the drawing is narrower still.
 *
 * An operation that lists subsets returns nothing, and the others list nothing, so a frame
 * keeps room for the list only while one is shown and for the returned value otherwise. That
 * holds for a whole operation; the framing changes only from one operation to the next.
 */
type Arrangement = 'usual' | 'beside' | 'under' | 'above';

interface Frame {
  arr: Arrangement;
  /** The rows' left edge, the first row under x, and the pitch of the rows. */
  x0: number;
  rowsTop: number;
  row: number;
  out: { x: number; y: number };
  list: { x: number; y: number };
  bounds: Bounds;
}

function frameFor(state: BitState, arr: Arrangement): Frame {
  const w = state.width;
  const above = arr === 'above';
  const x0 = above ? X0_ABOVE : X0;
  const row = above ? ROW + NAME_H : ROW;
  const right = x0 + w * CELL;
  const rowsTop = TOP + CELL + 34 + (above ? NAME_H : 0);
  const rowsBottom = rowsTop + MAX_ROWS * row;
  const listed = state.listOf !== null;
  const listH = listed ? 24 + LIST_ROWS * LIST_PITCH : 0;
  const listW = listed ? LIST_COLS * colWidth(state) : 0;
  const base = { arr, x0, rowsTop, row };
  if (arr === 'beside') {
    const lx = right + (listed ? DEC_W + 10 : OUT_GAP + 64 + 40);
    const ly = TOP + 4;
    return {
      ...base,
      out: { x: right + OUT_GAP, y: TOP },
      list: { x: lx, y: ly },
      bounds: {
        x: 0,
        y: 0,
        w: listed ? lx + listW : right + OUT_GAP + 64 + 20,
        h: Math.max(rowsBottom, ly + listH),
      },
    };
  }
  if (arr === 'under' || above) {
    const oy = rowsBottom + 14;
    const ly = listed ? rowsBottom + 16 : oy + CELL + 30;
    return {
      ...base,
      out: { x: right - 64, y: oy },
      list: { x: 20, y: ly },
      bounds: {
        x: 0,
        y: 0,
        w: Math.max(right + DEC_W, 20 + listW),
        h: listed ? ly + listH : oy + CELL + 14,
      },
    };
  }
  return {
    ...base,
    out: { x: right + OUT_GAP, y: TOP },
    list: { x: 20, y: rowsBottom + 16 },
    bounds: {
      x: 0,
      y: 0,
      w: Math.max(right + (listed ? DEC_W : 170), 20 + listW),
      h: listed ? rowsBottom + 16 + listH : rowsBottom + 14,
    },
  };
}

/** Width of one column of the list of subsets. */
function colWidth(state: BitState): number {
  const bits = state.listBits || state.width;
  const longest = bits + 1 + setText(full(MAX_LISTED_BITS)).length;
  return Math.ceil(longest * LIST_SIZE * 0.6 + 18);
}

/**
 * Draw a step, arranged for the stage when there is one. Every arrangement keeps room for the
 * list and the returned value, so the choice holds through a run.
 */
export function view(
  step: Step<BitState, BitExtra>,
  _settings?: BitSettings,
  stage?: StageSize,
): Scene {
  const options: Arrangement[] = stage ? ['usual', 'beside', 'under', 'above'] : ['usual'];
  const frame = pickLayout(
    stage,
    options.map((a) => frameFor(step.state, a)),
  );
  return draw(step, frame);
}

function draw(step: Step<BitState, BitExtra>, frame: Frame): Scene {
  const { state, extra = {} } = step;
  const w = state.width;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const focus = new Set(extra.focus ?? []);
  const shapes: Shape[] = [];
  const x0 = frame.x0;
  const above = frame.arr === 'above';
  const colX = (i: number) => x0 + (w - 1 - i) * CELL;
  const right = x0 + w * CELL;

  for (let i = 0; i < w; i++) {
    shapes.push({
      kind: 'text',
      id: `idx-${i}`,
      x: colX(i) + CELL / 2,
      y: TOP - 12,
      text: String(i),
      size: 13,
      anchor: 'middle',
      cls: 'index',
      mono: true,
      role: focus.has(i) ? 'active' : undefined,
    });
  }
  shapes.push({
    kind: 'text',
    id: 'idx-title',
    x: x0 - 12,
    y: TOP - 12,
    text: 'bit',
    size: 13,
    anchor: 'end',
    cls: 'label',
  });

  // A row's name is left of it, or above it (except x's, which is short).
  const drawRow = (key: string, y: number, label: string, value: number, live: boolean) => {
    const bits = bin(value, w);
    const over = above && key !== 'x';
    shapes.push({
      kind: 'text',
      id: `${key}-label`,
      x: over ? x0 : x0 - 12,
      y: over ? y - 6 : y + CELL / 2 + 5,
      text: label,
      size: 13,
      anchor: over ? 'start' : 'end',
      mono: true,
      cls: 'label',
    });
    for (let i = 0; i < w; i++) {
      const b = bits[w - 1 - i]!;
      const id = `${key}-${i}`;
      shapes.push({
        kind: 'rect',
        id,
        x: colX(i),
        y,
        w: CELL,
        h: CELL,
        role: roles.get(id),
        cls: live && b === '1' ? 'cell live' : 'cell',
      });
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: colX(i) + CELL / 2,
        y: y + CELL / 2 + 7,
        text: b,
        size: 19,
        anchor: 'middle',
        weight: b === '1' ? 'bold' : 'normal',
        mono: true,
        role: b === '1' ? undefined : 'stale',
      });
    }
    shapes.push({
      kind: 'text',
      id: `${key}-dec`,
      x: right + 12,
      y: y + CELL / 2 + 5,
      text: `= ${value}`,
      size: 14,
      mono: true,
    });
  };

  drawRow('x', TOP, 'x', state.x, true);
  shapes.push({
    kind: 'text',
    id: 'x-set',
    x: x0,
    y: TOP + CELL + 20,
    text: `set ${setText(state.x)}`,
    size: 13,
    mono: true,
    cls: 'label',
  });
  (extra.rows ?? []).slice(0, MAX_ROWS).forEach((r, k) => {
    drawRow(`row${k}`, frame.rowsTop + k * frame.row, r.label, r.value, false);
  });

  if (extra.out !== undefined) {
    const { x: ox, y: oy } = frame.out;
    shapes.push({
      kind: 'rect',
      id: 'out-box',
      x: ox,
      y: oy,
      w: 64,
      h: CELL,
      r: 8,
      cls: 'ghost',
      role: roles.get('out'),
    });
    shapes.push({
      kind: 'text',
      id: 'out-label',
      x: ox + 32,
      y: oy - 8,
      text: 'returns',
      size: 13,
      anchor: 'middle',
      cls: 'label',
    });
    shapes.push({
      kind: 'text',
      id: 'out',
      x: ox + 32,
      y: oy + CELL / 2 + 7,
      text: extra.out,
      size: 18,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get('out'),
    });
  }

  const { x: listX, y: listTop } = frame.list;
  const bits = state.listBits || w;
  const entryText = (m: number) => `${bin(m, bits)} ${setText(m)}`;
  const colW = colWidth(state);
  if (state.listOf) {
    shapes.push({
      kind: 'text',
      id: 'list-title',
      x: listX,
      y: listTop,
      text: `${state.list.length} ${state.listOf}`,
      size: 13,
      cls: 'label',
    });
    state.list.forEach((m, k) => {
      shapes.push({
        kind: 'text',
        id: `out-${k}`,
        x: listX + Math.floor(k / LIST_ROWS) * colW,
        y: listTop + 24 + (k % LIST_ROWS) * LIST_PITCH,
        text: entryText(m),
        size: LIST_SIZE,
        mono: true,
        role: roles.get(`out-${k}`),
      });
    });
  }

  return { shapes, bounds: frame.bounds, label: describe(state) };
}
