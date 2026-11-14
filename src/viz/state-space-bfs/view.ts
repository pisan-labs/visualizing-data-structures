/**
 * The drawing, top to bottom (or, on a wide stage, the layers beside the rest):
 *
 * - the puzzle: start and goal, and the barred combinations or the word list;
 * - the moves of the state that just left the queue: each state it makes, and under it what
 *   became of it (new, seen, again, barred, goal);
 * - the queue, front first;
 * - the layers: a row per distance from the start, holding the states found at that distance in
 *   the order they were found. The state being expanded is blue, the ones still queued teal;
 *   with no visited set, a state that comes back is dashed. At the end the path is marked.
 *
 * Rows and cells are reserved for the whole operation (the deepest layer, the most moves one
 * state lists), so the camera holds still while it runs. A plain picture draws the puzzle alone.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { cellRow, chip, chipSize, columns, FONT, monoWidth } from '../../layouts/columns';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  describe,
  LAYER_ROWS,
  MOVE_CELLS,
  positions,
  QUEUE_CHIPS,
  ROW_CHIPS,
  startOf,
  topRow,
  type SSExtra,
  type SSSettings,
  type SSStep,
  type SSState,
  verdictRole,
} from './model';

const PAD = 10;
const SMALL = 18;
const CHIP = 18;
const LINE = 36;
const PITCH = 76;

interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

const text = (
  id: string,
  x: number,
  y: number,
  t: string,
  o: { size?: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean; label?: boolean } = {},
): Shape => ({
  kind: 'text',
  id,
  x,
  y,
  text: t,
  size: o.size ?? SMALL,
  anchor: o.anchor,
  weight: o.bold ? 'bold' : undefined,
  cls: o.label ? 'label' : undefined,
  mono: true,
});

/** At most `max` characters, with an ellipsis. */
const clip = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, max - 1)}…`);

export function view(step: SSStep, settings: SSSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const puzzle = e?.puzzle ?? settings.puzzle;

  const head = puzzleBlock(s, e, puzzle);
  if (!e) {
    return {
      shapes: translate(head.shapes, PAD, 0),
      bounds: { x: 0, y: 0, w: head.w + 2 * PAD, h: head.h + PAD },
      label: describe(s, settings),
    };
  }
  const moves = movesBlock(e, roles);
  const queue = queueBlock(e, roles);
  const layers = layersBlock(e, roles);

  // Stacked: puzzle, moves, queue, layers. Side by side: the layers right of the rest.
  const left = [head, moves, queue];
  const leftH = left.reduce((h, b) => h + b.h + 12, 0);
  const leftW = Math.max(...left.map((b) => b.w));
  const stacked = () => {
    const shapes: Shape[] = [];
    let y = 0;
    for (const b of [...left, layers]) {
      shapes.push(...translate(b.shapes, PAD, y));
      y += b.h + 12;
    }
    const w = Math.max(leftW, layers.w) + 2 * PAD;
    return { shapes, bounds: { x: 0, y: 0, w, h: y } as Bounds };
  };
  const beside = () => {
    const shapes: Shape[] = [];
    let y = 0;
    for (const b of left) {
      shapes.push(...translate(b.shapes, PAD, y));
      y += b.h + 12;
    }
    const x = PAD + leftW + 30;
    shapes.push(...translate(layers.shapes, x, ZOOM_DROP));
    const w = x + layers.w + PAD;
    return { shapes, bounds: { x: 0, y: 0, w, h: Math.max(leftH, layers.h + ZOOM_DROP + 12) } as Bounds };
  };
  const a = stacked();
  const b = beside();
  const pick = pickLayout(stage, [
    { bounds: a.bounds, make: () => a },
    { bounds: b.bounds, make: () => b },
  ]);
  const scene = pick.make();
  return { shapes: scene.shapes, bounds: scene.bounds, label: label(step, settings) };
}

/** The puzzle: start, goal, and what is barred or allowed. */
function puzzleBlock(s: SSState, e: SSExtra | undefined, puzzle: SSSettings['puzzle']): Block {
  const shapes: Shape[] = [];
  const start = startOf(s, puzzle);
  const lock = puzzle === 'lock';
  const heading = e
    ? `${lock ? 'lock' : 'words'}: ${e.start} to ${e.target}`
    : lock
      ? `lock: ${s.wheels} wheels, starts at ${start}`
      : `words: start at ${start}`;
  const sub = lock ? `barred: ${s.barred.join(' ')}` : `list: ${s.words.join(' ')}`;
  const subText = clip(sub, 46);
  shapes.push(
    text('heading', 0, 26, heading, { size: FONT.label, bold: true }),
    text('puzzle', 0, 56, subText, { label: true }),
  );
  const w = Math.max(monoWidth(heading, FONT.label), monoWidth(subText, SMALL));
  return { shapes, w, h: 64 };
}

/** The moves of the state just taken off the queue. */
function movesBlock(e: SSExtra, roles: ReadonlyMap<string, MarkRole>): Block {
  const shapes: Shape[] = [];
  const nameX = monoWidth('moves', FONT.name);
  const cells = Math.max(1, e.frame.moves);
  const cols = columns(cells, { pitch: PITCH, x0: nameX + 12 });
  const cur = e.current === undefined ? undefined : e.entries[e.current]!;
  const moves = e.moves ?? [];
  const title = cur
    ? `from ${cur.state}, d = ${cur.d}${e.skipped ? `; ${e.skipped} make no word` : ''}${moves.length > MOVE_CELLS ? `; ${moves.length - MOVE_CELLS} more` : ''}`
    : 'moves: none yet';
  shapes.push(text('moves-title', 0, 18, title, { label: true }));
  const row = cellRow(cols, {
    id: 'mv',
    from: 0,
    to: cells - 1,
    top: 30,
    text: (i) => moves[i]?.to ?? null,
    cellClass: (i) => (moves[i] ? 'live' : 'cell'),
    baseRole: (i) => {
      const v = moves[i]?.verdict;
      return v ? verdictRole[v] : undefined;
    },
    valueSize: 22,
    index: (i) => moves[i]?.verdict ?? '',
    roles,
    name: 'moves',
    nameX,
  });
  shapes.push(...row.shapes.filter((x) => !(x.kind === 'text' && x.text === '')));
  return {
    shapes,
    w: Math.max(cols.x(cells), monoWidth(title, SMALL)),
    h: row.bottom,
  };
}

/** The queue, front first. */
function queueBlock(e: SSExtra, roles: ReadonlyMap<string, MarkRole>): Block {
  const shapes: Shape[] = [];
  const nameX = monoWidth('queue', FONT.name);
  const cy = 20;
  shapes.push(text('queue-name', nameX, cy + FONT.name * 0.36, 'queue', { size: FONT.name, anchor: 'end', label: true }));
  const end = e.goal !== undefined && e.made > e.goal ? e.goal : e.made;
  const waiting: number[] = [];
  for (let u = e.head; u < end; u++) waiting.push(u);
  const slot = chipSize('w'.repeat(Math.max(...e.entries.map((x) => x.state.length))), CHIP).w;
  let x = nameX + 12;
  if (waiting.length === 0)
    shapes.push(text('queue-empty', x, cy + SMALL * 0.36, e.outcome === 'none' ? 'empty' : '–', { label: true }));
  const shown = waiting.length > QUEUE_CHIPS ? waiting.slice(0, QUEUE_CHIPS - 1) : waiting;
  for (const u of shown) {
    const en = e.entries[u]!;
    const id = `q-${u}`;
    shapes.push(...chip({ id, x: x + slot / 2, y: cy, text: en.state, size: CHIP, role: roles.get(id), dashed: en.again }));
    x += slot + 6;
  }
  if (shown.length < waiting.length) {
    const t = `+${waiting.length - shown.length}`;
    const w = chipSize(t, CHIP).w;
    shapes.push(...chip({ id: 'q-more', x: x + w / 2, y: cy, text: t, size: CHIP }));
  }
  const most = nameX + 12 + QUEUE_CHIPS * (slot + 6) + 20;
  return { shapes, w: most, h: cy + 20 };
}

/** The layers: a row per distance, the states in the order they were found. */
function layersBlock(e: SSExtra, roles: ReadonlyMap<string, MarkRole>): Block {
  const shapes: Shape[] = [];
  const rows = Math.min(e.frame.layers, LAYER_ROWS);
  const deepest = e.entries[e.made - 1]!.d;
  const top = topRow(deepest);
  const widest = `d=${Math.max(9, e.frame.layers - 1)}`;
  const nameX = monoWidth(widest, FONT.name);
  const slot = chipSize('w'.repeat(Math.max(...e.entries.map((x) => x.state.length))), CHIP).w;
  const title = top > 0 ? `layers, by distance (${top} above)` : 'layers, by distance from the start';
  shapes.push(text('layers-title', 0, 18, title, { label: true }));
  const pos = positions(e.entries, e.made);
  const onPath = new Set(e.path ?? []);
  const byRow = new Map<number, number[]>();
  for (let u = 0; u < e.made; u++) {
    const d = e.entries[u]!.d;
    byRow.set(d, [...(byRow.get(d) ?? []), u]);
  }
  for (let r = 0; r < rows; r++) {
    const d = top + r;
    const cy = 30 + r * LINE + 16;
    shapes.push(text(`ly-${r}-name`, nameX, cy + FONT.name * 0.36, `d=${d}`, { size: FONT.name, anchor: 'end', label: true }));
    const us = byRow.get(d) ?? [];
    let x = nameX + 12;
    for (const u of us) {
      if (pos[u]! >= ROW_CHIPS - 1 && us.length > ROW_CHIPS) break;
      const en = e.entries[u]!;
      const id = `st-${u}`;
      const queued = u >= e.head && !(e.goal === u);
      const role = roles.get(id) ?? (onPath.has(u) ? 'found' : u === e.goal ? 'found' : queued ? 'visit' : undefined);
      shapes.push(...chip({ id, x: x + slot / 2, y: cy, text: en.state, size: CHIP, role, dashed: en.again }));
      x += slot + 6;
    }
    if (us.length > ROW_CHIPS) {
      const id = `ly-${d}-more`;
      const t = `+${us.length - (ROW_CHIPS - 1)}`;
      const w = chipSize(t, CHIP).w;
      shapes.push(...chip({ id, x: x + w / 2, y: cy, text: t, size: CHIP, role: roles.get(id) }));
    }
  }
  // The answer, once found: the path from the start, one state per layer.
  const py = 30 + rows * LINE + 22;
  const pathText = e.path
    ? clip(`path: ${e.path.map((u) => e.entries[u]!.state).join(' → ')}`, 44)
    : e.outcome === 'none'
      ? 'path: none, the goal cannot be reached'
      : e.outcome === 'stopped'
        ? 'path: not found yet'
        : 'path: –';
  shapes.push({ ...text('path', 0, py, pathText, { bold: !!e.path, label: !e.path }), role: e.path ? 'found' : undefined });
  const w = Math.max(nameX + 12 + ROW_CHIPS * (slot + 6) + 20, monoWidth(title, SMALL), monoWidth(pathText, SMALL));
  return { shapes, w, h: py + 8 };
}

function label(step: SSStep, settings: SSSettings): string {
  const e = step.extra!;
  const parts = [describe(step.state, settings), `Search from ${e.start} to ${e.target}.`];
  const layers = new Map<number, string[]>();
  for (let u = 0; u < e.made; u++) {
    const en = e.entries[u]!;
    layers.set(en.d, [...(layers.get(en.d) ?? []), en.state]);
  }
  for (const [d, xs] of layers)
    parts.push(`Distance ${d}: ${xs.slice(0, 8).join(', ')}${xs.length > 8 ? ', …' : ''}.`);
  if (e.current !== undefined) parts.push(`Expanding ${e.entries[e.current]!.state}.`);
  if (e.path) parts.push(`Path: ${e.path.map((u) => e.entries[u]!.state).join(', ')}.`);
  return parts.join(' ');
}
