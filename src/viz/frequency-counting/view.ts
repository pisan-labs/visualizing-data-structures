/**
 * Two pictures.
 *
 * Grouping (and the plain picture of the word list):
 * - the words, as chips; a word moves into its group when it is placed, leaving a dashed slot;
 * - the current word's key ("key: g1h1i1n1t1", or its sorted letters);
 * - the pattern: the 26 letter counts, a to m over n to z;
 * - the map: one row per key, the key's chip and then its words.
 * On a wide stage the map sits right of the rest; otherwise it comes under the words, with the
 * key and the counts under it. Every word's key is known when the operation starts, so the
 * map's rows have fixed places and the camera holds still.
 *
 * The first unique letter:
 * - the word, one letter per cell, with indices;
 * - count: each position's count once known (by rescanning, or read in pass 2);
 * - the pattern: the 26 letter counts.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { cellRow, chip, chipSize, columns, FONT, monoWidth, pitchFor } from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { ALPHABET } from '../_arr1/kit';
import { approachOf } from '../_patterns/kit';
import { describe, type FSettings, type FStep, type GroupExtra, type UniqueExtra } from './model';

const PAD = 10;
const CHIP = FONT.chip;
const LINE = 38;
const TITLE = 22;
/** The 26 counts: 13 cells a row. */
const STRIP = { pitch: 34, h: 32, label: 18, value: 20 };
const STRIP_W = 13 * STRIP.pitch;
const STRIP_ROW = STRIP.label + 4 + STRIP.h + 8;

type Roles = ReadonlyMap<string, MarkRole>;

export function view(step: FStep, settings: FSettings, stage?: StageSize): Scene {
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const e = step.extra;
  if (e?.kind === 'unique') return uniqueView(step, e, roles, settings, stage);
  // A laptop's stage is more than twice as wide as tall; a phone's, a thumbnail's and one side
  // of compare mode are not.
  const wide = stage !== undefined && stage.w > 1.8 * stage.h;
  return groupView(step, e, roles, settings, wide);
}

interface Placed {
  x: number;
  line: number;
  w: number;
}

/** Chips placed left to right from `left`, wrapping before `right`. */
function flow(texts: string[], left: number, right: number): Placed[] {
  const out: Placed[] = [];
  let x = left;
  let line = 0;
  for (const t of texts) {
    const w = chipSize(t, CHIP).w;
    if (x > left && x + w > right) {
      x = left;
      line++;
    }
    out.push({ x, line, w });
    x += w + 10;
  }
  return out;
}

/** The 26 counts at (x, top), two rows of 13. Returns the bottom. */
function strip(
  shapes: Shape[],
  counts: readonly number[],
  roles: Roles,
  x: number,
  top: number,
): number {
  for (let i = 0; i < 26; i++) {
    const ch = ALPHABET[i]!;
    const row = Math.floor(i / 13);
    const cx = x + (i % 13) * STRIP.pitch;
    const y = top + row * STRIP_ROW;
    const id = `c-${ch}`;
    const role = roles.get(id);
    const n = counts[i] ?? 0;
    shapes.push({
      kind: 'text',
      id: `${id}-l`,
      x: cx + STRIP.pitch / 2,
      y: y + STRIP.label,
      text: ch,
      size: STRIP.label,
      anchor: 'middle',
      cls: 'label',
      mono: true,
    });
    shapes.push({
      kind: 'rect',
      id,
      x: cx,
      y: y + STRIP.label + 4,
      w: STRIP.pitch,
      h: STRIP.h,
      r: 0,
      cls: n ? 'live' : 'cell',
      role,
    });
    shapes.push({
      kind: 'text',
      id: `${id}-v`,
      x: cx + STRIP.pitch / 2,
      y: y + STRIP.label + 4 + STRIP.h / 2 + STRIP.value * 0.36,
      text: String(n),
      size: STRIP.value,
      anchor: 'middle',
      weight: n ? 'bold' : 'normal',
      mono: true,
      cls: n ? undefined : 'label',
      role,
    });
  }
  return top + 2 * STRIP_ROW;
}

function groupView(
  step: FStep,
  e: GroupExtra | undefined,
  roles: Roles,
  settings: FSettings,
  wide: boolean,
): Scene {
  const words = step.state.words;
  const naive = approachOf(settings) === 'naive';
  const shapes: Shape[] = [];
  const leftW = STRIP_W;
  let y = 12;
  if (e) {
    shapes.push({
      kind: 'text',
      id: 'heading',
      x: PAD,
      y: 26,
      text: naive ? 'group anagrams: key = sorted letters' : 'group anagrams: key = 26 counts',
      size: FONT.label,
      weight: 'bold',
      mono: true,
    });
    y = 40;
  }

  // The words, in their slots; placed ones are drawn in the map instead.
  const slots = flow(words, PAD, PAD + leftW);
  const placed = new Set(e ? e.group.flatMap((g, t) => (g === null ? [] : [t])) : []);
  const chipAt = new Map<number, { x: number; y: number }>();
  slots.forEach((p, t) => {
    const cy = y + p.line * LINE + 14;
    if (placed.has(t)) {
      const { w, h } = chipSize(words[t]!, CHIP);
      shapes.push({
        kind: 'rect',
        id: `ws-${t}`,
        x: p.x,
        y: cy - h / 2,
        w,
        h,
        r: 7,
        cls: 'ghost',
      });
    } else chipAt.set(t, { x: p.x + p.w / 2, y: cy });
  });
  y += (Math.max(0, ...slots.map((p) => p.line)) + 1) * LINE;

  // The map: rows in the order the keys first appear (fixed for the operation). Returns its
  // bottom, and widens `right` to its right edge.
  let right = PAD + leftW;
  const drawMap = (x: GroupExtra, mapX: number, top: number): number => {
    const order: string[] = [];
    for (const k of x.allKeys) if (!order.includes(k)) order.push(k);
    const keyW = Math.max(...order.map((k) => chipSize(k, CHIP).w));
    shapes.push({
      kind: 'text',
      id: 'map-title',
      x: mapX,
      y: top + 20,
      text: 'map: key → words',
      size: TITLE,
      cls: 'label',
      mono: true,
    });
    const my = top + 32;
    order.forEach((k, g) => {
      const cy = my + g * LINE + 14;
      if (g < x.map.length) {
        shapes.push(
          ...chip({
            id: `k-${g}`,
            x: mapX + keyW / 2,
            y: cy,
            text: k,
            size: CHIP,
            role: roles.get(`k-${g}`),
          }),
        );
      } else {
        shapes.push({
          kind: 'rect',
          id: `k-${g}`,
          x: mapX,
          y: cy - 13,
          w: keyW,
          h: 26,
          r: 7,
          cls: 'ghost',
        });
      }
      // Its words, left to right, in the room the whole group will need.
      let wx = mapX + keyW + 14;
      x.allKeys.forEach((kk, t) => {
        if (kk !== k) return;
        const w = chipSize(words[t]!, CHIP).w;
        if (placed.has(t)) chipAt.set(t, { x: wx + w / 2, y: cy });
        wx += w + 10;
      });
      right = Math.max(right, wx);
    });
    return my + order.length * LINE;
  };

  let bottom = y;
  if (e) {
    // On a tall stage the map comes right under the words, and the counts under the map.
    if (!wide) y = drawMap(e, PAD, y) + 4;
    const cur = e.cur;
    const key = cur === undefined ? null : e.keys[cur];
    shapes.push({
      kind: 'text',
      id: 'key',
      x: PAD,
      y: y + 22,
      text:
        cur === undefined
          ? 'key: …'
          : key
            ? `key of ${words[cur]}: ${key}`
            : `key of ${words[cur]}: counting…`,
      size: FONT.label,
      weight: 'bold',
      mono: true,
      role: roles.get('key'),
    });
    y += 36;
    bottom = naive ? y : strip(shapes, e.counts ?? Array(26).fill(0), roles, PAD, y + 4);
    if (wide) bottom = Math.max(bottom, drawMap(e, PAD + leftW + 40, 40));
  }

  for (const [t, at] of chipAt) {
    const g = e?.group[t];
    shapes.push(
      ...chip({
        id: `w-${t}`,
        x: at.x,
        y: at.y,
        text: words[t]!,
        size: CHIP,
        role: roles.get(`w-${t}`) ?? (g !== null && g !== undefined ? 'done' : undefined),
      }),
    );
  }

  const width = Math.max(right, ...shapes.map((s) => (s.kind === 'text' ? textRight(s) : 0))) + PAD;
  return { shapes, bounds: { x: 0, y: 0, w: width, h: bottom + PAD }, label: groupLabel(step, e) };
}

/** The right edge of a left-anchored text. */
function textRight(s: Shape): number {
  if (s.kind !== 'text' || (s.anchor && s.anchor !== 'start')) return 0;
  return s.x + monoWidth(s.text, s.size ?? 16);
}

function uniqueView(
  step: FStep,
  e: UniqueExtra,
  roles: Roles,
  settings: FSettings,
  stage?: StageSize,
): Scene {
  const naive = approachOf(settings) === 'naive';
  const w = e.word;
  const n = w.length;
  const nameX = PAD + monoWidth('count', FONT.name);
  // A phone's stage is narrow: the narrowest pitch keeps the text large enough there.
  const narrow = stage !== undefined && stage.w < 600;
  const cols = columns(n, { pitch: narrow ? 44 : pitchFor(n), x0: nameX + 12 });
  const shapes: Shape[] = [];
  const heading = naive ? 'first unique letter: rescan' : 'first unique letter: count, then scan';
  shapes.push({
    kind: 'text',
    id: 'heading',
    x: PAD,
    y: 26,
    text: heading,
    size: FONT.label,
    weight: 'bold',
    mono: true,
  });
  const s = cellRow(cols, {
    id: 's',
    from: 0,
    to: n - 1,
    top: 44,
    text: (i) => w[i]!,
    baseRole: (i) => (e.answer === i ? 'found' : undefined),
    roles,
    name: 's',
    nameX,
  });
  shapes.push(...s.shapes);
  const c = cellRow(cols, {
    id: 'n',
    from: 0,
    to: n - 1,
    top: s.bottom + 4,
    text: (i) => (e.seen[i] === null || e.seen[i] === undefined ? null : String(e.seen[i])),
    cellClass: (i) => (e.seen[i] === null || e.seen[i] === undefined ? 'cell' : 'live'),
    index: false,
    roles,
    name: 'count',
    nameX,
  });
  shapes.push(...c.shapes);
  let bottom = c.bottom;
  if (e.counts) bottom = strip(shapes, e.counts, roles, PAD, bottom + 14);
  const width = Math.max(cols.x(n), PAD + STRIP_W, PAD + monoWidth(heading, FONT.label)) + PAD;
  const known = e.seen.flatMap((v, i) => (v === null ? [] : [`${w[i]} ${v}`]));
  const label = [
    `The word ${w}, ${n} letters.`,
    known.length ? `Counts found so far: ${known.join(', ')}.` : '',
    e.answer === undefined
      ? ''
      : e.answer < 0
        ? 'No letter appears once.'
        : `The first unique letter is ${w[e.answer]}, at index ${e.answer}.`,
  ]
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: { x: 0, y: 0, w: width, h: bottom + PAD }, label };
}

function groupLabel(step: FStep, e: GroupExtra | undefined): string {
  const parts = [describe(step.state)];
  if (!e) return parts.join(' ');
  const words = step.state.words;
  if (e.cur !== undefined)
    parts.push(`Looking at ${words[e.cur]}${e.keys[e.cur] ? `, key ${e.keys[e.cur]}` : ''}.`);
  if (e.map.length)
    parts.push(
      `The map holds ${e.map.map((m) => `${m.key}: ${m.words.map((t) => words[t]).join(' ')}`).join('; ')}.`,
    );
  return parts.join(' ');
}
