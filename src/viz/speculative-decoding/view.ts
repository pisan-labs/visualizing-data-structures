/**
 * Speculative decoding, in three panels.
 *
 * The text: the prompt and the words generated, with a line under the words of each large pass
 * (so "pass 2" over three words is three words for one pass).
 *
 * The round: one column per draft, then one for the word the large model adds. Rows: the draft,
 * q(x) from the small model, p(x) from the large one, p/q (or the large model's top word, with
 * greedy acceptance), the u of the test, and the verdict.
 *
 * The distributions at the position in focus: q, p and the leftover norm(max(0, p − q)) as
 * bars, the words down the left; the one being drawn from slides end to end to tile 0 to 1,
 * with the line of u (src/viz/_decode/bars.ts).
 *
 * Shape ids, for marks: tok-<i> a word of the text, col-<i> the draft (or added word) in
 * column i, q-<word>, p-<word>, r-<word> the bars (</s> is "eos").
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { round3, short } from '../_lm/numbers';
import { drawTable, type Column, type Row } from '../_decode/bars';
import { chip, chipW, CHIP_H, label, textW, title, TITLE_H, type Panel } from '../_tokenize/draw';
import {
  colId,
  describe,
  EXTRA,
  keyOf,
  tokId,
  words,
  type SpecExtra,
  type SpecSettings,
  type SpecState,
  type SpecWork,
} from './model';
import { chance, draftDist, stretches, targetDist, type Dist } from './spec';

const WRAP = 420;
/** The most words that can follow a context in the toy corpus (after "the"). */
const MAX_ROWS = 9;
const GAP = 24;
const TRACK = 90;
const ROOM = 44;
/** Room above the drawing for the zoom buttons, when they cover its corner. */
const DROP = 52;

type Roles = ReadonlyMap<string, MarkRole>;

// ---------------------------------------------------------------------------------------------
// The text

function textPanel(s: SpecState, roles: Roles): Panel {
  const out: Shape[] = [];
  title(out, 'text', 'text');
  const all = words(s);
  // The pass each generated word came from.
  const pass: number[] = [];
  let r = 0;
  let left = 0;
  const sizes = s.rounds;
  for (let i = 0; i < s.out.length; i++) {
    while (left === 0 && r < sizes.length) left = sizes[r++]!;
    pass.push(r);
    left--;
  }
  const LINE = CHIP_H + 26;
  let x = 0;
  let y = TITLE_H;
  const spans = new Map<number, { x1: number; x2: number; y: number }[]>();
  all.forEach((t, i) => {
    const w = chipW(t);
    if (x > 0 && x + w > WRAP) {
      x = 0;
      y += LINE;
    }
    const id = tokId(i);
    chip(out, id, x, y, t, roles.get(id), i < s.prompt.length ? 'ghost' : 'live');
    if (i >= s.prompt.length) {
      const p = pass[i - s.prompt.length]!;
      const list = spans.get(p) ?? [];
      const last = list.at(-1);
      if (last && last.y === y) last.x2 = x + w;
      else list.push({ x1: x, x2: x + w, y });
      spans.set(p, list);
    }
    x += w + 6;
  });
  for (const [p, list] of spans)
    list.forEach((sp, j) => {
      const id = `pl-${p}${j ? `-${j}` : ''}`;
      const ly = sp.y + CHIP_H + 5;
      out.push({ kind: 'arrow', id, x1: sp.x1, y1: ly, x2: sp.x2, y2: ly, head: 'none' });
      if (j === 0)
        label(out, `${id}-t`, (sp.x1 + sp.x2) / 2, ly + 17, String(p), {
          anchor: 'middle',
          dim: true,
        });
    });
  // Room for two lines, so the panel keeps its size as the text grows.
  const lines = Math.max(2, (y - TITLE_H) / LINE + 1);
  return { shapes: out, w: WRAP, h: TITLE_H + lines * LINE - 6 };
}

// ---------------------------------------------------------------------------------------------
// The round

interface RoundView {
  drafts: string[];
  qs: Dist[];
  ps: Dist[];
  au: (number | null)[];
  accepted: number | null;
  tested: number;
  extra: string | null;
  extraDist: Dist | null;
  kind: 'resample' | 'bonus' | 'none' | null;
  greedy: boolean;
}

function roundOf(s: SpecState, w: SpecWork | undefined, greedy: boolean): RoundView | null {
  if (w) {
    const r = w.round;
    const done = w.stage === 'extra' || w.stage === 'done';
    return {
      drafts: r.drafts,
      qs: r.qs,
      ps: w.stage === 'draft' ? [] : (r.ps ?? []),
      au: (r.au ?? []).slice(0, w.tested),
      accepted: w.stage === 'draft' ? null : Math.min(r.accepted ?? 0, w.tested),
      tested: w.tested,
      extra: done ? (r.extra ?? null) : null,
      extraDist: done || w.stage === 'leftover' ? (r.extraDist ?? null) : null,
      kind: w.stage === 'draft' ? null : (r.kind ?? null),
      greedy: r.greedy ?? greedy,
    };
  }
  if (s.pending)
    return {
      drafts: s.pending.drafts,
      qs: s.pending.qs,
      ps: [],
      au: [],
      accepted: null,
      tested: 0,
      extra: null,
      extraDist: null,
      kind: null,
      greedy,
    };
  const r = s.last;
  if (!r) return null;
  return {
    drafts: r.drafts,
    qs: r.qs,
    ps: r.ps,
    au: r.au,
    accepted: r.accepted,
    tested: Math.min(r.drafts.length, r.accepted + 1),
    extra: r.extra,
    extraDist: r.extraDist,
    kind: r.kind,
    greedy: r.greedy,
  };
}

const ROWS_SAMPLE = ['draft', 'q', 'p', 'p/q', 'u', ''];
const ROWS_GREEDY = ['draft', 'q', 'p', 'top p', ''];

function roundPanel(v: RoundView | null, k: number, greedy: boolean, roles: Roles): Panel {
  const out: Shape[] = [];
  const g = v?.greedy ?? greedy;
  title(out, 'round', 'this round');
  const heads = g ? ROWS_GREEDY : ROWS_SAMPLE;
  const n = v?.drafts.length ?? 0;
  const cols = Math.max(k, n) + 1;
  const extraAt = cols - 1;
  const LW = 52;
  const CW = 78;
  const RH = 28;
  const top = TITLE_H + 20;
  heads.forEach((h, r) =>
    label(out, `rh-${r}`, LW - 8, top + r * RH + CHIP_H / 2 + 5, h, { anchor: 'end', dim: true }),
  );
  for (let c = 0; c < cols; c++) {
    const cx = LW + c * CW;
    const isExtra = c === extraAt;
    label(out, `ch-${c}`, cx + CW / 2 - 4, TITLE_H + 12, isExtra ? '+1' : String(c + 1), {
      anchor: 'middle',
      dim: true,
    });
    const id = isExtra ? EXTRA : colId(c);
    const cell = (r: number, text: string, role?: MarkRole) =>
      label(out, `${id}-${r}`, cx + CW / 2 - 4, top + r * RH + CHIP_H / 2 + 5, text, {
        anchor: 'middle',
        role,
      });
    if (v && c < n) {
      const x = v.drafts[c]!;
      const tested = c < v.tested;
      const ok = v.accepted !== null && tested && c < v.accepted;
      const bad = v.accepted !== null && tested && !ok;
      const dead = v.accepted !== null && c > v.accepted && v.tested > v.accepted;
      const w = chipW(x);
      chip(
        out,
        id,
        cx + (CW - 8 - w) / 2,
        top,
        x,
        roles.get(id) ?? (ok ? 'found' : bad ? 'error' : undefined),
        dead || bad ? 'ghost' : 'live',
      );
      const q = chance(v.qs[c]!, x);
      cell(1, short(q));
      const p = v.ps[c];
      if (p) cell(2, short(chance(p, x)));
      if (p && g) cell(3, p.words[0]!);
      if (p && !g) cell(3, chance(p, x) >= q ? '≥ 1' : short(chance(p, x) / q));
      const u = v.au[c];
      if (!g && u !== undefined && u !== null) cell(4, round3(u).replace(/^0/, ''));
      if (tested && v.accepted !== null)
        cell(heads.length - 1, ok ? '✓' : '✗', ok ? 'found' : 'error');
    } else if (isExtra && v && v.extra !== null) {
      const w = chipW(v.extra);
      chip(out, id, cx + (CW - 8 - w) / 2, top, v.extra, roles.get(id) ?? 'new');
      if (v.extraDist) cell(2, short(chance(v.extraDist, v.extra)));
      cell(heads.length - 1, v.kind === 'bonus' ? 'bonus' : v.greedy ? 'top p' : 'resample');
    } else {
      out.push({
        kind: 'rect',
        id,
        x: cx + (CW - 8 - 40) / 2,
        y: top,
        w: 40,
        h: CHIP_H,
        r: 4,
        cls: 'ghost',
        role: roles.get(id),
      });
    }
  }
  return { shapes: out, w: LW + cols * CW, h: top + heads.length * RH };
}

// ---------------------------------------------------------------------------------------------
// The distributions at the position in focus

interface Focus {
  q: Dist | null;
  p: Dist | null;
  r: Dist | null;
  /** The distribution drawn from now, and u. */
  draw: { col: 'q' | 'p' | 'r'; u: number } | null;
  context: string[];
}

function focusOf(s: SpecState, w: SpecWork | undefined): Focus {
  const prefix = words(s);
  if (w) {
    const r = w.round;
    const i = w.focus;
    const ctx = [...r.prefix, ...r.drafts.slice(0, i)];
    const q = r.qs[i] ?? null;
    if (w.stage === 'draft') {
      const u = r.qu[i];
      return {
        q,
        p: null,
        r: null,
        draw: u === null || u === undefined ? null : { col: 'q', u },
        context: ctx,
      };
    }
    const p = r.ps?.[i] ?? null;
    const resample = r.kind === 'resample' && !r.greedy && i === r.accepted;
    const left = resample && (w.stage === 'leftover' || w.stage === 'extra') ? r.extraDist! : null;
    let draw: Focus['draw'] = null;
    if (w.stage === 'extra' && r.eu !== null && r.eu !== undefined)
      draw = { col: r.kind === 'bonus' ? 'p' : 'r', u: r.eu };
    return { q, p, r: left, draw, context: ctx };
  }
  if (s.pending) {
    const i = s.pending.drafts.length - 1;
    if (i >= 0)
      return {
        q: s.pending.qs[i]!,
        p: null,
        r: null,
        draw: null,
        context: [...prefix, ...s.pending.drafts.slice(0, i)],
      };
  }
  const last = s.last;
  if (last && last.extra !== null) {
    const i = last.kind === 'bonus' ? last.drafts.length : last.accepted;
    return {
      q: last.qs[i] ?? null,
      p: last.ps[i] ?? null,
      r: last.kind === 'resample' && !last.greedy ? last.extraDist : null,
      draw: null,
      context: [...last.prefix, ...last.drafts.slice(0, i)],
    };
  }
  if (prefix.at(-1) === '</s>' || !prefix.length)
    return { q: null, p: null, r: null, draw: null, context: prefix };
  return { q: draftDist(prefix), p: targetDist(prefix), r: null, draw: null, context: prefix };
}

function barsPanel(f: Focus, roles: Roles): { shapes: Shape[]; bounds: Bounds } {
  const order = (f.draw ? f[f.draw.col] : (f.p ?? f.q))?.words ?? [];
  const seen = new Set(order);
  const rest = [...(f.p?.words ?? []), ...(f.q?.words ?? [])].filter(
    (w) => !seen.has(w) && (seen.add(w), true),
  );
  const ws = [...order, ...rest];
  const rows: Row[] = ws.map((w) => ({ key: keyOf(w), label: w }));
  const column = (id: 'q' | 'p' | 'r', heading: string, d: Dist | null): Column => {
    const drawn = f.draw?.col === id ? f.draw : null;
    const st = drawn && d ? stretches(d) : null;
    return {
      kind: 'bars',
      id,
      title: heading,
      track: TRACK,
      room: ROOM,
      draws: true,
      bar: (r) => {
        if (!d) return null;
        const w = ws[r]!;
        const v = chance(d, w);
        const at = d.words.indexOf(w);
        return {
          value: v,
          text: short(v),
          offset: st && at >= 0 ? st.from[at]! : 0,
          dim: v === 0,
        };
      },
      u:
        drawn && d
          ? { value: drawn.u, label: `u = ${round3(drawn.u)}`, rows: [0, d.words.length - 1] }
          : undefined,
    };
  };
  const t = drawTable(
    [[column('q', 'q small', f.q), column('p', 'p large', f.p), column('r', 'leftover', f.r)]],
    rows,
    roles,
    { top: TITLE_H, labelW: 62, stage: { w: 1, h: 1, strip: true } },
  );
  const ctx = f.context.slice(-2).join(' ');
  const heading = f.q || f.p ? `next word after "${ctx}"` : 'the text has ended';
  t.shapes.push({
    kind: 'text',
    id: 'dist-title',
    x: 0,
    y: 17,
    text: heading,
    size: 15,
    weight: 'bold',
    mono: true,
  });
  const b = t.bounds;
  const reserved = TITLE_H + 28 + MAX_ROWS * 30 + 24 + 12;
  const x1 = Math.min(b.x, -12);
  const x2 = Math.max(b.x + b.w, textW(heading) + 12);
  const y2 = Math.max(b.y + b.h, reserved);
  return { shapes: t.shapes, bounds: { x: x1, y: -12, w: x2 - x1, h: y2 + 12 } };
}

// ---------------------------------------------------------------------------------------------

function shift(shapes: Shape[], dx: number, dy: number): Shape[] {
  return shapes.map((s) => {
    if (s.kind === 'arrow')
      return {
        ...s,
        x1: s.x1 + dx,
        y1: s.y1 + dy,
        x2: s.x2 + dx,
        y2: s.y2 + dy,
        via: s.via && { x: s.via.x + dx, y: s.via.y + dy },
      };
    if (s.kind === 'polygon')
      return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    return { ...s, x: s.x + dx, y: s.y + dy };
  });
}

interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

const asBlock = (p: Panel): Block => ({ shapes: p.shapes, w: p.w, h: p.h });
const fromBounds = (t: { shapes: Shape[]; bounds: Bounds }): Block => ({
  shapes: shift(t.shapes, -t.bounds.x - 12, -t.bounds.y - 12),
  w: t.bounds.w - 24,
  h: t.bounds.h - 24,
});

function arrange(parts: { b: Block; x: number; y: number }[]): { shapes: Shape[]; bounds: Bounds } {
  const shapes = parts.flatMap(({ b, x, y }) => shift(b.shapes, x, y));
  const x2 = Math.max(...parts.map(({ b, x }) => x + b.w));
  const y2 = Math.max(...parts.map(({ b, y }) => y + b.h));
  return { shapes, bounds: { x: -12, y: -12, w: x2 + 24, h: y2 + 24 } };
}

export function view(
  step: Step<SpecState, SpecExtra>,
  settings: SpecSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const w = step.extra?.work;
  const greedy = settings.accept === 'greedy';
  const text = asBlock(textPanel(s, roles));
  const round = asBlock(roundPanel(roundOf(s, w, greedy), Math.round(settings.k), greedy, roles));
  const bars = fromBounds(barsPanel(focusOf(s, w), roles));
  const drop = stage?.strip ? 0 : DROP;
  const left = Math.max(text.w, round.w);
  const options = [
    // Laptop: the text over the round, the bars beside them.
    arrange([
      { b: text, x: 0, y: drop },
      { b: round, x: 0, y: drop + text.h + GAP },
      { b: bars, x: left + GAP, y: drop },
    ]),
    // Phone: all three one under another.
    arrange([
      { b: text, x: 0, y: drop },
      { b: round, x: 0, y: drop + text.h + GAP },
      { b: bars, x: 0, y: drop + text.h + GAP + round.h + GAP },
    ]),
  ];
  const best = pickLayout(stage, options);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
