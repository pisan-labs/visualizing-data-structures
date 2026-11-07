/**
 * The assignment problem: the bipartite graph on the left (rows A, B, ... down one side,
 * columns 1, 2, ... down the other) and the cost matrix beside or under it, with the row
 * potentials u in a column to its left and the column potentials v in a row above it.
 *
 * During a run each cell shows its cost (M - cost when maximizing) and, small in its corner,
 * its reduced cost c - u - v. The graph shows only the tight cells as edges (dashed), the tree's
 * edges as arrows from row to column, and matched edges as double lines. Before a run the graph
 * shows every pair faintly. Rows in S and columns in T wear a dashed ring in the graph and are
 * colored in the matrix headers; the root is blue.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  VERTEX_R,
  drawGraph,
  drawLegend,
  padBounds,
  placePanels,
  unionBounds,
  type EdgeLook,
  type GraphLayout,
  type GraphLike,
  type VertexLook,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  cellId,
  colName,
  describe,
  describeRun,
  reduced,
  rowName,
  uId,
  vId,
  type HmExtra,
  type HmRun,
  type HmSettings,
  type HmState,
} from './model';

const GAP_Y = 54;
const GAP_X = 150;
const CW = 46;
const CH = 34;

function bipartite(n: number, r: HmRun | undefined): GraphLike {
  const vertices = [
    ...Array.from({ length: n }, (_, i) => rowName(i)),
    ...Array.from({ length: n }, (_, j) => colName(j)),
  ];
  const edges: GraphLike['edges'] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const show =
        !r ||
        r.rowMate[i] === j ||
        (r.phase === 'search' && r.u[i] !== null && reduced(r, i, j) === 0);
      if (show) edges.push({ u: rowName(i), v: colName(j), w: 1 });
    }
  return { directed: false, weighted: false, vertices, edges };
}

function layoutOf(n: number): GraphLayout {
  const pos: GraphLayout['pos'] = {};
  for (let i = 0; i < n; i++) {
    pos[rowName(i)] = { x: 0, y: i * GAP_Y };
    pos[colName(i)] = { x: GAP_X, y: i * GAP_Y };
  }
  const R = VERTEX_R;
  return { pos, r: R, bounds: { x: -R, y: -R, w: GAP_X + 2 * R, h: (n - 1) * GAP_Y + 2 * R } };
}

function text(
  out: Shape[],
  id: string,
  x: number,
  y: number,
  t: string,
  o: Partial<Extract<Shape, { kind: 'text' }>> = {},
) {
  out.push({ kind: 'text', id, x, y, text: t, size: 15, anchor: 'middle', ...o });
}

function drawMatrix(
  out: Shape[],
  s: HmState,
  r: HmRun | undefined,
  roles: ReadonlyMap<string, MarkRole>,
  x: number,
  y: number,
): Bounds {
  const n = s.cost.length;
  const values = r ? r.work : s.cost;
  const nameW = 24;
  const potW = 42;
  const x0 = x + nameW + potW + 8;
  const title = r && r.goal === 'max' ? `M − c, with M = ${r.big}` : r ? 'cost c' : 'cost c[i][j]';
  text(out, 'm-title', x, y + 14, title, { anchor: 'start', size: 14, cls: 'label', mono: true });
  const yNames = y + 24;
  const yV = yNames + 22;
  const y0 = yV + 30;
  const inT = (j: number) => !!r?.T[j];
  const inS = (i: number) => !!r?.S.includes(i);
  // Column headers and v.
  text(out, 'v-label', x + nameW / 2, yV + 18, 'v', { cls: 'label', mono: true });
  for (let j = 0; j < n; j++) {
    const cx = x0 + j * (CW + 2) + CW / 2;
    text(out, `ch-${j}`, cx, yNames + 15, colName(j), {
      weight: 'bold',
      role: roles.get(`ch-${j}`) ?? (inT(j) ? 'visit' : undefined),
    });
    const id = vId(j);
    const role = roles.get(id) ?? (inT(j) ? 'visit' : undefined);
    out.push({ kind: 'rect', id, x: cx - CW / 2, y: yV, w: CW, h: 26, r: 4, cls: 'live', role });
    const val = r?.v[j];
    text(out, `${id}-t`, cx, yV + 18, val === null || val === undefined ? '' : String(val), {
      mono: true,
      size: 14,
      role: role === 'new' ? 'new' : undefined,
    });
  }
  // Rows: name, u, cells.
  text(out, 'u-label', x + nameW + potW / 2, yNames + 15, 'u', { cls: 'label', mono: true });
  for (let i = 0; i < n; i++) {
    const cy = y0 + i * (CH + 2);
    const rowRole =
      roles.get(`rh-${i}`) ?? (r?.root === i ? 'active' : inS(i) ? 'visit' : undefined);
    text(out, `rh-${i}`, x + nameW / 2, cy + CH / 2 + 5.5, rowName(i), {
      weight: 'bold',
      role: r?.scan === i ? 'active' : rowRole,
    });
    const id = uId(i);
    const role = roles.get(id) ?? (inS(i) ? 'visit' : undefined);
    out.push({
      kind: 'rect',
      id,
      x: x + nameW,
      y: cy + 4,
      w: potW,
      h: CH - 8,
      r: 4,
      cls: 'live',
      role,
    });
    const val = r?.u[i];
    text(
      out,
      `${id}-t`,
      x + nameW + potW / 2,
      cy + CH / 2 + 5,
      val === null || val === undefined ? '' : String(val),
      {
        mono: true,
        size: 14,
        role: role === 'new' ? 'new' : undefined,
      },
    );
    for (let j = 0; j < n; j++) {
      const cx = x0 + j * (CW + 2);
      const cid = cellId(i, j);
      const matched = r?.rowMate[i] === j;
      const onPath = r?.path.some(([a, b]) => a === i && b === j);
      const live = r && r.u[i] !== null && r.v[j] !== null;
      const red = live ? reduced(r, i, j) : null;
      const tight = red === 0 && r?.phase === 'search';
      const role =
        roles.get(cid) ?? (onPath ? 'active' : matched ? 'found' : tight ? 'visit' : undefined);
      out.push({ kind: 'rect', id: cid, x: cx, y: cy, w: CW, h: CH, r: 3, cls: 'live', role });
      const v = String(values[i]![j]!);
      text(out, `${cid}-t`, cx + (live ? CW / 2 - 4 : CW / 2), cy + CH / 2 + 5.5, v, {
        size: v.length <= 2 ? 16 : 13,
        weight: matched ? 'bold' : 'normal',
        role: role === 'active' || role === 'error' ? role : undefined,
      });
      if (red !== null) {
        text(out, `${cid}-r`, cx + CW - 4, cy + CH - 4, String(red), {
          size: 11,
          anchor: 'end',
          mono: true,
          cls: red === 0 ? undefined : 'label',
          weight: red === 0 ? 'bold' : 'normal',
        });
      }
    }
  }
  const w = nameW + potW + 8 + n * (CW + 2) - 2;
  const yEnd = y0 + n * (CH + 2) + 6;
  const legend = drawLegend(out, {
    id: 'key',
    items: r
      ? ['corner: reduced cost c − u − v', '0 = tight', '═ matched', '→ tree edge', '- - tight']
      : ['every pair is an edge', 'press Find to start'],
    x,
    y: yEnd,
    maxW: Math.max(w, 230),
  });
  return unionBounds({ x, y, w, h: yEnd - y }, legend);
}

export function view(
  step: Step<HmState, HmExtra>,
  _settings: HmSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const r = extra.run;
  const n = state.cost.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const g = bipartite(n, r);
  const layout = layoutOf(n);
  const look = (v: string): VertexLook | undefined => {
    if (!r) return undefined;
    const i = v.charCodeAt(0) - 65;
    if (i >= 0 && i < 26) {
      if (r.root === i) return 'current';
      return r.S.includes(i) ? 'frontier' : undefined;
    }
    return r.T[Number(v) - 1] ? 'frontier' : undefined;
  };
  const edgeLook = (key: string): EdgeLook | undefined => {
    if (!r) return 'unexamined';
    const [a, b] = key.split('-') as [string, string];
    const i = a.charCodeAt(0) - 65;
    const j = Number(b) - 1;
    if (r.rowMate[i] === j) return undefined;
    if (r.T[j] && r.prev[j] === i) return 'tree';
    return 'seen';
  };
  const drawn = drawGraph(g, layout, {
    roles,
    vertex: look,
    edge: edgeLook,
    parent: (key) => key.split('-')[0],
    weights: false,
  });
  const shapes: Shape[] = [...drawn.shapes];
  // Matched edges get a second line beside the first: a double line.
  if (r)
    r.rowMate.forEach((j, i) => {
      if (j < 0) return;
      const a = layout.pos[rowName(i)]!;
      const b = layout.pos[colName(j)]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const off = 4.5;
      const R = VERTEX_R + 1;
      const key = `e-${rowName(i)}-${colName(j)}`;
      shapes.push({
        kind: 'arrow',
        id: `${key}-m`,
        x1: a.x + ux * R - uy * off,
        y1: a.y + uy * R + ux * off,
        x2: b.x - ux * R - uy * off,
        y2: b.y - uy * R + ux * off,
        head: 'none',
        role: roles.get(key),
      });
    });
  // Side captions.
  shapes.push({
    kind: 'text',
    id: 'g-rows',
    x: 0,
    y: -VERTEX_R - 10,
    text: 'rows',
    size: 13,
    anchor: 'middle',
    cls: 'label',
  });
  shapes.push({
    kind: 'text',
    id: 'g-cols',
    x: GAP_X,
    y: -VERTEX_R - 10,
    text: 'columns',
    size: 13,
    anchor: 'middle',
    cls: 'label',
  });
  const graphBox = unionBounds(drawn.bounds, {
    x: -VERTEX_R - 20,
    y: -VERTEX_R - 24,
    w: GAP_X + 2 * VERTEX_R + 40,
    h: 10,
  });
  const panel = placePanels(shapes, graphBox, stage, (out, x, y) =>
    drawMatrix(out, state, r, roles, x, y),
  );
  const label = r ? `${describe(state)} ${describeRun(r)}` : describe(state);
  return { shapes, bounds: padBounds(unionBounds(graphBox, panel), 14), label };
}
