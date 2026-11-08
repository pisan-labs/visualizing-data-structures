/**
 * LL(1): the rules, the FIRST and FOLLOW sets (a row per variable), and the parse table M[A, a]
 * (a row per variable, a column per terminal and $; a cell with two rules is red). During a
 * parse the sets give way to the input (read symbols greyed), the stack (top first) and the
 * parse tree, growing top down. Blocks are packed in rows; `bestPlacement` keeps the packing
 * drawn largest. Sizes come from the finished sets, table, tree and deepest stack, so nothing
 * moves while they fill.
 *
 * Shape ids: rules `r-…`; sets `ff-<A>-1` (FIRST) and `ff-<A>-2` (FOLLOW); table `m-<A>-<a>`,
 * `m-title`; input `in-<i>`; stack `stk-<node>` and `stk-end`; tree `t-n<id>`, `t-t<id>`.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds, textWidth, unionBounds } from '../../layouts/graph';
import { translate } from '../../layouts/arrange';
import { drawTape } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  BUTTONS_DROP,
  bestPlacement,
  drawRules,
  drawTree,
  layoutTree,
  ruleRows,
  type Placement,
} from '../_grammar/draw';
import { formText, type Grammar, type ParseTree, type Sym } from '../_grammar/grammar';
import {
  END,
  RULES,
  analyze,
  cellId,
  columns,
  describe,
  firstId,
  followId,
  setText,
  stackId,
  type Ll1Extra,
  type Ll1Settings,
  type Ll1State,
} from './model';

type LStep = Step<Ll1State, Ll1Extra>;

const TEXT = 15;
const ROW_H = 30;
const TITLE_H = 24;

interface GridOptions {
  title: string;
  titleId: string;
  rows: Sym[];
  heads: string[];
  colW: number[];
  cell: (r: number, c: number) => { id: string; text: string; role?: MarkRole };
  roles: ReadonlyMap<string, MarkRole>;
}

/** A small table: a title, column heads, a bold row head per row, and boxed cells. */
function drawGrid(out: Shape[], o: GridOptions): Bounds {
  const headW = Math.max(28, ...o.rows.map((v) => textWidth(v, TEXT, true, true))) + 12;
  out.push({
    kind: 'text',
    id: o.titleId,
    x: 0,
    y: 14,
    text: o.title,
    size: TEXT,
    cls: 'label',
    role: o.roles.get(o.titleId),
  });
  let x = headW;
  o.heads.forEach((h, c) => {
    out.push({
      kind: 'text',
      id: `${o.titleId}-h${c}`,
      x: x + o.colW[c]! / 2,
      y: TITLE_H + 16,
      text: h,
      size: TEXT,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      cls: 'label',
    });
    x += o.colW[c]!;
  });
  const top = TITLE_H + 24;
  o.rows.forEach((v, r) => {
    const y = top + r * ROW_H;
    out.push({
      kind: 'text',
      id: `${o.titleId}-r${r}`,
      x: 0,
      y: y + ROW_H / 2 + 5,
      text: v,
      size: TEXT,
      weight: 'bold',
      mono: true,
    });
    let cx = headW;
    o.heads.forEach((_, c) => {
      const w = o.colW[c]!;
      const { id, text, role } = o.cell(r, c);
      const rr = o.roles.get(id) ?? role;
      out.push({
        kind: 'rect',
        id,
        x: cx,
        y,
        w: w - 3,
        h: ROW_H - 3,
        r: 4,
        cls: text ? 'live' : undefined,
        role: rr,
      });
      if (text)
        out.push({
          kind: 'text',
          id: `${id}-t`,
          x: cx + (w - 3) / 2,
          y: y + ROW_H / 2 + 4,
          text,
          size: TEXT,
          anchor: 'middle',
          mono: true,
          weight: rr && rr !== 'done' ? 'bold' : undefined,
          role: rr,
        });
      cx += w;
    });
  });
  const w = headW + o.colW.reduce((a, b) => a + b, 0);
  return { x: 0, y: 0, w: Math.max(w, textWidth(o.title, TEXT)), h: top + o.rows.length * ROW_H };
}

const setInside = (xs: readonly Sym[]) => xs.join(' ');

const finals = new WeakMap<Grammar, Ll1State>();
/** The finished analysis of a grammar, for sizing. */
function finished(s: Ll1State): Ll1State {
  if (s.phase === 'ready') return s;
  let f = finals.get(s.grammar);
  if (!f) finals.set(s.grammar, (f = analyze(s.grammar)));
  return f;
}

function drawSets(out: Shape[], s: Ll1State, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const f = finished(s);
  const g = s.grammar;
  const width = (pick: (v: Sym) => readonly Sym[]) =>
    Math.max(70, ...g.variables.map((v) => textWidth(setInside(pick(v)), TEXT, true) + 18));
  return drawGrid(out, {
    title: 'FIRST and FOLLOW',
    titleId: 'ff-title',
    rows: g.variables,
    heads: ['FIRST', 'FOLLOW'],
    colW: [width((v) => f.first[v] ?? []), width((v) => f.follow[v] ?? [])],
    cell: (r, c) => {
      const v = g.variables[r]!;
      const xs = (c === 0 ? s.first : s.follow)[v] ?? [];
      return { id: c === 0 ? firstId(v) : followId(v), text: setInside(xs) };
    },
    roles,
  });
}

const entryText = (g: Grammar, rules: readonly number[] | undefined) =>
  (rules ?? []).map((i) => formText(g.rules[i]!.rhs)).join(' / ');

function drawTable(out: Shape[], s: Ll1State, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const f = finished(s);
  const g = s.grammar;
  const cols = columns(g);
  const colW = cols.map((a) =>
    Math.max(
      40,
      ...g.variables.map((v) => textWidth(entryText(g, f.table[v]?.[a]), TEXT, true) + 16),
    ),
  );
  const conflict = new Set(s.conflicts.map((c) => cellId(c.A, c.a)));
  return drawGrid(out, {
    title: s.conflicts.length
      ? `M[A, a]: ${s.conflicts.length} conflict${s.conflicts.length === 1 ? '' : 's'}`
      : 'M[A, a]: the rule to use',
    titleId: 'm-title',
    rows: g.variables,
    heads: cols,
    colW,
    cell: (r, c) => {
      const v = g.variables[r]!;
      const id = cellId(v, cols[c]!);
      return {
        id,
        text: entryText(g, s.table[v]?.[cols[c]!]),
        role: conflict.has(id) ? 'error' : undefined,
      };
    },
    roles,
  });
}

const STACK_W = 52;
const STACK_H = 30;
const STACK_SHOWN = 10;

/** The input row and the stack under it. */
function drawParse(out: Shape[], s: Ll1State, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const run = s.run!;
  const cells = [...run.word, END];
  out.push({ kind: 'text', id: 'in-title', x: 0, y: 14, text: 'Input', size: TEXT, cls: 'label' });
  const tb = drawTape(out, {
    id: 'in',
    x: 0,
    y: 22,
    cells,
    to: cells.length,
    head: run.verdict ? null : run.pos,
    headRoom: 'none',
    read: run.pos,
    roles,
  });
  const top = 22 + tb.h + 16;
  out.push({
    kind: 'text',
    id: 'stk-title',
    x: 0,
    y: top + 14,
    text: 'Stack (top first)',
    size: TEXT,
    cls: 'label',
  });
  const items = [...run.stack].reverse();
  const shown = items.slice(0, STACK_SHOWN);
  shown.forEach((it, k) => {
    const id = stackId(it.node);
    const y = top + TITLE_H + k * (STACK_H + 4);
    const role = roles.get(id) ?? (k === 0 && !run.verdict ? 'active' : undefined);
    out.push({ kind: 'rect', id, x: 0, y, w: STACK_W, h: STACK_H, r: 4, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: STACK_W / 2,
      y: y + STACK_H / 2 + 6,
      text: it.sym,
      size: 17,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
      role,
    });
  });
  if (items.length > STACK_SHOWN)
    out.push({
      kind: 'text',
      id: 'stk-more',
      x: STACK_W + 10,
      y: top + TITLE_H + (STACK_SHOWN - 1) * (STACK_H + 4) + 20,
      text: `${items.length - STACK_SHOWN} more below`,
      size: TEXT,
      cls: 'label',
    });
  const depth = Math.min(STACK_SHOWN, Math.max(run.deepest, 2));
  const h = top + TITLE_H + depth * (STACK_H + 4);
  return { x: 0, y: 0, w: Math.max(tb.w, 150, textWidth('Stack (top first)', TEXT)), h };
}

/** Deepest level of the tree drawn; a parse that keeps expanding (a guess on left recursion)
 * grows below it unseen. */
const TREE_DEPTH = 6;

const pruned = new WeakMap<ParseTree, { tree: ParseTree; deep: boolean }>();
/** The tree cut at TREE_DEPTH: deeper nodes stay in the list but no parent points at them. */
function cut(tree: ParseTree): { tree: ParseTree; deep: boolean } {
  let c = pruned.get(tree);
  if (c) return c;
  const depth: number[] = [];
  for (const n of tree) depth[n.id] = n.parent < 0 ? 0 : depth[n.parent]! + 1;
  const deep = depth.some((d) => d > TREE_DEPTH);
  const t = tree.map((n) => ({ ...n, kids: depth[n.id]! >= TREE_DEPTH ? [] : n.kids }));
  c = { tree: deep ? t : tree, deep };
  pruned.set(tree, c);
  return c;
}

function drawParseTree(out: Shape[], s: Ll1State, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const run = s.run!;
  const { tree, deep } = cut(run.tree);
  const reach = new Set<number>();
  const walk = (id: number) => {
    reach.add(id);
    tree[id]!.kids.forEach(walk);
  };
  walk(0);
  const layout = layoutTree(tree);
  const title = deep ? `Parse tree (top ${TREE_DEPTH + 1} levels)` : 'Parse tree';
  out.push({ kind: 'text', id: 'tree-title', x: 0, y: 14, text: title, size: TEXT, cls: 'label' });
  drawTree(out, tree, layout, {
    prefix: 't-',
    x: 0,
    y: 26,
    roles,
    shown: (id) => id < run.made && reach.has(id),
  });
  return { x: 0, y: 0, w: Math.max(layout.bounds.w, 90), h: 26 + layout.bounds.h };
}

/** Every way of putting the blocks, in order, into rows. */
function rowPackings(sizes: readonly { w: number; h: number }[], gap: number): Placement[] {
  const n = sizes.length;
  const out: Placement[] = [];
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    const at: Placement = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    let firstRow = true;
    sizes.forEach((b, i) => {
      if (i > 0 && mask & (1 << (i - 1))) {
        y += rowH + gap;
        x = 0;
        rowH = 0;
        firstRow = false;
      }
      const drop = firstRow && x > 0 ? BUTTONS_DROP : 0;
      at.push({ x, y: y + drop });
      x += b.w + gap;
      rowH = Math.max(rowH, b.h + drop);
    });
    out.push(at);
  }
  // A tall first block with the others stacked beside it.
  if (n >= 3) {
    const right = sizes[0]!.w + gap;
    let y = BUTTONS_DROP;
    out.push(
      sizes.map((b, i) =>
        i === 0 ? { x: 0, y: 0 } : { x: right, y: (y += i === 1 ? 0 : sizes[i - 1]!.h + gap) },
      ),
    );
  }
  return out;
}

export function view(step: LStep, _settings: Ll1Settings, stage?: StageSize): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const g = state.grammar;
  const blocks: { shapes: Shape[]; box: Bounds }[] = [];
  const add = (draw: (out: Shape[]) => Bounds) => {
    const shapes: Shape[] = [];
    blocks.push({ shapes, box: draw(shapes) });
  };
  if (state.run) {
    add((o) => drawParse(o, state, roles));
    add((o) => drawParseTree(o, state, roles));
    add((o) => drawTable(o, state, roles));
    add((o) =>
      drawRules(o, ruleRows(g.variables, g.rules), {
        prefix: RULES,
        x: 0,
        y: 0,
        maxW: 300,
        roles,
        title: 'Grammar',
      }),
    );
  } else {
    add((o) =>
      drawRules(o, ruleRows(g.variables, g.rules), {
        prefix: RULES,
        x: 0,
        y: 0,
        maxW: 300,
        roles,
        title: 'Grammar',
      }),
    );
    add((o) => drawSets(o, state, roles));
    add((o) => drawTable(o, state, roles));
  }
  const sizes = blocks.map((b) => b.box);
  const places = bestPlacement(sizes, rowPackings(sizes, 28), stage);
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  blocks.forEach((b, k) => {
    const at = places[k]!;
    shapes.push(...translate(b.shapes, at.x - b.box.x, at.y - b.box.y));
    boxes.push({ ...b.box, x: at.x, y: at.y });
  });
  return { shapes, bounds: padBounds(unionBounds(...boxes), 10), label: describe(state) };
}

export { setText };
