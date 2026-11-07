import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  callTreeBounds,
  drawCallTree,
  layoutCallTree,
  monoWidth,
  type TreeCall,
} from '../../layouts/calls';
import type { Scene, Shape } from '../../render/scene';
import { pickLayout } from '../_stage/arrange';
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

const TREE = { size: 12.5, gap: 8, levelGap: 54, twoLines: true } as const;
const LINE = 24;
const ROW = 22;
/** Level notes listed under the tree: the size drawCallTree gives them, and their spacing. */
const NOTE_SIZE = Math.round(TREE.size * 0.92 * 10) / 10;
const NOTE_LINE = 20;

/** Every call of the drawn part of the tree, root first, in the order a learner reads them. */
function treeCalls(r: Rec, depth: number): TreeCall[] {
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
        add(`${p}.${j}`, p, i);
        next.push(`${p}.${j}`);
      }
    frontier = next;
  }
  return out;
}

const levelOf = (id: string) => id.split('.').length - 1;

/**
 * How the parts sit. `notes`: the work on each level right of that level (the usual way) or
 * listed under the tree (a narrow stage). `table`: the numeric check under the result (usual),
 * right of the summary, or right of the tree (a wide, short stage).
 */
interface Arrangement {
  notes: 'right' | 'under';
  table: 'under' | 'beside-summary' | 'beside-tree';
}

const ARRANGEMENTS: Arrangement[] = [
  { notes: 'right', table: 'under' },
  { notes: 'right', table: 'beside-summary' },
  { notes: 'right', table: 'beside-tree' },
  { notes: 'under', table: 'under' },
  { notes: 'under', table: 'beside-summary' },
  { notes: 'under', table: 'beside-tree' },
];

/**
 * Draw a step. With a stage, the arrangement that draws largest on it: a laptop puts the
 * numeric check beside the rest, a phone lists the level notes under the tree. Every
 * arrangement reserves the same room through an operation, so the choice holds for a run.
 */
export function view(
  step: Step<MtState, undefined>,
  settings: MtSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  if (!s.rec) return draw(step, settings, ARRANGEMENTS[0]!);
  return pickLayout(
    stage,
    (stage ? ARRANGEMENTS : ARRANGEMENTS.slice(0, 1)).map((a) => draw(step, settings, a)),
  );
}

function draw(step: Step<MtState, undefined>, settings: MtSettings, arr: Arrangement): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const r = s.rec;
  if (!r) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 20,
      y: 40,
      text: 'Type a recurrence such as 2 2 1 and press Solve.',
      size: 15,
      cls: 'label',
    });
    return { shapes, bounds: { x: 0, y: 0, w: 560, h: 200 }, label: describe(s) };
  }

  shapes.push({
    kind: 'text',
    id: 'rec',
    x: 20,
    y: 30,
    text: recText(r),
    size: 18,
    weight: 'bold',
    mono: true,
  });

  const D = drawDepth(r.a);
  const all = treeCalls(r, D);
  const layout = layoutCallTree(all, TREE);
  const notesAll = Array.from({ length: D + 1 }, (_, i) => levelNote(r, i));
  const notes = notesAll.map((n, i) => (i <= s.depth ? n : undefined));
  const top = 56 + TREE.size * 1.4;
  const dx = 20 - layout.bounds.x;
  const dy = top - layout.bounds.y;
  const right = arr.notes === 'right';
  const treeBox = callTreeBounds(layout, dx, dy, right ? notesAll : undefined);
  const shown = all
    .filter((c) => levelOf(c.id) <= s.depth)
    .map((c) => ({
      ...c,
      state: levelOf(c.id) === s.depth && !s.summary ? ('current' as const) : ('done' as const),
    }));
  shapes.push(
    ...drawCallTree(layout, shown, {
      dx,
      dy,
      roles,
      levelNotes: right ? notes : undefined,
      pathActive: false,
    }),
  );

  // Below the drawn levels: the rest of the tree in words.
  let y = treeBox.y + treeBox.h + 26;
  // On a narrow stage the level notes are listed here, in level order, as drawCallTree draws
  // them (same ids and look), instead of right of their levels.
  let notesW = 0;
  if (!right) {
    y -= 8;
    const size = NOTE_SIZE;
    notesAll.forEach((note, d) => {
      notesW = Math.max(notesW, monoWidth(note, size));
      const shown = notes[d];
      if (shown)
        shapes.push({
          kind: 'text',
          id: `level-${d}`,
          x: 20,
          y,
          text: shown,
          size,
          mono: true,
          cls: 'label',
          role: roles.get(`level-${d}`),
        });
      y += NOTE_LINE;
    });
    y += 10;
  }
  const summaryTop = y - 18;
  const { c, exact } = critical(r);
  const nc = exact ? power('n', c) : `n^${c.toFixed(3)}`;
  let summaryW = 0;
  const text = (id: string, t: string, size = 13.5, extra: Partial<Shape> = {}) => {
    summaryW = Math.max(summaryW, monoWidth(t, size));
    shapes.push({
      kind: 'text',
      id,
      x: 20,
      y,
      text: t,
      size,
      mono: true,
      role: roles.get(id),
      ...extra,
    } as Shape);
    y += LINE;
  };
  const levelsText = `log${sub(r.b)} n + 1 levels; level i has ${r.a}ⁱ calls on size n/${r.b}ⁱ`;
  const leavesText = `leaves: ${r.a === 1 ? '1 call' : `${r.a}^(log${sub(r.b)} n) = ${nc} calls`} on size 1, Θ(1) each`;
  // The trend reads "a / b^d = 3/2 > 1: each level ...": two lines, so phones keep it legible.
  const [ratio, ...rest] = trend(r).split(': ');
  // Room for every line, shown or not, so the columns beside stay put.
  for (const t of [levelsText, leavesText, `${ratio}:`, rest.join(': ')])
    summaryW = Math.max(summaryW, monoWidth(t, 13.5));
  if (s.summary) {
    text('sum-dots', '⋮', 16);
    text('sum-levels', levelsText);
    text('sum-leaves', leavesText);
  } else y += 3 * LINE;
  if (s.compared) {
    text('trend', `${ratio}:`, 13.5);
    text('trend-2', rest.join(': '), 13.5);
  } else y += 2 * LINE;

  const resultY = y + 4;
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
    const w = monoWidth(label, 16) + 28;
    summaryW = Math.max(summaryW, w);
    shapes.push({
      kind: 'rect',
      id: 'result',
      x: 20,
      y: resultY,
      w,
      h: 38,
      r: 8,
      cls: 'cell live',
      role: roles.get('result'),
    });
    shapes.push({
      kind: 'text',
      id: 'result-text',
      x: 34,
      y: resultY + 25,
      text: label,
      size: 16,
      weight: 'bold',
      mono: true,
    });
  }

  // The numeric check, as a small table: under the result, or beside the summary or the tree.
  const tableX =
    arr.table === 'beside-summary'
      ? 20 + summaryW + 48
      : arr.table === 'beside-tree'
        ? treeBox.x + treeBox.w + 40
        : 20;
  const tableY =
    arr.table === 'beside-summary'
      ? summaryTop + 10
      : arr.table === 'beside-tree'
        ? treeBox.y + 4
        : resultY + 64;
  const cols = [0, 130, 310].map((cx) => tableX + cx);
  const tableBottom = tableY + (CHECK_ROWS + 1) * ROW;
  const tableRight = cols[2]! + monoWidth('T(n) / answer', 13);
  if (s.check) {
    ['n', 'T(n)', 'T(n) / answer'].forEach((h, i) =>
      shapes.push({
        kind: 'text',
        id: `chk-head-${i}`,
        x: cols[i]!,
        y: tableY,
        text: h,
        size: 13,
        cls: 'label',
        mono: true,
      }),
    );
    for (const row of s.check) {
      const ry = tableY + row.m * ROW;
      const cells = [String(r.b ** row.m), row.t, row.ratio];
      cells.forEach((t, i) => {
        const id = `chk-${row.m}-${['n', 't', 'ratio'][i]}`;
        shapes.push({
          kind: 'text',
          id,
          x: cols[i]!,
          y: ry,
          text: t,
          size: 13,
          mono: true,
          role: roles.get(id),
        });
      });
    }
  }

  const longest = Math.max(
    ...[trend(r).split(': ').slice(1).join(': '), recText(r)].map((t) => monoWidth(t, 13.5)),
  );
  let width = Math.max(treeBox.x + treeBox.w + 20, 480, longest + 40, notesW + 40);
  // Room for the numeric check only once it runs, so a plain solve fills the stage.
  let height = s.check && arr.table === 'under' ? tableBottom : resultY + 50;
  if (s.check && arr.table !== 'under') {
    width = Math.max(width, tableRight + 30);
    height = Math.max(height, tableBottom - ROW + 16);
  }
  return { shapes, bounds: { x: 0, y: 0, w: width, h: height }, label: describe(s) };
}
