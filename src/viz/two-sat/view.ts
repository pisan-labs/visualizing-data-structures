/**
 * 2-SAT: the implication graph (x above ¬x for each variable in the default layout), and under
 * or beside it the clauses, the finished stack (Kosaraju) or the stack (Tarjan), the
 * components found so far, and a table of each variable's components and value.
 *
 * Vertex positions come from the whole implication graph, so nothing moves while the arcs are
 * built. Each component gets a color from a small palette and its number shows in the
 * components row, so color is never the only cue. A contradiction (x and ¬x together) is red.
 */
import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
import {
  VERTEX_R,
  below,
  drawGraph,
  drawLegend,
  drawRow,
  drawTable,
  layoutGraph,
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
  clauseText,
  describe,
  describeRun,
  implications,
  litName,
  literals,
  topoRank,
  type SatExtra,
  type SatSettings,
  type SatState,
} from './model';

/** Component k (from 0) gets its own group color; the number tells them apart past eight. */
export const compRole = (k: number): MarkRole => groupRole(k + 1);

function graphOf(s: SatState, arcs: [number, number][]): GraphLike {
  return {
    directed: true,
    weighted: false,
    vertices: literals(s),
    edges: arcs.map(([x, y]) => ({ u: litName(s, x), v: litName(s, y), w: 1 })),
  };
}

function layoutOf(s: SatState, settings: SatSettings): GraphLayout {
  if (settings.layout !== 'pairs') {
    return layoutGraph(graphOf(s, implications(s)), settings.layout);
  }
  const pos: GraphLayout['pos'] = {};
  const gap = 82;
  s.vars.forEach((_, i) => {
    const y0 = i % 2 ? 22 : 0;
    pos[litName(s, 2 * i)] = { x: i * gap, y: y0 };
    pos[litName(s, 2 * i + 1)] = { x: i * gap, y: y0 + 120 };
  });
  const R = VERTEX_R;
  const n = s.vars.length;
  return {
    pos,
    r: R,
    bounds: { x: -R, y: -R, w: (n - 1) * gap + 2 * R, h: (n > 1 ? 142 : 120) + 2 * R },
  };
}

export function view(
  step: Step<SatState, SatExtra>,
  settings: SatSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const r = extra.run;
  const marks = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const roles = new Map<string, MarkRole>();
  const names = literals(s);
  if (r)
    names.forEach((v, k) => {
      if (r.comp[k] !== null) roles.set(`vx-${v}`, compRole(r.comp[k]!));
    });
  if (r?.conflict !== null && r?.conflict !== undefined) {
    roles.set(`vx-${names[2 * r.conflict]}`, 'error');
    roles.set(`vx-${names[2 * r.conflict + 1]}`, 'error');
  }
  for (const [id, role] of marks) roles.set(id, role);
  const layout = layoutOf(s, settings);
  const g = graphOf(s, r ? r.arcs : []);
  const index = new Map(names.map((v, k) => [v, k]));
  const flipped = r && r.phase === 'second';
  const look = (v: string): VertexLook | undefined => {
    if (!r) return undefined;
    const k = index.get(v)!;
    if (r.u === k) return 'current';
    if (r.phase === 'tarjan' && r.stack.includes(k)) return 'frontier';
    if (r.comp[k] !== null) return undefined;
    return r.color[k] === 'gray' ? 'frontier' : r.color[k] === 'black' ? 'done' : undefined;
  };
  const edgeLook = (key: string): EdgeLook | undefined => {
    if (!r) return undefined;
    const [a, b] = key.split('-') as [string, string];
    const x = index.get(a)!;
    const y = index.get(b)!;
    if (r.phase === 'build' || r.phase === 'transpose') return undefined;
    if (r.phase === 'check' || r.phase === 'done')
      return r.comp[x] === r.comp[y] ? undefined : 'seen';
    return r.tree[`${x},${y}`] ? 'tree' : 'unexamined';
  };
  const drawn = drawGraph(
    flipped ? { ...g, edges: g.edges.map((e) => ({ ...e, u: e.v, v: e.u })) } : g,
    layout,
    {
      roles,
      vertex: look,
      edge: (key) => {
        if (!flipped) return edgeLook(key);
        const [a, b] = key.split('-') as [string, string];
        return edgeLook(`${b}-${a}`);
      },
      parent: (key) => key.split('-')[0],
      note:
        r &&
        ((v) => {
          const k = index.get(v)!;
          if (r.d[k] === null) return undefined;
          const second = r.algorithm === 'tarjan' ? r.low[k] : r.f[k];
          return `${r.d[k]}/${second ?? ''}`;
        }),
      pointers: r && r.u !== null ? [{ name: 'u', at: names[r.u]!, role: 'active' }] : [],
    },
  );
  const shapes: Shape[] = [...drawn.shapes];
  // When the drawing is reversed (Kosaraju's pass 2) an arc's id still names its direction in
  // G, so the marks on it keep working: rename reversed arcs back.
  if (flipped)
    for (const sh of shapes) {
      const m = /^(e|ew|ek)-([^-]+)-([^-]+)(-a)?$/.exec(sh.id);
      if (m && index.has(m[2]!) && index.has(m[3]!)) sh.id = `${m[1]}-${m[3]}-${m[2]}${m[4] ?? ''}`;
    }
  const boxes: Bounds[] = [drawn.bounds];
  const panel = placePanels(shapes, drawn.bounds, stage, (out, x, y0) => {
    const parts: Bounds[] = [];
    const texts = s.clauses.map((c) => clauseText(s, c));
    const cellW = Math.max(40, ...texts.map((t) => t.length * 8.6 + 14));
    const perRow = Math.max(1, Math.floor(340 / (cellW + 4)));
    const clauses = drawRow(out, {
      id: 'cl',
      label: 'clauses',
      labelW: 84,
      cells: texts.map((t, k) => ({
        key: String(k),
        text: t,
        role: r?.sat ? 'found' : r?.clause === k ? 'active' : undefined,
      })),
      x,
      y: y0,
      roles,
      perRow,
      cellW,
    });
    parts.push(clauses);
    let y = below(clauses, 12);
    if (r) {
      const n = names.length;
      const tarjan = r.algorithm === 'tarjan';
      const per = 8;
      const room = { x, y, w: 84 + Math.min(n, per) * 50, h: Math.ceil(n / per) * 46 - 2 };
      const row = drawRow(out, {
        id: tarjan ? 'S' : 'F',
        label: tarjan ? 'stack' : 'finished',
        labelW: 84,
        cells: (tarjan ? r.stack : r.finished).map((k) => ({
          key: String(k),
          text: names[k]!,
          from: layout.pos[names[k]!],
          dim: !tarjan && r.comp[k] !== null,
        })),
        x,
        y,
        roles,
        perRow: per,
        cellW: 46,
        ends: tarjan ? ['bottom', 'top'] : ['first', 'last'],
      });
      parts.push(row, room);
      y = below(unionBounds(row, room), 12);
      const compText = (c: number[], k: number) => `${k + 1}: ${c.map((i) => names[i]).join(' ')}`;
      const cw = Math.max(46, ...r.comps.map((c, k) => compText(c, k).length * 8.2 + 14));
      const comps = drawRow(out, {
        id: 'scc',
        label: 'SCCs',
        labelW: 84,
        cells: r.comps.map((c, k) => ({ key: String(k), text: compText(c, k), role: compRole(k) })),
        x,
        y,
        roles,
        perRow: Math.max(1, Math.floor(340 / (cw + 4))),
        cellW: cw,
        empty: 'none yet',
      });
      parts.push(comps);
      y = below(comps, 12);
      const known = r.phase === 'check' || r.phase === 'done';
      const pos = (k: number) =>
        known && r.comp[k] !== null ? String(topoRank(r, r.comp[k]!) + 1) : '';
      const table = drawTable(out, {
        id: 'as',
        x,
        y,
        columns: s.vars,
        head: 'x',
        rows: [
          { key: 'pos', label: 'topo(x)', cells: s.vars.map((_, i) => ({ text: pos(2 * i) })) },
          {
            key: 'neg',
            label: 'topo(¬x)',
            cells: s.vars.map((_, i) => ({ text: pos(2 * i + 1) })),
          },
          {
            key: 'val',
            label: 'value',
            cells: s.vars.map((_, i) => ({
              text: r.value[i] === null ? '' : r.value[i] ? 'T' : 'F',
              role: r.conflict === i ? 'error' : undefined,
            })),
          },
        ],
        roles,
      });
      parts.push(table);
      y = below(table, 10);
      parts.push(
        drawLegend(out, {
          id: 'key',
          items: [
            tarjan ? 'badge d/low' : 'badge d/f',
            'topo: place of the component in topological order',
            ...(flipped ? ['arcs reversed: G^T'] : []),
          ],
          x,
          y,
          maxW: Math.max(table.w, 300),
        }),
      );
    } else {
      parts.push(
        drawLegend(out, {
          id: 'key',
          items: ['one vertex per literal', 'arcs appear as the clauses are read'],
          x,
          y,
          maxW: 300,
        }),
      );
    }
    return unionBounds(...parts);
  });
  boxes.push(panel);
  const label = r ? `${describe(s)} ${describeRun(s, r)}` : describe(s);
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
