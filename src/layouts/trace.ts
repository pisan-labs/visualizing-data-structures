/**
 * A configuration trace: the last few configurations of a machine, one per line, newest last,
 * each with its move number in front. A Turing machine's line is Sipser's u q v; a pushdown
 * automaton's is (state, rest of the input, stack). Lines too long for the panel are cut around
 * the part that matters most (the state), with … where symbols are left out.
 *
 *   drawTrace(shapes, options) -> bounds
 *     x, y, w     the panel's top left corner and width
 *     title       the heading, such as "Configurations (u q v)"
 *     lines       the configurations, oldest first; the last is the current one
 *     keep        lines the panel keeps room for, so it never changes size
 *     roles       marks by shape id
 *     id          line ids are `${id}-${n}` and their numbers `${id}-${n}-n` (default "cfg");
 *                 the heading is `${titleId}` (default "trace-title")
 *   fitLine(line, max)  the line's text in at most `max` characters
 *
 * Older lines are faded, so the current one stands out. Line ids come from each line's `n`,
 * which stays with the configuration as the trace scrolls, so a line slides up instead of
 * changing its text.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export interface TraceLine {
  /** Names the line's shapes; give each configuration its own and keep it as lines scroll. */
  n: number;
  /** The number in front of the line, such as the moves made so far. */
  index: number | string;
  /** The parts, joined with spaces: u, q and v; or the state, the input left and the stack. */
  parts: string[];
  /** The part kept whole when the line is cut (the state). Parts before it lose symbols from
   * their start, parts after it from their end. Default: the middle part. */
  focus?: number;
}

export interface TraceOptions {
  id?: string;
  titleId?: string;
  x: number;
  y: number;
  w: number;
  title: string;
  lines: readonly TraceLine[];
  keep: number;
  roles?: ReadonlyMap<string, MarkRole>;
}

const SIZE = 14;
const LINE = 20;
const NUM_W = 30;
const TITLE_H = 22;

/**
 * The line in at most `max` characters: whole when it fits; otherwise the focus part whole and
 * the others cut to share what is left (the parts after the focus get the odd one), with … where
 * symbols were left out. Empty parts are left out.
 */
export function fitLine(l: Pick<TraceLine, 'parts' | 'focus'>, max: number): string {
  const focus = l.focus ?? Math.floor(l.parts.length / 2);
  const join = (ps: string[]) => ps.filter(Boolean).join(' ');
  if (join(l.parts).length <= max) return join(l.parts);
  const others = l.parts.map((p, i) => (i !== focus && p ? i : -1)).filter((i) => i >= 0);
  const room = Math.max(others.length, max - l.parts[focus]!.length - others.length);
  const after = others.filter((i) => i > focus);
  const before = others.filter((i) => i < focus);
  const share = new Map<number, number>();
  let left = room;
  // Hand out the room evenly, the parts after the focus first.
  for (const [k, i] of [...after, ...before].entries()) {
    const n = Math.ceil(left / (others.length - k));
    share.set(i, n);
    left -= n;
  }
  return join(
    l.parts.map((p, i) => {
      const keep = Math.max(1, share.get(i) ?? p.length);
      if (i === focus || p.length <= keep) return p;
      return i < focus ? `…${p.slice(p.length - keep + 1)}` : `${p.slice(0, keep - 1)}…`;
    }),
  );
}

export function drawTrace(out: Shape[], o: TraceOptions): Bounds {
  const id = o.id ?? 'cfg';
  const titleId = o.titleId ?? 'trace-title';
  const roles = o.roles ?? new Map<string, MarkRole>();
  out.push({
    kind: 'text',
    id: titleId,
    x: o.x,
    y: o.y + 13,
    text: o.title,
    size: 13,
    cls: 'label',
    role: roles.get(titleId),
  });
  const max = Math.floor((o.w - NUM_W) / (SIZE * 0.6));
  o.lines.forEach((l, k) => {
    const lid = `${id}-${l.n}`;
    const role = roles.get(lid);
    const ly = o.y + TITLE_H + 15 + k * LINE;
    out.push({
      kind: 'text',
      id: `${lid}-n`,
      x: o.x + NUM_W - 8,
      y: ly,
      text: String(l.index),
      size: 12,
      anchor: 'end',
      mono: true,
      cls: 'index',
    });
    out.push({
      kind: 'text',
      id: lid,
      x: o.x + NUM_W,
      y: ly,
      text: fitLine(l, max),
      size: SIZE,
      mono: true,
      role,
      opacity: role || k === o.lines.length - 1 ? undefined : 0.75,
    });
  });
  return { x: o.x, y: o.y, w: o.w, h: TITLE_H + o.keep * LINE };
}
