/**
 * The map: nested rounded rectangles, all languages outside, then recursively enumerable,
 * decidable (a setting), context-sensitive, context-free and regular inside. Each region's top
 * band holds its name, its machine and its grammar form, then the tokens of the languages that
 * live there. Every token has a slot reserved from the start, so placing one never moves another.
 *
 * Beside or under the map, a panel: the grammar's rules and its level checks (Classify), or a
 * language and its claims (Place). The map's width and the panel's place are chosen together,
 * from a few arrangements, by how large fitScore draws them on the stage: wide bands with the
 * panel beside on a laptop, narrow bands with the panel under on a phone. Sizes come from what
 * the whole operation will show, so nothing jumps mid-run.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { fitScore, padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { BUTTONS_DROP, drawRules, ruleRows } from '../_grammar/draw';
import { LANGUAGE, LANGUAGES, type LangId } from './languages';
import {
  FORM,
  LEVEL_REGION,
  MACHINE,
  TYPE,
  productionText,
  regionTitle,
  shownRegion,
  visibleRegions,
  type RegionId,
} from './levels';
import {
  GRAMMAR_TOKEN,
  RULES,
  asRule,
  checkId,
  claimId,
  describe,
  regionId,
  tokenId,
  type ChExtra,
  type ChSettings,
  type ChState,
  type GrammarInfo,
} from './model';

type ChStep = Step<ChState, ChExtra>;

const INSET = 12;
const PAD = 9;
const GAP = 9;
const TITLE_SIZE = 15;
const DETAIL_SIZE = 13;
const TOKEN_SIZE = 14;
const TOKEN_H = 25;
const TEXT_LINE = 21;
const TOKEN_LINE = 31;
const BAND_BOTTOM = 5;
const HEAD_SIZE = 14;
const BODY_SIZE = 13;
const BODY_LINE = 18;
/** The panel's width beside the map; under it, the map's width within these limits. */
const PANEL_W = 330;
const PANEL_MIN = 300;
const PANEL_MAX = 460;

/**
 * Text width, a little wider than the shared estimate: CI's font (DejaVu Sans) is wide, and a
 * label that spills out of its band would cross the region's edge.
 */
const tw = (text: string, size: number, bold = false) => text.length * size * (bold ? 0.66 : 0.61);

/** Words wrapped into lines no wider than maxW. */
export function wrap(text: string, maxW: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && tw(next, size, bold) > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------------------------
// The map

interface Slot {
  key: string;
  label: string;
  w: number;
}

interface Band {
  id: RegionId;
  title: string;
  detail: string;
  slots: Slot[];
}

interface MapText {
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
  bold: boolean;
}

interface MapGeom {
  rects: { id: RegionId; depth: number; b: Bounds }[];
  texts: MapText[];
  slots: Map<string, Bounds>;
  bounds: Bounds;
}

const tokenW = (label: string) => Math.max(36, tw(label, TOKEN_SIZE) + 18);
export const GRAMMAR_LABEL = 'L(G)';
/** Each grammar level's region has a slot for L(G); the token itself has one id. */
const grammarSlot = (r: RegionId) => `${GRAMMAR_TOKEN}@${r}`;

/** The regions drawn, outermost first, with their slots: L(G) first, then the languages. */
function bands(settings: ChSettings): Band[] {
  const grammarRegions = new Set(Object.values(LEVEL_REGION));
  return visibleRegions(settings)
    .reverse()
    .map((id) => {
      const slots: Slot[] = [];
      if (grammarRegions.has(id))
        slots.push({ key: grammarSlot(id), label: GRAMMAR_LABEL, w: tokenW(GRAMMAR_LABEL) });
      for (const l of LANGUAGES)
        if (shownRegion(l.home, settings) === id)
          slots.push({ key: l.id, label: l.token, w: tokenW(l.token) });
      const form = FORM[id];
      return {
        id,
        title: regionTitle(id, settings),
        detail: form ? `${MACHINE[id]} · ${form}` : MACHINE[id],
        slots,
      };
    });
}

/** The width at which every band fits on one line. */
function oneLineWidth(list: Band[]): number {
  return Math.max(
    ...list.map((b, depth) => {
      const items = [
        tw(b.title, TITLE_SIZE, true),
        tw(b.detail, DETAIL_SIZE),
        ...b.slots.map((s) => s.w),
      ];
      return 2 * depth * INSET + 2 * PAD + items.reduce((a, x) => a + x, 0) + GAP * items.length;
    }),
  );
}

/** The narrowest width at which the innermost bands still hold their widest word or token. */
function minWidth(list: Band[]): number {
  return Math.max(
    ...list.map((b, depth) => {
      const words = b.detail.split(' ').map((w) => tw(w, DETAIL_SIZE));
      const widest = Math.max(tw(b.title, TITLE_SIZE, true), ...words, ...b.slots.map((s) => s.w));
      return 2 * depth * INSET + 2 * PAD + widest;
    }),
  );
}

/**
 * The regions at width W. In each band the title comes first, then the machine and form (on the
 * same line if they fit, else wrapped under it), then the token slots, wrapping as needed.
 */
function layoutMap(list: Band[], W: number): MapGeom {
  const rects: MapGeom['rects'] = [];
  const texts: MapText[] = [];
  const slots = new Map<string, Bounds>();
  let y = 0;
  list.forEach((band, depth) => {
    const x = depth * INSET;
    const w = W - 2 * depth * INSET;
    const avail = w - 2 * PAD;
    const left = x + PAD;
    type Item =
      | { kind: 'text'; text: string; x: number; size: number; bold: boolean; id: string }
      | { kind: 'slot'; key: string; x: number; w: number };
    const lines: Item[][] = [[]];
    const titleW = tw(band.title, TITLE_SIZE, true);
    lines[0]!.push({
      kind: 'text',
      id: `${regionId(band.id)}-title`,
      text: band.title,
      x: 0,
      size: TITLE_SIZE,
      bold: true,
    });
    let cx = titleW;
    if (band.detail) {
      const dw = tw(band.detail, DETAIL_SIZE);
      const parts = cx + GAP + dw <= avail ? [band.detail] : wrap(band.detail, avail, DETAIL_SIZE);
      parts.forEach((text, k) => {
        const same = parts.length === 1 && cx + GAP + dw <= avail;
        if (!same) lines.push([]);
        const ix = same ? cx + GAP : 0;
        lines.at(-1)!.push({
          kind: 'text',
          id: `${regionId(band.id)}-detail-${k}`,
          text,
          x: ix,
          size: DETAIL_SIZE,
          bold: false,
        });
        cx = ix + tw(text, DETAIL_SIZE);
      });
    }
    for (const slot of band.slots) {
      if (cx > 0 && cx + GAP + slot.w > avail) {
        lines.push([]);
        cx = 0;
      }
      const sx = cx > 0 ? cx + GAP : 0;
      lines.at(-1)!.push({ kind: 'slot', key: slot.key, x: sx, w: slot.w });
      cx = sx + slot.w;
    }
    let ly = y + 3;
    for (const line of lines) {
      const h = line.some((i) => i.kind === 'slot') ? TOKEN_LINE : TEXT_LINE;
      for (const item of line) {
        if (item.kind === 'slot') {
          slots.set(item.key, {
            x: left + item.x,
            y: ly + (h - TOKEN_H) / 2,
            w: item.w,
            h: TOKEN_H,
          });
        } else {
          texts.push({
            id: item.id,
            x: left + item.x,
            y: ly + h / 2 + item.size * 0.36,
            text: item.text,
            size: item.size,
            bold: item.bold,
          });
        }
      }
      ly += h;
    }
    rects.push({ id: band.id, depth, b: { x, y, w, h: 0 } });
    y = ly + BAND_BOTTOM;
  });
  let bottom = y + 4;
  for (let k = rects.length - 1; k >= 0; k--) {
    rects[k]!.b.h = bottom - rects[k]!.b.y;
    bottom += INSET;
  }
  return { rects, texts, slots, bounds: { x: 0, y: 0, w: W, h: rects[0]!.b.h } };
}

/** The map's widths worth trying: every band on one line, and narrower ones down to a phone's. */
function mapWidths(list: Band[]): number[] {
  const one = Math.ceil(oneLineWidth(list));
  const min = Math.ceil(minWidth(list));
  const raw = [one, Math.round(one * 0.75), Math.round(one * 0.58), 360, 330];
  return [...new Set(raw.map((w) => Math.max(min, Math.min(one, w))))];
}

// ---------------------------------------------------------------------------------------------
// The panel

interface PanelText {
  id: string;
  dx: number;
  dy: number;
  text: string;
  size: number;
  bold?: boolean;
  label?: boolean;
  role?: MarkRole;
  /** Reserved: counts for the size, but not drawn yet. */
  hidden?: boolean;
}

/** The checks under the rules: one head and one reason per level, all reserved. */
function checkLines(g: GrammarInfo, settings: ChSettings, width: number): PanelText[] {
  const out: PanelText[] = [];
  let dy = 0;
  g.result.checks.forEach((c, k) => {
    const region = LEVEL_REGION[c.level];
    const title =
      settings.names === 'types'
        ? `Type ${TYPE[region]}`
        : c.level.charAt(0).toUpperCase() + c.level.slice(1);
    const fits = c.miss < 0;
    const shown = k < g.at || (k === g.at && g.decided);
    const checking = k === g.at && !g.decided;
    const head = checking
      ? `… ${title}: checking`
      : fits
        ? `✓ ${title}: every rule fits`
        : `✗ ${title}: ${productionText(g.rules[c.miss]!)}`;
    const reserve = fits
      ? `✓ ${title}: every rule fits`
      : `✗ ${title}: ${productionText(g.rules[c.miss]!)}`;
    const headLines = wrap(head.length > reserve.length ? head : reserve, width, HEAD_SIZE, true);
    const drawn = wrap(head, width, HEAD_SIZE, true);
    headLines.forEach((_, i) => {
      out.push({
        id: i === 0 ? checkId(k) : `${checkId(k)}-${i}`,
        dx: 0,
        dy: dy + HEAD_SIZE,
        text: drawn[i] ?? '',
        size: HEAD_SIZE,
        bold: true,
        role: checking ? 'active' : fits ? 'found' : 'error',
        hidden: !(shown || checking) || !drawn[i],
      });
      dy += BODY_LINE + 2;
    });
    const reason = fits
      ? c.level === 'unrestricted'
        ? 'a variable on every left side'
        : ''
      : c.short;
    if (reason) {
      for (const [i, line] of wrap(reason, width - 16, BODY_SIZE).entries()) {
        out.push({
          id: `${checkId(k)}-why-${i}`,
          dx: 16,
          dy: dy + BODY_SIZE,
          text: line,
          size: BODY_SIZE,
          label: true,
          hidden: !shown,
        });
        dy += BODY_LINE;
      }
    }
    dy += 4;
  });
  return out;
}

/** A language's title, its claims and the verdict, all reserved, drawn as far as shown. */
function claimLines(
  id: LangId,
  shown: number,
  done: boolean,
  settings: ChSettings,
  width: number,
): PanelText[] {
  const lang = LANGUAGE.get(id)!;
  const out: PanelText[] = [];
  let dy = 0;
  wrap(lang.title, width, HEAD_SIZE + 1, true).forEach((line, i) => {
    out.push({
      id: i === 0 ? 'lang-title' : `lang-title-${i}`,
      dx: 0,
      dy: dy + HEAD_SIZE + 1,
      text: line,
      size: HEAD_SIZE + 1,
      bold: true,
    });
    dy += BODY_LINE + 4;
  });
  dy += 4;
  lang.claims.forEach((c, k) => {
    const title = regionTitle(c.region, settings);
    const head = c.kind === 'in' ? `✓ In ${title}` : `✗ Not ${title}`;
    const hidden = k >= shown;
    out.push({
      id: claimId(k),
      dx: 0,
      dy: dy + HEAD_SIZE,
      text: head,
      size: HEAD_SIZE,
      bold: true,
      role: c.kind === 'in' ? 'new' : 'error',
      hidden,
    });
    dy += BODY_LINE + 2;
    for (const [i, line] of wrap(c.short, width - 16, BODY_SIZE).entries()) {
      out.push({
        id: `${claimId(k)}-why-${i}`,
        dx: 16,
        dy: dy + BODY_SIZE,
        text: line,
        size: BODY_SIZE,
        label: true,
        hidden,
      });
      dy += BODY_LINE;
    }
    dy += 4;
  });
  const out1 = lang.claims.find((c) => c.kind === 'out');
  const home = lang.home === 'all' ? 'outside every level' : regionTitle(lang.home, settings);
  const not = out1 && lang.home !== 'all' ? `, not ${regionTitle(out1.region, settings)}` : '';
  out.push({
    id: 'lang-verdict',
    dx: 0,
    dy: dy + HEAD_SIZE + 2,
    text: `So: ${home}${not}`,
    size: HEAD_SIZE,
    bold: true,
    role: 'found',
    hidden: !done,
  });
  return out;
}

interface Panel {
  w: number;
  h: number;
  /** Draw at (x, y), returning the title's place (where a new token slides in from). */
  draw(out: Shape[], x: number, y: number): { x: number; y: number };
}

function textPanel(lines: PanelText[], roles: ReadonlyMap<string, MarkRole>): Panel {
  const w = Math.max(...lines.map((l) => l.dx + tw(l.text, l.size, l.bold)), 0);
  const h = Math.max(...lines.map((l) => l.dy + l.size * 0.35), 0);
  return {
    w,
    h,
    draw(out, x, y) {
      for (const l of lines) {
        if (l.hidden) continue;
        out.push({
          kind: 'text',
          id: l.id,
          x: x + l.dx,
          y: y + l.dy,
          text: l.text,
          size: l.size,
          weight: l.bold ? 'bold' : undefined,
          cls: l.label ? 'label' : undefined,
          role: roles.get(l.id) ?? l.role,
        });
      }
      return { x: x + 20, y: y + 6 };
    },
  };
}

/** The grammar's rules, then its checks. */
function grammarPanel(
  g: GrammarInfo,
  settings: ChSettings,
  width: number,
  roles: ReadonlyMap<string, MarkRole>,
): Panel {
  const rules = g.rules.map(asRule);
  const lhsOrder = [...new Set(rules.map((r) => r.lhs))];
  const rows = ruleRows(lhsOrder, rules);
  const title = `G (start ${g.start}), ${g.rules.length} rule${g.rules.length === 1 ? '' : 's'}`;
  const opts = (x: number, y: number) => ({
    prefix: RULES,
    x,
    y,
    maxW: width,
    roles,
    title,
  });
  const measure: Shape[] = [];
  const box = drawRules(measure, rows, opts(0, 0));
  const checks = textPanel(checkLines(g, settings, width), roles);
  const gap = 12;
  return {
    w: Math.max(box.w, checks.w),
    h: box.h + gap + checks.h,
    draw(out, x, y) {
      drawRules(out, rows, opts(x, y));
      checks.draw(out, x, y + box.h + gap);
      return { x: x + 20, y: y + 8 };
    },
  };
}

function panelFor(
  state: ChState,
  settings: ChSettings,
  width: number,
  roles: ReadonlyMap<string, MarkRole>,
): Panel | null {
  const f = state.focus;
  if (f.kind === 'grammar' && state.grammar)
    return grammarPanel(state.grammar, settings, width, roles);
  if (f.kind === 'language')
    return textPanel(claimLines(f.id, f.shown, f.done, settings, width), roles);
  return null;
}

// ---------------------------------------------------------------------------------------------
// The scene

interface Arrangement {
  W: number;
  map: MapGeom;
  panel: Panel | null;
  at: { x: number; y: number };
  bounds: Bounds;
}

function arrangements(
  state: ChState,
  settings: ChSettings,
  roles: ReadonlyMap<string, MarkRole>,
): Arrangement[] {
  const list = bands(settings);
  const out: Arrangement[] = [];
  for (const W of mapWidths(list)) {
    const map = layoutMap(list, W);
    const beside = panelFor(state, settings, PANEL_W, roles);
    if (!beside) {
      out.push({ W, map, panel: null, at: { x: 0, y: 0 }, bounds: map.bounds });
      continue;
    }
    const sideAt = { x: W + 28, y: BUTTONS_DROP };
    out.push({
      W,
      map,
      panel: beside,
      at: sideAt,
      bounds: unionBounds(map.bounds, { ...sideAt, w: beside.w, h: beside.h }),
    });
    const under = panelFor(state, settings, Math.max(PANEL_MIN, Math.min(PANEL_MAX, W)), roles)!;
    const underAt = { x: 0, y: map.bounds.h + 20 };
    out.push({
      W,
      map,
      panel: under,
      at: underAt,
      bounds: unionBounds(map.bounds, { ...underAt, w: under.w, h: under.h }),
    });
  }
  return out;
}

/** The arrangement drawn largest on the stage (on both typical stages when there is none). */
function choose(list: Arrangement[], stage?: StageSize): Arrangement {
  let best = list[0]!;
  let score = -Infinity;
  for (const a of list) {
    const s = fitScore(padBounds(a.bounds, 14), stage);
    if (s > score * 1.03) {
      best = a;
      score = s;
    }
  }
  return best;
}

/** Where the L(G) token sits now, and how it looks. */
function grammarToken(g: GrammarInfo): { region: RegionId; role?: MarkRole } {
  const check = g.result.checks[g.at]!;
  const region = LEVEL_REGION[check.level];
  if (!g.decided) return { region, role: 'compare' };
  return { region, role: check.miss < 0 ? undefined : 'error' };
}

export function view(step: ChStep, settings: ChSettings, stage?: StageSize): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const a = choose(arrangements(state, settings, roles), stage);
  const shapes: Shape[] = [];
  const fills = ['live', ''];
  for (const r of a.map.rects) {
    const id = regionId(r.id);
    shapes.push({
      kind: 'rect',
      id,
      ...r.b,
      r: 14,
      cls: fills[r.depth % 2] || undefined,
      role: roles.get(id),
    });
  }
  for (const t of a.map.texts) {
    shapes.push({
      kind: 'text',
      id: t.id,
      x: t.x,
      y: t.y,
      text: t.text,
      size: t.size,
      weight: t.bold ? 'bold' : undefined,
      cls: t.bold ? undefined : 'label',
    });
  }
  const from = a.panel ? a.panel.draw(shapes, a.at.x, a.at.y) : undefined;
  const focus = state.focus.kind === 'language' ? state.focus.id : null;
  const token = (
    key: string,
    slot: Bounds | undefined,
    label: string,
    role: MarkRole | undefined,
    o: { dashed?: boolean; slide?: boolean } = {},
  ) => {
    if (!slot) return;
    const id = tokenId(key);
    const enter = o.slide ? from : undefined;
    shapes.push({
      kind: 'rect',
      id,
      ...slot,
      r: slot.h / 2,
      cls: o.dashed ? 'ghost' : 'live',
      role: roles.get(id) ?? role,
      enterFrom: enter,
    });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: slot.x + slot.w / 2,
      y: slot.y + slot.h / 2 + TOKEN_SIZE * 0.36,
      text: label,
      size: TOKEN_SIZE,
      anchor: 'middle',
      weight: 'bold',
      enterFrom: enter && { x: enter.x, y: enter.y + TOKEN_SIZE * 0.36 },
    });
  };
  if (state.grammar) {
    // One id in every region, so the token slides out level by level as the checks fail.
    const g = grammarToken(state.grammar);
    token(GRAMMAR_TOKEN, a.map.slots.get(grammarSlot(g.region)), GRAMMAR_LABEL, g.role, {
      dashed: true,
      slide: state.focus.kind === 'grammar',
    });
  }
  for (const id of state.placed) {
    const l = LANGUAGE.get(id)!;
    token(id, a.map.slots.get(id), l.token, undefined, { slide: id === focus });
  }
  return { shapes, bounds: padBounds(a.bounds, 14), label: describe(state, settings) };
}
