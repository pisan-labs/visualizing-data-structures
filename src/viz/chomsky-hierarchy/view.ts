/**
 * The map: nested rounded rectangles, all languages outside, then recursively enumerable,
 * decidable (a setting), context-sensitive, context-free and regular inside. Each region's top
 * band holds its name and, under it, its machine and grammar form; the tokens of the languages
 * that live there sit on the right of the band, beside the name if they fit, else in rows under
 * it. The outer box keeps its tokens at the bottom, clear of the stage's zoom buttons.
 *
 * Tokens keep the order they were placed in, so a new token never moves an old one sideways.
 * While a grammar is on show, L(G) has a slot in each of the four grammar levels, so it can slide
 * outward from level to level without the bands changing size.
 *
 * Beside or under the map, a panel: the grammar's rules and its level checks (Classify), or a
 * language and its claims (Place). The map's width and the panel's place are chosen together,
 * from a few arrangements, by how large fitScore draws them on the stage: wide bands with the
 * panel beside on a laptop, narrow bands with the panel under on a phone. A narrow stage may get
 * the machines' abbreviations and a panel without the explanations (the narration has them).
 * Sizes come from what the whole operation will show, so nothing jumps mid-run.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { fitScore, padBounds, unionBounds } from '../../layouts/graph';
import { textWidth, wrapText } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { BUTTONS_DROP, drawRules, ruleRows } from '../_grammar/draw';
import { productionText } from '../_grammar/grammar';
import { LANGUAGE, type LangId } from './languages';
import {
  FORM,
  LEVEL_REGION,
  MACHINE,
  NAME,
  SHORT_MACHINE,
  TYPE,
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

const INSET = 10;
const PAD = 7;
const GAP = 8;
const TITLE_SIZE = 15;
const DETAIL_SIZE = 13;
const TITLE_LINE = 20;
const DETAIL_LINE = 17;
const TOKEN_SIZE = 14;
const TOKEN_H = 24;
const TOKEN_ROW = 29;
const HEAD_SIZE = 14;
const BODY_SIZE = 13;
const BODY_LINE = 18;
/** The panel's widths beside the map; under it, the map's width within these limits. */
const PANEL_W = [330, 270];
const PANEL_MIN = 300;
const PANEL_MAX = 460;

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

/**
 * A token's pill. Short labels of wide letters run past the bold estimate in DejaVu Sans ("ww"
 * 0.92 of the size, "HALT" 0.69, against 0.64): the 14 of padding and the 36 minimum keep them
 * inside, with 5 to spare on each side.
 */
const tokenW = (label: string) => Math.max(36, textWidth(label, TOKEN_SIZE, false, true) + 14);
const GRAMMAR_LABEL = 'L(G)';
/** Each grammar level's region has a slot for L(G); the token itself has one id. */
const grammarSlot = (r: RegionId) => `${GRAMMAR_TOKEN}@${r}`;

/**
 * The regions drawn, outermost first, with their slots: L(G) first (while a grammar is on show),
 * then the languages placed, in the order placed.
 */
function bands(state: ChState, settings: ChSettings, short: boolean): Band[] {
  const grammarRegions = new Set(Object.values(LEVEL_REGION));
  return visibleRegions(settings)
    .reverse()
    .map((id) => {
      const slots: Slot[] = [];
      if (state.grammar && grammarRegions.has(id))
        slots.push({ key: grammarSlot(id), label: GRAMMAR_LABEL, w: tokenW(GRAMMAR_LABEL) });
      for (const lid of state.placed) {
        const l = LANGUAGE.get(lid)!;
        if (shownRegion(l.home, settings) === id)
          slots.push({ key: l.id, label: l.token, w: tokenW(l.token) });
      }
      const machine = (short ? SHORT_MACHINE : MACHINE)[id];
      const form = FORM[id];
      return {
        id,
        title: regionTitle(id, settings),
        // No break inside the form, or between the machine's last word and the dot.
        detail: form ? `${machine}\u00a0· ${form.replace(/ /g, '\u00a0')}` : machine,
        slots,
      };
    });
}

const rowWidth = (slots: readonly Slot[]) =>
  slots.reduce((a, s) => a + s.w, 0) + GAP * Math.max(0, slots.length - 1);

/** Slots packed into rows no wider than maxW, in order. */
function packRows(slots: readonly Slot[], maxW: number): Slot[][] {
  const rows: Slot[][] = [];
  for (const s of slots) {
    const row = rows.at(-1);
    if (row && rowWidth([...row, s]) <= maxW) row.push(s);
    else rows.push([s]);
  }
  return rows;
}

/** The width at which every band holds its tokens beside its name. */
function oneLineWidth(list: Band[]): number {
  return Math.max(
    ...list.map((b, depth) => {
      const head = Math.max(
        textWidth(b.title, TITLE_SIZE, false, true),
        textWidth(b.detail, DETAIL_SIZE),
      );
      const toks = depth === 0 ? 0 : rowWidth(b.slots);
      return 2 * depth * INSET + 2 * PAD + head + (toks ? GAP + toks : 0);
    }),
  );
}

/** The narrowest width at which every band still holds its widest word or token. */
function minWidth(list: Band[]): number {
  return Math.max(
    ...list.map((b, depth) => {
      const words = b.detail.split(' ').map((w) => textWidth(w, DETAIL_SIZE));
      const title = textWidth(b.title, TITLE_SIZE, false, true);
      const widest = Math.max(title, ...words, ...b.slots.map((s) => s.w));
      return 2 * depth * INSET + 2 * PAD + widest;
    }),
  );
}

/** Slots in a row, right-aligned to `right`, top at y. */
function placeRow(slots: Map<string, Bounds>, row: readonly Slot[], right: number, y: number) {
  let x = right - rowWidth(row);
  for (const s of row) {
    slots.set(s.key, { x, y, w: s.w, h: TOKEN_H });
    x += s.w + GAP;
  }
}

/** The regions at width W, outermost first. */
function layoutMap(list: Band[], W: number): MapGeom {
  const rects: MapGeom['rects'] = [];
  const texts: MapText[] = [];
  const slots = new Map<string, Bounds>();
  let footer: { rows: Slot[][]; right: number } | null = null;
  let y = 0;
  for (const [depth, band] of list.entries()) {
    const x = depth * INSET;
    const w = W - 2 * depth * INSET;
    const left = x + PAD;
    const right = x + w - PAD;
    const avail = right - left;
    const top = y + 4;
    const outer = depth === 0;
    const titleW = textWidth(band.title, TITLE_SIZE, false, true);
    const toks = rowWidth(band.slots);
    const lines = (maxW: number) => (band.detail ? wrapText(band.detail, maxW, DETAIL_SIZE) : []);
    const headH = (n: number) => TITLE_LINE + n * DETAIL_LINE;
    const widest = Math.max(
      titleW,
      ...band.detail.split(' ').map((t) => textWidth(t, DETAIL_SIZE)),
    );
    // Tokens beside the name (the detail wrapping short of them), or in rows under it, whichever
    // is shorter. The outer box keeps its tokens for a row at the bottom.
    let detail = lines(avail);
    let rows = outer || !toks ? [] : packRows(band.slots, avail);
    let beside = false;
    const narrow = avail - GAP - toks;
    if (!outer && toks && narrow >= widest) {
      const d = lines(narrow);
      if (headH(d.length) <= headH(detail.length) + rows.length * TOKEN_ROW) {
        detail = d;
        rows = [];
        beside = true;
      }
    }
    texts.push({
      id: `${regionId(band.id)}-title`,
      x: left,
      y: top + TITLE_SIZE,
      text: band.title,
      size: TITLE_SIZE,
      bold: true,
    });
    detail.forEach((line, k) => {
      texts.push({
        id: `${regionId(band.id)}-detail-${k}`,
        x: left,
        y: top + TITLE_LINE + DETAIL_SIZE - 1 + k * DETAIL_LINE,
        text: line,
        size: DETAIL_SIZE,
        bold: false,
      });
    });
    const head = headH(detail.length);
    if (beside) placeRow(slots, band.slots, right, top + (head - TOKEN_H) / 2);
    let bandH = 4 + head;
    for (const row of rows) {
      placeRow(slots, row, right, y + bandH + (TOKEN_ROW - TOKEN_H) / 2);
      bandH += TOKEN_ROW;
    }
    if (outer && band.slots.length) footer = { rows: packRows(band.slots, avail), right };
    rects.push({ id: band.id, depth, b: { x, y, w, h: 0 } });
    y += bandH + 4;
  }
  // Heights from the inside out; the outer box's tokens go in rows under the region inside it.
  let bottom = y + 2;
  for (let k = rects.length - 1; k >= 0; k--) {
    const r = rects[k]!;
    if (k === 0 && footer) {
      let fy = bottom - INSET + 4;
      for (const row of footer.rows) {
        placeRow(slots, row, footer.right, fy + (TOKEN_ROW - TOKEN_H) / 2);
        fy += TOKEN_ROW;
      }
      bottom = fy + 3;
    }
    r.b.h = bottom - r.b.y;
    bottom += INSET;
  }
  return { rects, texts, slots, bounds: { x: 0, y: 0, w: W, h: rects[0]!.b.h } };
}

/** The map's widths worth trying: every band on one line, and narrower ones down to a phone's. */
function mapWidths(list: Band[]): number[] {
  const one = Math.ceil(oneLineWidth(list));
  const min = Math.ceil(minWidth(list));
  const raw = [one, Math.round(one * 0.8), Math.round(one * 0.65), 400, 360, 330];
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
function checkLines(
  g: GrammarInfo,
  settings: ChSettings,
  width: number,
  compact: boolean,
): PanelText[] {
  const out: PanelText[] = [];
  let dy = 0;
  const heads = g.result.checks.map((c, k) => {
    const region = LEVEL_REGION[c.level];
    const title =
      settings.names === 'types'
        ? `Type ${TYPE[region]}`
        : c.level.charAt(0).toUpperCase() + c.level.slice(1);
    const final =
      c.miss < 0
        ? `✓ ${title}: every rule fits`
        : `✗ ${title}: ${productionText(g.rules[c.miss]!)}`;
    const checking = `… ${title}: checking`;
    return { final, now: k === g.at && !g.decided ? checking : final, checking };
  });
  // A compact panel keeps one line, the check in progress, with room for the longest of them.
  const longest = Math.max(
    ...heads
      .flatMap((h) => [h.final, h.checking])
      .map((t) => wrapText(t, width, HEAD_SIZE, { bold: true }).length),
  );
  g.result.checks.forEach((c, k) => {
    if (compact && k !== g.at) return;
    const fits = c.miss < 0;
    const shown = k < g.at || (k === g.at && g.decided);
    const checking = k === g.at && !g.decided;
    const { final, now: head } = heads[k]!;
    // Room for the longer of the two, so the panel keeps its size as the check ends.
    const room = compact
      ? Array.from({ length: longest })
      : wrapText(head.length > final.length ? head : final, width, HEAD_SIZE, { bold: true });
    const drawn = wrapText(head, width, HEAD_SIZE, { bold: true });
    room.forEach((_, i) => {
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
    const reason = fits ? '' : c.short;
    if (reason && !compact) {
      for (const [i, line] of wrapText(reason, width - 16, BODY_SIZE).entries()) {
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

/** A level's name inside a phrase: "regular", or with Type names "Type 3". */
const lower = (r: RegionId, s: ChSettings) =>
  s.names === 'types' && TYPE[r] !== undefined ? `Type ${TYPE[r]}` : NAME[r];

/** A language's title, its claims and the verdict, all reserved, drawn as far as shown. */
function claimLines(
  id: LangId,
  shown: number,
  done: boolean,
  settings: ChSettings,
  width: number,
  compact: boolean,
): PanelText[] {
  const lang = LANGUAGE.get(id)!;
  const out: PanelText[] = [];
  let dy = 0;
  wrapText(lang.title, width, HEAD_SIZE + 1, { bold: true }).forEach((line, i) => {
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
    const head = c.kind === 'in' ? `✓ ${title}` : `✗ Not ${lower(c.region, settings)}`;
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
    if (!compact) {
      for (const [i, line] of wrapText(c.short, width - 16, BODY_SIZE).entries()) {
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
    }
    dy += 4;
  });
  const out1 = lang.claims.find((c) => c.kind === 'out');
  const home = lang.home === 'all' ? 'outside every level' : lower(lang.home, settings);
  const not = out1 && lang.home !== 'all' ? `, not ${lower(out1.region, settings)}` : '';
  wrapText(`So: ${home}${not}`, width, HEAD_SIZE, { bold: true }).forEach((line, i) => {
    out.push({
      id: i === 0 ? 'lang-verdict' : `lang-verdict-${i}`,
      dx: 0,
      dy: dy + HEAD_SIZE + 2,
      text: line,
      size: HEAD_SIZE,
      bold: true,
      role: 'found',
      hidden: !done,
    });
    dy += BODY_LINE + 2;
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
  const w = Math.max(...lines.map((l) => l.dx + textWidth(l.text, l.size, false, l.bold)), 0);
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
  compact: boolean,
  roles: ReadonlyMap<string, MarkRole>,
): Panel {
  const rules = g.rules.map(asRule);
  const rows = ruleRows([...new Set(rules.map((r) => r.lhs))], rules);
  const n = g.rules.length;
  const title = `G (start ${g.start}), ${n} rule${n === 1 ? '' : 's'}`;
  const opts = (x: number, y: number) => ({ prefix: RULES, x, y, maxW: width, roles, title });
  const box = drawRules([], rows, opts(0, 0));
  const checks = textPanel(checkLines(g, settings, width, compact), roles);
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
  compact: boolean,
  roles: ReadonlyMap<string, MarkRole>,
): Panel | null {
  const f = state.focus;
  if (f.kind === 'grammar' && state.grammar)
    return grammarPanel(state.grammar, settings, width, compact, roles);
  if (f.kind === 'language')
    return textPanel(claimLines(f.id, f.shown, f.done, settings, width, compact), roles);
  return null;
}

// ---------------------------------------------------------------------------------------------
// The scene

interface Arrangement {
  map: MapGeom;
  panel: Panel | null;
  at: { x: number; y: number };
  bounds: Bounds;
  /** A fallback for small stages: abbreviated machines, or a panel without explanations. */
  fallback: boolean;
}

function arrangements(
  state: ChState,
  settings: ChSettings,
  roles: ReadonlyMap<string, MarkRole>,
): Arrangement[] {
  const out: Arrangement[] = [];
  for (const short of [false, true]) {
    const list = bands(state, settings, short);
    for (const W of mapWidths(list)) {
      const map = layoutMap(list, W);
      for (const compact of [false, true]) {
        const fallback = short || compact;
        if (!panelFor(state, settings, PANEL_W[0]!, compact, roles)) {
          if (!compact)
            out.push({ map, panel: null, at: { x: 0, y: 0 }, bounds: map.bounds, fallback });
          continue;
        }
        for (const pw of PANEL_W) {
          const beside = panelFor(state, settings, pw, compact, roles)!;
          const sideAt = { x: W + 26, y: BUTTONS_DROP };
          out.push({
            map,
            panel: beside,
            at: sideAt,
            bounds: unionBounds(map.bounds, { ...sideAt, w: beside.w, h: beside.h }),
            fallback,
          });
        }
        const width = Math.max(PANEL_MIN, Math.min(PANEL_MAX, W));
        const under = panelFor(state, settings, width, compact, roles)!;
        const underAt = { x: 0, y: map.bounds.h + 18 };
        out.push({
          map,
          panel: under,
          at: underAt,
          bounds: unionBounds(map.bounds, { ...underAt, w: under.w, h: under.h }),
          fallback,
        });
      }
    }
  }
  return out;
}

/**
 * The arrangement drawn largest on the stage (on both typical stages when there is none). Earlier
 * ones win near ties, and a fallback has to be clearly larger to be worth its shorter labels.
 */
function choose(list: Arrangement[], stage?: StageSize): Arrangement {
  const best = (xs: Arrangement[]) => {
    let top = xs[0]!;
    let score = -Infinity;
    for (const a of xs) {
      const s = fitScore(padBounds(a.bounds, 14), stage);
      if (s > score * 1.03) {
        top = a;
        score = s;
      }
    }
    return { top, score };
  };
  const full = best(list.filter((a) => !a.fallback));
  const fallback = best(list.filter((a) => a.fallback));
  return fallback.score > full.score * 1.12 ? fallback.top : full.top;
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
  for (const r of a.map.rects) {
    const id = regionId(r.id);
    shapes.push({
      kind: 'rect',
      id,
      ...r.b,
      r: 14,
      cls: r.depth % 2 === 0 ? 'live' : undefined,
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
