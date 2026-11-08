/**
 * CFG to CNF: a row of stage chips (START, DEL, UNIT, TERM, BIN, CNF) over the rules, the rules
 * a step removes crossed out and the ones it adds in green, and beside them (or under them, on a
 * tall stage) the set the stage works from: the nullable variables during DEL, the unit pairs
 * during UNIT, or the leftmost derivation after Derive. pickBest keeps the arrangement (and the
 * width the rules wrap at) that draws largest.
 *
 * Shape ids: `phase-<p>` and `phase-<p>-t` the chips; the rules panel `r-…` (drawRules);
 * `null-<A>` the nullable variables; `pair-<A>-<B>` the unit pairs; `der-<k>` the forms.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest, translate } from '../../layouts/arrange';
import { padBounds, textWidth, unionBounds } from '../../layouts/graph';
import { drawTrace } from '../../layouts/trace';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { drawRules, ruleRows, type RuleRow } from '../_grammar/draw';
import { formText, type Rule } from '../_grammar/grammar';
import {
  PHASES,
  PHASE_NAME,
  RULES,
  describe,
  grammarOf,
  key,
  pairText,
  type CnfExtra,
  type CnfSettings,
  type CnfState,
  type Phase,
} from './model';

type CStep = Step<CnfState, CnfExtra>;

const CHIP_W = 74;
const CHIP_H = 28;
const CHIP_GAP = 6;
const TEXT = 15;

/** The stage chips; returns their box. */
function drawPhases(
  out: Shape[],
  s: CnfState,
  settings: CnfSettings,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const order: Phase[] = [...PHASES[settings.order], 'done'];
  const now = order.indexOf(s.phase);
  order.forEach((p, k) => {
    const id = `phase-${p}`;
    const x = k * (CHIP_W + CHIP_GAP);
    const role: MarkRole | undefined =
      roles.get(id) ??
      (s.phase === 'done' ? 'done' : k < now ? 'done' : k === now ? 'active' : undefined);
    out.push({ kind: 'rect', id, x, y: 0, w: CHIP_W, h: CHIP_H, r: 6, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + CHIP_W / 2,
      y: CHIP_H / 2 + 5,
      text: p === 'done' ? 'CNF' : PHASE_NAME[p],
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role,
    });
  });
  return { x: 0, y: 0, w: order.length * (CHIP_W + CHIP_GAP) - CHIP_GAP, h: CHIP_H };
}

export function rulesTitle(s: CnfState): string {
  switch (s.phase) {
    case 'typed':
      return 'The grammar as typed';
    case 'done':
      return `In Chomsky normal form (start ${s.start})`;
    default:
      return `During ${PHASE_NAME[s.phase]}`;
  }
}

/** Rows for the rules, with the step's removed rules crossed out under their variable. */
function rowsFor(s: CnfState, struck: readonly Rule[]): RuleRow[] {
  const g = grammarOf(s);
  const all = [...s.rules];
  for (const r of struck) {
    if (all.some((x) => key(x) === key(r))) continue;
    // Put a removed rule after the last rule of its variable, or at the end.
    const at = all.map((x) => x.lhs).lastIndexOf(r.lhs);
    all.splice(at < 0 ? all.length : at + 1, 0, r);
  }
  const gone = new Set(struck.map(key));
  return ruleRows(g.variables, all).map((row) => ({
    lhs: row.lhs,
    alts: row.alts.map((a) => ({ ...a, struck: gone.has(key(a.rule)) })),
  }));
}

/** A labeled row of chips that wraps at `maxW`. */
function drawChips(
  out: Shape[],
  title: string,
  titleId: string,
  items: { id: string; text: string }[],
  maxW: number,
  roles: ReadonlyMap<string, MarkRole>,
  empty: string,
): Bounds {
  out.push({ kind: 'text', id: titleId, x: 0, y: 14, text: title, size: TEXT, cls: 'label' });
  let x = 0;
  let y = 26;
  let right = textWidth(title, TEXT);
  const h = 30;
  if (!items.length) {
    out.push({
      kind: 'text',
      id: `${titleId}-none`,
      x: 0,
      y: y + 20,
      text: empty,
      size: TEXT,
      cls: 'label',
    });
    return { x: 0, y: 0, w: Math.max(right, textWidth(empty, TEXT)), h: y + h };
  }
  for (const it of items) {
    const w = textWidth(it.text, TEXT, true) + 16;
    if (x > 0 && x + w > maxW) {
      x = 0;
      y += h + 6;
    }
    const role = roles.get(it.id);
    out.push({ kind: 'rect', id: it.id, x, y, w, h, r: 6, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${it.id}-t`,
      x: x + w / 2,
      y: y + h / 2 + 5,
      text: it.text,
      size: TEXT,
      anchor: 'middle',
      mono: true,
      weight: role ? 'bold' : undefined,
      role,
    });
    x += w + 6;
    right = Math.max(right, x - 6);
  }
  return { x: 0, y: 0, w: right, h: y + h };
}

/** What the current stage works from, or the derivation; null when there is nothing to show. */
function drawSide(
  out: Shape[],
  s: CnfState,
  roles: ReadonlyMap<string, MarkRole>,
  maxW: number,
): Bounds | null {
  const d = s.derivation;
  if (d) {
    const keep = 9;
    const lines = d.forms.map((f, k) => ({ n: k, index: k, parts: [formText(f)], focus: 0 }));
    const longest = Math.max(8, ...d.forms.map((f) => formText(f).length));
    const w = Math.min(Math.max(maxW, 200), 30 + longest * 14 * 0.6 + 10);
    const title = d.ok
      ? `Leftmost derivation of ${formText(d.word)}`
      : `${formText(d.word)}: no derivation`;
    const b = drawTrace(out, {
      id: 'der',
      titleId: 'der-title',
      x: 0,
      y: 0,
      w: Math.max(w, textWidth(title, 14) + 4),
      title,
      lines: lines.slice(-keep),
      keep: Math.min(keep, Math.max(lines.length, 1)),
      roles,
    });
    return b;
  }
  if (s.phase === 'del')
    return drawChips(
      out,
      'Nullable variables',
      'null-title',
      s.nullable.map((v) => ({ id: `null-${v}`, text: v })),
      maxW,
      roles,
      'none yet',
    );
  if (s.phase === 'unit')
    return drawChips(
      out,
      'Unit pairs (A, B): A becomes B',
      'pair-title',
      s.pairs.map((p) => ({ id: `pair-${p[0]}-${p[1]}`, text: pairText(p) })),
      maxW,
      roles,
      'none',
    );
  return null;
}

export function view(step: CStep, settings: CnfSettings, stage?: StageSize): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const struck = step.extra?.struck ?? [];
  const label = describe(state);
  const rows = rowsFor(state, struck);

  const build = (maxW: number, sideW: number, beside: boolean, cols = 1) => {
    const shapes: Shape[] = [];
    const chips = drawPhases(shapes, state, settings, roles);
    const rules: Shape[] = [];
    // Two columns of variables on a wide stage when there are many.
    const split = cols > 1 && rows.length > 5 ? Math.ceil(rows.length / 2) : rows.length;
    let rb = drawRules(rules, rows.slice(0, split), {
      prefix: RULES,
      x: 0,
      y: 0,
      maxW,
      roles,
      title: rulesTitle(state),
    });
    if (split < rows.length) {
      const second = drawRules(rules, rows.slice(split), {
        prefix: RULES,
        x: rb.w + 36,
        y: 24,
        maxW,
        roles,
      });
      rb = unionBounds(rb, second);
    }
    const top = chips.h + 18;
    shapes.push(...translate(rules, 0, top));
    const rulesBox = { ...rb, y: top };
    const boxes: Bounds[] = [chips, rulesBox];
    const side: Shape[] = [];
    const sb = drawSide(side, state, roles, sideW);
    if (sb) {
      const at = beside ? { x: rulesBox.w + 32, y: top } : { x: 0, y: top + rulesBox.h + 20 };
      shapes.push(...translate(side, at.x, at.y));
      boxes.push({ x: at.x, y: at.y, w: sb.w, h: sb.h });
    }
    return { shapes, bounds: padBounds(unionBounds(...boxes), 12) };
  };

  // One wrap width per kind of stage, so the rules keep their places from step to step.
  const wide = !stage || stage.w >= 1.4 * stage.h;
  const best = wide
    ? pickBest(
        [
          build(460, 280, true),
          build(620, 320, true),
          build(300, 280, true, 2),
          build(380, 300, true, 2),
        ],
        stage,
      )
    : pickBest(
        [
          build(300, 300, false),
          build(300, 200, true),
          build(300, 300, false, 2),
          build(240, 300, false, 2),
        ],
        stage,
      );
  return { shapes: best.shapes, bounds: best.bounds, label };
}
