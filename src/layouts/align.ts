/**
 * Alignment layout: string matching drawn as one row per alignment. The text is a row of cells
 * with its indices above it; the pattern is a row below it, shifted to the current alignment;
 * earlier alignments stay as faded rows above the current one while there is room, so the
 * drawing reads like the staircase in a textbook. Used by the brute-force, KMP, Boyer-Moore and
 * Rabin-Karp pages; suffix structures can reuse it.
 *
 * Call `alignScene(frame, content)` from a view and wrap the result in a Scene with a label.
 * A table (a prefix function, shift tables) comes from src/layouts/table.ts and goes above the
 * text: reserve room with `frame.above` and `frame.aboveWidth`, then `placeTable` moves the
 * table's shapes into that room. Above, not below: the rows under the text keep room for
 * alignments still to come, and a table under that room would float far from a short search.
 * Empty slots at the bottom also crop away in a still picture (a practice question).
 *
 * - `frame` fixes the framing. Keep it the same for every step of an operation, so the camera
 *   stays still while the pattern slides:
 *   - `cols`: columns of cells, the longer of the text and the pattern.
 *   - `rows`: alignment rows reserved, the current one included (default 4). When there are
 *     more alignments than rows, the oldest drop off the top and the rest move up.
 *   - `pointer`: reserve a lane above the indices for a pointer (the text pointer i).
 *   - `foundLanes`: lanes of bars over the text for the matches found (default 2). Overlapping
 *     matches go in different lanes; with more overlaps than lanes they share.
 *   - `values`: reserve a lane under the text for one value per shift, such as Rabin-Karp's
 *     window hashes, each under the first character of its window.
 *   - `above`, `aboveWidth`: room reserved at the top for a table, and its width.
 * - `content` is what this step shows:
 *   - `text`: the top row, normally the text T. While a table is built from the pattern alone
 *     (KMP's prefix function, a good-suffix table), the pattern takes the top row: set
 *     `textName` to "P" and `textId` to another prefix, so the two rows cross-fade instead of
 *     changing letters in place.
 *   - `pattern` and `rows`: the alignments, oldest first; the last one is the current one.
 *     A row puts P[0] under top-row column `shift`. `cells[j]` says how the comparison at P[j]
 *     came out: 'match' (green), 'mismatch' (red, with a slash through the cell, so it does not
 *     rest on color alone), 'known' (green with a dashed border: known to match without being
 *     compared, as KMP knows after a shift), or nothing (not compared yet). `found` draws the
 *     whole row as a match. `from`..`to` draws only part of the pattern (a prefix under the
 *     suffix it is compared with). `label` goes left of the row ("s = 3") and `by` under it
 *     ("+3", the shift that brought the pattern here). Earlier rows are faded.
 *   - The shift arrow: when the current row has `by` and the row before it is shown, an arrow
 *     in the gap under that row runs from where P[0] was to where it is now.
 *   - `pointer`: a named arrow over a top-row column (i, the next text character to read).
 *   - `pair`: the text column and pattern cell compared now. A dashed guide joins them when
 *     earlier rows sit in between.
 *   - `found`: shifts where the pattern was found, drawn as bars over the text.
 *   - `values`: one value per shift for the value lane, with the lane's name. `tones` color
 *     values that stay colored (a match, a spurious hit) and `dashed` gives some a dashed
 *     border as well.
 *   - `roles`: the step's marks by shape id. A mark beats the color a row's `cells` give.
 *
 * Shape ids (use them as mark ids):
 * - `<textId>-<i>` a top-row cell (textId defaults to "t"), `<textId>-<i>-c` its character,
 *   `<textId>i-<i>` its index, `<textId>-name` the row's name. Marking a cell colors its
 *   character too.
 * - `r<row>-<j>` the cell of P[j] in row `row` (a row's id), `r<row>-<j>-c` its character,
 *   `r<row>-<j>-x` the slash of a mismatch, `r<row>-label` and `r<row>-by`.
 * - `shift` the shift arrow; `ptr` and `ptr-label` the pointer; `pair` the guide.
 * - `found-<s>` the bar of a match at shift s.
 * - `hv-<s>` a value-lane cell, `hv-<s>-t` its value, `hv-name` the lane's name.
 *
 * Sizes are in scene units. The pitch shrinks with the column count, from 48 down to 30 units,
 * so a text of 24 characters is about 800 units wide and its letters stay near 11 px on a
 * phone in portrait (about 362 px of drawing), and bigger on a 1366x768 laptop. A wide, short
 * frame keeps a band at the top empty, clear of the stage's zoom buttons.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export type Cmp = 'match' | 'mismatch' | 'known';

export interface AlignFrame {
  cols: number;
  rows?: number;
  pointer?: boolean;
  foundLanes?: number;
  values?: boolean;
  above?: number;
  aboveWidth?: number;
}

export interface AlignRow {
  /** Identity: the shapes of row `id` are `r<id>-...`. Keep it as the row moves up. */
  id: string | number;
  shift: number;
  /** Pattern positions drawn, inclusive. Default: all of P. */
  from?: number;
  to?: number;
  cells?: readonly (Cmp | null | undefined)[];
  found?: boolean;
  label?: string;
  by?: string;
}

export interface AlignContent {
  text: string;
  textName?: string;
  textId?: string;
  pattern: string;
  rows: readonly AlignRow[];
  pointer?: { name: string; at: number; role?: MarkRole };
  pair?: { i: number; row: string | number; j: number };
  found?: readonly number[];
  values?: {
    name: string;
    items: readonly (string | null | undefined)[];
    /** A color for a value that stays (a match, a spurious hit); marks still win. */
    tones?: readonly (MarkRole | undefined)[];
    /** Values drawn with a dashed border, so their meaning does not rest on color. */
    dashed?: readonly boolean[];
  };
  roles?: ReadonlyMap<string, MarkRole>;
}

export interface AlignGeometry {
  width: number;
  height: number;
  pitch: number;
  cellH: number;
  /** Left edge and center of column c (fractions and columns past the end are fine). */
  left(c: number): number;
  cx(c: number): number;
  /** The text row. */
  textTop: number;
  textBottom: number;
  /** Top of row slot k, 0 nearest the text. */
  rowTop(k: number): number;
  /** Top of the room reserved above the text for a table. */
  aboveTop: number;
  /** Top of the pointer lane. */
  pointerTop: number;
  /** Center of the text row, for centering a table over it. */
  centerX: number;
  /** Rows shown at once. */
  slots: number;
}

const PAD = 12;
/** Clear of the stage's zoom buttons, for wide drawings. */
const PAD_TOP = 46;
const NAME_W = 58;
const MIN_W = 460;
const POINTER_H = 40;
const INDEX_H = 22;
const FOUND_LANE = 7;
const VALUE_H = 36;
const GAP = 14;

/** Column pitch for this many columns: 48 units down to 30. */
export function pitchFor(cols: number): number {
  return Math.max(30, Math.min(48, Math.floor(720 / Math.max(1, cols))));
}

export function alignGeometry(frame: AlignFrame): AlignGeometry {
  const pitch = pitchFor(frame.cols);
  const cellH = pitch <= 36 ? 38 : Math.min(44, pitch);
  const slots = Math.max(1, frame.rows ?? 4);
  const lanes = frame.foundLanes ?? 2;
  const gridW = frame.cols * pitch;
  const natural = NAME_W + gridW + PAD;
  const width = Math.max(MIN_W, natural + PAD, (frame.aboveWidth ?? 0) + 2 * PAD);
  const x0 = (width - natural) / 2 + NAME_W;

  // A wide, short drawing fills the stage's width, so its top right corner sits under the
  // stage's zoom buttons: keep a band clear there. A taller one is drawn narrower than the
  // stage, so the corner is empty anyway.
  const body =
    (frame.above ? frame.above + 12 : 0) +
    (frame.pointer ? POINTER_H : 0) +
    INDEX_H +
    lanes * FOUND_LANE +
    4 +
    cellH +
    (frame.values ? VALUE_H + 4 : 0) +
    GAP +
    slots * (cellH + GAP) -
    GAP +
    2 * PAD;
  let y = body < width * 0.5 ? PAD_TOP : PAD;
  const aboveTop = y;
  if (frame.above) y += frame.above + 12;
  const pointerTop = y;
  if (frame.pointer) y += POINTER_H;
  y += INDEX_H + lanes * FOUND_LANE + 4;
  const textTop = y;
  const textBottom = textTop + cellH;
  y = textBottom + (frame.values ? VALUE_H + 4 : 0) + GAP;
  const rowsTop = y;
  const slotH = cellH + GAP;
  const height = rowsTop + slots * slotH - GAP + PAD;
  return {
    width,
    height,
    pitch,
    cellH,
    left: (c) => x0 + c * pitch,
    cx: (c) => x0 + (c + 0.5) * pitch,
    textTop,
    textBottom,
    rowTop: (k) => rowsTop + k * slotH,
    aboveTop,
    pointerTop,
    centerX: x0 + gridW / 2,
    slots,
  };
}

/** Font size for one character in a cell of this pitch. */
const charSize = (pitch: number) => Math.round(Math.min(28, pitch * 0.84));

/** Font size for a value in the value lane: smaller for longer values. */
const valueSize = (text: string, pitch: number) =>
  Math.max(11, Math.min(22, Math.floor((pitch - 4) / (Math.max(1, text.length) * 0.6))));

const ROLE: Record<Cmp, MarkRole> = { match: 'done', mismatch: 'error', known: 'done' };

/** Greedy lanes for the found bars: a match goes in the first lane it does not overlap. */
function lanesFor(found: readonly number[], m: number, lanes: number): Map<number, number> {
  const ends: number[] = Array(lanes).fill(-Infinity);
  const out = new Map<number, number>();
  [...found]
    .sort((a, b) => a - b)
    .forEach((s, k) => {
      let lane = ends.findIndex((e) => e <= s);
      if (lane < 0) lane = k % lanes;
      ends[lane] = s + m;
      out.set(s, lane);
    });
  return out;
}

export function alignScene(
  frame: AlignFrame,
  content: AlignContent,
): { shapes: Shape[]; bounds: Bounds; geometry: AlignGeometry } {
  const g = alignGeometry(frame);
  const roles = content.roles ?? new Map<string, MarkRole>();
  const shapes: Shape[] = [];
  const { pitch, cellH } = g;
  const cs = charSize(pitch);
  const tid = content.textId ?? 't';
  const lanes = frame.foundLanes ?? 2;
  const nameX = g.left(0) - 10;

  // The top row: name, indices and cells.
  shapes.push({
    kind: 'text',
    id: `${tid}-name`,
    x: nameX,
    y: g.textTop + cellH / 2 + 7,
    text: content.textName ?? 'T',
    size: 22,
    anchor: 'end',
    weight: 'bold',
    mono: true,
    cls: 'label',
  });
  const indexY = g.textTop - lanes * FOUND_LANE - 8;
  [...content.text].forEach((ch, i) => {
    const id = `${tid}-${i}`;
    const role = roles.get(id);
    shapes.push({
      kind: 'text',
      id: `${tid}i-${i}`,
      x: g.cx(i),
      y: indexY,
      text: String(i),
      size: Math.min(18, Math.round(pitch * 0.6)),
      anchor: 'middle',
      mono: true,
      cls: 'index',
      role: roles.get(`${tid}i-${i}`),
    });
    shapes.push({
      kind: 'rect',
      id,
      x: g.left(i),
      y: g.textTop,
      w: pitch,
      h: cellH,
      r: 2,
      cls: 'cell live',
      role,
    });
    shapes.push({
      kind: 'text',
      id: `${id}-c`,
      x: g.cx(i),
      y: g.textTop + cellH / 2 + cs * 0.36,
      text: ch,
      size: cs,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: roles.get(`${id}-c`) ?? role,
    });
  });

  // Matches found: bars over the text, in lanes.
  const m = content.pattern.length;
  const laneOf = lanesFor(content.found ?? [], m, lanes);
  for (const s of content.found ?? []) {
    const lane = laneOf.get(s) ?? 0;
    shapes.push({
      kind: 'rect',
      id: `found-${s}`,
      x: g.left(s) + 3,
      y: g.textTop - 5 - (lane + 1) * FOUND_LANE + 2,
      w: m * pitch - 6,
      h: 4,
      r: 2,
      role: roles.get(`found-${s}`) ?? 'found',
    });
  }

  // The pointer over the top row.
  if (frame.pointer && content.pointer) {
    const p = content.pointer;
    const x = g.cx(p.at);
    const top = g.pointerTop;
    const role = roles.get('ptr') ?? p.role ?? 'active';
    shapes.push({
      kind: 'text',
      id: 'ptr-label',
      x,
      y: top + 16,
      text: p.name,
      size: 21,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role,
    });
    shapes.push({
      kind: 'arrow',
      id: 'ptr',
      x1: x,
      y1: top + 21,
      x2: x,
      y2: indexY - 15,
      role,
    });
  }

  // The value lane, one value per shift.
  if (frame.values && content.values) {
    const y = g.textBottom + 4;
    shapes.push({
      kind: 'text',
      id: 'hv-name',
      x: nameX,
      y: y + VALUE_H / 2 + 6,
      text: content.values.name,
      size: 16,
      anchor: 'end',
      mono: true,
      cls: 'label',
    });
    content.values.items.forEach((v, s) => {
      if (v === null || v === undefined || v === '') return;
      const id = `hv-${s}`;
      const role = roles.get(id) ?? content.values!.tones?.[s];
      const size = valueSize(v, pitch);
      shapes.push({
        kind: 'rect',
        id,
        x: g.left(s) + 2,
        y,
        w: pitch - 4,
        h: VALUE_H - 4,
        r: 6,
        cls: content.values!.dashed?.[s] ? 'cell live ghost' : 'cell live',
        role,
      });
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: g.cx(s),
        y: y + (VALUE_H - 4) / 2 + size * 0.36,
        text: v,
        size,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role: roles.get(`${id}-t`) ?? role,
      });
    });
  }

  // Alignment rows: the most recent ones that fit, oldest at the top.
  const rows = content.rows.slice(-g.slots);
  rows.forEach((row, k) => {
    const current = k === rows.length - 1;
    const opacity = current ? 1 : 0.45;
    const top = g.rowTop(k);
    const from = Math.max(0, row.from ?? 0);
    const to = Math.min(m - 1, row.to ?? m - 1);
    const rid = `r${row.id}`;
    for (let j = from; j <= to; j++) {
      const id = `${rid}-${j}`;
      const cmp = row.cells?.[j] ?? undefined;
      const role = roles.get(id) ?? (row.found ? 'found' : cmp ? ROLE[cmp] : undefined);
      const col = row.shift + j;
      shapes.push({
        kind: 'rect',
        id,
        x: g.left(col),
        y: top,
        w: pitch,
        h: cellH,
        r: 2,
        cls: cmp === 'known' && !row.found ? 'cell live ghost' : 'cell live',
        role,
        opacity,
      });
      shapes.push({
        kind: 'text',
        id: `${id}-c`,
        x: g.cx(col),
        y: top + cellH / 2 + cs * 0.36,
        text: content.pattern[j] ?? '',
        size: cs,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`${id}-c`) ?? role,
        opacity,
      });
      if (cmp === 'mismatch') {
        shapes.push({
          kind: 'arrow',
          id: `${id}-x`,
          x1: g.left(col) + 4,
          y1: top + cellH - 4,
          x2: g.left(col) + pitch - 4,
          y2: top + 4,
          head: 'none',
          role: 'error',
          opacity,
          z: 1.5,
        });
      }
    }
    if (row.label) {
      shapes.push({
        kind: 'text',
        id: `${rid}-label`,
        x: nameX,
        y: top + (row.by && current ? 17 : cellH / 2 + 6),
        text: row.label,
        size: 18,
        anchor: 'end',
        mono: true,
        cls: 'label',
        opacity,
      });
    }
    if (row.by && current) {
      shapes.push({
        kind: 'text',
        id: `${rid}-by`,
        x: nameX,
        y: top + 35,
        text: row.by,
        size: 16,
        anchor: 'end',
        mono: true,
        weight: 'bold',
        role: roles.get(`${rid}-by`) ?? 'active',
      });
    }
  });

  // The shift arrow, under the row before the current one.
  const cur = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  if (cur?.by && prev && prev.shift !== cur.shift) {
    const y = g.rowTop(rows.length - 2) + cellH + GAP / 2;
    shapes.push({
      kind: 'arrow',
      id: 'shift',
      x1: g.left(prev.shift) + 2,
      y1: y,
      x2: g.left(cur.shift) - 1,
      y2: y,
      role: roles.get('shift') ?? 'active',
    });
  }

  // A guide between the text and the pattern cell compared now, past the rows in between.
  if (content.pair) {
    const k = rows.findIndex((r) => r.id === content.pair!.row);
    if (k > 0) {
      const x = g.cx(content.pair.i);
      shapes.push({
        kind: 'arrow',
        id: 'pair',
        x1: x,
        y1: g.textBottom + 2,
        x2: x,
        y2: g.rowTop(k) - 2,
        head: 'none',
        dashed: true,
        role: roles.get('pair'),
        z: 1.6,
      });
    }
  }

  return { shapes, bounds: { x: 0, y: 0, w: g.width, h: g.height }, geometry: g };
}

/** Move shapes by (dx, dy). */
export function translate(shapes: readonly Shape[], dx: number, dy: number): Shape[] {
  return shapes.map((s) => {
    const enterFrom = s.enterFrom && { x: s.enterFrom.x + dx, y: s.enterFrom.y + dy };
    if (s.kind === 'arrow') {
      const via = s.via && { x: s.via.x + dx, y: s.via.y + dy };
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy, via, enterFrom };
    }
    if (s.kind === 'polygon')
      return { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })), enterFrom };
    return { ...s, x: s.x + dx, y: s.y + dy, enterFrom };
  });
}

/** Give every shape id a prefix, so two tables can share a scene. */
export function prefixIds(shapes: readonly Shape[], prefix: string): Shape[] {
  return shapes.map((s) => ({ ...s, id: `${prefix}${s.id}` }));
}

/**
 * Move a table drawn by src/layouts/table.ts so the top of what it draws sits at `top`,
 * centered on `centerX`. `box` is the table's own extent: the left and right of its headers
 * and grid, and the top of its column headers (from its tableGeometry).
 */
export function placeTable(
  shapes: readonly Shape[],
  box: { left: number; right: number; top: number },
  centerX: number,
  top: number,
): Shape[] {
  return translate(shapes, centerX - (box.left + box.right) / 2, top - box.top);
}
