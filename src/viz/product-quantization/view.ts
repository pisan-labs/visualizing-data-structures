/**
 * Product quantization: the stored vectors as a table (their numbers, cut into pieces, their
 * codes, then the reconstruction error or, in a search, the distance by the table next to the
 * exact one), and the codebooks as a table of centres, one column per piece, with the squared
 * distance from the vector being encoded (or the query) to every centre beside it: in a search
 * that column is the distance table. With 2 pieces, each piece's sub-vectors are also drawn on a
 * small plane with its codebook's centres and their cells. A laptop puts the codebooks beside the
 * vectors; a phone puts them under.
 *
 * Shape ids, for marks: r-<id> a vector's row; k<j>-<c> centre c of codebook j; t-<j>-<c> its
 * distance-table entry; s<j>-<id> a vector's piece j on the plane.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { groupRole } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { ZOOM_DROP } from '../../render/stage';
import { text } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { borders } from '../_retrieve3/cells';
import { drawPt, drawWindow, field } from '../_retrieve/draw';
import { dist2 } from './kmeans';
import {
  cellId,
  centreId,
  D,
  decode,
  describe,
  dotId,
  num,
  pieceOf,
  piecesOf,
  rowId,
  sizeOf,
  type PqExtra,
  type PqSettings,
  type PqState,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

const SIZE = 13;
const SMALL = 13;
const ROW_H = 20;
const NAME_W = 26;
const NUM_W = 24;
const GAP = 10;
const CODE_W = 62;
const COL_W = 56;
const UNIT = 15;
const BOX = { xmin: 0, xmax: 10, ymin: 0, ymax: 10 };
const SUB = '₁₂₃₄';

const t = (id: string, x: number, y: number, s: string, o: Parameters<typeof text>[3] = {}) =>
  text(id, { x, y }, s, { size: SIZE, cls: '', ...o });

/** The row roles at the end of a search: found and true, true only (missed), found only. */
function searchRole(s: PqState, i: number): MarkRole | undefined {
  const last = s.last;
  if (!last) return undefined;
  const f = last.found.includes(i);
  const tr = last.truth.includes(i);
  return f && tr ? 'found' : tr ? 'error' : f ? 'compare' : undefined;
}

function drawVectors(s: PqState, m: number, roles: Roles, extra: PqExtra): Block {
  const shapes: Shape[] = [];
  const w = D / m;
  const numX = (k: number) => NAME_W + k * NUM_W + Math.floor(k / w) * GAP;
  const codeX = numX(D - 1) + NUM_W + GAP;
  const c1 = codeX + CODE_W;
  const c2 = c1 + COL_W;
  const width = c2 + COL_W;
  const searching = extra.approx !== undefined || extra.table !== undefined || !!s.last;
  const heads = searching ? ['by table', 'exact'] : s.codes ? ['error', ''] : ['', ''];
  shapes.push(t('vh-n', 2, 14, 'vec', { bold: true }));
  for (let k = 0; k < D; k++)
    shapes.push(
      t(`vh-${k}`, numX(k) + NUM_W / 2, 14, `x${SUB[k]}`, { bold: true, anchor: 'middle' }),
    );
  shapes.push(t('vh-c', codeX + CODE_W / 2, 14, 'code', { bold: true, anchor: 'middle' }));
  heads.forEach((h, k) =>
    shapes.push(t(`vh-x${k}`, (k ? c2 : c1) + COL_W / 2, 14, h, { bold: true, anchor: 'middle' })),
  );
  // A faint line between pieces.
  for (let j = 1; j < m; j++) {
    const x = numX(j * w) - GAP / 2;
    shapes.push({
      kind: 'arrow',
      id: `vs-${j}`,
      x1: x,
      y1: 20,
      x2: x,
      y2: 22 + Math.max(1, s.vecs.length) * ROW_H,
      head: 'none',
      opacity: 0.5,
    });
  }
  const q = extra.q ?? s.last?.q;
  const approx = extra.approx ?? s.last?.approx;
  s.vecs.forEach((v, i) => {
    const y = 22 + i * ROW_H;
    const role =
      roles.get(rowId(v)) ??
      (extra.q === undefined && !extra.approx ? searchRole(s, i) : undefined);
    shapes.push({
      kind: 'rect',
      id: rowId(v),
      x: -2,
      y,
      w: width + 4,
      h: ROW_H,
      r: 2,
      cls: role ? 'live' : 'ghost',
      role,
      opacity: role ? 1 : 0,
    });
    shapes.push(t(`vn-${v.id}`, 4, y + 15, v.name, { bold: true }));
    v.v.forEach((x, k) =>
      shapes.push(
        t(`vv-${v.id}-${k}`, numX(k) + NUM_W / 2, y + 15, String(x), {
          anchor: 'middle',
          mono: true,
        }),
      ),
    );
    const code = s.codes?.[i];
    if (code)
      shapes.push(
        t(`vc-${v.id}`, codeX + CODE_W / 2, y + 15, code.join(' '), {
          anchor: 'middle',
          mono: true,
          bold: true,
        }),
      );
    let cells: string[] = ['', ''];
    if (searching && q) {
      const a = approx?.[i];
      if (a !== undefined) cells = [num(a), num(dist2(q, v.v))];
    } else if (code && s.books.length) cells = [num(dist2(v.v, decode(code, s.books))), ''];
    cells.forEach((c, k) => {
      if (c)
        shapes.push(
          t(`vx-${v.id}-${k}`, (k ? c2 : c1) + COL_W / 2, y + 15, c, {
            anchor: 'middle',
            mono: true,
          }),
        );
    });
  });
  const h = 22 + Math.max(1, s.vecs.length) * ROW_H;
  return { shapes, bounds: { x: 0, y: 0, w: width, h } };
}

/** "1.5, 7.5" for a centre in a cell. */
const centreText = (c: readonly number[]) => c.map(num).join(', ');

function drawBooks(s: PqState, m: number, ks: number, roles: Roles, extra: PqExtra): Block {
  const shapes: Shape[] = [];
  const w = D / m;
  const cw = w === 1 ? 40 : w === 2 ? 84 : 150;
  const dw = 48;
  const codeW = 34;
  const colX = (j: number) => codeW + j * (cw + dw + 6);
  const width = colX(m) - 6;
  // Whose distances fill the d² columns: the vector being encoded, or the query.
  const subject = extra.vec !== undefined && extra.dd ? s.vecs[extra.vec]! : undefined;
  const q = extra.q ?? s.last?.q;
  const table = extra.table ?? s.last?.table;
  const title = subject
    ? `codebooks, d² from ${subject.name}'s pieces`
    : q
      ? 'codebooks, d² from q’s pieces'
      : 'codebooks';
  shapes.push(t('bh', 0, 14, title, { bold: true }));
  const top = 24;
  shapes.push(t('bh-c', 2, top + 14, 'code', { bold: true }));
  for (let j = 0; j < m; j++) {
    shapes.push(
      t(`bh-${j}`, colX(j) + cw / 2, top + 14, m === 1 ? 'centre' : `piece ${j + 1}`, {
        bold: true,
        anchor: 'middle',
      }),
    );
    shapes.push(
      t(`bh-d${j}`, colX(j) + cw + dw / 2, top + 14, 'd²', { bold: true, anchor: 'middle' }),
    );
  }
  const max = table ? Math.max(1e-9, ...table.flat()) : 1;
  for (let c = 0; c < ks; c++) {
    const y = top + 22 + c * ROW_H;
    shapes.push(
      t(`bc-${c}`, codeW / 2, y + 15, String(c), { bold: true, anchor: 'middle', mono: true }),
    );
    for (let j = 0; j < m; j++) {
      const centre = s.books[j]?.[c];
      const kid = centreId(j, c);
      shapes.push({
        kind: 'rect',
        id: kid,
        x: colX(j),
        y,
        w: cw,
        h: ROW_H,
        r: 2,
        cls: 'live',
        role: roles.get(kid),
      });
      if (centre)
        shapes.push(
          t(`${kid}-t`, colX(j) + cw / 2, y + 15, centreText(centre), {
            anchor: 'middle',
            mono: true,
          }),
        );
      let d: number | undefined;
      if (subject && extra.dd) d = extra.dd[j]?.[c];
      else if (table) d = table[j]?.[c];
      const tid = cellId(j, c);
      shapes.push({
        kind: 'rect',
        id: tid,
        x: colX(j) + cw,
        y,
        w: dw,
        h: ROW_H,
        r: 2,
        cls: d === undefined ? 'ghost' : 'live',
        shade: d === undefined || subject ? undefined : Math.max(0, 1 - d / max) * 0.9,
        role: roles.get(tid),
        opacity: d === undefined ? 0.35 : 1,
      });
      if (d !== undefined)
        shapes.push(
          t(`${tid}-t`, colX(j) + cw + dw / 2, y + 15, num(d), { anchor: 'middle', mono: true }),
        );
    }
  }
  return { shapes, bounds: { x: 0, y: 0, w: width, h: top + 22 + ks * ROW_H } };
}

/** With 2 pieces: each piece's sub-vectors on a small plane, with its centres and their cells. */
function drawPlanes(s: PqState, roles: Roles, extra: PqExtra): Block {
  const shapes: Shape[] = [];
  const side = UNIT * 10;
  const q = extra.q ?? s.last?.q;
  for (let j = 0; j < 2; j++) {
    const x0 = j * (side + 22);
    const plane = field(UNIT, x0 + 4, 22);
    drawWindow(shapes, plane, `w${j}`, {
      grid: 2,
      title: `piece ${j + 1}: x${SUB[2 * j]}, x${SUB[2 * j + 1]}`,
      size: SMALL,
    });
    const book = s.books[j] ?? [];
    const cs = book.map((c) => ({ x: c[0]!, y: c[1]! }));
    for (const b of borders(cs, BOX))
      shapes.push({
        kind: 'arrow',
        id: `vb${j}-${b.i}-${b.j}`,
        ...(() => {
          const a = plane.at(b.a);
          const e = plane.at(b.b);
          return { x1: a.x, y1: a.y, x2: e.x, y2: e.y };
        })(),
        head: 'none',
        opacity: 0.55,
      });
    const labels =
      extra.piece === j && extra.labels
        ? extra.labels
        : s.codes
          ? s.codes.map((c) => c[j]!)
          : undefined;
    s.vecs.forEach((v, i) => {
      const p = pieceOf(v.v, 2, j);
      const id = dotId(j, v);
      const current = extra.vec === i;
      const group = labels?.[i] === undefined ? undefined : groupRole(labels[i]! + 1);
      drawPt(shapes, plane, {
        id,
        at: { x: p[0]!, y: p[1]! },
        r: current ? 5 : 3.5,
        role: roles.get(id) ?? (current ? 'active' : group),
        label: current ? v.name : undefined,
        size: SMALL,
        dx: -4,
        dy: -9,
        z: current ? 5 : 3,
      });
    });
    // A centre: a small box under the dots, its code to the right of it.
    book.forEach((c, k) => {
      const at = plane.at({ x: c[0]!, y: c[1]! });
      const id = `kp${j}-${k}`;
      shapes.push({
        kind: 'rect',
        id,
        x: at.x - 7,
        y: at.y - 7,
        w: 14,
        h: 14,
        r: 3,
        cls: 'live',
        role: roles.get(centreId(j, k)) ?? groupRole(k + 1),
        z: 2,
      });
      shapes.push({
        ...text(`${id}-l`, { x: at.x + 12, y: at.y + 4.5 }, String(k), {
          size: SMALL,
          bold: true,
          cls: '',
        }),
        z: 4,
      });
    });
    if (q) {
      const p = pieceOf(q, 2, j);
      const at = plane.at({ x: p[0]!, y: p[1]! });
      shapes.push({
        kind: 'rect',
        id: `qp${j}`,
        x: at.x - 5,
        y: at.y - 5,
        w: 10,
        h: 10,
        r: 1,
        cls: 'live',
        role: 'active',
        z: 5,
      });
    }
  }
  return { shapes, bounds: { x: 0, y: 0, w: 2 * side + 30, h: side + 30 } };
}

export function view(step: Step<PqState, PqExtra>, settings: PqSettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  // Before training, draw for the pieces and codebook size the settings will train with.
  const m = s.m || piecesOf(settings);
  const ks = s.ks || sizeOf(settings);
  const vecs = drawVectors(s, m, roles, extra);
  const books = drawBooks(s, m, ks, roles, extra);
  const planes = m === 2 ? drawPlanes(s, roles, extra) : null;

  const compose = (parts: [Block, number, number][]): Block => {
    const shapes = parts.flatMap(([b, dx, dy]) => translate(b.shapes, dx, dy));
    const x2 = Math.max(...parts.map(([b, dx]) => dx + b.bounds.w));
    const y2 = Math.max(...parts.map(([b, , dy]) => dy + b.bounds.h));
    return { shapes, bounds: { x: -8, y: -8, w: x2 + 16, h: y2 + 16 } };
  };
  const right = (x: number, y: number): [Block, number, number][] =>
    planes
      ? [
          [planes, x, y],
          [books, x, y + planes.bounds.h + 6],
        ]
      : [[books, x, y]];
  // Below the stage's zoom buttons, which sit over the top right corner on a laptop.
  const wide = compose([
    [vecs, 0, 0],
    ...right(vecs.bounds.w + 24, stage?.strip ? 0 : ZOOM_DROP + 6),
  ]);
  const tall = compose([[vecs, 0, 0], ...right(0, vecs.bounds.h + 16)]);
  const best = pickLayout(stage, [wide, tall]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
