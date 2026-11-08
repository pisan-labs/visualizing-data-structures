/**
 * Suffix array: the text along the top, and under it one row per suffix, in the current order
 * (text order before a build, sorted after): its row number i, SA[i] (where it starts),
 * LCP[i], and the suffix itself, one character per column. During prefix doubling each row
 * also shows the pair it sorts by and its rank, and the characters already sorted are shaded.
 * Rows belong to their suffixes, so they slide when the order changes; the row numbers and the
 * LCP column stay put. A binary search shows lo, mid and hi beside the rows and P under them.
 */
import type { MarkRole, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  describe,
  lcpId,
  rowId,
  textId,
  type SuffixExtra,
  type SuffixSettings,
  type SuffixState,
} from './model';

const PITCH = 24;
const ROW_H = 30;
const TEXT_TOP = 52;
const HEAD_Y = TEXT_TOP + 30 + 30;
const ROW0 = HEAD_Y + 10;
const X_LO = 2;
const X_MID = 24;
const X_HI = 56;
const X_I = 88;
const X_SA = 120;
const X_LCP = 156;
const X_SUF = 186;

export function view(step: Step<SuffixState, SuffixExtra>, settings?: SuffixSettings): Scene {
  const s = step.state;
  const t = s.text;
  const n = t.length;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const order = extra.order ?? s.sa ?? Array.from({ length: n }, (_, i) => i);
  const lcp = extra.lcp ?? s.lcp ?? null;
  const shapes: Shape[] = [];
  const cols = Math.max(n, extra.search?.pattern.length ?? 0, 6);
  const xKey = X_SUF + cols * PITCH + 44;
  const xRank = xKey + 70;
  // The pair and rank columns only take room when the build is by doubling.
  const width = settings?.method === 'naive' ? xKey - 20 : xRank + 30;
  const rowY = (i: number) => ROW0 + i * ROW_H;
  const charX = (j: number) => X_SUF + j * PITCH + PITCH / 2;
  const text = (
    id: string,
    x: number,
    y: number,
    value: string,
    o: Partial<Extract<Shape, { kind: 'text' }>> = {},
  ) => shapes.push({ kind: 'text', id, x, y, text: value, size: 16, mono: true, ...o });

  // The text, with its indices, over the suffix column.
  text('t-name', X_SUF - 12, TEXT_TOP + 21, 'T', { anchor: 'end', cls: 'label', weight: 'bold' });
  const spot = new Map<number, MarkRole>();
  for (const sp of extra.spots ?? [])
    for (let j = sp.from; j < sp.from + sp.len; j++) spot.set(j, sp.role);
  for (let j = 0; j < n; j++) {
    const role = roles.get(textId(j)) ?? spot.get(j);
    shapes.push({
      kind: 'rect',
      id: textId(j),
      x: X_SUF + j * PITCH,
      y: TEXT_TOP,
      w: PITCH,
      h: 30,
      r: 0,
      cls: 'live',
      role,
    });
    text(`${textId(j)}-c`, charX(j), TEXT_TOP + 21, t[j]!, {
      anchor: 'middle',
      weight: 'bold',
      size: 18,
      role: role === 'found' ? 'found' : undefined,
    });
    text(`ti-${j}`, charX(j), TEXT_TOP - 7, String(j), {
      anchor: 'middle',
      size: 16,
      cls: 'index',
    });
  }

  // Column heads.
  const doubling = extra.rank !== undefined;
  const head = (id: string, x: number, value: string, anchor: 'middle' | 'start' = 'middle') =>
    text(id, x, HEAD_Y, value, { anchor, size: 16, cls: 'label' });
  head('hd-i', X_I, 'i');
  head('hd-sa', X_SA, 'SA');
  head('hd-lcp', X_LCP, 'LCP');
  head('hd-suf', X_SUF + 2, s.sa || extra.order ? 'suffix' : 'suffix (by start)', 'start');
  if (doubling) {
    if (extra.keys) head('hd-key', xKey, 'pair');
    head('hd-rank', xRank, 'rank');
  }

  const hl = new Map((extra.hl ?? []).map((h) => [h.p, h]));
  order.forEach((p, i) => {
    const y = rowY(i);
    const len = n - p;
    const id = rowId(p);
    const role = roles.get(id);
    text(`ri-${i}`, X_I, y + 20, String(i), { anchor: 'middle', size: 16, cls: 'index' });
    shapes.push({
      kind: 'rect',
      id,
      x: X_SUF - 2,
      y: y + 2,
      w: len * PITCH + 4,
      h: ROW_H - 4,
      r: 3,
      cls: 'live',
      role,
    });
    const h = hl.get(p);
    if (h && h.len > 0) {
      shapes.push({
        kind: 'rect',
        id: `${id}-hl`,
        x: X_SUF,
        y: y + 4,
        w: h.len * PITCH,
        h: ROW_H - 8,
        r: 2,
        role: h.role,
        z: 1.5,
      });
    }
    text(`${id}-sa`, X_SA, y + 21, String(p), {
      anchor: 'middle',
      weight: 'bold',
      role: role === 'found' || role === 'active' ? role : undefined,
    });
    for (let j = 0; j < len; j++) {
      text(`${id}-c${j}`, charX(j), y + 21, t[p + j]!, {
        anchor: 'middle',
        size: 18,
        role: h && j < h.len && (h.role === 'found' || h.role === 'error') ? h.role : undefined,
      });
    }
    if (doubling) {
      const key = extra.keys?.[p];
      if (key)
        text(`${id}-key`, xKey, y + 21, `(${key[0]}, ${key[1]})`, { anchor: 'middle', size: 16 });
      text(`${id}-rk`, xRank, y + 21, String(extra.rank![p]), { anchor: 'middle', weight: 'bold' });
    }
  });

  // LCP column: one cell per row position.
  for (let i = 0; i < n; i++) {
    const y = rowY(i);
    const id = lcpId(i);
    const v = lcp?.[i];
    shapes.push({
      kind: 'rect',
      id,
      x: X_LCP - 15,
      y: y + 2,
      w: 30,
      h: ROW_H - 4,
      r: 3,
      cls: v === null || v === undefined ? undefined : 'live',
      role: roles.get(id),
    });
    if (v !== null && v !== undefined)
      text(`${id}-t`, X_LCP, y + 21, String(v), {
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(id) === 'found' ? 'found' : undefined,
      });
  }

  // Binary search: the pointers, and P under the rows.
  const bottom = rowY(n) + 10;
  const sr = extra.search;
  if (sr) {
    const ptr = (name: string, x: number, row: number | undefined, role?: MarkRole) => {
      if (row === undefined) return;
      text(`ptr-${name}`, x, rowY(row) + 20, name, { size: 16, role, weight: 'bold' });
    };
    ptr('lo', X_LO, sr.found ? undefined : sr.lo);
    ptr('mid', X_MID, sr.mid, 'active');
    ptr('hi', X_HI, sr.found ? undefined : sr.hi);
    text('p-name', X_SUF - 12, bottom + 21, 'P', { anchor: 'end', cls: 'label', weight: 'bold' });
    [...sr.pattern].forEach((ch, j) => {
      shapes.push({
        kind: 'rect',
        id: `p-${j}`,
        x: X_SUF + j * PITCH,
        y: bottom,
        w: PITCH,
        h: 30,
        r: 0,
        cls: 'live',
        role: sr.found && sr.found[1] > sr.found[0] ? 'found' : undefined,
      });
      text(`p-${j}-c`, charX(j), bottom + 21, ch, { anchor: 'middle', weight: 'bold', size: 18 });
    });
  }

  const height = bottom + 30 + 12;
  return { shapes, bounds: { x: 0, y: 0, w: width, h: height }, label: label(step) };
}

function label(step: Step<SuffixState, SuffixExtra>): string {
  const e = step.extra;
  const base = describe(step.state);
  if (e?.search) {
    const s = e.search;
    return `${base} Searching for ${s.pattern}: lo ${s.lo}, hi ${s.hi}${s.mid !== undefined ? `, mid ${s.mid}` : ''}.`;
  }
  if (e?.order && !step.state.sa) return `${base} Rows so far: ${e.order.join(' ')}.`;
  return base;
}
