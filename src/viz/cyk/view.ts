/**
 * CYK: the rules (in Chomsky normal form, or a stage of the conversion with the rules it removes
 * crossed out and the ones it adds in green), the triangle of cells, and at the end a parse tree
 * read back from the table.
 *
 * The triangle is the table layout (src/layouts/table.ts) with the cells outside it left out:
 * row ℓ from the bottom holds the substrings of length ℓ, column i the ones starting at symbol i,
 * so the word sits under the bottom row and the whole word's cell is at the top left. Cells are
 * as wide as the longest set the finished table will hold, so nothing moves while it fills.
 * The blocks go side by side or stacked, whichever reads larger (bestPlacement, by fitScore).
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds, textWidth, translate, unionBounds } from '../../layouts/graph';
import { tableGeometry, tableScene, type TableFrame } from '../../layouts/table';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  BUTTONS_DROP,
  besideOrUnder,
  bestPlacement,
  drawRules,
  drawTree,
  layoutTree,
  ruleKey,
  ruleRows,
  type Placement,
  type RuleRow,
} from '../_grammar/draw';
import { cyk, type CnfStage, type Grammar, type Sym } from '../_grammar/grammar';
import {
  RULES,
  TREE,
  describe,
  shownGrammar,
  type CykExtra,
  type CykSettings,
  type CykState,
} from './model';

type CykStep = Step<CykState, CykExtra>;

const STAGE_NAME: Record<CnfStage['kind'], string> = {
  start: 'a new start variable',
  eps: 'remove an ε-rule',
  unit: 'remove a unit rule',
  long: 'split a long rule',
  term: 'a variable for a terminal',
};

/** The caption over the rules: which version of the grammar they are. */
export function rulesTitle(s: CykState): string {
  const n = s.cnf.stages.length;
  if (s.shown < 0) return 'The grammar as typed';
  if (s.shown === n - 1) return `Rules in CNF (start ${s.cnf.cnf.start})`;
  return `Stage ${s.shown + 1} of ${n}: ${STAGE_NAME[s.cnf.stages[s.shown]!.kind]}`;
}

/** Rows for the rules on show; with `diff`, the stage's removed rules stay, crossed out. */
function rowsFor(s: CykState, diff: boolean): RuleRow[] {
  const g = shownGrammar(s);
  const rows = ruleRows(g.variables, g.rules);
  if (!diff || s.shown < 0) return rows;
  const stage = s.cnf.stages[s.shown]!;
  const before = s.shown === 0 ? s.grammar : s.cnf.stages[s.shown - 1]!.grammar;
  const gone = new Set(stage.removed.map(ruleKey));
  const order = [...g.variables, ...before.variables.filter((v) => !g.variables.includes(v))];
  return order
    .map((lhs) => {
      const old = before.rules.filter((r) => r.lhs === lhs);
      const kept = old.map((rule) => ({ rule, struck: gone.has(ruleKey(rule)) }));
      const oldKeys = new Set(old.map(ruleKey));
      const added = g.rules.filter((r) => r.lhs === lhs && !oldKeys.has(ruleKey(r)));
      return { lhs, alts: [...kept, ...added.map((rule) => ({ rule }))] };
    })
    .filter((row) => row.alts.length);
}

const tables = new WeakMap<Grammar, Map<string, Sym[][][]>>();
/** The finished table, for sizing the cells. */
function finalTable(g: Grammar, w: readonly Sym[]): Sym[][][] {
  let m = tables.get(g);
  if (!m) tables.set(g, (m = new Map()));
  const key = w.join(' ');
  let t = m.get(key);
  if (!t) m.set(key, (t = cyk(g, w).table));
  return t;
}

const cellText = (vs: readonly Sym[] | null | undefined) =>
  vs === null || vs === undefined ? null : vs.length ? vs.join(',') : '∅';

/** A cell's set on one line, or on two when it is long, so cells can stay narrow on a phone. */
export function cellLines(vs: readonly Sym[]): string[] {
  const one = cellText(vs)!;
  if (vs.length <= 2 || one.length <= 5) return [one];
  const k = Math.ceil(vs.length / 2);
  return [`${vs.slice(0, k).join(',')},`, vs.slice(k).join(',')];
}

const LINE_SIZE = 18;

function drawTable(out: Shape[], s: CykState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const w = s.word!;
  const n = w.length;
  const done = finalTable(s.cnf.cnf, w);
  const longest = Math.max(1, ...done.flat().flatMap((c) => cellLines(c).map((l) => l.length)));
  const cellW = Math.round(Math.max(52, Math.min(92, 14 + longest * 0.6 * LINE_SIZE)));
  const frame: TableFrame = {
    rows: n,
    cols: n,
    colHeads: 2,
    colHeadsAt: 'below',
    rowHeads: [52],
    cellW,
    cellH: 44,
  };
  const values = Array.from({ length: n }, (_, r) => {
    const len = n - r;
    return Array.from({ length: n }, (_, c) =>
      c + len <= n ? cellText(s.table![len - 1]![c]) : null,
    );
  });
  const { shapes, bounds } = tableScene(frame, {
    values,
    colHeads: [Array.from({ length: n }, (_, i) => String(i + 1)), [...w]],
    colStyles: ['index', 'label'],
    rowHeads: [Array.from({ length: n }, (_, r) => `ℓ=${n - r}`)],
    rowStyles: ['index'],
    corner: [['i'], ['w']],
    roles,
  });
  // Keep the triangle: the cells past the end of the word do not exist.
  const outside = (id: string) => {
    const m = /^(?:cell|val)-(\d+)-(\d+)$/.exec(id);
    return !!m && Number(m[2]) + (n - Number(m[1])) > n;
  };
  // A long set goes on two lines: the value's text becomes the first, and a second text follows.
  const g = tableGeometry(frame);
  const kept: Shape[] = [];
  for (const x of shapes) {
    if (outside(x.id)) continue;
    kept.push(x);
    const m = /^val-(\d+)-(\d+)$/.exec(x.id);
    if (!m || x.kind !== 'text') continue;
    const [r, c] = [Number(m[1]), Number(m[2])];
    const vs = s.table![n - r - 1]![c];
    if (!vs) continue;
    const lines = cellLines(vs);
    if (lines.length < 2) continue;
    const longestLine = Math.max(...lines.map((l) => l.length));
    const size = Math.min(LINE_SIZE, Math.floor((cellW - 8) / (longestLine * 0.6)));
    const cy = g.cy(r);
    x.text = lines[0]!;
    x.size = size;
    x.y = cy - 0.2 * size;
    kept.push({ ...x, id: `${x.id}-2`, text: lines[1]!, y: cy + 0.85 * size });
  }
  out.push(...kept);
  return bounds;
}

function drawRulesBlock(
  out: Shape[],
  s: CykState,
  diff: boolean,
  maxW: number,
  roles: ReadonlyMap<string, MarkRole>,
  size?: number,
): Bounds {
  return drawRules(out, rowsFor(s, diff), {
    prefix: RULES,
    x: 0,
    y: 0,
    maxW,
    roles,
    title: rulesTitle(s),
    size,
  });
}

function drawTreeBlock(out: Shape[], s: CykState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const layout = layoutTree(s.tree!);
  const caption = 'Parse tree';
  out.push({
    kind: 'text',
    id: 'tree-caption',
    x: 0,
    y: 13,
    text: caption,
    size: 13,
    cls: 'label',
  });
  drawTree(out, s.tree!, layout, { prefix: TREE, x: 0, y: 24, roles });
  return {
    x: 0,
    y: 0,
    w: Math.max(layout.bounds.w, textWidth(caption, 13)),
    h: 24 + layout.bounds.h,
  };
}

/**
 * Three blocks: the table, the rules and the tree, in a few sensible arrangements. A block right
 * of the table at the top starts lower, clear of the zoom buttons.
 */
function threeWays(a: Bounds, b: Bounds, gap: number): Placement[] {
  const right = a.w + gap;
  const down = a.h + gap;
  const top = BUTTONS_DROP;
  return [
    [
      { x: 0, y: 0 },
      { x: right, y: top },
      { x: right + b.w + gap, y: top },
    ],
    [
      { x: 0, y: 0 },
      { x: right, y: top },
      { x: right, y: top + b.h + gap },
    ],
    [
      { x: 0, y: 0 },
      { x: right, y: top },
      { x: 0, y: down },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: down },
      { x: right, y: top },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: down },
      { x: 0, y: down + b.h + gap },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: down },
      { x: b.w + gap, y: down },
    ],
  ];
}

export function view(step: CykStep, _settings: CykSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const label = describe(state);
  const hasTable = !!state.word?.length && !!state.table;

  if (!hasTable) {
    const shapes: Shape[] = [];
    const box = drawRulesBlock(shapes, state, !!extra.diff, 440, roles);
    if (state.word && state.accept !== null) {
      const text = state.accept ? 'ε is in the language' : 'ε is not in the language';
      shapes.push({
        kind: 'text',
        id: 'status',
        x: 0,
        y: box.y + box.h + 22,
        text,
        size: 15,
        weight: 'bold',
        mono: true,
        role: state.accept ? 'found' : 'error',
      });
      return {
        shapes,
        bounds: padBounds(
          unionBounds(box, { x: 0, y: box.y + box.h, w: textWidth(text, 15, true), h: 30 }),
          14,
        ),
        label,
      };
    }
    return { shapes, bounds: padBounds(box, 14), label };
  }

  const table: Shape[] = [];
  const t = drawTable(table, state, roles);
  const rules: Shape[] = [];
  const r = drawRulesBlock(rules, state, false, 300, roles, 17);
  const blocks: { shapes: Shape[]; box: Bounds }[] = [
    { shapes: table, box: t },
    { shapes: rules, box: r },
  ];
  let places: Placement;
  if (state.accept && state.tree) {
    const tree: Shape[] = [];
    const p = drawTreeBlock(tree, state, roles);
    blocks.push({ shapes: tree, box: p });
    places = bestPlacement([t, r, p], threeWays(t, r, 30), stage);
  } else {
    places = bestPlacement([t, r], besideOrUnder(t, r, 30, BUTTONS_DROP), stage);
  }
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  blocks.forEach((b, k) => {
    const at = places[k]!;
    shapes.push(...translate(b.shapes, at.x - b.box.x, at.y - b.box.y));
    boxes.push({ ...b.box, x: at.x, y: at.y });
  });
  return { shapes, bounds: padBounds(unionBounds(...boxes), 10), label };
}
