import type { MarkRole, Step } from '../../engine/types';
import {
  callTreeBounds,
  drawCallTree,
  layoutCallTree,
  monoWidth,
  type TreeCall,
} from '../../layouts/calls';
import type { Scene, Shape } from '../../render/scene';
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

export function view(step: Step<MtState, undefined>, settings: MtSettings): Scene {
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
  const treeBox = callTreeBounds(layout, dx, dy, notesAll);
  const shown = all
    .filter((c) => levelOf(c.id) <= s.depth)
    .map((c) => ({
      ...c,
      state: levelOf(c.id) === s.depth && !s.summary ? ('current' as const) : ('done' as const),
    }));
  shapes.push(
    ...drawCallTree(layout, shown, { dx, dy, roles, levelNotes: notes, pathActive: false }),
  );

  // Below the drawn levels: the rest of the tree in words.
  let y = treeBox.y + treeBox.h + 26;
  const { c, exact } = critical(r);
  const nc = exact ? power('n', c) : `n^${c.toFixed(3)}`;
  const text = (id: string, t: string, size = 13.5, extra: Partial<Shape> = {}) => {
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
  if (s.summary) {
    text('sum-dots', '⋮', 16);
    text('sum-levels', `log${sub(r.b)} n + 1 levels; level i has ${r.a}ⁱ calls on size n/${r.b}ⁱ`);
    text(
      'sum-leaves',
      `leaves: ${r.a === 1 ? '1 call' : `${r.a}^(log${sub(r.b)} n) = ${nc} calls`} on size 1, Θ(1) each`,
    );
  } else y += 3 * LINE;
  if (s.compared) text('trend', trend(r), 13.5);
  else y += LINE;

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

  // The numeric check, as a small table.
  const tableY = resultY + 64;
  const cols = [20, 150, 330];
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

  const width = Math.max(treeBox.x + treeBox.w + 20, 600, monoWidth(trend(r), 13.5) + 40);
  const height = tableY + (CHECK_ROWS + 1) * ROW;
  return { shapes, bounds: { x: 0, y: 0, w: width, h: height }, label: describe(s) };
}
