/**
 * The table of toy programs against their descriptions (src/layouts/table.ts), D's row under
 * it, and the cell for D on ⟨D⟩ where the diagonal would continue. A panel goes beside the table
 * on a wide stage and under it on a tall one (placePanels): the programs and their codes, a run
 * line by line with the tape, or the argument for D on ⟨D⟩ and for the reduction. The panel
 * keeps one size for a table size, so the camera never moves between operations.
 *
 * Shape ids: the table's `cell-i-j`, `val-i-j`, `ch-0-j`, `rh-0-i` and `path-k`; D's row
 * `d-i` (text `d-i-t`) and `d-label`; `dd`, `dd-t`, `dd-head` and `dd-arrow` for D on ⟨D⟩; the
 * panel's `panel-title`, `legend-i` and `legend-i-w<k>`, the listing `ln-k` (text `ln-k-t`),
 * the tape `tape-c`, `status`, and `proof-k`.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { placePanels, unionBounds, padBounds } from '../../layouts/graph';
import { CELL_W as TAPE_W, drawTape } from '../../layouts/tape';
import { tableGeometry, tableScene, valueSize, type Cell } from '../../layouts/table';
import { wrapText } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  DD_ID,
  M,
  cellLabel,
  dId,
  dLabel,
  dOutcome,
  desc,
  describe,
  reducedLabel,
  type Framing,
  type HaltExtra,
  type HaltSettings,
  type HaltState,
  type RunView,
} from './model';
import { PROGRAMS, cell, instrText, type Outcome } from './toy';

const CELL_W = 56;
const CELL_H = 44;
const HEAD_W = 44;
/** The gap between the table and D's row, and between the table and the ⟨D⟩ column. */
const D_GAP = 14;

const TITLE = 17;
const TEXT = 15;
const LINE_H = 20;
const LIST_H = 22;
const LIST_W = 200;

/** The color a finished cell keeps: accept and halt green, reject orange, a loop plain. */
function outcomeRole(o: Outcome, framing: Framing): MarkRole | undefined {
  if (o === 'accept') return 'done';
  if (o === 'reject') return framing === 'halt' ? 'done' : 'remove';
  return undefined;
}

const text = (
  id: string,
  x: number,
  y: number,
  t: string,
  size: number,
  more: Partial<Extract<Shape, { kind: 'text' }>> = {},
): Shape => ({ kind: 'text', id, x, y, text: t, size, ...more });

// ---------------------------------------------------------------------------------------------
// The panel

/** The panel's width for a table of n programs: the tape for the longest description. */
function panelWidth(n: number): number {
  const longest = Math.max(...PROGRAMS.slice(0, n).map((p) => p.code.length));
  return Math.max(300, (longest + 1) * TAPE_W);
}

function paragraphs(
  out: Shape[],
  x: number,
  y: number,
  width: number,
  items: { text: string; role?: MarkRole; bold?: boolean }[],
): number {
  items.forEach((p, k) => {
    // The error role draws text bold too (Shapes.svelte), so those lines are measured bold.
    const bold = p.bold || p.role === 'error';
    wrapText(p.text, width, TEXT, { bold }).forEach((line, l) => {
      out.push(
        text(`proof-${k}-${l}`, x, y + TEXT, line, TEXT, {
          role: p.role,
          weight: p.bold ? 'bold' : undefined,
        }),
      );
      y += LINE_H;
    });
    y += 6;
  });
  return y;
}

/** The argument for D on ⟨D⟩, as far as it has got. */
function proofItems(s: HaltState): { text: string; role?: MarkRole; bold?: boolean }[] {
  const halt = s.framing === 'halt';
  const all = [
    {
      text: halt
        ? 'Suppose H decides HALT. Then D is a Turing machine too, with a description ⟨D⟩.'
        : 'Suppose H decides A_TM. Then D is a Turing machine too, with a description ⟨D⟩.',
    },
    {
      text: halt
        ? 'If D halts on ⟨D⟩, H says it halts, so D loops. ✗'
        : 'If D accepts ⟨D⟩, H accepts ⟨D, ⟨D⟩⟩, so D rejects ⟨D⟩. ✗',
      role: 'error' as const,
    },
    {
      text: halt
        ? 'If D loops on ⟨D⟩, H says it loops, so D halts. ✗'
        : 'If D does not accept ⟨D⟩, H rejects, so D accepts ⟨D⟩. ✗',
      role: 'error' as const,
    },
    { text: 'Both are impossible, so H does not exist.', bold: true },
  ];
  const k = { none: 0, ask: 1, yes: 2, no: 3, done: 4 }[s.dd];
  return all.slice(0, k);
}

/** The reduction, with its last line once every cell is answered. */
function reduceItems(s: HaltState, all = false): { text: string; bold?: boolean }[] {
  const halt = s.framing === 'halt';
  const items = halt
    ? [
        { text: 'Then R would decide HALT.' },
        { text: 'R on ⟨M, w⟩: make M′, which is M with every reject changed to accept.' },
        { text: 'Ask S whether M′ accepts w. It does exactly when M halts on w.' },
        { text: 'Impossible, so S does not exist.', bold: true },
      ]
    : [
        { text: 'Then S would decide A_TM.' },
        { text: 'S on ⟨M, w⟩: ask R whether M halts on w.' },
        { text: 'If not, reject. If it does, run M on w and answer as M does.' },
        { text: 'Impossible, so R does not exist.', bold: true },
      ];
  const done = s.reduced.every((row) => row.every(Boolean));
  return all || done ? items : items.slice(0, 3);
}

function drawLegend(out: Shape[], s: HaltState, x: number, y: number, width: number): number {
  out.push(
    text('panel-title', x, y + TITLE, 'The programs and their codes', TITLE, { weight: 'bold' }),
  );
  y += TITLE + 12;
  for (let i = 0; i < s.n; i++) {
    const p = PROGRAMS[i]!;
    out.push(
      text(`legend-${i}`, x, y + TEXT, `${M(i)} = ${p.code}`, TEXT, { mono: true, weight: 'bold' }),
    );
    y += LINE_H;
    wrapText(p.what, width - 16, 14).forEach((line, l) => {
      out.push(text(`legend-${i}-w${l}`, x + 16, y + 14, line, 14, { cls: 'label' }));
      y += LINE_H - 2;
    });
    y += 4;
  }
  return y;
}

function statusOf(r: RunView): { text: string; role?: MarkRole } {
  const steps = `${r.step} step${r.step === 1 ? '' : 's'}`;
  switch (r.done) {
    case 'accept':
      return { text: `accepts after ${steps}`, role: 'done' };
    case 'reject':
      return { text: `rejects after ${steps}`, role: 'error' };
    case 'loop':
      return { text: `loops: step ${r.step + 1} repeats step ${r.first}`, role: 'error' };
    case 'unknown':
      return { text: `no answer after ${steps}`, role: 'error' };
    default:
      return { text: `step ${r.step}: line ${r.line}, head on cell ${r.head}` };
  }
}

function drawRun(
  out: Shape[],
  r: RunView,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): number {
  const prog = PROGRAMS[r.i]!.prog;
  const input = PROGRAMS[r.j]!.code;
  out.push(
    text('panel-title', x, y + TITLE, `${M(r.i)} on ${desc(r.j)} = ${input}`, TITLE, {
      weight: 'bold',
      mono: true,
    }),
  );
  y += TITLE + 12;
  const doneRole: MarkRole | undefined =
    r.done === 'accept' ? 'found' : r.done ? 'error' : 'active';
  prog.forEach((ins, k) => {
    const id = `ln-${k}`;
    const current = k === r.line - 1;
    const role = roles.get(id) ?? (current ? doneRole : undefined);
    out.push({
      kind: 'rect',
      id,
      x,
      y: y + k * LIST_H,
      w: LIST_W,
      h: LIST_H - 3,
      r: 3,
      cls: 'live',
      role,
    });
    out.push(
      text(`${id}-t`, x + 8, y + k * LIST_H + 14, `${k + 1}  ${instrText(ins)}`, 14, {
        mono: true,
        role: role === 'active' || role === 'error' || role === 'found' ? role : undefined,
      }),
    );
  });
  y += prog.length * LIST_H + 8;
  const tape = drawTape(out, {
    id: 'tape',
    x,
    y,
    cells: [...input],
    to: input.length + 1,
    head: r.head,
    headRoom: 'head',
    index: true,
    left: true,
    roles,
  });
  y = tape.y + tape.h + 6;
  const st = statusOf(r);
  out.push(text('status', x, y + TEXT, st.text, TEXT, { mono: true, role: st.role }));
  return y + LINE_H;
}

function drawPanel(
  out: Shape[],
  s: HaltState,
  x: number,
  y: number,
  width: number,
  roles: ReadonlyMap<string, MarkRole>,
): number {
  if (s.run) return drawRun(out, s.run, x, y, roles);
  if (s.reduced.some((row) => row.some(Boolean))) {
    const title = s.framing === 'halt' ? 'If S decided A_TM' : 'If R decided HALT';
    out.push(text('panel-title', x, y + TITLE, title, TITLE, { weight: 'bold' }));
    return paragraphs(out, x, y + TITLE + 12, width, reduceItems(s));
  }
  if (s.dd !== 'none') {
    out.push(text('panel-title', x, y + TITLE, 'D on ⟨D⟩', TITLE, { weight: 'bold' }));
    return paragraphs(out, x, y + TITLE + 12, width, proofItems(s));
  }
  return drawLegend(out, s, x, y, width);
}

const heightCache = new Map<string, number>();

/** The tallest the panel gets for this table, so it keeps one size. */
function panelHeight(n: number, framing: Framing, width: number): number {
  const key = `${n}|${framing}`;
  const hit = heightCache.get(key);
  if (hit !== undefined) return hit;
  const scratch: Shape[] = [];
  const base: HaltState = {
    n,
    framing,
    shown: [],
    d: [],
    dd: 'none',
    reduced: [],
    run: null,
  };
  const none = new Map<string, MarkRole>();
  let h = drawLegend(scratch, base, 0, 0, width);
  h = Math.max(h, drawPanel(scratch, { ...base, dd: 'done' }, 0, 0, width, none));
  h = Math.max(h, paragraphs(scratch, 0, TITLE + 12, width, reduceItems(base, true)));
  for (let i = 0; i < n; i++) {
    const end: RunView = { i, j: 0, line: 1, head: 0, step: 0, done: null };
    h = Math.max(h, drawRun(scratch, end, 0, 0, none));
  }
  heightCache.set(key, h);
  return h;
}

// ---------------------------------------------------------------------------------------------
// The scene

export function view(
  step: Step<HaltState, HaltExtra>,
  settings: HaltSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const extra = step.extra ?? {};
  const framing = s.framing ?? settings.framing;
  const n = s.n;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));

  // The table, with each finished cell in its outcome's color unless a mark says otherwise.
  const tableRoles = new Map(roles);
  const values: string[][] = [];
  for (let i = 0; i < n; i++) {
    values.push([]);
    for (let j = 0; j < n; j++) {
      if (!s.shown[i]![j]) {
        values[i]!.push('');
        continue;
      }
      const reduced = s.reduced[i]![j];
      const o = cell(i, j).outcome;
      values[i]!.push(reduced ? reducedLabel(i, j, framing) : cellLabel(o, framing));
      const id = `cell-${i}-${j}`;
      if (!tableRoles.has(id)) {
        const role = reduced ? 'visit' : outcomeRole(o, framing);
        if (role) tableRoles.set(id, role);
      }
    }
  }
  const path: Cell[] =
    extra.diag !== undefined && extra.diag > 0
      ? Array.from({ length: extra.diag + 1 }, (_, k) => [k, k] as const)
      : [];
  const frame = {
    rows: n,
    cols: n,
    rowHeads: [HEAD_W],
    cellW: CELL_W,
    cellH: CELL_H,
  };
  const g = tableGeometry(frame);
  const { shapes } = tableScene(frame, {
    values,
    colHeads: [Array.from({ length: n }, (_, j) => desc(j))],
    rowHeads: [Array.from({ length: n }, (_, i) => M(i))],
    colStyles: ['label'],
    rowStyles: ['label'],
    path,
    pathRole: 'compare',
    roles: tableRoles,
  });

  // D's row under the table, and the cell for D on ⟨D⟩ where the diagonal would go next.
  const dTop = g.gridBottom + D_GAP;
  const ddX = g.gridRight + D_GAP;
  shapes.push(
    text('d-label', g.headX(0), dTop + CELL_H / 2 + 8, 'D', 22, {
      anchor: 'middle',
      mono: true,
      weight: 'bold',
    }),
  );
  for (let i = 0; i < n; i++) {
    const id = dId(i);
    const has = s.d[i];
    const o = dOutcome(cell(i, i).outcome, framing);
    const role = roles.get(id) ?? (has ? outcomeRole(o, framing) : undefined);
    const from = extra.slide === i ? { x: g.left(i) + 3, y: g.top(i) + 3 } : undefined;
    shapes.push({
      kind: 'rect',
      id,
      x: g.left(i) + 3,
      y: dTop,
      w: CELL_W - 6,
      h: CELL_H,
      r: 8,
      cls: has ? 'cell live' : 'cell',
      role,
      enterFrom: from,
    });
    if (has) {
      const t = dLabel(i, framing);
      const size = valueSize(t, CELL_W);
      shapes.push(
        text(`${id}-t`, g.cx(i), dTop + CELL_H / 2 + size * 0.36, t, size, {
          anchor: 'middle',
          weight: 'bold',
          role,
          enterFrom: extra.slide === i ? { x: g.cx(i), y: g.cy(i) + size * 0.36 } : undefined,
        }),
      );
    }
  }
  if (s.dd !== 'none') {
    const ddRole: MarkRole = roles.get(DD_ID) ?? (s.dd === 'ask' ? 'active' : 'error');
    const headSize = Math.min(24, valueSize('⟨D⟩', CELL_W) - 2);
    shapes.push(
      text('dd-head', ddX + CELL_W / 2, g.headY(0), '⟨D⟩', headSize, {
        anchor: 'middle',
        mono: true,
        weight: 'bold',
      }),
      {
        kind: 'rect',
        id: DD_ID,
        x: ddX,
        y: dTop,
        w: CELL_W,
        h: CELL_H,
        r: 8,
        cls: 'cell live',
        role: ddRole,
      },
      text('dd-t', ddX + CELL_W / 2, dTop + CELL_H / 2 + 10, '?', 28, {
        anchor: 'middle',
        weight: 'bold',
        role: ddRole,
      }),
      {
        kind: 'arrow',
        id: 'dd-arrow',
        x1: g.gridRight - CELL_W * 0.2,
        y1: g.gridBottom - CELL_H * 0.2,
        x2: ddX + 4,
        y2: dTop + 4,
        dashed: true,
        role: ddRole === 'active' ? 'compare' : 'error',
      },
    );
  }

  const table: Bounds = {
    x: g.gridLeft - HEAD_W - 4,
    y: g.headY(0) - 26,
    w: ddX + CELL_W + 8 - (g.gridLeft - HEAD_W - 4),
    h: dTop + CELL_H + 6 - (g.headY(0) - 26),
  };
  const width = panelWidth(n);
  const height = panelHeight(n, framing, width);
  const panel = placePanels(shapes, table, stage, (out, x, y) => {
    drawPanel(out, s, x, y, width, roles);
    return { x, y, w: width, h: height };
  });

  return {
    shapes,
    bounds: padBounds(unionBounds(table, panel), 14),
    label: label(step, framing),
  };
}

function label(step: Step<HaltState, HaltExtra>, framing: Framing): string {
  const s = step.state;
  const parts = [describe(s, { framing, size: s.n })];
  if (s.run) {
    const r = s.run;
    const st = statusOf(r);
    parts.push(`Panel: ${M(r.i)} on ${desc(r.j)}, ${st.text}.`);
  }
  return parts.join(' ');
}
