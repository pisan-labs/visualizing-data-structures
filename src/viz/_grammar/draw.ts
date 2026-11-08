/**
 * Drawings shared by the grammar pages: a panel of rules, a parse tree, and a chooser that puts
 * blocks beside or under each other, whichever reads larger on the stage.
 *
 *   drawRules(out, rows, opts)  one line per variable, "A → α | β", wrapping at opts.maxW.
 *     Each alternative is its own text, id ruleShapeId(prefix, rule), so a step can light the
 *     rule it uses. An alternative marked `struck` is drawn crossed out (a rule just removed).
 *   layoutTree(tree)            positions for every node of a parse tree (layoutForest), so a
 *     tree that grows node by node can draw each node where it will end up.
 *   drawTree(out, tree, layout, opts)  variables in circles, terminals in squares, ε as a bare
 *     ε; ids treeNodeId / treeTextId / treeEdgeId with a prefix, so two trees can share a stage.
 *   arrange(blocks, stage)      offsets for blocks put side by side or stacked, whichever fits
 *     the stage best (fitScore); with no stage, the best on both a laptop and a phone.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { layoutForest, type ForestLayout } from '../../layouts/forest';
import { fitScore, padBounds, textWidth, unionBounds } from '../../layouts/graph';
import type { Bounds, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import { EPS, formText, isVariable, type ParseTree, type Rule, type Sym } from './grammar';

export const RULE_SIZE = 15;

export const ruleKey = (r: Rule): string => `${r.lhs}>${r.rhs.join(' ')}`;
export const ruleShapeId = (prefix: string, r: Rule): string => `${prefix}-${ruleKey(r)}`;
export const ruleRowId = (prefix: string, lhs: Sym): string => `${prefix}-row-${lhs}`;

export interface RuleAlt {
  rule: Rule;
  role?: MarkRole;
  /** Crossed out: a rule this step removes. */
  struck?: boolean;
}

export interface RuleRow {
  lhs: Sym;
  alts: RuleAlt[];
}

/** Rows for a grammar's rules, by variable, in variable order. */
export function ruleRows(variables: readonly Sym[], rules: readonly Rule[]): RuleRow[] {
  const order = [...variables];
  for (const r of rules) if (!order.includes(r.lhs)) order.push(r.lhs);
  return order
    .map((lhs) => ({ lhs, alts: rules.filter((r) => r.lhs === lhs).map((rule) => ({ rule })) }))
    .filter((row) => row.alts.length);
}

/**
 * The rules, one variable per line. Returns the panel's box. `title` goes above the rules;
 * `minW` keeps the panel at least that wide, so a panel whose rules change keeps its place.
 */
export function drawRules(
  out: Shape[],
  rows: readonly RuleRow[],
  opts: {
    prefix: string;
    x: number;
    y: number;
    maxW: number;
    roles?: ReadonlyMap<string, MarkRole>;
    title?: string;
    size?: number;
  },
): Bounds {
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const size = opts.size ?? RULE_SIZE;
  const line = Math.round(size * 1.55);
  const charW = textWidth('m', size, true);
  let y = opts.y;
  let right = opts.x;
  if (opts.title) {
    out.push({
      kind: 'text',
      id: `${opts.prefix}-title`,
      x: opts.x,
      y: y + 13,
      text: opts.title,
      size: 13,
      cls: 'label',
      role: roles.get(`${opts.prefix}-title`),
    });
    right = Math.max(right, opts.x + textWidth(opts.title, 13));
    y += 22;
  }
  // Variables, then the arrows lined up, then the right sides.
  const arrowX = opts.x + (Math.max(...rows.map((r) => r.lhs.length), 1) + 0.6) * charW;
  const headW = arrowX - opts.x + 2 * charW;
  for (const row of rows) {
    const base = y + size;
    const rowId = ruleRowId(opts.prefix, row.lhs);
    out.push({
      kind: 'text',
      id: rowId,
      x: opts.x,
      y: base,
      text: row.lhs,
      size,
      mono: true,
      weight: 'bold',
      role: roles.get(rowId),
    });
    out.push({
      kind: 'text',
      id: `${rowId}-arrow`,
      x: arrowX,
      y: base,
      text: '→',
      size,
      mono: true,
      cls: 'label',
    });
    let x = opts.x + headW;
    let lineY = base;
    row.alts.forEach((alt, k) => {
      const text = formText(alt.rule.rhs);
      const w = text.length * charW;
      const bar = k > 0 ? 2 * charW : 0;
      if (k > 0 && x + bar + w > opts.x + opts.maxW) {
        x = opts.x + headW;
        lineY += line;
      } else if (k > 0) {
        out.push({
          kind: 'text',
          id: `${rowId}-bar-${k}`,
          x: x + charW * 0.5,
          y: lineY,
          text: '|',
          size,
          mono: true,
          cls: 'label',
        });
        x += bar;
      }
      const id = ruleShapeId(opts.prefix, alt.rule);
      const role = roles.get(id) ?? alt.role;
      out.push({
        kind: 'text',
        id,
        x,
        y: lineY,
        text,
        size,
        mono: true,
        weight: role && role !== 'stale' ? 'bold' : undefined,
        role: alt.struck ? 'stale' : role,
      });
      if (alt.struck) {
        out.push({
          kind: 'arrow',
          id: `${id}-strike`,
          x1: x - 2,
          y1: lineY - size * 0.32,
          x2: x + w + 2,
          y2: lineY - size * 0.32,
          head: 'none',
          role: 'remove',
          z: 2.5,
        });
      }
      x += w;
      right = Math.max(right, x);
    });
    y = lineY + line - size;
  }
  return { x: opts.x, y: opts.y, w: right - opts.x, h: y - opts.y + size * 0.4 };
}

// ---------------------------------------------------------------------------------------------
// Parse trees

export const TREE_R = 15;
const LEVEL_GAP = 50;

export const treeNodeId = (prefix: string, id: number) => `${prefix}n${id}`;
export const treeTextId = (prefix: string, id: number) => `${prefix}t${id}`;
export const treeEdgeId = (prefix: string, id: number) => `${prefix}e${id}`;

export function layoutTree(tree: ParseTree): ForestLayout {
  return layoutForest([0], (id) => tree[id]?.kids ?? [], {
    radius: TREE_R,
    gap: 7,
    levelGap: LEVEL_GAP,
  });
}

const labelSize = (t: string) => (t.length <= 1 ? 17 : t.length === 2 ? 15 : 12);

/**
 * A parse tree drawn at (x, y), the top left of the layout's bounds. Only nodes in `shown` are
 * drawn (all when it is left out), each where it sits in the finished tree. `role(id)` gives a
 * node a color when no mark names it.
 */
export function drawTree(
  out: Shape[],
  tree: ParseTree,
  layout: ForestLayout,
  opts: {
    prefix: string;
    x: number;
    y: number;
    roles?: ReadonlyMap<string, MarkRole>;
    shown?: (id: number) => boolean;
    role?: (id: number) => MarkRole | undefined;
    /** Nodes made this step: they slide out of their parent the first time they appear. */
    fresh?: (id: number) => boolean;
  },
): Bounds {
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const dx = opts.x - layout.bounds.x;
  const dy = opts.y - layout.bounds.y;
  const pos = (id: number) => {
    const p = layout.nodes.get(id)!;
    return { x: p.x + dx, y: p.y + dy };
  };
  const r = TREE_R;
  for (const node of tree) {
    if (opts.shown && !opts.shown(node.id)) continue;
    const p = pos(node.id);
    const nid = treeNodeId(opts.prefix, node.id);
    const tid = treeTextId(opts.prefix, node.id);
    const role = roles.get(nid) ?? opts.role?.(node.id);
    const from = opts.fresh?.(node.id) && node.parent >= 0 ? pos(node.parent) : undefined;
    if (node.parent >= 0) {
      const q = pos(node.parent);
      const eid = treeEdgeId(opts.prefix, node.id);
      const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      const ux = (p.x - q.x) / len;
      const uy = (p.y - q.y) / len;
      const end = node.sym === EPS ? 12 : r;
      out.push({
        kind: 'arrow',
        id: eid,
        x1: q.x + ux * r,
        y1: q.y + uy * r,
        x2: p.x - ux * end,
        y2: p.y - uy * end,
        head: 'none',
        role: roles.get(eid),
      });
    }
    if (node.sym === EPS) {
      out.push({
        kind: 'text',
        id: tid,
        x: p.x,
        y: p.y + 6,
        text: EPS,
        size: 17,
        anchor: 'middle',
        cls: 'label',
        role: roles.get(tid) ?? role,
        enterFrom: from && { x: from.x, y: from.y + 6 },
      });
      continue;
    }
    const variable = isVariable(node.sym);
    if (variable) {
      out.push({
        kind: 'circle',
        id: nid,
        x: p.x,
        y: p.y,
        r,
        cls: 'live',
        role,
        enterFrom: from,
      });
    } else {
      out.push({
        kind: 'rect',
        id: nid,
        x: p.x - r + 2,
        y: p.y - r + 2,
        w: 2 * r - 4,
        h: 2 * r - 4,
        r: 4,
        cls: 'live',
        role,
        enterFrom: from && { x: from.x - r + 2, y: from.y - r + 2 },
      });
    }
    const size = labelSize(node.sym);
    out.push({
      kind: 'text',
      id: tid,
      x: p.x,
      y: p.y + size * 0.36,
      text: node.sym,
      size,
      anchor: 'middle',
      weight: variable ? 'bold' : undefined,
      mono: !variable,
      role: roles.get(tid) ?? role,
      enterFrom: from && { x: from.x, y: from.y + size * 0.36 },
    });
  }
  return { x: opts.x, y: opts.y, w: layout.bounds.w, h: layout.bounds.h };
}

/** The size a tree's layout takes. */
export const treeSize = (layout: ForestLayout) => ({ w: layout.bounds.w, h: layout.bounds.h });

// ---------------------------------------------------------------------------------------------
// Arranging blocks

/** Where to put each block: its top left corner. */
export type Placement = { x: number; y: number }[];

/**
 * Candidate arrangements of blocks (sizes only), each a list of top-left corners; returns the one
 * whose whole picture fitScore draws largest on `stage` (both typical stages when there is
 * none). Earlier candidates win ties, so list the preferred arrangement first.
 */
export function bestPlacement(
  sizes: readonly { w: number; h: number }[],
  candidates: readonly Placement[],
  stage?: StageSize,
): Placement {
  let best = candidates[0]!;
  let score = -Infinity;
  for (const c of candidates) {
    const box = padBounds(
      unionBounds(...sizes.map((s, i) => ({ x: c[i]!.x, y: c[i]!.y, w: s.w, h: s.h }))),
      14,
    );
    const f = fitScore(box, stage);
    if (f > score * 1.03) {
      best = c;
      score = f;
    }
  }
  return best;
}

/**
 * The stage's zoom buttons sit over the top right corner, so a block put beside another at the
 * top starts this much lower, in scene units (src/render/stage.ts).
 */
export const BUTTONS_DROP = ZOOM_DROP;

/**
 * Two blocks: b beside a, or b under a (left aligned). Beside, b starts `drop` lower: pass
 * BUTTONS_DROP when b ends up in the top right corner of the stage.
 */
export function besideOrUnder(
  a: { w: number; h: number },
  _b: { w: number; h: number },
  gap: number,
  drop = 0,
): Placement[] {
  return [
    [
      { x: 0, y: 0 },
      { x: a.w + gap, y: drop },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: a.h + gap },
    ],
  ];
}
