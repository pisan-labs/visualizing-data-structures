/**
 * The n-gram model: a strip of tokens (a sentence with its <s> and </s> markers, the window of n
 * tokens being counted or scored, and under each scored token its probability), and a table of
 * bars: the most common n-grams while counting, or the words after a context with their counts
 * and probabilities. For a draw the bars slide end to end so they tile 0 to 1, and the line of u
 * crosses the word picked. With nothing run, the corpus itself.
 *
 * A laptop puts the strip left of the table; a phone puts it on top. Both keep room for the
 * largest table and the longest strip an operation can make, so the camera stays still.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { CORPUS } from '../_lm/corpus';
import { short } from '../_lm/numbers';
import { drawTable, ROW_H, ZOOM_PAD, type Column, type Row } from '../_decode/bars';
import { shadeOf } from '../_matrix/matrix';
import {
  countsFor,
  describe,
  keyOf,
  orderOf,
  pictureOf,
  type Dist,
  type LmExtra,
  type LmSettings,
  type LmState,
  type Strip,
  type Table,
} from './model';

const CELL = 66;
const CELL_H = 34;
const P_H = 28;
const GAP = 4;
const TRACK = 200;
/** Room after a bar for ".91 in all". */
const ROOM = 96;
/** The most rows a table has: nine words seen after "the", and the unseen ones. */
const MAX_ROWS = 10;
const WORD_LABEL_W = 9 * 9 + 14;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

/** The strip at (x, y), `per` cells to a row, with room kept for `reserve` cells. */
function drawStrip(
  st: Strip,
  roles: ReadonlyMap<string, MarkRole>,
  x: number,
  y: number,
  per: number,
  reserve: number,
): Block {
  const shapes: Shape[] = [];
  const cells = st.tokens.length + (st.ask ? 1 : 0);
  const rowH = CELL_H + (st.probs ? P_H + 2 : 0) + 10;
  const place = (i: number) => ({
    cx: x + (i % per) * (CELL + GAP),
    cy: y + Math.floor(i / per) * rowH,
  });
  for (let i = 0; i < cells; i++) {
    const { cx, cy } = place(i);
    const id = `s-${i}`;
    const asking = i === st.tokens.length;
    const inWindow = st.window && i >= st.window[0] && i <= st.window[1];
    const role =
      roles.get(id) ?? (inWindow ? (i === st.window![1] ? 'active' : 'compare') : undefined);
    shapes.push({
      kind: 'rect',
      id,
      x: cx,
      y: cy,
      w: CELL,
      h: CELL_H,
      r: 3,
      cls: asking ? 'ghost' : 'live',
      role,
    });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: cx + CELL / 2,
      y: cy + CELL_H / 2 + 5,
      text: asking ? '?' : st.tokens[i]!,
      size: 15,
      anchor: 'middle',
      weight: asking ? 'normal' : 'bold',
      mono: true,
      cls: asking || st.tokens[i]!.startsWith('<') ? 'label' : undefined,
    });
    const p = st.probs?.[i];
    if (st.probs && p !== undefined && p !== null) {
      const pid = `sp-${i}`;
      shapes.push({
        kind: 'rect',
        id: pid,
        x: cx + 6,
        y: cy + CELL_H + 2,
        w: CELL - 12,
        h: P_H,
        r: 2,
        cls: 'live',
        shade: p > 0 ? shadeOf(p, 1) : undefined,
        role: roles.get(pid) ?? (p === 0 ? 'error' : undefined),
      });
      shapes.push({
        kind: 'text',
        id: `${pid}-t`,
        x: cx + CELL / 2,
        y: cy + CELL_H + 2 + P_H / 2 + 5,
        text: short(p),
        size: 14,
        anchor: 'middle',
        mono: true,
        role: p === 0 ? 'error' : undefined,
      });
    }
  }
  const n = Math.max(cells, reserve, 1);
  const rows = Math.ceil(n / per);
  const w = Math.min(n, per) * (CELL + GAP) - GAP;
  return { shapes, bounds: { x, y, w, h: rows * rowH - 10 } };
}

function distTable(t: Extract<Table, { kind: 'counts' | 'probs' }>): {
  rows: Row[];
  cols: Column[];
  u?: number;
} {
  const d: Dist = t.dist;
  const rows: Row[] = d.seen.map((r) => ({ key: keyOf(r.word), label: r.word }));
  if (d.unseen.length) rows.push({ key: 'unseen', label: `${d.unseen.length} unseen` });
  const counts = rows.map((r, i) => (i < d.seen.length ? d.seen[i]!.count : 0));
  const ctx = d.context.join(' ');
  const c: Column = {
    kind: 'cells',
    id: 'c',
    title: 'C',
    w: 48,
    cell: (r) => ({ text: String(counts[r]), dim: counts[r] === 0 }),
  };
  if (t.kind === 'counts') {
    const top = Math.max(1, ...counts);
    return {
      rows,
      cols: [
        c,
        {
          kind: 'bars',
          id: 'p',
          title: `C(${ctx} w)`,
          track: TRACK,
          bar: (r) => ({ value: counts[r]! / top, text: '' }),
        },
      ],
    };
  }
  const unseenMass = d.pUnseen * d.unseen.length;
  const mass = (r: number) => (r < d.seen.length ? d.seen[r]!.p : unseenMass);
  // Stacked for a draw: the bars in draw order, the unseen words last.
  const from: number[] = [];
  let cum = 0;
  rows.forEach((_, r) => {
    from.push(cum);
    cum += mass(r);
  });
  const stacked = t.u !== undefined;
  const picked = t.pick === undefined ? -1 : d.seen.findIndex((r) => r.word === t.pick);
  return {
    rows,
    cols: [
      c,
      {
        kind: 'bars',
        id: 'p',
        title: `P(w | ${ctx})`,
        track: TRACK,
        room: ROOM,
        draws: true,
        bar: (r) => {
          const m = mass(r);
          const text = r < d.seen.length ? short(m) : m > 0 ? `${short(m)} in all` : '0';
          return { value: m, text, offset: stacked ? from[r] : 0, dim: m === 0 };
        },
        u:
          stacked && t.u !== undefined
            ? {
                value: t.u,
                label: `u = ${t.u.toFixed(3)}${picked < 0 && t.pick ? ` → ${t.pick}` : ''}`,
                rows: [0, rows.length - 1],
              }
            : undefined,
      },
    ],
  };
}

function topTable(t: Extract<Table, { kind: 'top' }>): { rows: Row[]; cols: Column[] } {
  const rows = t.rows.map(([g]) => ({ key: keyOf(g), label: g }));
  return {
    rows,
    cols: [
      {
        kind: 'bars',
        id: 'p',
        title: 'count',
        track: TRACK,
        bar: (r) => ({ value: t.rows[r]![1] / t.max, text: String(t.rows[r]![1]) }),
      },
    ],
  };
}

function drawCorpus(per: number, top: number): Block {
  const shapes: Shape[] = [];
  const colW = 340;
  const lineH = 24;
  const rows = Math.ceil(CORPUS.length / per);
  CORPUS.forEach((s, i) => {
    shapes.push({
      kind: 'text',
      id: `corpus-${i}`,
      x: Math.floor(i / rows) * colW,
      y: top + 30 + (i % rows) * lineH,
      text: s,
      size: 15,
      mono: true,
    });
  });
  shapes.push({
    kind: 'text',
    id: 'corpus-title',
    x: 0,
    y: top + 4,
    text: `the corpus: ${CORPUS.length} sentences`,
    size: 15,
    weight: 'bold',
    mono: true,
  });
  return {
    shapes,
    bounds: padBounds({ x: 0, y: 0, w: per * colW - 20, h: top + 30 + rows * lineH }, 12),
  };
}

export function view(step: Step<LmState, LmExtra>, settings: LmSettings, stage?: StageSize): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const pic = step.extra?.picture ?? pictureOf(state, settings);
  const label = describe(state, settings);
  const n = orderOf(settings);

  if (!pic.strip && !pic.table) {
    const best = pickLayout(stage, [drawCorpus(2, 0), drawCorpus(1, 0)]);
    return { shapes: best.shapes, bounds: best.bounds, label };
  }

  const table = pic.table;
  const built = table ? (table.kind === 'top' ? topTable(table) : distTable(table)) : null;
  const labelW =
    table?.kind === 'top'
      ? Math.max(...countsFor(n).ngrams.map(([g]) => g.length)) * 9 + 14
      : WORD_LABEL_W;
  const reserve = pic.strip?.reserve ?? 0;

  const arrange = (side: boolean): Block => {
    const shapes: Shape[] = [];
    const boxes: Bounds[] = [];
    const top = stage?.strip ? 0 : ZOOM_PAD;
    let tx = 0;
    let ty = top;
    if (pic.strip) {
      const per = 6;
      const s = drawStrip(pic.strip, roles, 0, side ? 0 : top, per, reserve);
      shapes.push(...s.shapes);
      boxes.push(s.bounds);
      if (side) tx = s.bounds.w + 36;
      else ty = s.bounds.y + s.bounds.h + 26;
    }
    if (built) {
      const t = drawTable([built.cols], built.rows, roles, { labelW, top: ty, stage });
      shapes.push(...t.shapes.map((sh) => shift(sh, tx)));
      boxes.push({
        ...t.bounds,
        x: t.bounds.x + tx + 12,
        y: t.bounds.y + 12,
        w: t.bounds.w - 24,
        h: t.bounds.h - 24,
      });
      // The largest table this page draws, so the frame holds still.
      boxes.push({
        x: tx,
        y: ty,
        w: labelW + 48 + 18 + TRACK + ROOM,
        h: 28 + MAX_ROWS * ROW_H + 24,
      });
    }
    boxes.push({ x: 0, y: 0, w: 1, h: 1 });
    return { shapes, bounds: padBounds(unionBounds(...boxes), 12) };
  };
  const best = pickLayout(stage, [arrange(true), arrange(false)]);
  return { shapes: best.shapes, bounds: best.bounds, label };
}

function shift(s: Shape, dx: number): Shape {
  if (dx === 0) return s;
  if (s.kind === 'arrow') return { ...s, x1: s.x1 + dx, x2: s.x2 + dx };
  if (s.kind === 'polygon') return { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y })) };
  return { ...s, x: s.x + dx };
}
