/**
 * Rice's theorem: the code of M′ (line 1 runs M on w, line 2 hands over to M_P), what a test run
 * did in each phase with the inputs tried so far, the argument line by line, and which
 * properties Rice's theorem covers (semantic) and which it does not (syntactic or trivial).
 * Blocks are packed by `bestPlacement`; each keeps one size, so nothing moves between steps.
 *
 * Shape ids: `mp-title`, `mp-<k>` code lines; `phase-1`, `phase-2`; `row-<k>` tested inputs;
 * `arg-<k>` argument lines; `prop-<k>` examples.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { translate } from '../../layouts/arrange';
import { padBounds, textWidth, unionBounds } from '../../layouts/graph';
import { wrapText } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { BUTTONS_DROP, bestPlacement, type Placement } from '../_grammar/draw';
import { PROGRAMS, type Outcome } from '../halting-problem/toy';
import {
  ARGUMENT,
  EXAMPLES,
  MAX_ROWS,
  M,
  desc,
  describe,
  propOf,
  wordText,
  type RiceSettings,
  type RiceState,
} from './model';

type RStep = Step<RiceState, unknown>;

const TEXT = 15;
const LINE = 21;
const W = 380;

function text(
  out: Shape[],
  id: string,
  x: number,
  y: number,
  t: string,
  o: Partial<Extract<Shape, { kind: 'text' }>> = {},
) {
  out.push({ kind: 'text', id, x, y, text: t, size: TEXT, ...o });
}

/** Wrapped lines under one id each (`id`, `id-1`, `id-2`, …); returns the height used. */
function para(
  out: Shape[],
  id: string,
  x: number,
  y: number,
  t: string,
  w: number,
  o: Partial<Extract<Shape, { kind: 'text' }>> = {},
): number {
  const lines = wrapText(t, w, TEXT, { mono: o.mono, bold: o.weight === 'bold' });
  lines.forEach((l, k) => text(out, k ? `${id}-${k}` : id, x, y + k * LINE, l, o));
  return lines.length * LINE;
}

function drawCode(out: Shape[], s: RiceState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const p = propOf(s);
  const built = s.m !== null && s.w !== null;
  text(out, 'mp-title', 0, 14, 'M′ on input x:', { cls: 'label', role: roles.get('mp-title') });
  const now = s.current?.line;
  const lines = [
    built
      ? `1  run ${M(s.m!)} on w = ${desc(s.w!)} = ${PROGRAMS[s.w!]!.code}, ignoring x`
      : '1  run M on w, ignoring x',
    '2  if that halts: run M_P on x, and do what it does',
    `   M_P = ${p.code}: ${p.what}`,
  ];
  let y = 40;
  lines.forEach((l, k) => {
    const id = `mp-${k + 1}`;
    const role = roles.get(id) ?? (now === k + 1 && k < 2 ? 'active' : undefined);
    y += para(out, id, 0, y, l, W, { mono: true, role, weight: role ? 'bold' : undefined });
  });
  return { x: 0, y: 0, w: W, h: 40 + 5 * LINE };
}

const verb = (o: Outcome | null) =>
  o === null ? '…' : o === 'loop' ? 'loops' : o === 'unknown' ? 'still running' : `${o}s`;

function drawRun(out: Shape[], s: RiceState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  text(out, 'run-title', 0, 14, 'Testing M′', { cls: 'label' });
  const c = s.current;
  const built = s.m !== null && s.w !== null;
  const phases = [
    {
      id: 'phase-1',
      t: built
        ? `1: ${M(s.m!)} on ${desc(s.w!)} ${c?.first ? `${verb(c.first)}${c.first !== 'loop' ? ` after ${c.firstSteps} steps` : ''}` : ''}`
        : '1: M on w',
    },
    {
      id: 'phase-2',
      t: `2: M_P on ${c ? wordText(c.x) : 'x'} ${c?.second ? verb(c.second) : c?.first === 'loop' ? 'never runs' : ''}`,
    },
  ];
  phases.forEach((ph, k) => {
    const y = 26 + k * 36;
    const role = roles.get(ph.id);
    out.push({ kind: 'rect', id: ph.id, x: 0, y, w: W, h: 30, r: 6, cls: 'live', role });
    text(out, `${ph.id}-t`, 10, y + 20, ph.t, { mono: true, role });
  });
  const top = 26 + 2 * 36 + 10;
  text(out, 'rows-title', 0, top + 14, 'Inputs tried: what M′ does', { cls: 'label' });
  s.rows.forEach((r, k) => {
    const id = `row-${k}`;
    const role = roles.get(id) ?? (r.outcome === 'accept' ? 'done' : undefined);
    const x = (k % 3) * 126;
    const y = top + 24 + Math.floor(k / 3) * 34;
    out.push({ kind: 'rect', id, x, y, w: 120, h: 28, r: 6, cls: 'live', role });
    text(out, `${id}-t`, x + 60, y + 19, `${wordText(r.x)}: ${verb(r.outcome)}`, {
      anchor: 'middle',
      mono: true,
      role,
    });
  });
  return { x: 0, y: 0, w: W, h: top + 24 + Math.ceil(MAX_ROWS / 3) * 34 };
}

function drawArgument(out: Shape[], s: RiceState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  text(out, 'arg-title', 0, 14, 'Why no program decides P', { cls: 'label' });
  const lines = ARGUMENT(propOf(s), s.m ?? 0, s.w ?? 0);
  let y = 40;
  let full = 40;
  lines.forEach((l, k) => {
    const t = `${k + 1}. ${l}`;
    full += wrapText(t, W, TEXT, { bold: true }).length * LINE + 4;
    if (k >= s.argued) return;
    const id = `arg-${k}`;
    const role = roles.get(id);
    y += para(out, id, 0, y, t, W, { role, weight: role ? 'bold' : undefined }) + 4;
  });
  return { x: 0, y: 0, w: W, h: full };
}

const TAG: Record<string, string> = {
  semantic: 'semantic: undecidable',
  syntactic: 'about the code: decidable',
  trivial: 'trivial: decidable',
};

function drawExamples(out: Shape[], s: RiceState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  text(out, 'prop-title', 0, 14, 'Which properties Rice covers', { cls: 'label' });
  const p = propOf(s);
  const shown = [
    EXAMPLES[0]!,
    EXAMPLES[1]!,
    EXAMPLES[3]!,
    EXAMPLES[5]!,
    EXAMPLES[7]!,
    EXAMPLES[8]!,
  ];
  let y = 40;
  let w = textWidth('Which properties Rice covers', TEXT);
  shown.forEach((e, k) => {
    const id = `prop-${k}`;
    const chosen = e.text === p.text;
    const role = roles.get(id) ?? (chosen ? 'active' : e.kind === 'semantic' ? undefined : 'done');
    const t = `${e.text}: ${TAG[e.kind]}`;
    y += para(out, id, 0, y, t, W, { role, weight: chosen ? 'bold' : undefined });
    w = Math.max(w, Math.min(W, textWidth(t, TEXT)));
  });
  return { x: 0, y: 0, w, h: y };
}

function packings(sizes: readonly { w: number; h: number }[], gap: number): Placement[] {
  const [a, b] = sizes as [Bounds, Bounds, Bounds];
  const col2 = Math.max(a.w, b.w) + gap;
  return [
    // Two columns: code and run left, the argument (or the examples) right.
    [
      { x: 0, y: 0 },
      { x: 0, y: a.h + gap },
      { x: col2, y: BUTTONS_DROP },
    ],
    // One column.
    [
      { x: 0, y: 0 },
      { x: 0, y: a.h + gap },
      { x: 0, y: a.h + b.h + 2 * gap },
    ],
    // Three columns.
    [
      { x: 0, y: 0 },
      { x: a.w + gap, y: BUTTONS_DROP },
      { x: a.w + b.w + 2 * gap, y: BUTTONS_DROP },
    ],
  ];
}

export function view(step: RStep, _settings: RiceSettings, stage?: StageSize): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  // The argument takes the examples' place once it starts; the slot keeps the larger size.
  const side: Shape[] = [];
  const arg = state.argued > 0;
  const sb = (arg ? drawArgument : drawExamples)(side, state, roles);
  const other = (arg ? drawExamples : drawArgument)([], state, roles);
  const slot = { ...sb, w: Math.max(sb.w, other.w), h: Math.max(sb.h, other.h) };
  const blocks = [
    ...[drawCode, drawRun].map((draw) => {
      const shapes: Shape[] = [];
      return { shapes, box: draw(shapes, state, roles) };
    }),
    { shapes: side, box: slot },
  ];
  const sizes = blocks.map((b) => b.box);
  const places = bestPlacement(sizes, packings(sizes, 26), stage);
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  blocks.forEach((b, k) => {
    const at = places[k]!;
    shapes.push(...translate(b.shapes, at.x - b.box.x, at.y - b.box.y));
    boxes.push({ ...b.box, x: at.x, y: at.y });
  });
  return { shapes, bounds: padBounds(unionBounds(...boxes), 10), label: describe(state) };
}
