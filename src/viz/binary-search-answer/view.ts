/**
 * The drawing, top to bottom:
 *
 * - what is asked ("smallest capacity for d = 3 days"), left, clear of the zoom buttons;
 * - the possible answers as a strip from lo0 to hi0, each answer a band of the same width: the
 *   answers ruled out below the window (too small: fails, or fits but is not the largest), the
 *   window still open, and the answers ruled out above it. The answer being checked has a
 *   pointer over it; lo and hi sit under the window (binary search only);
 * - the check of that answer, one column per value: the weights (or positions), and under them
 *   what the check worked out for each value it read: the day and the day's load (ship), or
 *   the distance from the last item and the item placed there (spread);
 * - the answers tried so far, as chips that say whether each one worked.
 *
 * Every row is drawn for the whole operation, so the camera holds still while it runs. A plain
 * picture (the start, a load, practice) draws the values alone.
 */
import type { MarkRole } from '../../engine/types';
import { cellRow, chip, chipSize, columns, FONT, monoWidth } from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import { describe, what, type BAExtra, type BASettings, type BAStep } from './model';

const PAD = 10;
const PITCH = 58;
const SMALL = 18;
const STRIP_H = 30;
const ROW_H = 40;
const MIN_W = 560;
/** Tried chips shown at once, at most: the latest ones, after a "+m earlier" chip. */
export const SHOW_TRIES = 4;

export function view(step: BAStep, settings: BASettings): Scene {
  const s = step.state;
  const e = step.extra;
  const problem = e?.problem ?? settings.problem;
  const ship = problem === 'ship';
  const values = ship ? s.w : s.p;
  const n = values.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const naive = approachOf(settings) === 'naive';

  const names = ship ? ['w', 'day', 'load', 'tried'] : ['p', 'gap', 'item', 'tried'];
  const nameX = PAD + Math.max(...names.map((t) => monoWidth(t, FONT.name)));
  const cols = columns(n, { pitch: PITCH, x0: nameX + 12 });
  const heading = e
    ? ship
      ? `smallest capacity for d = ${e.param} ${e.param === 1 ? 'day' : 'days'}`
      : `largest gap for k = ${e.param} items`
    : '';
  const width = Math.max(
    cols.x(n) + PAD,
    e ? MIN_W : 0,
    PAD + monoWidth(heading, FONT.label) + PAD,
  );

  const shapes: Shape[] = [];
  let y = 8;
  if (e) {
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
    y = strip(shapes, e, roles, naive, cols.x(0), width - PAD, 44);
  }

  const top = cellRow(cols, {
    id: ship ? 'w' : 'p',
    from: 0,
    to: n - 1,
    top: y,
    text: (i) => String(values[i]),
    roles,
    name: ship ? 'w' : 'p',
    nameX,
  });
  shapes.push(...top.shapes);
  let bottom = top.bottom;

  if (e) {
    const c = e.check;
    const read = (i: number) => c !== undefined && c.read > 0 && i < readUpTo(c);
    const tags = cellRow(cols, {
      id: 't',
      from: 0,
      to: n - 1,
      top: bottom + 4,
      h: ROW_H,
      text: (i) => {
        if (!read(i)) return null;
        if (ship) return String(c!.tag[i]);
        return i === 0 ? '–' : String(c!.amount[i]);
      },
      cellClass: (i) => (read(i) ? 'live' : 'cell'),
      baseRole: (i) => {
        if (!read(i)) return undefined;
        if (ship) return c!.tag[i]! > e.param ? 'error' : undefined;
        return i === 0 ? undefined : c!.tag[i] ? 'new' : 'stale';
      },
      valueSize: 22,
      index: false,
      roles,
      name: ship ? 'day' : 'gap',
      nameX,
    });
    const amounts = cellRow(cols, {
      id: 'm',
      from: 0,
      to: n - 1,
      top: tags.bottom,
      h: ROW_H,
      text: (i) => {
        if (!read(i)) return null;
        if (ship) return String(c!.amount[i]);
        return c!.tag[i] ? String(c!.tag[i]) : null;
      },
      cellClass: (i) => (read(i) ? 'live' : 'cell'),
      baseRole: (i) => (read(i) && !ship && c!.tag[i] ? 'found' : undefined),
      valueSize: 22,
      index: false,
      roles,
      name: ship ? 'load' : 'item',
      nameX,
    });
    shapes.push(...tags.shapes, ...amounts.shapes);
    bottom = triedRow(shapes, e, roles, amounts.bottom + 14, nameX, cols.x(0), width - PAD);
  }

  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: bottom + PAD },
    label: label(step, settings),
  };
}

/** How many values the check has read: they are the first ones, in order. */
const readUpTo = (c: NonNullable<BAExtra['check']>) => c.read;

/** The strip of possible answers. Returns where the next part starts. */
function strip(
  shapes: Shape[],
  e: BAExtra,
  roles: ReadonlyMap<string, MarkRole>,
  naive: boolean,
  left: number,
  right: number,
  top: number,
): number {
  const ship = e.problem === 'ship';
  const loText = String(e.lo0);
  const hiText = String(e.hi0);
  const x0 = left + monoWidth(loText, SMALL) + 8;
  const x1 = right - monoWidth(hiText, SMALL) - 8;
  const m = e.hi0 - e.lo0 + 1;
  const band = (x1 - x0) / m;
  const xOf = (v: number) => x0 + (v - e.lo0) * band;
  // Room for the pointer over the strip.
  const sy = top + 36;
  const mid = sy + STRIP_H / 2 + SMALL * 0.36;
  shapes.push(
    {
      kind: 'text',
      id: 'ax-lo0',
      x: x0 - 8,
      y: mid,
      text: loText,
      size: SMALL,
      anchor: 'end',
      cls: 'label',
      mono: true,
    },
    {
      kind: 'text',
      id: 'ax-hi0',
      x: x1 + 8,
      y: mid,
      text: hiText,
      size: SMALL,
      cls: 'label',
      mono: true,
    },
  );
  const lowWord = ship ? 'fails' : 'fits';
  const highWord = ship ? 'fits' : 'fails';
  const region = (
    id: string,
    a: number,
    b: number,
    role: MarkRole | undefined,
    word: string,
    cls?: string,
  ) => {
    if (b < a) return;
    const x = xOf(a);
    const w = xOf(b + 1) - x;
    shapes.push({
      kind: 'rect',
      id,
      x,
      y: sy,
      w,
      h: STRIP_H,
      r: 3,
      cls,
      role: roles.get(id) ?? role,
    });
    if (word && monoWidth(word, SMALL) + 8 <= w)
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: x + w / 2,
        y: mid,
        text: word,
        size: SMALL,
        anchor: 'middle',
        mono: true,
        role: roles.get(id) === 'found' ? 'found' : undefined,
      });
  };
  region('ax-low', e.lo0, e.lo - 1, ship ? 'error' : 'done', lowWord);
  region('ax-open', e.lo, e.hi, undefined, e.answer !== undefined ? '' : '', 'live');
  region('ax-high', e.hi + 1, e.hi0, ship ? 'done' : 'error', highWord);

  // The answer being checked, or the answer found, with a pointer above it.
  const pointAt = e.answer ?? e.mid;
  if (pointAt !== undefined) {
    const cx = xOf(pointAt) + band / 2;
    const text =
      e.answer !== undefined
        ? `answer = ${e.answer}`
        : naive
          ? `${ship ? 'c' : 'g'} = ${pointAt}`
          : `mid = ${pointAt}`;
    const half = monoWidth(text, SMALL) / 2;
    const tx = Math.max(left + half, Math.min(right - half, cx));
    const id = e.answer !== undefined ? 'answer' : 'ax-mid';
    shapes.push(
      {
        kind: 'rect',
        id: `${id}-tick`,
        x: cx - 1.5,
        y: sy - 12,
        w: 3,
        h: 11,
        r: 1,
        role: roles.get(id) ?? 'active',
      },
      {
        kind: 'text',
        id,
        x: tx,
        y: sy - 19,
        text,
        size: SMALL,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(id) ?? 'active',
      },
    );
  }
  let bottom = sy + STRIP_H;
  if (!naive) {
    // lo and hi under the window: lo to the left of its band's middle, hi to the right.
    const ly = bottom + SMALL + 4;
    const same = e.lo === e.hi;
    const loX = xOf(e.lo) + band / 2;
    const hiX = xOf(e.hi) + band / 2;
    if (same) {
      const text = `lo = hi = ${e.lo}`;
      const half = monoWidth(text, SMALL) / 2;
      shapes.push({
        kind: 'text',
        id: 'ax-lo',
        x: Math.max(left + half, Math.min(right - half, loX)),
        y: ly,
        text,
        size: SMALL,
        anchor: 'middle',
        mono: true,
        cls: 'label',
      });
    } else {
      const lt = `lo = ${e.lo}`;
      const ht = `hi = ${e.hi}`;
      const wl = monoWidth(lt, SMALL);
      const wh = monoWidth(ht, SMALL);
      // lo ends left of the middle between the two bands, hi starts right of it, so the two
      // never overlap; both stay inside the drawing.
      const center = (loX + hiX) / 2;
      let lx = Math.min(loX + band / 2, center - 4);
      let hx = Math.max(hiX - band / 2, center + 4);
      if (lx - wl < left) {
        lx = left + wl;
        hx = Math.max(hx, lx + 8);
      }
      if (hx + wh > right) {
        hx = right - wh;
        lx = Math.min(lx, hx - 8);
      }
      shapes.push(
        {
          kind: 'text',
          id: 'ax-lo',
          x: lx,
          y: ly,
          text: lt,
          size: SMALL,
          anchor: 'end',
          mono: true,
          cls: 'label',
        },
        {
          kind: 'text',
          id: 'ax-hi',
          x: hx,
          y: ly,
          text: ht,
          size: SMALL,
          mono: true,
          cls: 'label',
        },
      );
    }
    bottom = ly + 6;
  }
  return bottom + 16;
}

/** The answers tried so far, in slots of one width, so the row never outgrows the drawing. */
function triedRow(
  shapes: Shape[],
  e: BAExtra,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
  nameX: number,
  left: number,
  right: number,
): number {
  const cy = top + 14;
  shapes.push({
    kind: 'text',
    id: 'tried-name',
    x: nameX,
    y: cy + FONT.name * 0.36,
    text: 'tried',
    size: FONT.name,
    anchor: 'end',
    cls: 'label',
    mono: true,
  });
  if (e.tried.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'tried-none',
      x: left,
      y: cy + SMALL * 0.36,
      text: e.tries === 0 ? 'no check needed' : 'nothing yet',
      size: SMALL,
      cls: 'label',
      mono: true,
    });
    return cy + 20;
  }
  // Every chip this operation can show fits a slot as wide as the widest answer.
  const slot = chipSize(`${e.hi0} fails`, SMALL).w;
  const moreW = chipSize(`+${e.tries} earlier`, SMALL).w;
  const room = Math.floor((right - left - (e.tries > SHOW_TRIES ? moreW + 8 : 0) + 8) / (slot + 8));
  const fit = Math.max(1, Math.min(SHOW_TRIES, room));
  const from = Math.max(0, e.tried.length - fit);
  let x = left;
  if (e.tries > fit) {
    if (from > 0) {
      const text = `+${from} earlier`;
      const w = chipSize(text, SMALL).w;
      shapes.push(...chip({ id: 'try-more', x: x + w / 2, y: cy, text, size: SMALL }));
    }
    x += moreW + 8;
  }
  for (let i = from; i < e.tried.length; i++) {
    const t = e.tried[i]!;
    const text = `${t.x} ${t.ok ? 'fits' : 'fails'}`;
    const id = `try-${i}`;
    const role = roles.get(id) ?? (t.ok ? 'done' : 'remove');
    shapes.push(...chip({ id, x: x + slot / 2, y: cy, text, size: SMALL, role }));
    x += slot + 8;
  }
  return cy + 20;
}

function label(step: BAStep, settings: BASettings): string {
  const e = step.extra;
  const parts = [describe(step.state, settings)];
  if (!e) return parts.join(' ');
  const name = what(e.problem);
  parts.push(
    `Possible ${name === 'capacity' ? 'capacities' : 'gaps'}: ${e.lo0} to ${e.hi0}; still open: ${e.lo} to ${e.hi}.`,
  );
  if (e.mid !== undefined) parts.push(`Checking ${e.mid}.`);
  if (e.tried.length)
    parts.push(`Tried: ${e.tried.map((t) => `${t.x} ${t.ok ? 'fits' : 'fails'}`).join(', ')}.`);
  if (e.answer !== undefined) parts.push(`Answer: ${e.answer}.`);
  return parts.join(' ');
}
