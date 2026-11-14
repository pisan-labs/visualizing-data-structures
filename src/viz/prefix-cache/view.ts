/**
 * The prefix cache: the request in progress as a row of token cells (cached ones done, new ones
 * marked new), the radix tree below it (src/layouts/trie.ts, as on the compressed-trie page),
 * each edge a run of tokens and each node showing its reference count, and a side panel: how
 * full the cache is, the running requests, and the leaves in the order they would be evicted.
 *
 * A laptop puts the panel right of the tree; a phone puts it under the tree, and may grow the
 * tree sideways when that draws it larger.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import { textWidth } from '../../layouts/text';
import { drawTrie, layoutTrie, trieNodeId } from '../../layouts/trie';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_CORNER } from '../../render/stage';
import {
  capacityOf,
  cachedTokens,
  describe,
  evictOrder,
  LRU_SHOWN,
  ROOT,
  tokenId,
  type PrefixExtra,
  type PrefixSettings,
  type PrefixState,
} from './model';

const R = 13;
const LABEL = 15;
const VALUE = 15;
const SMALL = 14;
const CELL_H = 28;
const PANEL_GAP = 40;
/** Longest edge label in the panel before it is cut. */
const CUT = 18;

type Roles = ReadonlyMap<string, MarkRole>;

const text = (
  id: string,
  x: number,
  y: number,
  t: string,
  o: Partial<Extract<Shape, { kind: 'text' }>> = {},
): Shape => ({ kind: 'text', id, x, y, text: t, size: SMALL, mono: true, ...o });

const cellW = (w: string) => Math.max(30, w.length * VALUE * 0.6 + 12);

/** The request in progress: its letter, then one cell per token. */
function drawRequest(
  out: Shape[],
  arg: NonNullable<PrefixExtra['arg']>,
  roles: Roles,
  x0: number,
  y0: number,
): Bounds {
  out.push(
    text('req-name', x0, y0 + CELL_H / 2 + 5, `${arg.name}:`, { size: VALUE, weight: 'bold' }),
  );
  let x = x0 + 28;
  arg.tokens.forEach((w, i) => {
    const id = tokenId(i);
    const base: MarkRole | undefined = i < arg.matched ? 'visit' : arg.inserted ? 'new' : undefined;
    const role = roles.get(id) ?? base;
    const cw = cellW(w);
    out.push({ kind: 'rect', id, x, y: y0, w: cw, h: CELL_H, r: 3, cls: 'live', role });
    out.push(
      text(`${id}-t`, x + cw / 2, y0 + CELL_H / 2 + 5, w, {
        size: VALUE,
        anchor: 'middle',
        role: role === 'error' ? 'error' : undefined,
      }),
    );
    x += cw + 4;
  });
  return { x: x0, y: y0, w: x - 4 - x0, h: CELL_H };
}

const cut = (t: string) => (t.length > CUT ? `${t.slice(0, CUT - 1)}…` : t);

/** How full the cache is, the running requests, and the eviction order. */
function drawPanel(
  out: Shape[],
  s: PrefixState,
  settings: PrefixSettings,
  roles: Roles,
  x0: number,
  y0: number,
): Bounds {
  const row = 22;
  let y = y0 + 16;
  let w = 0;
  const put = (id: string, t: string, o: Partial<Extract<Shape, { kind: 'text' }>> = {}) => {
    out.push(text(id, x0, y, t, { role: roles.get(id), ...o }));
    w = Math.max(w, textWidth(t, (o.size as number | undefined) ?? SMALL, true));
    y += row;
  };
  put('cap', `cache: ${cachedTokens(s)} of ${capacityOf(settings)} tokens`, {
    size: VALUE,
    weight: 'bold',
  });
  y += 6;
  put('run-title', 'running', { size: VALUE, weight: 'bold' });
  if (!s.running.length) put('run-none', 'none', { cls: 'label' });
  for (const r of s.running)
    put(`run-${r.name}`, `${r.name}  ${r.tokens.length} tokens, ${r.reused} reused`);
  y += 6;
  put('lru-title', 'evicted first', { size: VALUE, weight: 'bold' });
  const order = evictOrder(s);
  if (!order.length) put('lru-none', 'nothing: all in use', { cls: 'label' });
  order.slice(0, LRU_SHOWN).forEach((u, k) => {
    const n = s.nodes[u]!;
    put(`lru-${u}`, `${k + 1}. "${cut(n.tokens.join(' '))}" t${n.last}`);
  });
  if (order.length > LRU_SHOWN)
    put('lru-more', `+${order.length - LRU_SHOWN} more`, { cls: 'label' });
  return { x: x0, y: y0, w, h: y - row + 8 - y0 };
}

/** The tree, with the root at (0, 0), and its box. */
function drawTree(
  s: PrefixState,
  step: Step<PrefixState, PrefixExtra>,
  roles: Roles,
  sideways: boolean,
): { shapes: Shape[]; bounds: Bounds } {
  const extra = step.extra ?? {};
  const layout = layoutTrie<number>(ROOT, (u) => s.nodes[u]!.kids, {
    label: (u) => s.nodes[u]!.tokens.join(' '),
    radius: R,
    labelSize: LABEL,
    gap: 12,
    labelGap: 10,
    levelGap: 64,
    sideways,
  });
  const path = new Set(extra.path ?? []);
  const shapes = drawTrie(layout, {
    isEnd: () => false,
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : undefined),
    edgeRole: (u) => (path.has(u) && u !== ROOT ? 'visit' : undefined),
    enterFrom: (u) => {
      if (u !== extra.fresh) return undefined;
      const p = layout.nodes.get(s.nodes[u]!.parent!);
      return p && { x: p.x, y: p.y };
    },
  });
  for (const n of layout.nodes.values()) {
    if (n.id === ROOT) continue;
    const ref = s.nodes[n.id]!.ref;
    shapes.push(
      text(`ref-${n.id}`, n.x, n.y + 5, String(ref), {
        anchor: 'middle',
        weight: ref > 0 ? 'bold' : 'normal',
        cls: ref > 0 ? undefined : 'label',
        role: roles.get(trieNodeId(n.id)) === 'remove' ? 'error' : undefined,
      }),
    );
  }
  const boxes: Bounds[] = [layout.bounds];
  shapes.push(
    text('root-label', -R - 6, -R - 2, 'root', { anchor: 'end', cls: 'label', size: SMALL }),
  );
  boxes.push({ x: -R - 6 - textWidth('root', SMALL, true), y: -R - 14, w: 40, h: 14 });
  if (!s.nodes[ROOT]!.kids.length) {
    shapes.push(text('empty', 0, R + 26, 'empty cache', { anchor: 'middle', cls: 'label' }));
    boxes.push({ x: -50, y: R + 10, w: 100, h: 20 });
  }
  return { shapes, bounds: unionBounds(...boxes) };
}

export function view(
  step: Step<PrefixState, PrefixExtra>,
  settings: PrefixSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const arg = step.extra?.arg;
  // Without a strip of their own, the zoom buttons cover the top right corner.
  const top = stage && !stage.strip ? ZOOM_CORNER.h : 0;

  const arrange = (sideways: boolean, below: boolean) => {
    const shapes: Shape[] = [];
    const boxes: Bounds[] = [{ x: 0, y: 0, w: 1, h: 1 }];
    let y = top;
    let reqW = 0;
    if (arg) {
      const b = drawRequest(shapes, arg, roles, 0, top);
      boxes.push(b);
      reqW = b.w;
      y = top + CELL_H + 30;
    }
    const tree = drawTree(s, step, roles, sideways);
    const dx = -tree.bounds.x;
    const dy = y - tree.bounds.y;
    shapes.push(...translate(tree.shapes, dx, dy));
    const tb = { ...tree.bounds, x: 0, y };
    boxes.push(tb);
    const panel = below
      ? drawPanel(shapes, s, settings, roles, 0, tb.y + tb.h + 30)
      : drawPanel(shapes, s, settings, roles, Math.max(tb.w, reqW) + PANEL_GAP, top);
    boxes.push(panel);
    return { shapes, bounds: padBounds(unionBounds(...boxes), 14) };
  };
  const best = pickLayout(stage, [
    arrange(false, false),
    arrange(false, true),
    arrange(true, true),
  ]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s, settings) };
}
