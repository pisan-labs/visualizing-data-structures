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
import { tableScene, type TableFrame } from '../../layouts/table';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
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
  if (s.shown === n - 1) return `Rules in Chomsky normal form (start ${s.cnf.cnf.start})`;
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

function drawTable(out: Shape[], s: CykState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const w = s.word!;
  const n = w.length;
  const done = finalTable(s.cnf.cnf, w);
  const longest = Math.max(1, ...done.flat().map((c) => (cellText(c) ?? '').length));
  const cellW = Math.round(Math.max(52, Math.min(100, 12 + longest * 0.6 * 18)));
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
  out.push(...shapes.filter((x) => !outside(x.id)));
  return bounds;
}

function drawRulesBlock(
  out: Shape[],
  s: CykState,
  diff: boolean,
  maxW: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  return drawRules(out, rowsFor(s, diff), {
    prefix: RULES,
    x: 0,
    y: 0,
    maxW,
    roles,
    title: rulesTitle(s),
  });
}

function drawTreeBlock(out: Shape[], s: CykState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const layout = layoutTree(s.tree!);
  const caption = 'A parse tree, read back from the table';
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

/** Three blocks: the table, the rules and the tree, in a few sensible arrangements. */
function threeWays(a: Bounds, b: Bounds, c: Bounds, gap: number): Placement[] {
  const right = a.w + gap;
  const down = a.h + gap;
  return [
    [
      { x: 0, y: 0 },
      { x: right, y: 0 },
      { x: right + b.w + gap, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: right, y: 0 },
      { x: right, y: b.h + gap },
    ],
    [
      { x: 0, y: 0 },
      { x: right, y: 0 },
      { x: 0, y: down },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: down },
      { x: right, y: 0 },
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
  const r = drawRulesBlock(rules, state, false, 300, roles);
  const blocks: { shapes: Shape[]; box: Bounds }[] = [
    { shapes: table, box: t },
    { shapes: rules, box: r },
  ];
  let places: Placement;
  if (state.accept && state.tree) {
    const tree: Shape[] = [];
    const p = drawTreeBlock(tree, state, roles);
    blocks.push({ shapes: tree, box: p });
    places = bestPlacement([t, r, p], threeWays(t, r, p, 30), stage);
  } else {
    places = bestPlacement([t, r], besideOrUnder(t, r, 30), stage);
  }
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  blocks.forEach((b, k) => {
    const at = places[k]!;
    // The rules start a little lower beside the table, clear of the zoom buttons.
    const dy = k > 0 && at.y === 0 ? 34 : 0;
    const dx = at.x - b.box.x;
    shapes.push(...translate(b.shapes, dx, at.y - b.box.y + dy));
    boxes.push({ ...b.box, x: at.x, y: at.y + dy });
  });
  return { shapes, bounds: padBounds(unionBounds(...boxes), 10), label };
}
