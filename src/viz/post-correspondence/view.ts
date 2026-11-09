/**
 * The Post correspondence problem: the dominoes in a row (wrapping on a phone), the partial
 * match under them as two rows of symbols, the tops above and the bottoms below, each domino's
 * piece in its own box so you see where the pieces meet, and a status line. The symbols where the
 * longer string runs ahead (the overhang) are blue; the first column where the strings disagree is
 * red. The search's frontier (the queue or the stack, next first) goes beside all that on a wide
 * stage and under it on a tall one.
 *
 * The rows show at most 22 columns (13 on a phone), sliding so the overhang or the disagreement
 * stays in view, with … where columns are left out. Every part keeps its size through a search.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds, placePanels, textWidth, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  dominoId,
  describe,
  overhangText,
  seqText,
  type Domino,
  type Partial,
  type PcpSettings,
  type PcpState,
  type Tried,
} from './model';

const SYM = 17;
const CHAR_W = 11;
const CARD_H = 62;
const CARD_GAP = 10;
const CELL_W = 20;
const ROW_H = 28;
const LABEL_W = 64;
const FRONTIER_ROWS = 6;
const BOX_H = 106;

const wideStage = (stage?: StageSize) => !stage || stage.w >= 1.4 * stage.h;

const cardW = (d: Domino) => Math.max(44, Math.max(d.top.length, d.bottom.length) * CHAR_W + 22);

/** The dominoes, in rows no wider than maxW. */
function drawDominoes(
  out: Shape[],
  ds: readonly Domino[],
  maxW: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  let x = 0;
  let y = 18;
  let right = 0;
  ds.forEach((d, i) => {
    const w = cardW(d);
    if (x > 0 && x + w > maxW) {
      x = 0;
      y += CARD_H + 26;
    }
    const id = dominoId(i);
    const role = roles.get(id);
    out.push({
      kind: 'text',
      id: `${id}-n`,
      x: x + w / 2,
      y: y - 6,
      text: String(i + 1),
      size: 13,
      anchor: 'middle',
      weight: 'bold',
      cls: 'label',
    });
    out.push({ kind: 'rect', id, x, y, w, h: CARD_H, r: 6, cls: 'live', role });
    out.push({
      kind: 'arrow',
      id: `${id}-line`,
      x1: x + 6,
      y1: y + CARD_H / 2,
      x2: x + w - 6,
      y2: y + CARD_H / 2,
      head: 'none',
    });
    const textRole = role === 'error' || role === 'found' ? role : undefined;
    for (const [k, s] of [d.top, d.bottom].entries())
      out.push({
        kind: 'text',
        id: `${id}-${k ? 'b' : 't'}`,
        x: x + w / 2,
        y: y + (k ? CARD_H - 10 : 22),
        text: s,
        size: SYM,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role: textRole,
      });
    x += w + CARD_GAP;
    right = Math.max(right, x - CARD_GAP);
  });
  return { x: 0, y: 0, w: right, h: y + CARD_H };
}

/** The pieces of one string: each domino's part, with the columns it covers. */
function pieces(ds: readonly Domino[], seq: readonly number[], side: 'top' | 'bottom') {
  let at = 0;
  return seq.map((i, j) => {
    const text = ds[i]![side];
    const p = { j, i, from: at, text };
    at += text.length;
    return p;
  });
}

/** The partial match as two rows of symbols, columns [start, start + cols). */
function drawMatch(
  out: Shape[],
  ds: readonly Domino[],
  p: Partial | Tried | null,
  x: number,
  y: number,
  cols: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const width = LABEL_W + cols * CELL_W;
  const seq = p?.seq ?? [];
  const top = p?.top ?? '';
  const bottom = p?.bottom ?? '';
  const n = Math.max(top.length, bottom.length);
  const common = Math.min(top.length, bottom.length);
  const at = p && 'at' in p && p.at !== undefined ? p.at : -1;
  const focus = at >= 0 ? at : common;
  const start = n <= cols ? 0 : Math.max(0, Math.min(focus - 3, n - cols));
  const end = start + cols;
  const row = (k: 0 | 1) => y + 22 + k * (ROW_H + 8);
  out.push({
    kind: 'rect',
    id: 'match-row',
    x,
    y,
    w: width,
    h: BOX_H,
    r: 6,
    cls: 'ghost',
    role: roles.get('match-row'),
  });
  for (const k of [0, 1] as const) {
    const side = k ? 'bottom' : 'top';
    const ry = row(k);
    out.push({
      kind: 'text',
      id: `match-${side}`,
      x: x + 8,
      y: ry + ROW_H / 2 + 5,
      text: side,
      size: 13,
      cls: 'label',
    });
    const text = k ? bottom : top;
    for (const pc of pieces(ds, seq, side)) {
      const a = Math.max(pc.from, start);
      const b = Math.min(pc.from + pc.text.length, end);
      if (a >= b) continue;
      const px = x + LABEL_W + (a - start) * CELL_W;
      const id = `mp-${side}-${pc.j}`;
      out.push({
        kind: 'rect',
        id,
        x: px + 1,
        y: ry,
        w: (b - a) * CELL_W - 2,
        h: ROW_H,
        r: 4,
        cls: 'live',
      });
      // The domino's number on the outer side of its piece.
      if (a === pc.from)
        out.push({
          kind: 'text',
          id: `${id}-n`,
          x: px + ((b - a) * CELL_W) / 2,
          y: k ? ry + ROW_H + 13 : ry - 5,
          text: String(pc.i + 1),
          size: 12,
          anchor: 'middle',
          cls: 'label',
        });
      for (let c = a; c < b; c++) {
        const ahead = c >= common;
        out.push({
          kind: 'text',
          id: `mc-${side}-${c}`,
          x: x + LABEL_W + (c - start + 0.5) * CELL_W,
          y: ry + ROW_H / 2 + 6,
          text: text[c]!,
          size: SYM,
          anchor: 'middle',
          mono: true,
          weight: c === at || ahead ? 'bold' : undefined,
          role: c === at ? 'error' : ahead ? 'active' : undefined,
        });
      }
    }
  }
  if (at >= start && at < end)
    out.push({
      kind: 'rect',
      id: 'mismatch',
      x: x + LABEL_W + (at - start) * CELL_W - 1,
      y: row(0) - 3,
      w: CELL_W + 2,
      h: row(1) + ROW_H + 3 - (row(0) - 3),
      r: 4,
      cls: 'ghost',
      role: 'error',
      z: 1.5,
    });
  if (start > 0 || n > end) {
    const note = `${start > 0 ? `… from column ${start + 1}` : ''}${start > 0 && n > end ? ', ' : ''}${n > end ? `${n - end} more →` : ''}`;
    out.push({
      kind: 'text',
      id: 'match-more',
      x: x + width - 6,
      y: y - 6,
      text: note,
      size: 12,
      anchor: 'end',
      cls: 'label',
    });
  }
  return { x, y: y - 18, w: width, h: BOX_H + 18 };
}

function status(s: PcpState): { text: string; role?: MarkRole } {
  const r = s.search;
  if (r) {
    if (r.over === 'match' && r.found) return { text: `match: ${seqText(r.found)}`, role: 'found' };
    if (r.over === 'empty')
      return r.cut
        ? { text: `no match up to ${r.bound}, ${r.cut} cut off`, role: 'error' }
        : { text: 'no match at any length', role: 'found' };
    if (r.over === 'limit')
      return { text: `gave up after ${r.expanded} partial matches`, role: 'error' };
    const t = r.tried;
    if (t) {
      const v =
        t.verdict === 'dead'
          ? `dead at column ${t.at! + 1}`
          : t.verdict === 'cut'
            ? 'cut off at the bound'
            : t.verdict === 'seen'
              ? 'overhang seen before: skip'
              : `alive, ${overhangText(t)}`;
      return { text: `${seqText(t.seq)}: ${v}`, role: t.verdict === 'dead' ? 'error' : undefined };
    }
    if (r.current)
      return {
        text: r.current.seq.length
          ? `extend ${seqText(r.current.seq)} (${overhangText(r.current)})`
          : 'extend the empty sequence',
      };
    return { text: 'start: the empty sequence' };
  }
  const c = s.check;
  if (c) {
    if (c.verdict === 'dead')
      return { text: `${seqText(c.seq)}: dead at column ${c.at! + 1}`, role: 'error' };
    if (c.verdict === 'match') return { text: `${seqText(c.seq)}: a match`, role: 'found' };
    return { text: `${seqText(c.seq)}: ${overhangText(c)}` };
  }
  return { text: 'no partial match yet' };
}

function drawFrontier(
  out: Shape[],
  s: PcpState,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const r = s.search;
  const dfs = r ? r.method === 'dfs' : false;
  const title = r
    ? `${dfs ? 'Stack, top first' : 'Queue, front first'}: ${r.frontier.length}`
    : 'Queue or stack';
  out.push({
    kind: 'text',
    id: 'fr-title',
    x,
    y: y + 14,
    text: title,
    size: 14,
    cls: 'label',
    role: roles.get('fr-title'),
  });
  const shown = r ? r.frontier.slice(0, FRONTIER_ROWS) : [];
  const lines = shown.map((p) => `${seqText(p.seq)}  ${overhangText(p)}`);
  const w = Math.max(180, textWidth(title, 14), ...lines.map((l) => textWidth(l, 14, true) + 16));
  shown.forEach((p, k) => {
    const id = `fr-${p.seq.join('-') || 'e'}`;
    const ry = y + 24 + k * 26;
    out.push({
      kind: 'rect',
      id,
      x,
      y: ry,
      w,
      h: 22,
      r: 4,
      cls: 'live',
      role: k ? undefined : 'active',
    });
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + 8,
      y: ry + 16,
      text: p.seq.length ? lines[k]! : 'ε (empty)',
      size: 14,
      mono: true,
    });
  });
  const more = r ? r.frontier.length - shown.length : 0;
  if (more > 0)
    out.push({
      kind: 'text',
      id: 'fr-more',
      x: x + 8,
      y: y + 24 + FRONTIER_ROWS * 26 + 12,
      text: `and ${more} more`,
      size: 13,
      cls: 'label',
    });
  if (!r)
    out.push({
      kind: 'text',
      id: 'fr-none',
      x,
      y: y + 40,
      text: 'Press Search to fill it.',
      size: 13,
      cls: 'label',
    });
  return { x, y, w, h: 24 + FRONTIER_ROWS * 26 + 20 };
}

export function view(
  step: Step<PcpState, unknown>,
  _settings: PcpSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const wide = wideStage(stage);
  const cols = wide ? 22 : 13;
  const matchW = LABEL_W + cols * CELL_W;
  const dom = drawDominoes(shapes, s.dominoes, Math.max(matchW, wide ? 560 : 0), roles);
  const my = dom.h + 30;
  const r = s.search;
  const shown = r ? (r.tried ?? r.current) : s.check;
  const m = drawMatch(shapes, s.dominoes, shown, 0, my, cols, roles);
  const st = status(s);
  shapes.push({
    kind: 'text',
    id: 'status',
    x: 0,
    y: my + BOX_H + 22,
    text: st.text,
    size: 15,
    mono: true,
    weight: st.role ? 'bold' : undefined,
    role: roles.get('status') ?? st.role,
  });
  const main = unionBounds(dom, m, { x: 0, y: my + BOX_H, w: matchW, h: 30 });
  const panel = placePanels(shapes, main, stage, (o, x, y) => drawFrontier(o, s, x, y, roles));
  return { shapes, bounds: padBounds(unionBounds(main, panel), 14), label: describe(s) };
}
