/**
 * The text on top (the input while encoding, the output while decoding) with the position
 * pointer; for LZ77 the window and the lookahead as tinted spans, and the match found drawn as
 * a row: the source characters under the place they are copied to, labeled with the offset. For LZW the row is the phrase w being read. Under or beside it: the triples or codes
 * written so far, and for LZW the dictionary entries made from 256 up. The panels are sized for
 * every token the text will need, so the camera holds still while they fill.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { alignScene, fitOn, type AlignFrame, type AlignRow } from '../../layouts/align';
import { pickBest, translate } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { pointerShapes, spanShapes } from '../_strings/overlay';
import {
  describe,
  dictId,
  lz77,
  lzw,
  tokId,
  tripleText,
  type LzExtra,
  type LzSettings,
  type LzState,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Chip {
  id: string;
  text: string;
  sub?: string;
}

const CHIP_H = 30;
const SUB_H = 46;
const GAP = 8;
const SIZE = 16;

const chipW = (c: Chip) =>
  Math.max(c.text.length * SIZE * 0.6, (c.sub?.length ?? 0) * 13 * 0.6) + 16;

/** Chips in rows no wider than `width`, under a title. Every chip of `plan` gets a place. */
function chipPanel(
  title: string,
  titleId: string,
  plan: Chip[],
  shown: number,
  width: number,
  roles: Roles,
  fresh?: number,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [
    { kind: 'text', id: titleId, x: 0, y: 16, text: title, size: 16, mono: true, cls: 'label' },
  ];
  const h = plan.some((c) => c.sub) ? SUB_H : CHIP_H;
  let x = 0;
  let y = 26;
  let right = 160;
  plan.forEach((c, k) => {
    const w = chipW(c);
    if (x > 0 && x + w > width) {
      x = 0;
      y += h + GAP;
    }
    if (k < shown) {
      const role = roles.get(c.id) ?? (k === fresh ? 'new' : undefined);
      shapes.push({ kind: 'rect', id: c.id, x, y, w, h, r: 6, cls: 'cell live', role });
      shapes.push({
        kind: 'text',
        id: `${c.id}-t`,
        x: x + w / 2,
        y: y + 21,
        text: c.text,
        size: SIZE,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role,
      });
      if (c.sub)
        shapes.push({
          kind: 'text',
          id: `${c.id}-s`,
          x: x + w / 2,
          y: y + 39,
          text: c.sub,
          size: 13,
          anchor: 'middle',
          mono: true,
          cls: 'label',
        });
    }
    right = Math.max(right, x + w);
    x += w + GAP;
  });
  return { shapes, bounds: { x: 0, y: 0, w: right, h: y + h } };
}

export function view(step: Step<LzState, LzExtra>, settings: LzSettings, stage?: StageSize): Scene {
  const st = step.state;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = st.text.length;
  const decoding = st.phase === 'decode';
  const lz = settings.method === 'lz77';
  const top = decoding ? st.out : st.text;

  const frameOf = (pitch: number): AlignFrame => ({
    cols: Math.max(n, 1),
    rows: 1,
    pointer: true,
    foundLanes: 1,
    pitch,
  });
  const fit = fitOn(stage, frameOf);
  const frame = { ...frameOf(fit.pitch), ...fit };
  const rows: AlignRow[] = [];
  const r = extra.row;
  if (r && r.cells.length) {
    const cells = Array.from({ length: top.length }, (_, j) =>
      j >= r.src && j < r.src + r.cells.length ? r.cells[j - r.src] : null,
    );
    const len = Math.min(r.cells.length, top.length - r.src);
    if (len > 0)
      rows.push({
        id: 'm',
        shift: r.dst - r.src,
        from: r.src,
        to: r.src + len - 1,
        cells,
        label: r.label,
      });
  }
  const align = alignScene(frame, {
    text: top,
    textName: decoding ? 'out' : 'T',
    pattern: top,
    rows,
    roles,
  });
  const g = align.geometry;
  const main: Shape[] = [...align.shapes];
  if (st.phase === 'encode' && lz && st.pos < n) {
    main.push(
      ...spanShapes(g, 'window', Math.max(0, st.pos - settings.window), st.pos - 1, 'visit'),
    );
    main.push(
      ...spanShapes(
        g,
        'ahead',
        st.pos,
        Math.min(n - 1, st.pos + settings.lookahead - 1),
        'active',
        {
          top: g.textTop + 5,
          bottom: g.textBottom - 5,
          outline: false,
        },
      ),
    );
  }
  if (st.phase !== 'none') {
    const at = decoding ? st.out.length : st.pos;
    if (at < n) main.push(...pointerShapes(g, [{ name: decoding ? 'next' : 'pos', at }], roles));
  }

  // The tokens the whole text needs, so the panels hold still.
  const triples = lz ? lz77(st.text, settings) : [];
  const plan = lz ? null : lzw(st.text);
  const tokens: Chip[] = lz
    ? triples.map((t, k) => ({ id: tokId(k), text: tripleText(t) }))
    : plan!.codes.map((c, k) => ({ id: tokId(k), text: String(c.code), sub: c.str }));
  const shownTokens = lz ? st.triples.length : st.codes.length;
  const decoded = decoding ? st.dk : -1;
  const tokRoles = new Map(roles);
  if (decoding)
    for (let k = 0; k < shownTokens; k++)
      if (!tokRoles.has(tokId(k)) && k < decoded) tokRoles.set(tokId(k), 'done');

  const layout = (width: number) => {
    const out = chipPanel(
      lz ? 'triples (offset, length, next)' : 'codes',
      'tok-title',
      tokens,
      shownTokens,
      width,
      tokRoles,
    );
    if (lz) return out;
    const dict = chipPanel(
      'dictionary',
      'dict-title',
      plan!.dict.map((d) => ({ id: dictId(d.code), text: `${d.code}=${d.str}` })),
      st.dict.length,
      width,
      roles,
    );
    const dy = out.bounds.h + 14;
    return {
      shapes: [...out.shapes, ...translate(dict.shapes, 0, dy)],
      bounds: { x: 0, y: 0, w: Math.max(out.bounds.w, dict.bounds.w), h: dy + dict.bounds.h },
    };
  };
  const aw = align.bounds.w;
  const left = g.left(0);
  const under = layout(aw - left - 12);
  const side = layout(330);
  const candidates = [
    {
      panel: under,
      dx: left,
      dy: align.bounds.h - 4,
      bounds: { x: 0, y: 0, w: aw, h: align.bounds.h - 4 + under.bounds.h + 12 },
    },
    {
      panel: side,
      dx: aw + 4,
      dy: g.textTop - 26,
      bounds: {
        x: 0,
        y: 0,
        w: aw + 4 + side.bounds.w + 12,
        h: Math.max(align.bounds.h, g.textTop - 26 + side.bounds.h + 12),
      },
    },
  ];
  const pick = pickBest(candidates, stage);
  const shapes = [...main, ...translate(pick.panel.shapes, pick.dx, pick.dy)];
  return {
    shapes,
    bounds: pick.bounds,
    label:
      describe(st, settings) +
      (extra.copy ? ` Copying from position ${extra.copy.from} to ${extra.copy.to}.` : ''),
  };
}
