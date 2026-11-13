/**
 * Mixture-of-experts routing: the tokens down the left, then three panels with one column per
 * expert: the router's logits, its probabilities p, and the gates (the weights of the experts a
 * token uses). Beside them, the experts themselves: a column of slots each, as many as the
 * capacity, filled with tokens in dispatch order; an assignment past the dashed capacity line is
 * dropped. Under each expert, its share of the assignments (f) and its mean probability (P), the
 * two halves of the load-balance loss.
 *
 * A laptop draws everything in one row; a phone puts the gates and the experts under the logits
 * and probabilities. Shape ids, for marks:
 *   w-<t>                 token t's label (later panel rows: w-<g>-<t>)
 *   l-<t>-<e>, p-<t>-<e>, g-<t>-<e>   cells of the three panels
 *   e-<e>                 expert e's name over its slots
 *   b-<e>-<i>             expert e's slot i; as-<t>-<e> the token placed in it
 *   cap-line, f-<e>, P-<e>
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { short } from '../_lm/numbers';
import { drawPanelRows, shadeOf, type CellLook, type Panel } from '../_matrix/matrix';
import {
  capacity,
  describe,
  E,
  EXPERTS,
  type MoeExtra,
  type MoeSettings,
  type MoeState,
  type MoeWork,
  type Routed,
} from './model';

const SLOT_W = 56;
const SLOT_H = 26;
const SLOT_PITCH = 30;
const COL_GAP = 4;
const FONT = 15;
const SMALL = 14;
const G_CELL = 48;

const maxAbs = (m: readonly (readonly number[])[]) => Math.max(0, ...m.flat().map(Math.abs));

interface Shown {
  r?: Routed;
  logitRows: number;
  pRows: number;
  w?: MoeWork;
  done: boolean;
}

function panels(state: MoeState, set: MoeSettings, sh: Shown): [Panel, Panel, Panel] {
  const T = state.words.length;
  const logits = sh.r?.logits ?? state.scored?.logits;
  const p = sh.r?.p ?? state.scored?.p;
  const top = logits ? maxAbs(logits) : 0;
  const l: Panel = {
    id: 'l',
    title: 'router logit',
    rows: T,
    cols: E,
    colHeads: EXPERTS,
    cell: (t, e) =>
      logits && t < sh.logitRows
        ? { text: short(logits[t]![e]!), shade: shadeOf(logits[t]![e]!, top) }
        : null,
  };
  const pp: Panel = {
    id: 'p',
    title: 'p = softmax',
    rows: T,
    cols: E,
    colHeads: EXPERTS,
    cell: (t, e) => (p && t < sh.pRows ? { text: short(p[t]![e]!), shade: p[t]![e]! } : null),
  };
  const r = sh.r;
  const placed = new Set<string>();
  const shownGate = new Map<string, CellLook>();
  if (r) {
    const count = sh.done ? r.assignments.length : (sh.w?.placed ?? 0);
    r.assignments.slice(0, count).forEach((a) => placed.add(`${a.token}-${a.expert}`));
    for (const a of r.assignments) {
      const key = `${a.token}-${a.expert}`;
      const visible =
        set.routing === 'token'
          ? sh.done || a.token < (sh.w?.gateRows ?? 0)
          : sh.done || a.expert < (sh.w?.pickedBy ?? 0);
      if (!visible) continue;
      if (!a.kept && placed.has(key)) shownGate.set(key, { text: 'drop', cls: 'ghost', dim: true });
      else shownGate.set(key, { text: short(a.weight), shade: a.weight });
    }
  }
  const g: Panel = {
    id: 'g',
    title: 'gate',
    rows: T,
    cols: E,
    cellW: G_CELL,
    colHeads: EXPERTS,
    cell: (t, e) => shownGate.get(`${t}-${e}`) ?? null,
  };
  return [l, pp, g];
}

/** The experts: slots filled in dispatch order, the capacity line, f and P underneath. */
function drawExperts(
  state: MoeState,
  set: MoeSettings,
  sh: Shown,
  roles: ReadonlyMap<string, MarkRole>,
): { shapes: Shape[]; bounds: Bounds } {
  const out: Shape[] = [];
  const r = sh.r;
  const cap = r?.cap ?? capacity(state.words.length, set);
  const perExpert = Array.from({ length: E }, (_, e) =>
    r ? r.assignments.filter((a) => a.expert === e).length : 0,
  );
  const rows = Math.max(cap, ...perExpert);
  const count = r ? (sh.done ? r.assignments.length : (sh.w?.placed ?? 0)) : 0;
  const placed = r ? r.assignments.slice(0, count) : [];
  const headY = 17;
  const slotsTop = 50;
  for (let e = 0; e < E; e++) {
    const x = e * (SLOT_W + COL_GAP);
    out.push({
      kind: 'text',
      id: `e-${e}`,
      x: x + SLOT_W / 2,
      y: headY + 24,
      text: EXPERTS[e]!,
      size: FONT,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: roles.get(`e-${e}`),
    });
    for (let i = 0; i < rows; i++) {
      const id = `b-${e}-${i}`;
      const over = i >= cap;
      const a = placed.find((q) => q.expert === e && q.slot === i);
      out.push({
        kind: 'rect',
        id,
        x,
        y: slotsTop + i * SLOT_PITCH,
        w: SLOT_W,
        h: SLOT_H,
        r: 3,
        cls: a ? (a.kept ? 'live' : 'ghost') : over ? 'ghost' : undefined,
        opacity: over && !a ? 0 : 1,
        role: a
          ? (roles.get(`as-${a.token}-${a.expert}`) ?? (a.kept ? undefined : 'error'))
          : roles.get(id),
      });
      if (a)
        out.push({
          kind: 'text',
          id: `as-${a.token}-${a.expert}`,
          x: x + SLOT_W / 2,
          y: slotsTop + i * SLOT_PITCH + SLOT_H / 2 + 5,
          text: state.words[a.token]!,
          size: FONT,
          anchor: 'middle',
          mono: true,
          cls: a.kept ? undefined : 'label',
        });
    }
  }
  const width = E * (SLOT_W + COL_GAP) - COL_GAP;
  const capY = slotsTop + cap * SLOT_PITCH - (SLOT_PITCH - SLOT_H) / 2;
  out.push({
    kind: 'text',
    id: 'cap-t',
    x: 0,
    y: headY,
    text: `C = ${cap}`,
    size: FONT,
    weight: 'bold',
    mono: true,
  });
  if (rows > cap)
    out.push({
      kind: 'arrow',
      id: 'cap-line',
      x1: -4,
      y1: capY,
      x2: width + 4,
      y2: capY,
      head: 'none',
      dashed: true,
      role: 'error',
    });
  const bottom = slotsTop + rows * SLOT_PITCH;
  const showLoss = Boolean(r && (sh.done || sh.w?.loss));
  for (let e = 0; e < E; e++) {
    const x = e * (SLOT_W + COL_GAP) + SLOT_W / 2;
    out.push({
      kind: 'text',
      id: `f-${e}`,
      x,
      y: bottom + 18,
      text: showLoss ? `f ${short(r!.f[e]!)}` : '',
      size: SMALL,
      anchor: 'middle',
      mono: true,
      role: roles.get(`f-${e}`),
    });
    out.push({
      kind: 'text',
      id: `P-${e}`,
      x,
      y: bottom + 38,
      text: showLoss ? `P ${short(r!.P[e]!)}` : '',
      size: SMALL,
      anchor: 'middle',
      mono: true,
      cls: 'label',
    });
  }
  return { shapes: out, bounds: { x: -4, y: 0, w: width + 8, h: bottom + 44 } };
}

export function view(
  step: Step<MoeState, MoeExtra>,
  settings: MoeSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const w = extra.work;
  const T = state.words.length;
  const sh: Shown = w
    ? { r: w.r, logitRows: w.logitRows, pRows: w.pRows, w, done: false }
    : {
        r: state.result,
        logitRows: state.scored ? T : 0,
        pRows: state.scored ? T : 0,
        done: Boolean(state.result),
      };
  const [l, p, g] = panels(state, settings, sh);
  const experts = drawExperts(state, settings, sh, roles);

  const compose = (groups: Panel[][]) => {
    const base = drawPanelRows(groups, state.words, roles, stage);
    const title = base.shapes.find((s) => s.id === 'g-title')!;
    const gTop = (title.kind === 'text' ? title.y : 0) - 17;
    const gx = title.kind === 'text' ? title.x : 0;
    const right = gx + E * G_CELL + 28;
    const moved = translate(experts.shapes, right + 4, gTop);
    const shapes = [...base.shapes, ...moved];
    // A token slides into its expert from its gate cell.
    for (const s of moved)
      if (s.kind === 'text' && s.id.startsWith('as-')) {
        const cell = base.shapes.find((c) => c.id === `g-${s.id.slice(3)}`);
        if (cell?.kind === 'rect')
          s.enterFrom = { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 + 5 };
      }
    const box = {
      x: experts.bounds.x + right + 4,
      y: gTop,
      w: experts.bounds.w,
      h: experts.bounds.h,
    };
    return { shapes, bounds: padBounds(unionBounds(base.bounds, box), 4) };
  };
  const best = pickLayout(stage, [compose([[l, p, g]]), compose([[l, p], [g]])]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(state) };
}
