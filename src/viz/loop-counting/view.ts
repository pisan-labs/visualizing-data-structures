import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { fitScore } from '../../layouts/graph';
import { gridScene } from '../../layouts/grid';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { zoomCorner } from '../../render/stage';
import {
  bigO,
  commas,
  describe,
  patternOf,
  plugText,
  ratioText,
  relation,
  type GrowState,
  type LcSettings,
  type LcState,
  type RunState,
} from './model';
import { DOUBLING, type Found, type Frame, type Pattern } from './patterns';

/** Width of a monospace character in em, a little over 0.6 so wider fonts still fit. */
const MONO = 0.63;
const M = 14;
const GAP = 18;

interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

// ----- The code card -----

const CARD = { size: 15, pitch: 26, pad: 12 };

/** The loops as code, with the counted line boxed and bold. Shapes start with "code-". */
function cardBlock(p: Pattern): Block {
  const lines = p.card.map((id) => p.lines.find((l) => l.id === id)!);
  const base = Math.min(...lines.map((l) => l.indent));
  const ch = CARD.size * MONO;
  const cols = lines.map((l) => 2 * (l.indent - base) + l.text.length);
  const w = Math.max(...cols) * ch + 2 * CARD.pad;
  const h = lines.length * CARD.pitch + 2 * CARD.pad;
  const shapes: Shape[] = [{ kind: 'rect', id: 'code-box', x: 0, y: 0, w, h, r: 6 }];
  lines.forEach((l, k) => {
    const top = CARD.pad + k * CARD.pitch;
    const counted = p.counted.includes(l.id);
    if (counted) {
      shapes.push({
        kind: 'rect',
        id: `code-hl-${k}`,
        x: CARD.pad / 2,
        y: top + 1,
        w: w - CARD.pad,
        h: CARD.pitch - 2,
        r: 4,
        role: 'done',
      });
    }
    shapes.push({
      kind: 'text',
      id: `code-${k}`,
      x: CARD.pad + 2 * (l.indent - base) * ch,
      y: top + CARD.pitch / 2 + CARD.size * 0.36,
      text: l.text,
      size: CARD.size,
      mono: true,
      weight: counted ? 'bold' : 'normal',
    });
  });
  return { shapes, w, h };
}

// ----- The readout panel -----

interface Row {
  id: string;
  text: string;
  size?: number;
  bold?: boolean;
  cls?: string;
}

const PANEL = { size: 15, pitch: 26, big: 22 };

/** Every row the run's panel will show by its end. */
function runRows(p: Pattern, n: number, f: Found, count: number): Row[] {
  const exact = p.exact(n, f);
  const ex = p.expand(f);
  const rows: Row[] = [{ id: 'f-count', text: `count = ${count}`, bold: true }];
  rows.push({ id: 'f-formula', text: `T(n) = ${p.formula(f)}` });
  if (p.where) rows.push({ id: 'f-where', text: p.where, cls: 'label' });
  rows.push({
    id: 'f-plug',
    text: `T(${n}) = ${plugText(p, n, f)} ${exact === count ? '✓' : '≠ count'}`,
  });
  if (ex) rows.push({ id: 'f-expand', text: `T(n) ${relation(ex)}` });
  rows.push({ id: 'f-drop', text: p.dropShort(f), cls: 'label' });
  rows.push({ id: 'f-bigo', text: bigO(p.order(f)), size: PANEL.big, bold: true });
  return rows;
}

const RUN_SHOWS: Record<RunState['phase'], (id: string) => boolean> = {
  run: (id) => id === 'f-count',
  counted: (id) => id === 'f-count',
  formula: (id) => ['f-count', 'f-formula', 'f-where', 'f-plug'].includes(id),
  bigO: () => true,
};

function growRows(p: Pattern, f: Found, g: GrowState, last: string): Row[] {
  const order = p.order(f);
  return [
    { id: 'f-formula', text: `T(n) = ${p.formula(f)}` },
    { id: 'f-ratio', text: `n ×2: count ${last}` },
    { id: 'f-verdict', text: DOUBLING[order], cls: 'label' },
    { id: 'f-bigo', text: bigO(order), size: PANEL.big, bold: true },
  ].filter((r) => r.id === 'f-formula' || (r.id === 'f-ratio' ? g.counts.length > 1 : g.done));
}

/**
 * The rows `shown`, each at its place among `all` (the rows at the end of the operation), so
 * rows never move and the panel's size holds for the whole operation.
 */
function panelBlock(all: Row[], shown: Row[], roles: ReadonlyMap<string, MarkRole>): Block {
  const shapes: Shape[] = [];
  let y = 0;
  const place = new Map<string, number>();
  for (const r of all) {
    const size = r.size ?? PANEL.size;
    y += size === PANEL.size ? PANEL.pitch : PANEL.pitch + (size - PANEL.size) * 1.4;
    place.set(r.id, y - 8);
  }
  for (const r of shown) {
    shapes.push({
      kind: 'text',
      id: r.id,
      x: 0,
      y: place.get(r.id) ?? 0,
      text: r.text,
      size: r.size ?? PANEL.size,
      mono: true,
      weight: r.bold ? 'bold' : 'normal',
      cls: roles.has(r.id) ? undefined : r.cls,
      role: roles.get(r.id),
    });
  }
  const w = Math.max(...all.map((r) => r.text.length * (r.size ?? PANEL.size) * MONO));
  return { shapes, w, h: y };
}

// ----- The iteration space -----

/** Cell size: big for small n, smaller so 16 columns (or 16 rows) still fit a phone. */
function cellSize(frame: Frame): number {
  if (frame.sliceNames) return Math.max(16, Math.min(28, Math.floor(156 / frame.cols)));
  return Math.max(18, Math.min(40, Math.floor(420 / frame.cols), Math.floor(320 / frame.rows)));
}

/** One grid: the whole iteration space, or one slice of the triple loop's. */
function oneGrid(
  frame: Frame,
  s: number,
  run: RunState,
  roles: ReadonlyMap<string, MarkRole>,
): Block {
  const cell = cellSize(frame);
  const lit = new Set(run.lit.filter((c) => c[0] === s).map((c) => `${c[1]},${c[2]}`));
  const found = run.found && run.found[0] === s ? `${run.found[1]},${run.found[2]}` : null;
  const pre = frame.sliceNames ? `s${s}-` : '';
  const valueSize = Math.min(15, Math.round(cell * 0.46));
  const {
    shapes: out,
    bounds,
    geometry,
  } = gridScene(
    { rows: frame.rows, cols: frame.cols, cell },
    {
      wall: () => false,
      cell: (r, c) => {
        const key = `${r},${c}`;
        return {
          role: key === found ? 'found' : lit.has(key) ? 'done' : undefined,
          text: frame.values?.[c],
          size: valueSize,
        };
      },
      rowNames: frame.rowNames,
      colNames: frame.colNames,
      roles,
      prefix: pre,
    },
  );
  if (frame.corner) {
    out.push({
      kind: 'text',
      id: `${pre}corner`,
      x: geometry.gridLeft - 7,
      y: geometry.gridTop - 8,
      text: frame.corner,
      size: 13,
      anchor: 'end',
      mono: true,
      cls: 'index',
    });
  }
  let h = bounds.h;
  if (frame.caption) {
    out.push({
      kind: 'text',
      id: `${pre}caption`,
      x: geometry.gridLeft,
      y: geometry.gridBottom + 26,
      text: frame.caption,
      size: 15,
      mono: true,
      weight: 'bold',
    });
    h += 30;
  }
  return { shapes: out, w: bounds.w, h };
}

const TITLE = 22;

/** The iteration space: one grid, or for the triple loop one grid per i, `perRow` to a row. */
function spaceBlock(
  frame: Frame,
  run: RunState,
  roles: ReadonlyMap<string, MarkRole>,
  perRow: number,
): Block {
  if (!frame.sliceNames) return oneGrid(frame, 0, run, roles);
  const shapes: Shape[] = [];
  let w = 0;
  let h = 0;
  for (let s = 0; s < frame.slices; s++) {
    const g = oneGrid(frame, s, run, roles);
    const x = (s % perRow) * g.w;
    const y = Math.floor(s / perRow) * (g.h + TITLE);
    const title = `s${s}-title`;
    shapes.push({
      kind: 'text',
      id: title,
      x: x + g.w / 2 + 13,
      y: y + 24,
      text: frame.sliceNames?.[s] ?? '',
      size: 14,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: roles.get(title),
    });
    shapes.push(...translate(g.shapes, x, y + TITLE));
    w = Math.max(w, x + g.w);
    h = Math.max(h, y + TITLE + g.h);
  }
  return { shapes, w, h };
}

// ----- The growth chart -----

const CHART = { left: 16, pitch: 86, bar: 52, top: 50, height: 170 };

function chartBlock(g: GrowState, roles: ReadonlyMap<string, MarkRole>): Block {
  const shapes: Shape[] = [];
  const base = CHART.top + CHART.height;
  const max = Math.max(1, ...g.counts);
  const right = CHART.left + g.sizes.length * CHART.pitch;
  shapes.push({
    kind: 'arrow',
    id: 'g-axis',
    x1: CHART.left - 6,
    y1: base,
    x2: right,
    y2: base,
    head: 'none',
  });
  g.sizes.forEach((m, k) => {
    const cx = CHART.left + k * CHART.pitch + CHART.pitch / 2;
    shapes.push({
      kind: 'text',
      id: `g-n-${k}`,
      x: cx,
      y: base + 22,
      text: `n = ${m}`,
      size: 13,
      anchor: 'middle',
      mono: true,
    });
    const t = g.counts[k];
    if (t === undefined) return;
    const h = t === 0 ? 0 : Math.max(2, (t / max) * CHART.height);
    const id = `g-bar-${k}`;
    shapes.push({
      kind: 'rect',
      id,
      x: cx - CHART.bar / 2,
      y: base - h,
      w: CHART.bar,
      h,
      r: 3,
      cls: 'live',
      role: roles.get(id) ?? 'done',
      enterFrom: { x: cx, y: base },
    });
    shapes.push({
      kind: 'text',
      id: `g-val-${k}`,
      x: cx,
      y: base - h - 8,
      text: commas(t),
      size: 13,
      anchor: 'middle',
      mono: true,
    });
    if (k > 0) {
      const rid = `g-ratio-${k}`;
      shapes.push({
        kind: 'text',
        id: rid,
        x: cx,
        y: 20,
        text: ratioText(g.counts[k - 1]!, t),
        size: 14,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(rid),
      });
    }
  });
  return { shapes, w: right + 10, h: base + 34 };
}

// ----- Putting the parts together -----

type Arrangement = 'right' | 'under' | 'left';

interface Placed {
  shapes: Shape[];
  bounds: Bounds;
}

/**
 * The card, the main picture and the panel placed for one arrangement. `right`: the panel right
 * of the picture, both under the card. `under`: all three in a column (a phone). `left`: the
 * card and the panel in a column left of the picture (a wide, short stage). On a stage, the
 * whole drawing moves down when something would sit under the zoom buttons (not on a phone,
 * where they have a strip of their own).
 */
function arrange(
  card: Block,
  main: Block | null,
  panel: Block | null,
  arr: Arrangement,
  stage: StageSize | undefined,
): Placed {
  const boxes: { b: Block; x: number; y: number }[] = [{ b: card, x: M, y: M }];
  if (main && panel) {
    const below = M + card.h + GAP;
    if (arr === 'right') {
      boxes.push({ b: main, x: M, y: below });
      boxes.push({ b: panel, x: M + main.w + 26, y: below + 26 });
    } else if (arr === 'under') {
      boxes.push({ b: main, x: M, y: below });
      boxes.push({ b: panel, x: M, y: below + main.h + GAP });
    } else {
      boxes.push({ b: panel, x: M, y: below + 8 });
      boxes.push({ b: main, x: M + Math.max(card.w, panel.w) + 28, y: M });
    }
  }
  const size = (dy: number) => ({
    x: 0,
    y: 0,
    w: Math.max(...boxes.map((p) => p.x + p.b.w)) + M,
    h: Math.max(...boxes.map((p) => p.y + p.b.h)) + M + dy,
  });
  // Move everything down until nothing near the top reaches under the zoom buttons.
  let dy = 0;
  const corner = stage && zoomCorner(stage);
  if (stage && corner) {
    for (let k = 0; k < 4; k++) {
      const b = size(dy);
      const s = fitScore(b, stage);
      const margin = Math.max(0, (stage.w - b.w * s) / 2);
      const under = boxes.some(
        (p) => margin + (p.x + p.b.w) * s > stage.w - corner.w && (p.y + dy) * s < corner.h,
      );
      if (!under) break;
      const need = Math.max(...boxes.map((p) => corner.h / s - p.y));
      dy = Math.max(dy + 4, need);
    }
  }
  return {
    shapes: boxes.flatMap((p) => translate(p.b.shapes, p.x, p.y + dy)),
    bounds: size(dy),
  };
}

/**
 * Draw a step: the code card, then the iteration space (or the growth chart) with the readout
 * panel. With a stage, the arrangement that draws largest on it. Every part keeps its size
 * through an operation, so the choice holds for a run.
 */
export function view(
  step: Step<LcState, undefined>,
  settings: LcSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const p = patternOf(settings);
  const f = settings.found;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const card = cardBlock(p);
  const label = describe(s, settings);
  const arrangements: Arrangement[] = stage ? ['right', 'under', 'left'] : ['right'];

  if (s.run) {
    const r = s.run;
    const frame = p.frame(r.n, f);
    const all = runRows(p, r.n, f, p.exact(r.n, f));
    const now = runRows(p, r.n, f, r.count).filter((row) => RUN_SHOWS[r.phase](row.id));
    const panel = panelBlock(all, now, roles);
    const perRows = frame.sliceNames
      ? [...new Set([Math.min(3, frame.slices), ...(stage ? [frame.slices, 2] : [])])]
      : [1];
    const options: Placed[] = [];
    for (const perRow of perRows) {
      const main = spaceBlock(frame, r, roles, perRow);
      for (const a of arrangements) options.push(arrange(card, main, panel, a, stage));
    }
    return { ...pickLayout(stage, options), label };
  }

  if (s.grow) {
    const g = s.grow;
    const last =
      g.counts.length > 1 ? ratioText(g.counts.at(-2)!, g.counts.at(-1)!) : ratioText(1, 1);
    // Room for the longest ratio the panel can show: ratios stay under 10.
    const all = growRows(p, f, { ...g, counts: [1, 1], done: true }, 'up from 0');
    const panel = panelBlock(all, growRows(p, f, g, last), roles);
    const main = chartBlock(g, roles);
    return {
      ...pickLayout(
        stage,
        arrangements.map((a) => arrange(card, main, panel, a, stage)),
      ),
      label,
    };
  }

  return { ...arrange(card, null, null, 'right', stage), label };
}
