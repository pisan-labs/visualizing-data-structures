/**
 * The pattern map's three pictures:
 *
 * - the overview: one box per family, with how many patterns it has and how many of their pages
 *   are live, in a grid of 4, 3 or 2 columns;
 * - a family: each pattern's cues on the left, arrows to the pattern on the right, and the
 *   pattern's page under its name. A pattern whose page is not live yet has a dashed box and
 *   says so. Large families split into two column groups on a wide stage;
 * - a problem: the statement on top, then one row per cue found in it: the words, the cue,
 *   and the pattern it points to (a look-alike's pattern is marked ruled out), and the answer.
 *   On a wide stage the words sit left of the cue; on a narrow one, above it.
 *
 * Every arrangement is sized for the whole operation, so nothing moves while it runs; the one
 * drawn largest on the stage wins (pickBest).
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import { clearOfButtons, padBounds, unionBounds } from '../../layouts/graph';
import { textWidth, wrapText } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  CUES,
  FAMILIES,
  NODES,
  PROBLEMS,
  cue as cueOf,
  cuesOf,
  live,
  node as nodeOf,
  pageText,
  type Find,
} from './map';
import {
  HEAD,
  PROB,
  VERDICT,
  arrowId,
  cueId,
  describe,
  famId,
  nodeId,
  pageId,
  shownFinds,
  wordsId,
  type PmSettings,
  type PmState,
} from './model';

/** Text size everywhere but titles, and the line height it takes. */
export const T = 14;
const TITLE = 16;
const LINE = 18;
const PAD = 6;
export const CUE_W = 240;
export const NODE_W = 240;
/** Room for an arrow between two columns. */
const GAP = 36;
const ROW_GAP = 12;
const CUE_GAP = 6;
const GROUP_GAP = 30;
const BOX_W = 236;
/** The words column of a problem, beside the cue on a wide stage. */
const WORDS_W = 220;

type Roles = Map<string, MarkRole>;

interface Part {
  shapes: Shape[];
  bounds: Bounds;
}

const linesH = (n: number) => n * LINE + 2 * PAD - 2;

/** Lines of text in a box: their baselines, from the box's top. */
const baseline = (top: number, i: number) => top + PAD + (i + 1) * LINE - 5;

function textLines(
  shapes: Shape[],
  id: string,
  lines: string[],
  x: number,
  top: number,
  o: { bold?: boolean; mono?: boolean; cls?: string; role?: MarkRole; size?: number } = {},
) {
  lines.forEach((text, i) =>
    shapes.push({
      kind: 'text',
      id: i === 0 ? id : `${id}-${i}`,
      x,
      y: baseline(top, i),
      text,
      size: o.size ?? T,
      weight: o.bold ? 'bold' : undefined,
      mono: o.mono,
      cls: o.cls,
      role: o.role,
    }),
  );
}

// ----- Boxes -----

interface Box {
  w: number;
  h: number;
  draw(shapes: Shape[], x: number, y: number, roles: Roles): void;
}

function cueBox(id: string): Box {
  const q = cueOf(id);
  const lines = wrapText(q.text, CUE_W - 2 * PAD, T);
  const h = linesH(lines.length);
  return {
    w: CUE_W,
    h,
    draw(shapes, x, y, roles) {
      const rid = cueId(id);
      shapes.push({ kind: 'rect', id: rid, x, y, w: CUE_W, h, r: h / 2.5, role: roles.get(rid) });
      textLines(shapes, `${rid}-t`, lines, x + PAD + 4, y);
    },
  };
}

function nodeBox(id: string, note?: string): Box {
  const n = nodeOf(id);
  const name = wrapText(n.name, NODE_W - 2 * PAD, T, { bold: true });
  const rows = name.length + 1 + (note ? 1 : 0);
  const h = linesH(rows);
  return {
    w: NODE_W,
    h,
    draw(shapes, x, y, roles) {
      const rid = nodeId(id);
      const isLive = live(id);
      shapes.push({
        kind: 'rect',
        id: rid,
        x,
        y,
        w: NODE_W,
        h,
        r: 6,
        cls: isLive ? 'live' : 'ghost',
        role: roles.get(rid),
      });
      textLines(shapes, `${rid}-t`, name, x + PAD, y, { bold: true });
      const pid = pageId(id);
      shapes.push({
        kind: 'text',
        id: pid,
        x: x + PAD,
        y: baseline(y, name.length),
        text: pageText(id),
        size: T,
        mono: isLive,
        cls: isLive ? undefined : 'label',
        role: roles.get(pid),
      });
      if (note)
        shapes.push({
          kind: 'text',
          id: `${rid}-note`,
          x: x + PAD,
          y: baseline(y, name.length + 1),
          text: note,
          size: T,
          cls: 'label',
          role: roles.get(`${rid}-note`) ?? 'error',
        });
    },
  };
}

function arrow(
  shapes: Shape[],
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  roles: Roles,
) {
  shapes.push({
    kind: 'arrow',
    id,
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    role: roles.get(id),
  });
}

/** A title line and lines of label text under it, wrapped to `width`. */
function header(shapes: Shape[], title: string, sub: string, width: number, roles: Roles): number {
  shapes.push({
    kind: 'text',
    id: HEAD,
    x: 0,
    y: TITLE,
    text: title,
    size: TITLE,
    weight: 'bold',
    role: roles.get(HEAD),
  });
  const lines = wrapText(sub, width, T);
  lines.forEach((text, i) =>
    shapes.push({
      kind: 'text',
      id: `${HEAD}-n${i}`,
      x: 0,
      y: TITLE + 22 + i * LINE,
      text,
      size: T,
      cls: 'label',
    }),
  );
  return TITLE + 22 + (lines.length - 1) * LINE + 16;
}

function shift(shapes: Shape[], dx: number, dy: number): Shape[] {
  return shapes.map((s) => {
    if (s.kind === 'arrow')
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    if (s.kind === 'polygon')
      return { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
    return { ...s, x: s.x + dx, y: s.y + dy };
  });
}

/** The header and the body under it, the body moved down if the zoom buttons would cover it. */
function assemble(
  head: Shape[],
  headBox: Bounds,
  body: Shape[],
  bodyBox: Bounds,
  stage?: StageSize,
): Part {
  let box = bodyBox;
  if (stage) box = clearOfButtons(bodyBox, headBox, stage);
  const dy = box.y - bodyBox.y;
  return { shapes: [...head, ...shift(body, 0, dy)], bounds: unionBounds(headBox, box) };
}

// ----- The overview -----

function overview(state: PmState, roles: Roles, cols: number, stage?: StageSize): Part {
  const head: Shape[] = [];
  const width = cols * BOX_W + (cols - 1) * 12;
  const live = NODES.filter((n) => isLiveNode(n.id)).length;
  const top = header(
    head,
    'The pattern map',
    `${FAMILIES.length} families, ${NODES.length} patterns, ${CUES.length} cues; ${live} pages live`,
    width,
    roles,
  );
  const headBox: Bounds = { x: 0, y: 0, w: width, h: top - 8 };
  const body: Shape[] = [];
  const h = linesH(2) + 4;
  FAMILIES.forEach((f, k) => {
    const x = (k % cols) * (BOX_W + 12);
    const y = top + Math.floor(k / cols) * (h + 12);
    const id = famId(k);
    const focus = state.family === k;
    body.push({
      kind: 'rect',
      id,
      x,
      y,
      w: BOX_W,
      h,
      r: 8,
      cls: 'live',
      role: roles.get(id) ?? (focus ? 'active' : undefined),
    });
    body.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + PAD + 2,
      y: baseline(y + 2, 0),
      text: f.name,
      size: T,
      weight: 'bold',
    });
    const k2 = f.nodes.filter(isLiveNode).length;
    const n = f.nodes.length;
    body.push({
      kind: 'text',
      id: `${id}-n`,
      x: x + PAD + 2,
      y: baseline(y + 2, 1),
      text: `${k + 1}. ${n} ${n === 1 ? 'pattern' : 'patterns'}, ${k2 === n ? 'all live' : `${k2} live`}`,
      size: T,
      cls: 'label',
    });
  });
  const rows = Math.ceil(FAMILIES.length / cols);
  const bodyBox: Bounds = { x: 0, y: top, w: width, h: rows * (h + 12) - 12 };
  return assemble(head, headBox, body, bodyBox, stage);
}

const isLiveNode = (id: string) => live(id);

// ----- A family -----

interface Row {
  node: string;
  cues: Box[];
  cueIds: string[];
  box: Box;
  h: number;
}

function familyRows(f: number): Row[] {
  return FAMILIES[f]!.nodes.map((id) => {
    const cueIds = cuesOf(id).map((q) => q.id);
    const cues = cueIds.map(cueBox);
    const box = nodeBox(id);
    const stack = cues.reduce((t, b) => t + b.h, 0) + CUE_GAP * (cues.length - 1);
    return { node: id, cues, cueIds, box, h: Math.max(stack, box.h) };
  });
}

/** Rows split into `groups` columns of about the same height, in order. */
function split(rows: Row[], groups: number): Row[][] {
  if (groups <= 1) return [rows];
  const total = rows.reduce((t, r) => t + r.h + ROW_GAP, 0);
  const out: Row[][] = [];
  let cur: Row[] = [];
  let acc = 0;
  for (const r of rows) {
    if (
      cur.length &&
      out.length < groups - 1 &&
      acc + r.h / 2 > (total / groups) * (out.length + 1)
    ) {
      out.push(cur);
      cur = [];
    }
    cur.push(r);
    acc += r.h + ROW_GAP;
  }
  out.push(cur);
  return out;
}

const GROUP_W = CUE_W + GAP + NODE_W;

function familyPart(state: PmState, roles: Roles, groups: number, stage?: StageSize): Part {
  const f = state.family;
  const fam = FAMILIES[f]!;
  const rows = familyRows(f);
  const cols = split(rows, Math.min(groups, rows.length));
  const width = cols.length * GROUP_W + (cols.length - 1) * GROUP_GAP;
  const head: Shape[] = [];
  const top = header(head, `${f + 1}. ${fam.name}`, `${fam.about}.`, width, roles);
  const headBox: Bounds = { x: 0, y: 0, w: width, h: top - 8 };
  const body: Shape[] = [];
  let bottom = top;
  cols.forEach((col, g) => {
    const x0 = g * (GROUP_W + GROUP_GAP);
    let y = top;
    for (const r of col) {
      const stack = r.cues.reduce((t, b) => t + b.h, 0) + CUE_GAP * (r.cues.length - 1);
      const nx = x0 + CUE_W + GAP;
      const ny = y + (r.h - r.box.h) / 2;
      r.box.draw(body, nx, ny, roles);
      let cy = y + (r.h - stack) / 2;
      r.cues.forEach((b, i) => {
        b.draw(body, x0, cy, roles);
        const mid = cy + b.h / 2;
        const target = Math.min(
          ny + r.box.h - 8,
          Math.max(ny + 8, ny + r.box.h / 2 + (mid - (y + r.h / 2)) * 0.4),
        );
        arrow(
          body,
          arrowId(r.cueIds[i]!),
          { x: x0 + CUE_W + 2, y: mid },
          { x: nx - 4, y: target },
          roles,
        );
        cy += b.h + CUE_GAP;
      });
      y += r.h + ROW_GAP;
    }
    bottom = Math.max(bottom, y - ROW_GAP);
  });
  const bodyBox: Bounds = { x: 0, y: top, w: width, h: bottom - top };
  return assemble(head, headBox, body, bodyBox, stage);
}

// ----- A problem -----

function problemPart(
  state: PmState,
  settings: PmSettings,
  roles: Roles,
  wide: boolean,
  stage?: StageSize,
): Part {
  const p = PROBLEMS[state.problem]!;
  const finds = shownFinds(p, settings);
  const width = wide ? WORDS_W + GAP + GROUP_W : GROUP_W;
  const head: Shape[] = [];
  const title = `Problem ${state.problem + 1} of ${PROBLEMS.length}: ${p.title}`;
  shapesTitle(head, title, roles);
  const text = wrapText(p.text, width - 2 * PAD - 4, T);
  const probTop = TITLE + 14;
  const probH = linesH(text.length);
  head.push({
    kind: 'rect',
    id: PROB,
    x: 0,
    y: probTop,
    w: width,
    h: probH,
    r: 6,
    role: roles.get(PROB),
  });
  textLines(head, `${PROB}-t`, text, PAD + 4, probTop);
  const headBox: Bounds = { x: 0, y: 0, w: width, h: probTop + probH };
  const body: Shape[] = [];
  const top = probTop + probH + 18;
  let y = top;
  /** Where each pattern's box is, once drawn: later finds that point there reuse it. */
  const placed = new Map<string, { x: number; y: number; h: number }>();
  const nodeX = width - NODE_W;
  finds.forEach((f: Find, k) => {
    const q = cueOf(f.cue);
    const idx = p.finds.indexOf(f);
    const words = wrapText(`“${f.words}”`, (wide ? WORDS_W : CUE_W) - 4, T);
    const wordsH = words.length * LINE;
    const cb = cueBox(q.id);
    const fresh = !placed.has(q.node);
    const nb = nodeBox(q.node, f.trap ? 'ruled out' : undefined);
    const cueX = wide ? WORDS_W + GAP : 0;
    const cueY = wide ? y : y + wordsH + 4;
    const left = wide ? Math.max(wordsH, cb.h) : wordsH + 4 + cb.h;
    const h = Math.max(left, fresh ? nb.h : 0);
    const read = k < state.read;
    const hopped = k < state.hopped;
    const wy = wide ? y + (h - wordsH) / 2 : y;
    const cy = wide ? y + (h - cb.h) / 2 : cueY + (h - left) / 2;
    if (read) {
      const wid = wordsId(idx);
      textLines(body, wid, words, 0, wy - PAD + 1, {
        role: roles.get(wid) ?? (f.trap ? undefined : undefined),
      });
      cb.draw(body, cueX, cy, roles);
      if (wide)
        arrow(
          body,
          `wa-${idx}`,
          { x: Math.min(WORDS_W, maxWidth(words)) + 6, y: cy + cb.h / 2 },
          { x: cueX - 4, y: cy + cb.h / 2 },
          roles,
        );
    }
    let at = placed.get(q.node);
    if (!at) {
      at = { x: nodeX, y: y + (h - nb.h) / 2, h: nb.h };
      placed.set(q.node, at);
    }
    if (hopped) {
      if (fresh) nb.draw(body, at.x, at.y, roles);
      const mid = cy + cb.h / 2;
      const target = Math.min(at.y + at.h - 8, Math.max(at.y + 8, mid));
      arrow(
        body,
        arrowId(q.id),
        { x: cueX + CUE_W + 2, y: mid },
        { x: at.x - 4, y: target },
        roles,
      );
    }
    y += h + ROW_GAP;
  });
  const vy = y + 4;
  if (state.page && state.node) {
    const n = nodeOf(state.node);
    body.push({
      kind: 'text',
      id: VERDICT,
      x: 0,
      y: vy + T,
      text: `Answer: ${n.name}${live(n.id) ? `, /${n.page}/` : ''}`,
      size: T,
      weight: 'bold',
      role: roles.get(VERDICT),
    });
  }
  const bodyBox: Bounds = { x: 0, y: top, w: width, h: vy + LINE - top };
  return assemble(head, headBox, body, bodyBox, stage);
}

function shapesTitle(shapes: Shape[], title: string, roles: Roles) {
  shapes.push({
    kind: 'text',
    id: HEAD,
    x: 0,
    y: TITLE,
    text: title,
    size: TITLE,
    weight: 'bold',
    role: roles.get(HEAD),
  });
}

const maxWidth = (lines: string[]) => Math.max(...lines.map((l) => textWidth(l, T)));

// ----- The scene -----

export function view(step: Step<PmState, unknown>, settings: PmSettings, stage?: StageSize): Scene {
  const { state } = step;
  const roles: Roles = new Map(step.marks.map((m) => [m.id, m.role]));
  let parts: Part[];
  if (state.mode === 'family') parts = [1, 2].map((g) => familyPart(state, roles, g, stage));
  else if (state.mode === 'problem')
    parts = [true, false].map((wide) => problemPart(state, settings, roles, wide, stage));
  else parts = [4, 3, 2].map((cols) => overview(state, roles, cols, stage));
  const best = pickBest(parts, stage);
  return {
    shapes: best.shapes,
    bounds: padBounds(best.bounds, 14),
    label: describe(state, settings),
  };
}
