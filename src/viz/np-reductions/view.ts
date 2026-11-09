/**
 * NP reductions: either the map (problems as boxes, reductions as arrows; solid ones can be
 * walked here, dashed ones are on the map only) or the current instance: the graph, drawn
 * with src/layouts/graph.ts at fixed positions so nothing moves while a reduction runs, and
 * beside or under it a panel with the question, the clauses or the sets, and the certificate.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import {
  VERTEX_R,
  below,
  drawGraph,
  drawLegend,
  drawRow,
  padBounds,
  placePanels,
  textWidth,
  unionBounds,
  type GraphLayout,
  type GraphLike,
} from '../../layouts/graph';
import { pickLayout } from '../../layouts/arrange';
import { shapesBounds, type Bounds, type Scene, type Shape } from '../../render/scene';
import {
  ARCS,
  MAP,
  NAMES,
  arcId,
  boxId,
  clauseText,
  describe,
  edgeKey,
  kText,
  satisfies,
  type NpExtra,
  type NpSettings,
  type NpState,
  type Pt,
  type UGraph,
} from './model';

const COL = 142;
const ROW = 74;
const BOX_H = 30;
const MAP_TEXT = 14;

/** The map turned on its side, for a tall stage: its rows become columns this far apart. */
const TURNED_COL = 150;
const TURNED_ROW = 84;

/**
 * The map of reductions: columns left to right, or with `turned` top to bottom (a phone draws
 * it larger that way).
 */
function drawMap(s: NpState, roles: Map<string, MarkRole>, extra: NpExtra, turned = false): Scene {
  const shapes: Shape[] = [];
  const at = new Map(
    MAP.map((p) => [
      p.id,
      turned
        ? { x: p.row * TURNED_COL, y: p.col * TURNED_ROW }
        : { x: p.col * COL, y: p.row * ROW },
    ]),
  );
  const width = (name: string) => textWidth(name, MAP_TEXT, true) + 18;
  const half = new Map(MAP.map((p) => [p.id, { w: width(p.name) / 2, h: BOX_H / 2 }]));
  const here = s.inst.problem;
  const walkable = new Set(ARCS.filter((a) => a.walk).flatMap((a) => [a.from, a.to]));
  for (const a of ARCS) {
    const p = at.get(a.from)!;
    const q = at.get(a.to)!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const exit = (id: string) => {
      const h = half.get(id)!;
      const sx = Math.abs(ux) > 1e-9 ? (h.w + 2) / Math.abs(ux) : Infinity;
      const sy = Math.abs(uy) > 1e-9 ? (h.h + 2) / Math.abs(uy) : Infinity;
      return Math.min(sx, sy);
    };
    const a0 = exit(a.from);
    const b0 = exit(a.to) + 2;
    const id = arcId(a.from, a.to);
    shapes.push({
      kind: 'arrow',
      id,
      x1: p.x + ux * a0,
      y1: p.y + uy * a0,
      x2: q.x - ux * b0,
      y2: q.y - uy * b0,
      head: 'end',
      dashed: !a.walk,
      role: roles.get(id),
      opacity: a.walk ? undefined : 0.75,
    });
  }
  for (const p of MAP) {
    const c = at.get(p.id)!;
    const h = half.get(p.id)!;
    const id = boxId(p.id);
    const role = roles.get(id) ?? (p.id === here && !extra.route ? 'active' : undefined);
    shapes.push({
      kind: 'rect',
      id,
      x: c.x - h.w,
      y: c.y - h.h,
      w: 2 * h.w,
      h: BOX_H,
      r: 6,
      cls: walkable.has(p.id) ? 'live' : 'ghost',
      role,
    });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: c.x,
      y: c.y + MAP_TEXT * 0.36,
      text: p.name,
      size: MAP_TEXT,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: role === 'active' || role === 'new' ? role : undefined,
    });
  }
  const maxW = Math.max(...MAP.map((p) => width(p.name)));
  const xs = [...at.values()].map((c) => c.x);
  const ys = [...at.values()].map((c) => c.y);
  const top: Bounds = {
    x: Math.min(...xs) - maxW / 2,
    y: Math.min(...ys) - BOX_H / 2,
    w: Math.max(...xs) - Math.min(...xs) + maxW,
    h: Math.max(...ys) - Math.min(...ys) + BOX_H,
  };
  const legend = drawLegend(shapes, {
    id: 'key',
    items: ['A → B: A reduces to B', 'solid: step through it here', 'dashed: on the map only'],
    x: top.x,
    y: below(top, 16),
    maxW: top.w,
  });
  return {
    shapes,
    bounds: padBounds(unionBounds(top, legend), 14),
    label: describe(s),
  };
}

const layouts = new WeakMap<Record<string, Pt>, GraphLayout>();

function layoutOf(g: UGraph): GraphLayout {
  const hit = layouts.get(g.pos);
  if (hit) return hit;
  const pts = Object.values(g.pos);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const R = VERTEX_R;
  const x = Math.min(...xs) - R;
  const y = Math.min(...ys) - R;
  const layout: GraphLayout = {
    pos: g.pos,
    r: R,
    bounds: { x, y, w: Math.max(...xs) + R - x, h: Math.max(...ys) + R - y },
  };
  layouts.set(g.pos, layout);
  return layout;
}

export function view(
  step: Step<NpState, NpExtra>,
  _settings?: NpSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  if (s.show === 'map')
    return stage
      ? pickLayout(stage, [drawMap(s, roles, extra), drawMap(s, roles, extra, true)])
      : drawMap(s, roles, extra);

  const i = s.inst;
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  const chosen = new Set(extra.chosen ?? i.witness ?? []);
  const covered = new Set(extra.covered ?? []);
  let graphBox: Bounds = { x: 0, y: 0, w: 0, h: 0 };

  const g = i.graph;
  if (g) {
    const layout = layoutOf(g);
    const numbered = i.problem === 'sc';
    const like: GraphLike = {
      directed: false,
      weighted: numbered,
      vertices: g.vertices,
      edges: g.edges.map(([u, v], k) => ({ u, v, w: k + 1 })),
    };
    const vroles = new Map(roles);
    if (i.problem !== '3sat' && i.problem !== 'sc')
      for (const v of chosen) if (!vroles.has(`vx-${v}`)) vroles.set(`vx-${v}`, 'found');
    for (const k of covered) {
      const e = numbered ? g.edges[Number(k) - 1] : undefined;
      const id = `e-${e ? edgeKey(e) : k}`;
      if (!vroles.has(id)) vroles.set(id, 'found');
    }
    const drawn = drawGraph(like, layout, { roles: vroles, weights: numbered });
    // Edges the complement drops, faint and dashed while it is built.
    for (const e of extra.gone ?? []) {
      const a = g.pos[e[0]]!;
      const b = g.pos[e[1]]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      const R = VERTEX_R + 2;
      shapes.push({
        kind: 'arrow',
        id: `gone-${edgeKey(e)}`,
        x1: a.x + ux * R,
        y1: a.y + uy * R,
        x2: b.x - ux * R,
        y2: b.y - uy * R,
        head: 'none',
        dashed: true,
        role: 'remove',
        opacity: 0.45,
      });
    }
    shapes.push(...drawn.shapes);
    // Bent edges can reach past the vertices: keep the panel clear of them.
    graphBox = unionBounds(
      drawn.bounds,
      layout.bounds,
      shapesBounds(drawn.shapes, 4) ?? layout.bounds,
    );
    boxes.push(graphBox);
  }

  const panel = (out: Shape[], x: number, y0: number): Bounds => {
    const parts: Bounds[] = [];
    let y = y0;
    const k = i.problem === '3sat' ? '' : `, k = ${kText(i)}`;
    const head = `${NAMES[i.problem]}${k}`;
    out.push({
      kind: 'text',
      id: 'head',
      x,
      y: y + 15,
      text: head,
      size: 15,
      weight: 'bold',
      mono: true,
    });
    const answer = i.answer
      ? `answer: ${i.answer}`
      : extra.from
        ? `from ${NAMES[extra.from.problem]}${extra.from.problem === '3sat' ? '' : `, k = ${extra.from.k}`}`
        : 'answer: not known yet';
    out.push({
      kind: 'text',
      id: 'sub',
      x,
      y: y + 36,
      text: answer,
      size: 13,
      cls: 'label',
      mono: true,
    });
    parts.push({
      x,
      y,
      w: Math.max(textWidth(head, 15, true), textWidth(answer, 13, true)),
      h: 42,
    });
    y += 52;

    const f = extra.formula ?? i.formula;
    if (f) {
      const assign =
        extra.assign ??
        (i.problem === '3sat' && i.witness ? f.vars.map((v) => i.witness!.includes(v)) : undefined);
      const texts = f.clauses.map((c) => `(${clauseText(f, c)})`);
      const cellW = Math.max(44, ...texts.map((t) => textWidth(t, 13, true) + 14));
      const clauses = drawRow(out, {
        id: 'cl',
        label: 'clauses',
        labelW: 74,
        cells: texts.map((t, j) => ({
          key: String(j),
          text: t,
          role:
            extra.clause === j
              ? 'active'
              : assign && satisfies({ ...f, clauses: [f.clauses[j]!] }, assign)
                ? 'found'
                : undefined,
        })),
        x,
        y,
        roles,
        perRow: Math.max(1, Math.floor(390 / (cellW + 4))),
        cellW,
      });
      parts.push(clauses);
      y = below(clauses, 10);
      if (assign) {
        const row = drawRow(out, {
          id: 'as',
          label: 'values',
          labelW: 74,
          cells: f.vars.map((v, j) => ({ key: v, text: `${v}=${assign[j] ? 'T' : 'F'}` })),
          x,
          y,
          roles,
          cellW: 46,
        });
        parts.push(row);
        y = below(row, 10);
      }
    }

    if (i.family) {
      const fam = i.family;
      const texts = fam.sets.map(
        (st) => `S${st.name} ${st.items.length ? st.items.join(' ') : '∅'}`,
      );
      const cellW = Math.max(60, ...texts.map((t) => textWidth(t, 13, true) + 14));
      const sets = drawRow(out, {
        id: 'sets',
        label: 'sets',
        labelW: 74,
        cells: fam.sets.map((st, j) => ({
          key: st.name,
          text: texts[j]!,
          role: chosen.has(st.name) ? 'found' : undefined,
        })),
        x,
        y,
        roles,
        perRow: Math.max(1, Math.floor(390 / (cellW + 4))),
        cellW,
        empty: 'none yet',
      });
      parts.push(sets);
      y = below(sets, 10);
      const uni = drawRow(out, {
        id: 'U',
        label: 'U',
        labelW: 74,
        cells: Array.from({ length: fam.m }, (_, e) => ({
          key: String(e + 1),
          text: String(e + 1),
          role: covered.has(String(e + 1)) ? 'found' : undefined,
        })),
        x,
        y,
        roles,
        perRow: 12,
        cellW: 30,
        empty: 'no edges',
      });
      parts.push(uni);
      y = below(uni, 10);
    }

    if (i.problem !== '3sat') {
      const cert = [...chosen];
      const row = drawRow(out, {
        id: 'cert',
        label: 'certificate',
        labelW: 104,
        cells: cert.map((v) => ({ key: v, text: i.problem === 'sc' ? `S${v}` : v, role: 'found' })),
        x,
        y,
        roles,
        perRow: 6,
        cellW: Math.max(36, ...cert.map((v) => textWidth(v, 13, true) + 22)),
        empty: i.answer === 'no' ? 'none exists' : 'none yet',
      });
      parts.push(row);
      y = below(row, 10);
    }

    const items =
      extra.formula || /\d$/.test(g?.vertices[0] ?? '')
        ? g && /[a-z]\d$/.test(g.vertices[0] ?? '')
          ? ['vertex ¬b2: the ¬b of clause 2']
          : []
        : [];
    if (i.problem === 'sc') items.push('edge numbers are the elements of U');
    if (extra.gone) items.push('dashed: edges of G the complement drops');
    if (items.length) parts.push(drawLegend(out, { id: 'key', items, x, y, maxW: 330 }));
    return unionBounds(...parts);
  };

  if (g) boxes.push(placePanels(shapes, graphBox, stage, panel));
  else boxes.push(panel(shapes, 0, 0));

  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: describe(s) };
}
