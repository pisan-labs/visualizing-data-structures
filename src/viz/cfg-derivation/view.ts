/**
 * A derivation: the rules (the one just used lit), the sentential form as a row of symbol
 * cells (the variable replaced next in blue, the symbols just made in green), the derivation so
 * far as a line of forms, and the parse tree growing node by node. The tree goes beside the
 * rest on a wide stage and under it on a tall one (bestPlacement, by fitScore). Ambiguity draws
 * a second tree beside (or under) the first.
 *
 * Everything is sized for the whole derivation from its first step: the form row keeps room for
 * the longest form, the derivation line for every form, and each tree node is drawn where it
 * sits in the finished tree, so the camera stays still while the tree grows.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds, textWidth, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  besideOrUnder,
  bestPlacement,
  drawRules,
  drawTree,
  layoutTree,
  ruleRows,
} from '../_grammar/draw';
import {
  EPS,
  formText,
  isVariable,
  treeOf,
  type DerivStep,
  type Grammar,
  type ParseTree,
  type Sym,
  type TrackedForm,
} from '../_grammar/grammar';
import {
  RULES,
  TREE,
  TREE2,
  describe,
  formId,
  showWord,
  type CfgExtra,
  type CfgSettings,
  type CfgState,
} from './model';

const CELL_W = 30;
const CELL_H = 32;
const PITCH = CELL_W + 4;
const PER_ROW = 11;
const ROW_PITCH = CELL_H + 8;
const CHAIN_SIZE = 14;
const CHAIN_LINE = 21;
/** The widest the rules, the form and the derivation line get. */
export const MAIN_W = 370;

type CfgStep = Step<CfgState, CfgExtra>;

/** The forms and trees of a derivation, cached by its steps array. */
const cache = new WeakMap<object, ReturnType<typeof treeOf>>();
function track(g: Grammar, steps: DerivStep[]) {
  let t = cache.get(steps);
  if (!t) {
    t = treeOf(g, steps);
    cache.set(steps, t);
  }
  return t;
}

const cellX = (x0: number, i: number) => x0 + (i % PER_ROW) * PITCH;
const cellY = (y0: number, i: number) => y0 + Math.floor(i / PER_ROW) * ROW_PITCH;

/**
 * The sentential form as a row of cells, wrapping after PER_ROW, with room for `room` cells.
 * Symbols made this step slide out of the cell of the variable they replace.
 */
function drawForm(
  out: Shape[],
  form: TrackedForm,
  before: TrackedForm | null,
  x0: number,
  y0: number,
  room: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const now = new Set(form.map((f) => f.node));
  const was = new Set(before?.map((f) => f.node) ?? []);
  const replaced = before ? before.findIndex((b) => !now.has(b.node)) : -1;
  const from = replaced >= 0 ? { x: cellX(x0, replaced), y: cellY(y0, replaced) } : undefined;
  form.forEach((f, i) => {
    const id = formId(f.node);
    const role = roles.get(id);
    const enter = before && !was.has(f.node) ? from : undefined;
    const x = cellX(x0, i);
    const y = cellY(y0, i);
    const variable = isVariable(f.sym);
    out.push({
      kind: 'rect',
      id,
      x,
      y,
      w: CELL_W,
      h: CELL_H,
      r: 5,
      cls: 'live',
      role,
      enterFrom: enter,
    });
    const size = f.sym.length > 1 ? 15 : 18;
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + CELL_W / 2,
      y: y + CELL_H / 2 + size * 0.36,
      text: f.sym,
      size,
      anchor: 'middle',
      weight: variable ? 'bold' : undefined,
      mono: !variable,
      role,
      enterFrom: enter && { x: enter.x + CELL_W / 2, y: enter.y + CELL_H / 2 + size * 0.36 },
    });
  });
  if (!form.length) {
    out.push({
      kind: 'text',
      id: 'f-eps',
      x: x0 + 2,
      y: y0 + CELL_H / 2 + 6,
      text: `${EPS}: no symbols left`,
      size: 16,
      cls: 'label',
    });
  }
  const n = Math.max(1, room);
  const rows = Math.ceil(n / PER_ROW);
  return {
    x: x0,
    y: y0,
    w: Math.max(Math.min(n, PER_ROW) * PITCH - 4, form.length ? 0 : 170),
    h: (rows - 1) * ROW_PITCH + CELL_H,
  };
}

/** Where each token of a derivation line goes, packed into lines no wider than maxW. */
function packChain(tokens: string[], maxW: number, firstX: number): { x: number; line: number }[] {
  const out: { x: number; line: number }[] = [];
  let x = firstX;
  let line = 0;
  const space = textWidth(' ', CHAIN_SIZE, true);
  for (const t of tokens) {
    const w = textWidth(t, CHAIN_SIZE, true);
    if (x > firstX && x + w > maxW) {
      line += 1;
      x = 0;
    }
    out.push({ x, line });
    x += w + space;
  }
  return out;
}

/** A derivation as a wrapped line of forms; only the first `shown` forms are drawn. */
function drawChain(
  out: Shape[],
  id: string,
  forms: Sym[][],
  shown: number,
  x0: number,
  y0: number,
  maxW: number,
  label?: string,
): Bounds {
  const tokens = forms.map((f, k) => (k === 0 ? formText(f) : `⇒ ${formText(f)}`));
  const labelW = label ? textWidth(`${label} `, CHAIN_SIZE, true) : 0;
  if (label && shown > 0)
    out.push({
      kind: 'text',
      id: `${id}-label`,
      x: x0,
      y: y0 + CHAIN_SIZE,
      text: label,
      size: CHAIN_SIZE,
      mono: true,
      cls: 'label',
    });
  const places = packChain(tokens, maxW, labelW);
  tokens.forEach((t, k) => {
    if (k >= shown) return;
    const p = places[k]!;
    out.push({
      kind: 'text',
      id: `${id}-${k}`,
      x: x0 + p.x,
      y: y0 + CHAIN_SIZE + p.line * CHAIN_LINE,
      text: t,
      size: CHAIN_SIZE,
      mono: true,
      weight: k === shown - 1 && k > 0 ? 'bold' : undefined,
    });
  });
  const lines = (places.at(-1)?.line ?? 0) + 1;
  return { x: x0, y: y0, w: maxW, h: lines * CHAIN_LINE };
}

/** A tree with a caption over it at (x, y); with no `out`, only its box. */
function drawCaptioned(
  out: Shape[] | null,
  tree: ParseTree,
  prefix: string,
  caption: string | null,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
  shown?: (id: number) => boolean,
  fresh?: (id: number) => boolean,
): Bounds {
  const layout = layoutTree(tree);
  const top = caption ? y + 24 : y;
  if (out && caption)
    out.push({
      kind: 'text',
      id: `${prefix}caption`,
      x,
      y: y + 13,
      text: caption,
      size: 13,
      cls: 'label',
    });
  if (out) drawTree(out, tree, layout, { prefix, x, y: top, roles, shown, fresh });
  return {
    x,
    y,
    w: Math.max(layout.bounds.w, caption ? textWidth(caption, 13) : 0),
    h: top - y + layout.bounds.h,
  };
}

export function view(step: CfgStep, _settings: CfgSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const g = state.grammar;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const main: Shape[] = [];
  const run = state.run;
  const t = run ? track(g, run.steps) : null;
  const at = run?.at ?? 0;
  const second = state.second;

  // The rules.
  const rules = drawRules(main, ruleRows(g.variables, g.rules), {
    prefix: RULES,
    x: 0,
    y: 0,
    maxW: MAIN_W,
    roles,
    title: `Rules (start variable ${g.start})`,
  });

  // The sentential form.
  let y = rules.y + rules.h + 16;
  const caption = run
    ? `${run.mode} derivation of ${showWord(run.word)}`
    : state.word
      ? `the word ${showWord(state.word)}`
      : 'sentential form';
  main.push({
    kind: 'text',
    id: 'form-caption',
    x: 0,
    y: y + 13,
    text: caption,
    size: 13,
    cls: 'label',
  });
  const boxes: Bounds[] = [rules, { x: 0, y, w: textWidth(caption, 13), h: 18 }];
  y += 22;
  const forms: TrackedForm[] = t ? t.forms : [[{ sym: g.start, node: 0 }]];
  const room = Math.max(...forms.map((f) => f.length));
  const formBox = drawForm(main, forms[at]!, at > 0 ? forms[at - 1]! : null, 0, y, room, roles);
  boxes.push(formBox);
  y = formBox.y + formBox.h + 14;

  // The derivation so far, and the second one.
  if (t) {
    const syms = t.forms.map((f) => f.map((x) => x.sym));
    const chain = drawChain(main, 'd', syms, at + 1, 0, y, MAIN_W, second ? 'tree 1:' : undefined);
    boxes.push(chain);
    y = chain.y + chain.h + 4;
    if (second) {
      const syms2 = track(g, second.steps).forms.map((f) => f.map((x) => x.sym));
      const shown2 = second.shown ? syms2.length : 0;
      const chain2 = drawChain(main, 'd2', syms2, shown2, 0, y, MAIN_W, 'tree 2:');
      boxes.push(chain2);
      y = chain2.y + chain2.h + 4;
    }
  }
  if (extra.status) {
    main.push({
      kind: 'text',
      id: 'status',
      x: 0,
      y: y + 16,
      text: extra.status.text,
      size: 15,
      weight: 'bold',
      mono: true,
      role: roles.get('status') ?? extra.status.role,
    });
    boxes.push({ x: 0, y, w: textWidth(extra.status.text, 15, true), h: 22 });
  }
  const mainBox = unionBounds(...boxes);

  // The tree, or two: their sizes first, then drawn where they go.
  const final: ParseTree = t ? t.trees.at(-1)! : [{ id: 0, sym: g.start, kids: [], parent: -1 }];
  const t2 = second ? track(g, second.steps).trees.at(-1)! : null;
  const cap1 = second ? 'tree 1' : null;
  const one = drawCaptioned(null, final, TREE, cap1, 0, 0, roles);
  let pair = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  let treeBox = one;
  if (t2) {
    const two = drawCaptioned(null, t2, TREE2, 'tree 2', 0, 0, roles);
    pair = bestPlacement([one, two], besideOrUnder(one, two, 36));
    treeBox = unionBounds(one, { ...two, ...pair[1]! });
  }
  const place = bestPlacement([mainBox, treeBox], besideOrUnder(mainBox, treeBox, 40), stage);
  const ox = place[1]!.x;
  const oy = place[1]!.y;
  const shapes = [...main];
  const made = t ? t.trees[at]!.length : 1;
  const before = t && at > 0 ? t.trees[at - 1]!.length : made;
  drawCaptioned(
    shapes,
    final,
    TREE,
    cap1,
    ox,
    oy,
    roles,
    (id) => id < made,
    (id) => id >= before,
  );
  if (t2 && second?.shown)
    drawCaptioned(shapes, t2, TREE2, 'tree 2', ox + pair[1]!.x, oy + pair[1]!.y, roles);
  const total = unionBounds(mainBox, { ...treeBox, x: ox, y: oy });
  return { shapes, bounds: padBounds(total, 14), label: describe(state) };
}
