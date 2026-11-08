/**
 * The game drawn top to bottom: the language and p; the string s as tape cells, with a bar over
 * each piece of the split (x, y, z or u, v, x, y, z, each in its own group color) and a ruler
 * under the p symbols the pumped pieces must lie in; the pumped string, its cells colored by the
 * piece they come from and sliding down from them; then the results for each i from 0 to MAX_I,
 * the verdict and, in the prover's role, the adversary's count of splits.
 *
 * Long strings wrap into rows of W cells. W is picked for the stage from a few widths
 * (pickLayout), using sizes that hold for a whole game (the string, and the longest pumped
 * string p allows), so the camera holds still while splits and i's change.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, drawTape } from '../../layouts/tape';
import { textWidth } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { pickLayout } from '../_stage/arrange';
import { MAX_I, PART_NAMES, PUMPED, pieces, splits, type Parts } from './game';
import { lang, show, type Lemma } from './languages';
import {
  COND,
  SHAPE,
  describe,
  pumpedName,
  tryId,
  verdictId,
  type PumpExtra,
  type PumpSettings,
  type PumpState,
} from './model';

type PStep = Step<PumpState, PumpExtra>;

/** Each piece's group color: the pumped pieces orange and pink, the outer ones blue and green. */
const PART_ROLE: Record<string, MarkRole[]> = {
  regular: ['g1', 'g2', 'g3'],
  cf: ['g1', 'g2', 'g5', 'g4', 'g3'],
};

const HEAD = 16;
const SMALL = 13;
const LINE = 22;
const GAP = 12;
const BAR_ROOM = 22;
const RULER_H = 24;
const TRY_W = 30;
const TRY_H = 28;
const BADGE_W = 112;
const BADGE_H = 30;

interface Item {
  id: string;
  text: string;
  size: number;
  bold?: boolean;
  label?: boolean;
}

/** Items left to right, wrapping at `width`; returns the rows used. */
function flow(out: Shape[], items: Item[], x: number, y: number, width: number): number {
  let cx = x;
  let row = 0;
  for (const it of items) {
    const w = textWidth(it.text, it.size, false, it.bold);
    if (cx > x && cx + w > x + width) {
      row++;
      cx = x;
    }
    out.push({
      kind: 'text',
      id: it.id,
      x: cx,
      y: y + row * LINE + 16,
      text: it.text,
      size: it.size,
      weight: it.bold ? 'bold' : undefined,
      cls: it.label ? 'label' : undefined,
      mono: false,
    });
    cx += w + 16;
  }
  return items.length ? row + 1 : 0;
}

const legendCache = new Map<string, number>();

/** The most rows the legend ("s  x = …  y = …  z = …") takes over every legal split of s. */
function legendRoom(s: string, p: number, lemma: Lemma, width: number): number {
  const key = `${s}|${p}|${lemma}|${width}`;
  const hit = legendCache.get(key);
  if (hit !== undefined) return hit;
  const names = PART_NAMES[lemma];
  let most = 1;
  for (const parts of splits(s.length, p, lemma)) {
    const items = pieces(s, parts).map((w, k) => ({
      id: '',
      text: `${names[k]} = ${show(w)}`,
      size: 14,
    }));
    most = Math.max(
      most,
      flow([], [{ id: '', text: 's', size: 15, bold: true }, ...items], 0, 0, width),
    );
  }
  if (legendCache.size > 500) legendCache.clear();
  legendCache.set(key, most);
  return most;
}

/** [from, to) cut into rows of W cells: one segment per row. */
function segments(from: number, to: number, W: number): { row: number; a: number; b: number }[] {
  const out: { row: number; a: number; b: number }[] = [];
  for (let k = from; k < to;) {
    const row = Math.floor(k / W);
    const end = Math.min(to, (row + 1) * W);
    out.push({ row, a: k - row * W, b: end - row * W });
    k = end;
  }
  return out;
}

/** Pitch of one row of pumped cells with its bars; rows of s also keep room for the ruler. */
const ROW_PITCH = BAR_ROOM + CELL_H + 8;
const S_PITCH = BAR_ROOM + CELL_H + RULER_H;

interface Piece {
  k: number;
  copy: number;
  from: number;
  to: number;
}

/** Bars over each piece (and each copy), each with its letter above the first segment. */
function drawBars(
  out: Shape[],
  id: string,
  ps: Piece[],
  names: string[],
  roles: MarkRole[],
  x: number,
  y: number,
  W: number,
  pitch: number,
) {
  for (const p of ps) {
    if (p.to <= p.from) continue;
    const segs = segments(p.from, p.to, W);
    segs.forEach((s, j) => {
      const top = y + s.row * pitch;
      out.push({
        kind: 'arrow',
        id: `${id}-${p.k}-${p.copy}-${j}`,
        x1: x + s.a * CELL_W + 3,
        y1: top + BAR_ROOM - 4,
        x2: x + s.b * CELL_W - 3,
        y2: top + BAR_ROOM - 4,
        head: 'none',
        role: roles[p.k],
      });
    });
    const s0 = segs[0]!;
    out.push({
      kind: 'text',
      id: `${id}-${p.k}-${p.copy}-t`,
      x: x + ((s0.a + s0.b) / 2) * CELL_W,
      y: y + s0.row * pitch + BAR_ROOM - 9,
      text: names[p.k]!,
      size: SMALL,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
    });
  }
}

/** Where piece k starts in s. */
const starts = (parts: Parts) => parts.map((_, k) => parts.slice(0, k).reduce((a, b) => a + b, 0));

function layout(
  step: PStep,
  settings: PumpSettings,
  W: number,
): { shapes: Shape[]; bounds: Bounds } {
  const st = step.state;
  const { lemma } = settings;
  const l = lang(st.lang);
  const names = PART_NAMES[lemma];
  const roles = PART_ROLE[lemma]!;
  const out: Shape[] = [];
  const width = Math.max(W * CELL_W, 300);
  const x0 = 0;
  let y = 0;

  // The language, p and the rule.
  const head: Item[] = [
    { id: 'lang', text: `L = ${l.set}`, size: HEAD, bold: true },
    { id: 'lang-p', text: `p = ${st.p}`, size: HEAD, bold: true },
    { id: 'lang-rule', text: `s = ${SHAPE[lemma]}, ${COND[lemma]}`, size: SMALL, label: true },
  ];
  y += flow(out, head, x0, y, width) * LINE + GAP;

  // The string and its split.
  const s = st.s;
  const parts = step.extra?.look?.parts ?? st.parts;
  const n = s?.length ?? st.p;
  const legend: Item[] = [{ id: 's-label', text: 's', size: 15, bold: true }];
  if (s !== null && parts)
    pieces(s, parts).forEach((w, k) =>
      legend.push({ id: `legend-${k}`, text: `${names[k]} = ${show(w)}`, size: 14 }),
    );
  else
    legend.push({
      id: 'legend-hint',
      text:
        s === null
          ? `pick s in L with |s| ≥ ${st.p}`
          : settings.role === 'defend'
            ? `split s as ${names.join('|')}`
            : 'the adversary splits s',
      size: 14,
      label: true,
    });
  // Room for the longest legend any split of this string needs, so the rows below never move.
  const legendRows = Math.max(
    s === null ? 1 : legendRoom(s, st.p, lemma, width),
    flow(out, legend, x0, y, width),
  );
  y += legendRows * LINE + 4;

  const sTop = y;
  const sRows = Math.ceil(n / W);
  if (s === null) {
    for (let i = 0; i < n; i++)
      out.push({
        kind: 'rect',
        id: `ghost-${i}`,
        x: x0 + (i % W) * CELL_W,
        y: sTop + Math.floor(i / W) * S_PITCH + BAR_ROOM,
        w: CELL_W,
        h: CELL_H,
        cls: 'ghost',
      });
  } else {
    const cellRoles = new Map<string, MarkRole>();
    if (parts) {
      const at = starts(parts);
      parts.forEach((len, k) => {
        for (let j = 0; j < len; j++) cellRoles.set(`s-${at[k]! + j}`, roles[k]!);
      });
      drawBars(
        out,
        'bar',
        parts.map((len, k) => ({ k, copy: 0, from: at[k]!, to: at[k]! + len })),
        names,
        roles,
        x0,
        sTop,
        W,
        S_PITCH,
      );
    }
    for (let r = 0; r < sRows; r++)
      drawTape(out, {
        id: 's',
        x: x0,
        y: sTop + r * S_PITCH + BAR_ROOM,
        cells: [...s],
        from: r * W,
        to: Math.min(n, (r + 1) * W),
        headRoom: 'none',
        roles: cellRoles,
      });
  }

  // The ruler: the p symbols that x and y (or v, x and y) must lie in.
  const rFrom = lemma === 'cf' && parts ? parts[0]! : 0;
  const rTo = Math.min(n, rFrom + st.p);
  const rulerY = (row: number) => sTop + row * S_PITCH + BAR_ROOM + CELL_H + 7;
  const segs = segments(rFrom, rTo, W);
  segs.forEach((sg, j) =>
    out.push({
      kind: 'arrow',
      id: `ruler-${j}`,
      x1: x0 + sg.a * CELL_W + 2,
      y1: rulerY(sg.row),
      x2: x0 + sg.b * CELL_W - 2,
      y2: rulerY(sg.row),
      head: 'both',
    }),
  );
  if (segs.length) {
    const sg = segs[0]!;
    const text = lemma === 'regular' ? `|xy| ≤ p = ${st.p}` : `|vxy| ≤ p = ${st.p}`;
    const w = textWidth(text, 12);
    const mid = x0 + ((sg.a + sg.b) / 2) * CELL_W;
    out.push({
      kind: 'text',
      id: 'ruler-t',
      x: Math.max(x0, Math.min(mid - w / 2, x0 + width - w)),
      y: rulerY(sg.row) + 15,
      text,
      size: 12,
      cls: 'label',
    });
  }
  y = sTop + sRows * S_PITCH + GAP;

  // The pumped string, with room for the longest one this game can make.
  const room = roomFor(step, lemma);
  const wRows = Math.ceil(room / W);
  const shownI = st.i;
  const generic = lemma === 'regular' ? 'xyⁱz' : 'uvⁱxyⁱz';
  const pumpedLabel =
    shownI !== null && st.parts
      ? `${pumpedName(shownI, lemma)} (i = ${shownI})`
      : settings.role === 'defend'
        ? `${generic}: the page picks i`
        : st.parts
          ? `${generic}: your move, pick i`
          : `${generic}: you pick i after the split`;
  out.push({
    kind: 'text',
    id: 'w-label',
    x: x0,
    y: y + 16,
    text: pumpedLabel,
    size: 15,
    weight: 'bold',
  });
  y += LINE + 2;
  const wTop = y;
  if (s !== null && st.parts && shownI !== null) {
    const ps = st.parts;
    const at = starts(ps);
    const cells: { id: string; sym: string; k: number; src: number }[] = [];
    const pcs: Piece[] = [];
    const pumped = PUMPED[lemma];
    ps.forEach((len, k) => {
      const copies = pumped.includes(k) ? shownI : 1;
      for (let c = 0; c < copies; c++) {
        pcs.push({ k, copy: c, from: cells.length, to: cells.length + len });
        for (let j = 0; j < len; j++)
          cells.push({ id: `w-${k}-${c}-${j}`, sym: s[at[k]! + j]!, k, src: at[k]! + j });
      }
    });
    drawBars(out, 'wbar', pcs, names, roles, x0, wTop, W, ROW_PITCH);
    cells.forEach((c, idx) => {
      const cx = x0 + (idx % W) * CELL_W;
      const cy = wTop + Math.floor(idx / W) * ROW_PITCH + BAR_ROOM;
      const sx = x0 + (c.src % W) * CELL_W;
      const sy = sTop + Math.floor(c.src / W) * S_PITCH + BAR_ROOM;
      out.push({
        kind: 'rect',
        id: c.id,
        x: cx,
        y: cy,
        w: CELL_W,
        h: CELL_H,
        role: roles[c.k],
        enterFrom: { x: sx, y: sy },
      });
      out.push({
        kind: 'text',
        id: `${c.id}-t`,
        x: cx + CELL_W / 2,
        y: cy + CELL_H / 2 + 6,
        text: c.sym,
        size: 18,
        anchor: 'middle',
        mono: true,
        enterFrom: { x: sx + CELL_W / 2, y: sy + CELL_H / 2 + 6 },
      });
    });
  }
  y = wTop + wRows * ROW_PITCH + GAP;

  // Results by i, and the adversary's count.
  const results = step.extra?.look?.results ?? st.tried;
  out.push({
    kind: 'text',
    id: 'try-label',
    x: x0,
    y: y + 14 + 20,
    text: 'i',
    size: 15,
    weight: 'bold',
    mono: true,
  });
  for (let i = 0; i <= MAX_I; i++) {
    const tx = x0 + 18 + i * (TRY_W + 4);
    const r = results[i];
    const role: MarkRole | undefined = r === true ? 'found' : r === false ? 'error' : undefined;
    out.push({
      kind: 'text',
      id: `${tryId(i)}-n`,
      x: tx + TRY_W / 2,
      y: y + 12,
      text: String(i),
      size: 12,
      anchor: 'middle',
      cls: 'label',
      mono: true,
    });
    out.push({
      kind: 'rect',
      id: tryId(i),
      x: tx,
      y: y + 16,
      w: TRY_W,
      h: TRY_H,
      r: 4,
      cls: 'live',
      role,
    });
    if (r !== null && r !== undefined)
      out.push({
        kind: 'text',
        id: `${tryId(i)}-t`,
        x: tx + TRY_W / 2,
        y: y + 16 + TRY_H / 2 + 5,
        text: r ? '✓' : '✗',
        size: 15,
        anchor: 'middle',
        role,
      });
  }
  const stripW = 18 + (MAX_I + 1) * (TRY_W + 4);
  const count = step.extra?.count;
  const search = count
    ? `${count.done}/${count.total} splits · ${count.survivors} survive all i`
    : st.search
      ? `${st.search.splits} splits · ${st.search.survivors} survive all i`
      : '';
  const searchFits =
    stripW + 20 + textWidth('9999/9999 splits · 9999 survive all i', SMALL) <= width;
  if (search)
    out.push({
      kind: 'text',
      id: 'search',
      x: searchFits ? x0 + stripW + 20 : x0,
      y: searchFits ? y + 16 + TRY_H / 2 + 5 : y + 16 + TRY_H + 18,
      text: search,
      size: SMALL,
      cls: 'label',
    });
  y += 16 + TRY_H + (searchFits ? 0 : LINE) + GAP;

  // The verdict on the pumped string on show, and who won: beside the badge if the longest fits.
  const winnerFits =
    BADGE_W + 14 + textWidth('The adversary wins this game', 15, false, true) <= width;
  if (st.winner && s !== null && st.parts && st.i !== null) {
    const inL = st.tried[st.i] === true;
    const role: MarkRole = inL ? 'found' : 'error';
    out.push({
      kind: 'rect',
      id: verdictId,
      x: x0,
      y,
      w: BADGE_W,
      h: BADGE_H,
      r: 15,
      cls: 'live',
      role,
    });
    out.push({
      kind: 'text',
      id: `${verdictId}-t`,
      x: x0 + BADGE_W / 2,
      y: y + BADGE_H / 2 + 6,
      text: inL ? '✓ in L' : '✗ not in L',
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role,
    });
    const who =
      st.winner === 'you'
        ? 'You win this game'
        : settings.role === 'prove'
          ? 'The adversary wins this game'
          : 'The page wins this game';
    out.push({
      kind: 'text',
      id: 'winner',
      x: winnerFits ? x0 + BADGE_W + 14 : x0,
      y: winnerFits ? y + BADGE_H / 2 + 6 : y + BADGE_H + 20,
      text: who,
      size: 15,
      weight: 'bold',
    });
  }
  y += BADGE_H + (winnerFits ? 0 : LINE + 4);

  const bounds = padBounds(unionBounds({ x: x0, y: 0, w: width, h: y }), 14);
  return { shapes: out, bounds };
}

/**
 * Cells to keep for the pumped string: its longest, at i = MAX_I, for the split in play or the
 * one the adversary is about to pick; before there is a split, for the longest pumped piece p
 * allows. It holds for a whole game, so the drawing does not move as i changes.
 */
function roomFor(step: PStep, lemma: Lemma): number {
  const st = step.state;
  const n = st.s?.length ?? st.p;
  const parts = st.parts ?? step.extra?.pick;
  const grow = parts ? PUMPED[lemma].reduce((sum, k) => sum + parts[k]!, 0) : st.p;
  return n + (MAX_I - 1) * grow;
}

export function view(step: PStep, settings: PumpSettings, stage?: StageSize): Scene {
  const st = step.state;
  const n = st.s?.length ?? st.p;
  const room = roomFor(step, settings.lemma);
  const natural = Math.min(24, Math.max(10, n, Math.ceil(room / 2)));
  const widths = [natural, ...[10, 12, 16, 20, 24].filter((w) => w !== natural)];
  const best = pickLayout(
    stage,
    widths.map((W) => layout(step, settings, W)),
  );
  return { shapes: best.shapes, bounds: best.bounds, label: describe(st, settings) };
}
