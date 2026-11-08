import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP, zoomCorner } from '../../render/stage';
import {
  advance,
  attacker,
  describe,
  init,
  type QueenExtra,
  type QueenSettings,
  type QueenState,
} from './model';

const CELL = 34;
const LABELS = 22;
const MINI = 5;
const STRIP_COLS = 6;
/** The drawing keeps at most this many found solutions. */
const KEEP = 12;

/** How many solutions each board size has, worked out once by running the search. */
const totals = new Map<number, number>();
function totalSolutions(n: number): number {
  if (!totals.has(n)) {
    let s = init({ n, goal: 'all' });
    for (;;) {
      const m = advance(s);
      s = m.next;
      if (m.kind === 'over') break;
    }
    totals.set(n, s.solutions);
  }
  return totals.get(n)!;
}

export function view(
  step: Step<QueenState, QueenExtra>,
  settings: QueenSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const n = s.n;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const x0 = LABELS;
  const y0 = LABELS;
  const cx = (c: number) => x0 + c * CELL + CELL / 2;
  const cy = (r: number) => y0 + r * CELL + CELL / 2;
  const full = s.queens.length === n;
  const row = s.queens.length;

  for (let i = 0; i < n; i++) {
    shapes.push({
      kind: 'text',
      id: `collabel-${i}`,
      x: cx(i),
      y: y0 - 7,
      text: String(i + 1),
      size: 11,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
    shapes.push({
      kind: 'text',
      id: `rowlabel-${i}`,
      x: x0 - 7,
      y: cy(i) + 4,
      text: String(i + 1),
      size: 11,
      anchor: 'end',
      cls: 'index',
      mono: true,
    });
  }

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const id = `cell-${r}-${c}`;
      shapes.push({
        kind: 'rect',
        id,
        x: x0 + c * CELL,
        y: y0 + r * CELL,
        w: CELL,
        h: CELL,
        r: 0,
        cls: (r + c) % 2 === 0 ? 'live' : undefined,
        role: roles.get(id),
      });
      // Squares the queens attack, in the rows still to fill: marked with a cross, not only shaded.
      if (r >= row && attacker(s.queens, r, c)) {
        shapes.push({
          kind: 'text',
          id: `x-${r}-${c}`,
          x: cx(c),
          y: cy(r) + 5,
          text: '×',
          size: 15,
          anchor: 'middle',
          cls: 'label',
        });
      } else if (r === row && c < s.from && !full) {
        // A safe square this row already tried: everything below it failed.
        shapes.push({
          kind: 'text',
          id: `tried-${r}-${c}`,
          x: cx(c),
          y: cy(r) + 3,
          text: 'tried',
          size: 10,
          anchor: 'middle',
          cls: 'label',
          mono: true,
        });
      }
    }
  }

  // The row the search works on, and a dead-end row: a dashed frame of four lines (a rectangle
  // with a role would be filled and hide the row).
  const outline = (r: number, role: MarkRole | undefined) => {
    const left = x0 - 3;
    const right = x0 + n * CELL + 3;
    const top = y0 + r * CELL - 3;
    const bottom = y0 + (r + 1) * CELL + 3;
    const frameRole = roles.get(`row-${r}`) ?? role;
    for (const [side, x1, y1, x2, y2] of [
      ['', left, top, right, top],
      ['-b', left, bottom, right, bottom],
      ['-l', left, top, left, bottom],
      ['-r', right, top, right, bottom],
    ] as const) {
      shapes.push({
        kind: 'arrow',
        id: `row-${r}${side}`,
        x1,
        y1,
        x2,
        y2,
        head: 'none',
        dashed: true,
        role: frameRole,
        z: 2,
      });
    }
  };
  if (!s.done && !full) outline(row, extra.deadEnd === row ? 'error' : 'active');
  if (extra.deadEnd !== undefined && extra.deadEnd !== row) outline(extra.deadEnd, 'error');

  s.queens.forEach((c, r) => {
    const from = extra.slidFrom?.row === r ? { x: cx(extra.slidFrom.col), y: cy(r) } : undefined;
    const role = roles.get(`queen-${r}`) ?? (full ? 'found' : undefined);
    shapes.push({
      kind: 'circle',
      id: `queen-${r}`,
      x: cx(c),
      y: cy(r),
      r: CELL * 0.36,
      cls: 'live',
      role,
      z: 3,
      enterFrom: from,
    });
    shapes.push({
      kind: 'text',
      id: `queen-${r}-q`,
      x: cx(c),
      y: cy(r) + 5.5,
      text: 'Q',
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role:
        role === 'error'
          ? 'error'
          : role === 'found'
            ? 'found'
            : role === 'new'
              ? 'new'
              : undefined,
      z: 4,
      enterFrom: from && { x: from.x, y: from.y + 5.5 },
    });
  });

  if (extra.removed) {
    const { row: r, col: c } = extra.removed;
    shapes.push({
      kind: 'circle',
      id: 'queen-gone',
      x: cx(c),
      y: cy(r),
      r: CELL * 0.36,
      cls: 'ghost',
      role: roles.get('queen-gone'),
      z: 3,
    });
  }

  if (extra.trying) {
    const t = extra.trying;
    const by = s.queens[t.by]!;
    // From the edge of the attacking queen to the edge of the square it attacks.
    const ax = cx(by);
    const ay = cy(t.by);
    const bx = cx(t.col);
    const by2 = cy(t.row);
    const len = Math.hypot(bx - ax, by2 - ay) || 1;
    const trim = CELL * 0.38;
    shapes.push({
      kind: 'arrow',
      id: 'attack-line',
      x1: ax + ((bx - ax) / len) * trim,
      y1: ay + ((by2 - ay) / len) * trim,
      x2: bx - ((bx - ax) / len) * trim,
      y2: by2 - ((by2 - ay) / len) * trim,
      role: roles.get('attack-line') ?? 'error',
      z: 5,
    });
    shapes.push({
      kind: 'circle',
      id: 'try',
      x: cx(t.col),
      y: cy(t.row),
      r: CELL * 0.36,
      cls: 'ghost',
      role: 'error',
      z: 3,
    });
    shapes.push({
      kind: 'text',
      id: 'try-q',
      x: cx(t.col),
      y: cy(t.row) + 5.5,
      text: 'Q',
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role: 'error',
      z: 4,
    });
  }

  const boardH = y0 + n * CELL;
  const boardW = x0 + n * CELL + 8;
  let bounds: Bounds = { x: -6, y: -4, w: boardW + 12, h: boardH + 18 };

  // When counting every solution, the ones found so far, as small boards under the big one, or
  // beside it on a wide stage (in fewer columns, so the strip is not wider than it needs).
  if (settings.goal === 'all') {
    const keep = Math.min(KEEP, totalSolutions(n));
    const miniW = n * MINI + 8;
    const strip = (cols: number, left: number, top: number) => {
      const rows = Math.ceil(keep / cols);
      return {
        cols,
        left,
        top,
        bounds: {
          x: -6,
          y: -4,
          w: Math.max(boardW, left + Math.min(keep, cols) * miniW) + 12,
          h: Math.max(boardH + 8, top + 18 + rows * (n * MINI + 8)) + 10,
        },
      };
    };
    const drop = stage && zoomCorner(stage) ? ZOOM_DROP : 0;
    const place = pickLayout(stage, [
      strip(STRIP_COLS, x0, boardH + 14),
      ...[2, 3, 4, 6].map((cols) => strip(cols, boardW + 16, y0 + drop)),
    ]);
    const { cols, left, top } = place;
    bounds = place.bounds;
    shapes.push({
      kind: 'text',
      id: 'found-title',
      x: left,
      y: top + 10,
      text: `solutions found: ${s.solutions}`,
      size: 12,
      cls: 'label',
      mono: true,
    });
    s.found.forEach((sol, k) => {
      const bx = left + (k % cols) * miniW;
      const by = top + 18 + Math.floor(k / cols) * (n * MINI + 8);
      shapes.push({
        kind: 'rect',
        id: `mini-${k}`,
        x: bx,
        y: by,
        w: n * MINI,
        h: n * MINI,
        r: 0,
        cls: 'live',
      });
      sol.forEach((c, r) => {
        shapes.push({
          kind: 'rect',
          id: `mini-${k}-${r}`,
          x: bx + c * MINI + 0.5,
          y: by + r * MINI + 0.5,
          w: MINI - 1,
          h: MINI - 1,
          r: 1,
          role: 'found',
        });
      });
    });
  }

  return { shapes, bounds, label: describe(s) };
}
