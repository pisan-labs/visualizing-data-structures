/**
 * The loaded machine; once Convert runs, the machine it builds beside or under it; and during a
 * run, the input tape with one output tape per machine under it, cells aligned, so a Moore
 * machine's extra first symbol and its lag behind the Mealy machine show column by column.
 *
 * The converted machine keeps its final layout while it grows. A Moore machine made from a
 * Mealy machine puts each state's copies side by side in that state's layer, so a split shows
 * as two states where there was one; a Mealy machine made from a Moore machine has the same
 * states in the same places.
 *
 * Arrangement: the diagrams run across (a laptop) or down (a phone), whichever draws the
 * machine and its conversion larger on the stage, so a machine never flips when Convert starts.
 * The converted machine goes beside or under the loaded one, and the tapes wherever
 * placePanels finds room, whichever draws largest (pickBest). Every frame comes from the
 * loaded machine, its conversion and the word's length, so it holds still through an operation.
 */
import { pickBest } from '../../layouts/arrange';
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { layers, layoutFromLayers, layoutStates, type StateLayout } from '../../layouts/automaton';
import { below, beside, padBounds, placePanels, translate, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, tapeWindow } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { TAPE_CELLS, drawInputTape, tapeCells } from '../_automata/panels';
import { drawMachine, drawOutputTape, OUT_CAPTION } from './draw';
import {
  convert,
  kindName,
  machineKey,
  mealyToMoore,
  moveKey,
  type First,
  type Kind,
  type Machine,
} from './machine';
import {
  DST,
  SRC,
  describe,
  describeConv,
  describeRun,
  type MmExtra,
  type MmSettings,
  type MmState,
  type RunView,
  type Track,
} from './model';

const CAPTION = 13;
const GAP = 10;

/** The converted machine's layout (see the file comment). */
function dstLayout(src: Machine, across: boolean): StateLayout {
  if (src.kind === 'moore') return layoutStates(src.fa, across);
  const { copies } = mealyToMoore(src);
  return layoutFromLayers(
    layers(src.fa).map((l) => l.flatMap((q) => copies[q]!)),
    across,
  );
}

/** The notes Mealy to Moore ends with, so the frame has room for them from the start. */
function finalNotes(src: Machine): Record<string, string> {
  if (src.kind === 'moore') return {};
  const { entered } = mealyToMoore(src);
  return Object.fromEntries(
    src.fa.states.map((q) => [q, `in: ${entered[q]!.length ? entered[q]!.join(',') : 'none'}`]),
  );
}

const captioned = (b: Bounds): Bounds => ({ ...b, y: b.y - 8 - CAPTION, h: b.h + 8 + CAPTION });

interface BlockSpec {
  /** The word's length. */
  room: number;
  kinds: Kind[];
  /** A single machine puts its state over the head. */
  label: boolean;
  first: First;
}

const outLength = (kind: Kind, n: number, first: First) =>
  kind === 'moore' && first === 'write' ? n + 1 : n;

/** The tapes' box: an input tape, then a captioned output tape per machine. */
function blockSize(b: BlockSpec): { w: number; h: number } {
  const w = Math.max(tapeCells(b.room) * CELL_W, 110);
  const h = (b.label ? 46 : 26) + CELL_H + b.kinds.length * (GAP + OUT_CAPTION + CELL_H);
  return { w, h };
}

interface Frame {
  across: boolean;
  /** Where the converted machine's shapes move to. */
  dx: number;
  dy: number;
  /** The tapes' top left corner. */
  bx: number;
  by: number;
  srcBox: Bounds;
  dstBox: Bounds;
  bounds: Bounds;
}

const frames = new Map<string, Frame>();

function candidates(
  src: Machine,
  across: boolean,
  showDst: boolean,
  block: BlockSpec | null,
  stage?: StageSize,
): Frame[] {
  const notes = finalNotes(src);
  const srcBox = captioned(
    drawMachine(src, layoutStates(src.fa, across), {
      note: (q) => notes[q],
      prefix: SRC,
    }).bounds,
  );
  const dstBox = captioned(
    drawMachine(convert(src), dstLayout(src, across), { prefix: DST }).bounds,
  );
  const out: Frame[] = [];
  for (const under of showDst ? [false, true] : [false]) {
    const dx = under ? srcBox.x - dstBox.x : beside(srcBox, 40) - dstBox.x;
    const dy = under ? below(srcBox, 24) - dstBox.y : srcBox.y - dstBox.y;
    const diagrams = showDst
      ? unionBounds(srcBox, { ...dstBox, x: dstBox.x + dx, y: dstBox.y + dy })
      : srcBox;
    const size = block && blockSize(block);
    const b = size ? placePanels([], diagrams, stage, (_o, x, y) => ({ x, y, ...size })) : null;
    out.push({
      across,
      dx,
      dy,
      bx: b?.x ?? 0,
      by: b?.y ?? 0,
      srcBox,
      dstBox,
      bounds: b ? unionBounds(diagrams, b) : diagrams,
    });
  }
  return out;
}

function frameFor(src: Machine, showDst: boolean, block: BlockSpec | null, stage?: StageSize) {
  const where = stage ? `${stage.w}x${stage.h}` : '-';
  const key = `${machineKey(src)}|${showDst}|${block ? `${block.room},${block.kinds.join('+')},${block.label},${block.first}` : '-'}|${where}`;
  const hit = frames.get(key);
  if (hit) return hit;
  // The direction suits the machine with its conversion, so it stays put when Convert starts.
  const across = pickBest(
    [true, false].flatMap((a) => candidates(src, a, true, null, stage)),
    stage,
  ).across;
  const best = pickBest(candidates(src, across, showDst, block, stage), stage);
  if (frames.size > 300) frames.clear();
  frames.set(key, best);
  return best;
}

function caption(shapes: Shape[], id: string, text: string, box: Bounds) {
  shapes.push({
    kind: 'text',
    id,
    x: box.x,
    y: box.y + CAPTION,
    text,
    size: CAPTION,
    cls: 'label',
  });
}

function drawTapes(
  shapes: Shape[],
  x: number,
  y: number,
  r: RunView,
  spec: BlockSpec,
  roles: ReadonlyMap<string, MarkRole>,
) {
  const n = r.word.length;
  const b = drawInputTape(shapes, x, y, {
    word: r.word,
    read: r.read,
    head: r.read,
    headLabel: spec.label ? r.tracks[0]!.q : undefined,
    room: n,
    roles,
  });
  // The same window as the input tape's, so a column holds what happens at one step.
  const win = tapeWindow(r.read, TAPE_CELLS, { lo: 0, hi: n });
  let at = b.y + b.h + GAP;
  for (const t of r.tracks) {
    const length = outLength(t.kind, n, spec.first);
    const fresh = r.done || !t.out.length ? null : t.out.length - 1;
    const ob = drawOutputTape(shapes, {
      kind: t.kind,
      x,
      y: at,
      written: t.out,
      length,
      from: win.from,
      to: win.to,
      fresh,
      roles,
    });
    at = ob.y + ob.h + GAP;
  }
}

export function view(step: Step<MmState, MmExtra>, settings: MmSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const src = state.machine;
  const conv = extra.conv;
  const r = extra.run;
  const showDst = !!(state.result || conv);
  const spec: BlockSpec | null = r
    ? {
        room: r.word.length,
        kinds: r.tracks.map((t) => t.kind),
        label: r.tracks.length === 1,
        first: settings.first,
      }
    : null;
  const f = frameFor(src, showDst, spec, stage);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const track = (prefix: string): Track | undefined => r?.tracks.find((t) => t.prefix === prefix);
  const looks = (t: Track | undefined) => ({
    look: (q: string) => (t && q === t.q ? ('current' as const) : undefined),
    edge: (p: string, q: string) =>
      t?.last && t.last.from === p && t.last.to === q ? ('used' as const) : undefined,
  });

  const s = drawMachine(src, layoutStates(src.fa, f.across), {
    roles,
    prefix: SRC,
    note: (q) => conv?.notes[q],
    ...looks(track(SRC)),
  });
  shapes.push(...s.shapes);
  caption(shapes, 'cap-src', `${kindName(src.kind)} machine`, f.srcBox);

  if (showDst) {
    const dst = convert(src);
    const d = drawMachine(dst, dstLayout(src, f.across), {
      roles,
      prefix: DST,
      ...looks(track(DST)),
      show: conv && {
        state: (q) => conv.states.includes(q),
        move: (mv) => conv.moves.includes(moveKey(mv.from, mv.on)),
        start: conv.start,
      },
    });
    shapes.push(...translate(d.shapes, f.dx, f.dy));
    caption(shapes, 'cap-dst', `${kindName(dst.kind)} machine (converted)`, {
      ...f.dstBox,
      x: f.dstBox.x + f.dx,
      y: f.dstBox.y + f.dy,
    });
  }

  if (r && spec) drawTapes(shapes, f.bx, f.by, r, spec, roles);

  const label = [describe(state), conv ? describeConv(src, conv) : '', r ? describeRun(r) : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: padBounds(f.bounds, 14), label };
}
