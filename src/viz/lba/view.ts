/**
 * An LBA: the tape ⊢ w ⊣ with greyed "no tape" zones beyond the markers, the head and its state,
 * a status line, the Chomsky hierarchy with the context-sensitive level (the LBA's) lit, and the
 * transition table (beside on a wide stage, under on a tall one) with the rule just used lit.
 *
 * Shape ids: `tape-<k>` cells (0 is ⊢), `tape-head`, `void-l` and `void-r`, `status`,
 * `rule-<q>-<a>` table cells, `level-<k>` the hierarchy chips.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest, translate } from '../../layouts/arrange';
import { padBounds, textWidth, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, drawTape } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  LEFT,
  RIGHT,
  describe,
  machineOf,
  ruleFor,
  ruleId,
  type LbaExtra,
  type LbaSettings,
  type LbaState,
} from './model';

type LStep = Step<LbaState, LbaExtra>;

const TEXT = 15;
const VOID_W = 40;

export const LEVELS = [
  { name: 'Regular', machine: 'DFA' },
  { name: 'Context-free', machine: 'PDA' },
  { name: 'Context-sensitive', machine: 'LBA' },
  { name: 'Decidable', machine: 'TM that halts' },
  { name: 'Recognizable', machine: 'TM' },
];

function status(s: LbaState, extra: LbaExtra): { text: string; role?: MarkRole } {
  if (s.word === null) return { text: 'No word on the tape yet.' };
  if (s.verdict === 'accept') return { text: `accept after ${s.moves} moves`, role: 'found' };
  if (s.verdict === 'reject') return { text: `reject after ${s.moves} moves`, role: 'error' };
  if (s.verdict === 'blocked')
    return {
      text: `stopped: the head may not pass ${extra.wall === 'left' ? LEFT : RIGHT}`,
      role: 'error',
    };
  const r = extra.rule;
  return {
    text: r ? `${r.from} ${r.read} → ${r.to} ${r.write} ${r.move}` : `in ${s.q}, move ${s.moves}`,
  };
}

function drawMain(
  out: Shape[],
  s: LbaState,
  extra: LbaExtra,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const n = s.tape.length;
  const x0 = VOID_W + 8;
  const t = drawTape(out, {
    x: x0,
    y: 0,
    cells: s.tape,
    to: n,
    head: s.word === null ? null : s.head,
    headLabel: s.q,
    headRoom: 'label',
    index: true,
    roles,
  });
  const top = 46;
  const right = x0 + n * CELL_W + 8;
  for (const [id, x] of [
    ['void-l', 0],
    ['void-r', right],
  ] as const) {
    out.push({
      kind: 'rect',
      id,
      x,
      y: top,
      w: VOID_W,
      h: CELL_H,
      r: 4,
      role: roles.get(id) ?? 'stale',
      opacity: 0.45,
    });
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + VOID_W / 2,
      y: top + CELL_H + 16,
      text: 'none',
      size: 14,
      anchor: 'middle',
      cls: 'label',
    });
  }
  const width = right + VOID_W;
  const st = status(s, extra);
  const sy = t.h + 24;
  out.push({
    kind: 'text',
    id: 'status',
    x: 0,
    y: sy,
    text: st.text,
    size: TEXT,
    mono: !!extra.rule || !!s.verdict,
    weight: st.role ? 'bold' : undefined,
    cls: st.role ? undefined : 'label',
    role: roles.get('status') ?? st.role,
  });
  // The hierarchy, innermost first, the LBA's level lit.
  const hy = sy + 22;
  out.push({
    kind: 'text',
    id: 'level-title',
    x: 0,
    y: hy + 14,
    text: 'Where LBAs sit in the Chomsky hierarchy',
    size: TEXT,
    cls: 'label',
  });
  let x = 0;
  let y = hy + 24;
  const maxW = Math.max(width, 340);
  LEVELS.forEach((lv, k) => {
    const label = `${lv.name} · ${lv.machine}`;
    const w = textWidth(label, 14) + 18;
    if (x > 0 && x + w > maxW) {
      x = 0;
      y += 34;
    }
    const id = `level-${k}`;
    const role = roles.get(id) ?? (k === 2 ? 'active' : undefined);
    out.push({ kind: 'rect', id, x, y, w, h: 28, r: 6, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + w / 2,
      y: y + 19,
      text: label,
      size: 14,
      anchor: 'middle',
      weight: k === 2 ? 'bold' : undefined,
      role,
    });
    x += w + 8;
  });
  return { x: 0, y: 0, w: maxW, h: y + 28 };
}

const shown = (a: string) => a;

function drawRules(out: Shape[], s: LbaState, roles: ReadonlyMap<string, MarkRole>): Bounds {
  const m = machineOf(s);
  const cols = [...m.symbols, LEFT, RIGHT].filter((a) => m.rules.some((r) => r.read === a));
  const cell = (q: string, a: string) => {
    const r = ruleFor(m, q, a);
    return r ? `${r.to === 'accept' ? 'acc' : r.to} ${shown(r.write)} ${r.move}` : '';
  };
  const headW = Math.max(...m.states.map((q) => textWidth(q, 14, true))) + 12;
  const colW = cols.map((a) =>
    Math.max(36, ...m.states.map((q) => textWidth(cell(q, a), 14, true) + 12)),
  );
  out.push({
    kind: 'text',
    id: 'rule-title',
    x: 0,
    y: 14,
    text: 'δ(q, a): next state, write, move',
    size: TEXT,
    cls: 'label',
  });
  const top = 26;
  let x = headW;
  cols.forEach((a, k) => {
    out.push({
      kind: 'text',
      id: `rule-h-${k}`,
      x: x + colW[k]! / 2,
      y: top + 15,
      text: a,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
    });
    x += colW[k]!;
  });
  m.states.forEach((q, i) => {
    const y = top + 22 + i * 28;
    out.push({
      kind: 'text',
      id: `rule-r-${q}`,
      x: 0,
      y: y + 17,
      text: q,
      size: 14,
      weight: 'bold',
      mono: true,
    });
    let cx = headW;
    cols.forEach((a, k) => {
      const id = ruleId(q, a);
      const t = cell(q, a);
      const role = roles.get(id);
      out.push({
        kind: 'rect',
        id,
        x: cx,
        y,
        w: colW[k]! - 3,
        h: 25,
        r: 4,
        cls: t ? 'live' : undefined,
        role,
      });
      if (t)
        out.push({
          kind: 'text',
          id: `${id}-t`,
          x: cx + (colW[k]! - 3) / 2,
          y: y + 17,
          text: t,
          size: 14,
          anchor: 'middle',
          mono: true,
          role,
        });
      cx += colW[k]!;
    });
  });
  return {
    x: 0,
    y: 0,
    w: Math.max(x, textWidth('δ(q, a): next state, write, move', TEXT)),
    h: top + 22 + m.states.length * 28,
  };
}

export function view(step: LStep, _settings: LbaSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const main: Shape[] = [];
  const mb = drawMain(main, state, extra, roles);
  const rules: Shape[] = [];
  const rb = drawRules(rules, state, roles);
  const build = (beside: boolean) => {
    const at = beside ? { x: mb.w + 30, y: 34 } : { x: 0, y: mb.h + 24 };
    const shapes = [...main, ...translate(rules, at.x, at.y)];
    return { shapes, bounds: padBounds(unionBounds(mb, { ...rb, ...at }), 12) };
  };
  const best = pickBest([build(false), build(true)], stage);
  return { ...best, label: describe(state) };
}
