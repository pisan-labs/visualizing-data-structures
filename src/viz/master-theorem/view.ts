import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import {
  callTreeBounds,
  drawCallTree,
  layoutCallTree,
  monoWidth,
  type TreeCall,
} from '../../layouts/calls';
import { wrapText } from '../../layouts/text';
import type { Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  CHECK_ROWS,
  caseNumber,
  critical,
  describe,
  drawDepth,
  fText,
  levelNote,
  power,
  recText,
  sizeAt,
  sub,
  trend,
  type MtSettings,
  type MtState,
  type Rec,
} from './model';

const TREE = { size: 13, gap: 8, levelGap: 56, twoLines: true } as const;
/** Line spacing of the summary and the check table; `tight` is for the stacked arrangements. */
const SPACING = { loose: { line: 24, row: 22, note: 20 }, tight: { line: 20, row: 18, note: 17 } };
/** Level notes listed under the tree: the size drawCallTree gives them, and their spacing. */
const NOTE_SIZE = Math.round(TREE.size * 0.92 * 10) / 10;
const SUM_SIZE = 13.5;
const TABLE_SIZE = 13;
/** The drawing's margin on the left and right. */
const PAD = 20;
/** Room between blocks one under another, and side by side. */
const VGAP = 22;
const HGAP = 44;

/** The id of the gap that stands for the calls a narrow tree leaves out, under parent `p`. */
const gapId = (p: string) => `${p}.more`;

/**
 * Every call of the drawn part of the tree, root first, in the order a learner reads them.
 * `elide` keeps only the first two and the last call under each parent, with a gap ("⋯")
 * for the rest, when a parent has more than three.
 */
function treeCalls(r: Rec, depth: number, elide = false): TreeCall[] {
  const out: TreeCall[] = [];
  const add = (id: string, parent: string | null, level: number) => {
    const size = sizeAt(r, level);
    out.push({ id, parent, label: `T(${size})`, value: fText(r.d, r.k, size), state: 'done' });
  };
  add('r', null, 0);
  let frontier = ['r'];
  for (let i = 1; i <= depth; i++) {
    const next: string[] = [];
    for (const p of frontier)
      for (let j = 0; j < r.a; j++) {
        if (elide && r.a > 3 && j >= 2 && j < r.a - 1) {
          if (j === 2) out.push({ id: gapId(p), parent: p, label: '⋯', state: 'done' });
          continue;
        }
        add(`${p}.${j}`, p, i);
        next.push(`${p}.${j}`);
      }
    frontier = next;
  }
  return out;
}

const levelOf = (id: string) => id.split('.').length - 1;
const isGap = (id: string) => id.endsWith('.more');

/** A part of the drawing: shapes with their top left corner at (0, 0), and its size. */
interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

const EMPTY: Block = { shapes: [], w: 0, h: 0 };

/** `a` over `b`. */
function under(a: Block, b: Block, gap = VGAP): Block {
  if (!b.h) return a;
  if (!a.h) return b;
  return {
    shapes: [...a.shapes, ...translate(b.shapes, 0, a.h + gap)],
    w: Math.max(a.w, b.w),
    h: a.h + gap + b.h,
  };
}

/** `b` right of `a`, `drop` lower. */
function beside(a: Block, b: Block, drop = 0, gap = HGAP): Block {
  if (!b.h) return a;
  return {
    shapes: [...a.shapes, ...translate(b.shapes, a.w + gap, drop)],
    w: a.w + gap + b.w,
    h: Math.max(a.h, b.h + drop),
  };
}

/**
 * How the parts sit, as blocks: the call tree with its level notes, the summary with the
 * result, and the numeric check. With the notes in a list, the view also tries shallower trees
 * (the list carries the deeper levels) and, for more than three calls, trees that show three
 * of them and a "⋯".
 */
interface Arrangement {
  /** Right of each level, listed under the tree, or listed beside it. */
  notes: 'right' | 'under' | 'beside';
  /** Where the summary and the check sit. */
  place:
    | 'stack' // all one under another
    | 'table-beside-summary'
    | 'table-beside-tree'
    | 'columns' // the tree and its notes left, the summary and the check right
    | 'table-right'; // the tree, notes and summary left, the check right
  /**
   * Wrap summary lines longer than this (a phone draws them larger for it), space lines
   * closer, and drop the summary's "⋮".
   */
  wrap: number | false;
}

const USUAL: Arrangement = { notes: 'right', place: 'stack', wrap: false };

const ARRANGEMENTS: Arrangement[] = [
  USUAL,
  { notes: 'right', place: 'table-beside-summary', wrap: false },
  { notes: 'right', place: 'table-beside-tree', wrap: false },
  { notes: 'right', place: 'columns', wrap: 380 },
  { notes: 'under', place: 'stack', wrap: 380 },
  { notes: 'under', place: 'table-beside-summary', wrap: 380 },
  { notes: 'under', place: 'columns', wrap: 380 },
  { notes: 'under', place: 'table-right', wrap: 380 },
  { notes: 'beside', place: 'stack', wrap: 460 },
  { notes: 'beside', place: 'table-right', wrap: 460 },
  { notes: 'beside', place: 'columns', wrap: 460 },
];

/**
 * Draw a step. With a stage, the arrangement that draws largest on it: a laptop puts the
 * summary and the numeric check beside the tree, a phone lists the level notes under a
 * shallower tree and wraps long lines. Every arrangement reserves the same room through an
 * operation, so the choice holds for a run.
 */
export function view(
  step: Step<MtState, undefined>,
  settings: MtSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  if (!s.rec) return draw(step, settings, USUAL, 0);
  if (!stage) return draw(step, settings, USUAL, drawDepth(s.rec.a));
  const D = drawDepth(s.rec.a);
  const options: Scene[] = [];
  for (const arr of ARRANGEMENTS)
    for (let depth = D; depth >= (arr.notes === 'right' ? D : 1); depth--)
      for (const elide of s.rec.a > 3 && arr.wrap ? [false, true] : [false])
        options.push(draw(step, settings, arr, depth, elide));
  return pickLayout(stage, options);
}

function draw(
  step: Step<MtState, undefined>,
  settings: MtSettings,
  arr: Arrangement,
  treeDepth: number,
  elide = false,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = s.rec;
  if (!r) {
    const shapes: Shape[] = [
      {
        kind: 'text',
        id: 'empty',
        x: 20,
        y: 40,
        text: 'Type a recurrence such as 2 2 1 and press Solve.',
        size: 15,
        cls: 'label',
      },
    ];
    return { shapes, bounds: { x: 0, y: 0, w: 560, h: 200 }, label: describe(s) };
  }

  const header: Shape = {
    kind: 'text',
    id: 'rec',
    x: PAD,
    y: 30,
    text: recText(r),
    size: 18,
    weight: 'bold',
    mono: true,
  };
  const top = 56;

  const D = drawDepth(r.a);
  const notesAll = Array.from({ length: D + 1 }, (_, i) => levelNote(r, i));
  const notes = notesAll.map((n, i) => (i <= s.depth ? n : undefined));
  const right = arr.notes === 'right';
  const tree = treeBlock(r, s, roles, treeDepth, elide, D, right ? notes : undefined, notesAll);
  const gaps = SPACING[arr.wrap ? 'tight' : 'loose'];
  const list = right ? EMPTY : notesBlock(notes, notesAll, roles, gaps.note);
  // The tree with its notes: under it, or beside it, level with the root.
  const treeAndNotes = arr.notes === 'beside' ? beside(tree, list, 0, 32) : under(tree, list, 10);
  const summary = summaryBlock(r, s, settings, roles, arr.wrap);
  const table = tableBlock(r, s, roles, gaps.row);

  // Blocks beside the tree start level with it, under the recurrence, which keeps them clear of
  // the stage's zoom buttons; the table beside the tree in the usual look starts lower.
  const drop = arr.wrap ? 0 : ZOOM_DROP;
  let body: Block;
  switch (arr.place) {
    case 'stack':
      body = under(under(treeAndNotes, summary), table, VGAP + 4);
      break;
    case 'table-beside-summary':
      body = under(treeAndNotes, beside(summary, table, 10));
      break;
    case 'table-beside-tree':
      body = under(beside(treeAndNotes, table, drop), summary);
      break;
    case 'columns':
      body = beside(treeAndNotes, under(summary, table, VGAP + 4), drop);
      break;
    case 'table-right':
      body = beside(under(treeAndNotes, summary), table, drop);
      break;
  }
  const shapes = [header, ...translate(body.shapes, PAD, top)];
  const width = Math.max(
    body.w + 2 * PAD,
    monoWidth(header.text, 18) + 2 * PAD,
    arr === USUAL ? 480 : 0,
  );
  const height = top + body.h + 12;
  return { shapes, bounds: { x: 0, y: 0, w: width, h: height }, label: describe(s) };
}

/** The first `depth` levels of the call tree, with the level notes right of them if given. */
function treeBlock(
  r: Rec,
  s: MtState,
  roles: Map<string, MarkRole>,
  depth: number,
  elide: boolean,
  fullDepth: number,
  notes: (string | undefined)[] | undefined,
  notesAll: string[],
): Block {
  const calls = treeCalls(r, depth, elide);
  const layout = layoutCallTree(calls, TREE);
  const dx = -layout.bounds.x;
  const dy = -layout.bounds.y;
  const box = callTreeBounds(layout, dx, dy, notes ? notesAll : undefined);
  const shown = calls
    .filter((c) => levelOf(c.id) <= s.depth)
    .map((c) => ({
      ...c,
      state: levelOf(c.id) === s.depth && !s.summary ? ('current' as const) : ('done' as const),
    }));
  // A gap keeps only its "⋯", with no box and no edge.
  const shapes = drawCallTree(layout, shown, {
    dx,
    dy,
    roles,
    levelNotes: notes,
    pathActive: false,
  }).filter((sh) => !(isGap(sh.id.replace(/-edge$/, '')) && sh.kind !== 'text'));
  let h = box.h;
  // A shallower tree than the operation reaches says that it goes on.
  if (depth < fullDepth) {
    if (s.depth > depth)
      shapes.push({
        kind: 'text',
        id: 'tree-more',
        x: box.w / 2,
        y: box.h + 16,
        text: '⋮',
        size: 16,
        anchor: 'middle',
        cls: 'label',
      });
    h += 20;
  }
  return { shapes, w: box.w, h };
}

/** The level notes as a list, in level order, as drawCallTree draws them (same ids and look). */
function notesBlock(
  notes: (string | undefined)[],
  notesAll: string[],
  roles: Map<string, MarkRole>,
  line: number,
): Block {
  const shapes: Shape[] = [];
  notes.forEach((note, d) => {
    if (note)
      shapes.push({
        kind: 'text',
        id: `level-${d}`,
        x: 0,
        y: NOTE_SIZE + d * line,
        text: note,
        size: NOTE_SIZE,
        mono: true,
        cls: 'label',
        role: roles.get(`level-${d}`),
      });
  });
  const w = Math.max(...notesAll.map((n) => monoWidth(n, NOTE_SIZE)));
  return { shapes, w, h: NOTE_SIZE + (notesAll.length - 1) * line + 4 };
}

/** The rest of the tree in words, the comparison, and the result. */
function summaryBlock(
  r: Rec,
  s: MtState,
  settings: MtSettings,
  roles: Map<string, MarkRole>,
  wrap: number | false,
): Block {
  const shapes: Shape[] = [];
  const LINE = SPACING[wrap ? 'tight' : 'loose'].line;
  let w = 0;
  let y = 18;
  // A line longer than the column breaks where `parts` says, then at spaces; the first piece
  // keeps the id the marks use.
  const lines = (parts: string[], size: number): string[] => {
    const whole = parts.join(' ');
    if (!wrap || monoWidth(whole, size) <= wrap) return [whole];
    return parts.flatMap((p) => wrapText(p, wrap, size, { mono: true }));
  };
  const put = (id: string, parts: string[], show: boolean, size = SUM_SIZE) => {
    lines(parts, size).forEach((piece, j) => {
      w = Math.max(w, monoWidth(piece, size));
      const pid = j === 0 ? id : `${id}-${j + 1}`;
      if (show)
        shapes.push({
          kind: 'text',
          id: pid,
          x: 0,
          y,
          text: piece,
          size,
          mono: true,
          role: roles.get(id),
        });
      y += LINE;
    });
  };
  const { c, exact } = critical(r);
  const nc = exact ? power('n', c) : `n^${c.toFixed(3)}`;
  const levelsText = [
    `log${sub(r.b)} n + 1 levels;`,
    `level i has ${r.a}ⁱ calls on size n/${r.b}ⁱ`,
  ];
  const leavesText = [
    `leaves: ${r.a === 1 ? '1 call' : `${r.a}^(log${sub(r.b)} n) = ${nc} calls`}`,
    'on size 1, Θ(1) each',
  ];
  // The trend reads "a / b^d = 3/2 > 1: each level ...": two lines, so phones keep it legible.
  const [ratio, ...rest] = trend(r).split(': ');
  // Room for every line, shown or not, so the parts around stay put.
  if (!wrap) put('sum-dots', ['⋮'], s.summary, 16);
  put('sum-levels', levelsText, s.summary);
  put('sum-leaves', leavesText, s.summary);
  put('trend', [`${ratio}:`], s.compared);
  put('trend-2', [rest.join(': ')], s.compared);

  const resultY = y - LINE + 14;
  if (s.result) {
    const caseName =
      settings.form === 'simple'
        ? s.result.kind === 'root'
          ? 'a < b^d'
          : s.result.kind === 'equal'
            ? 'a = b^d'
            : 'a > b^d'
        : s.result.kind === 'gap'
          ? 'no case applies'
          : `case ${caseNumber(s.result.kind)}`;
    const label = `${caseName}: T(n) = ${s.result.answer}`;
    const bw = monoWidth(label, 16) + 28;
    w = Math.max(w, bw);
    shapes.push({
      kind: 'rect',
      id: 'result',
      x: 0,
      y: resultY,
      w: bw,
      h: 38,
      r: 8,
      cls: 'cell live',
      role: roles.get('result'),
    });
    shapes.push({
      kind: 'text',
      id: 'result-text',
      x: 14,
      y: resultY + 25,
      text: label,
      size: 16,
      weight: 'bold',
      mono: true,
    });
  }
  return { shapes, w, h: resultY + 38 };
}

/** The numeric check, as a small table, once it runs (no room is kept for it before). */
function tableBlock(r: Rec, s: MtState, roles: Map<string, MarkRole>, row: number): Block {
  if (!s.check) return EMPTY;
  const head = ['n', 'T(n)', 'T(n) / answer'];
  const rows = s.check.map((row) => [String(r.b ** row.m), row.t, row.ratio]);
  // Each column as wide as its widest entry, and a gap.
  const widths = head.map((h, i) =>
    Math.max(monoWidth(h, TABLE_SIZE), ...rows.map((cells) => monoWidth(cells[i]!, TABLE_SIZE))),
  );
  const cols = [0, widths[0]! + 36, widths[0]! + widths[1]! + 72];
  const shapes: Shape[] = head.map((h, i) => ({
    kind: 'text',
    id: `chk-head-${i}`,
    x: cols[i]!,
    y: TABLE_SIZE,
    text: h,
    size: TABLE_SIZE,
    cls: 'label',
    mono: true,
  }));
  s.check.forEach((check, j) =>
    rows[j]!.forEach((t, i) => {
      const id = `chk-${check.m}-${['n', 't', 'ratio'][i]}`;
      shapes.push({
        kind: 'text',
        id,
        x: cols[i]!,
        y: TABLE_SIZE + check.m * row,
        text: t,
        size: TABLE_SIZE,
        mono: true,
        role: roles.get(id),
      });
    }),
  );
  return { shapes, w: cols[2]! + widths[2]!, h: TABLE_SIZE + CHECK_ROWS * row + 6 };
}
