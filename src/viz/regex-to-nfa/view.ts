/**
 * The expression as a row of cells on top (the part just built highlighted, parts not built yet
 * greyed), the NFA under it, and during a run the input word as a tape under the NFA.
 *
 * The NFA is drawn by the shared drawAutomaton, with the same ids as every automata page, along
 * the routes and label places the layout chose, so the picture reads like the textbook figure:
 * a star's repeat arrow above its body and its skip arrow below. It draws only the states and
 * arrows built so far, each where it is in the finished picture. Ids: stateId(q) "s-q0",
 * moveId(p, q) "m-q0-q1" (and "-t" for its label, "-a" and "-b" for the first two pieces of an
 * arrow between wrapped rows), "rx-<i>" an expression cell, "tape-<i>" a tape cell, "box-<k>"
 * the frame around a piece, "result" the accept/reject badge.
 *
 * During a build, each piece built and not yet used by a parent sits in a dashed frame; the
 * piece just built is tinted, and its start gets the start arrow.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { drawAutomaton, fixedLayout, type StateLook } from '../../layouts/automaton';
import { fitScore, padBounds, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, drawTape } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { EPS } from '../_automata/automaton';
import { pending } from '../_automata/thompson-construct';
import { TIGHT, boxAround, pairKey, pictures, type Picture } from '../_automata/thompson-layout';
import { describe, drawn, type RxExtra, type RxSettings, type RxState } from './model';

const RX_W = 26;
const RX_H = 32;
/** Room for the "R =" and "w =" labels left of the rows of cells. */
const LABEL_W = 40;
const LABEL_SIZE = 15;
/** The tape the layout choice reserves room for, whatever the word. */
const TAPE_RESERVE = 8;
/** Room for the accept/reject badge right of the tape. */
const RESULT_W = 80;

interface Frame {
  pic: Picture;
  /** Expression cells per line. */
  per: number;
  rowBox: Bounds;
  tapeAt: { x: number; y: number };
}

/**
 * Where the expression and the tape go: the expression over the NFA and the tape under it
 * (`apart`), the tape right of the expression over the NFA (`top`), or the expression on one
 * line under the NFA with the tape right of it (`bottom`), which keeps both out of the corner the
 * zoom buttons cover.
 */
type Place = 'apart' | 'top' | 'bottom';

/** Between the expression and the tape when they share a line. */
const BESIDE = 30;

/** The frame for a picture, with the expression and the tape placed as `place` says. */
function frameFor(pic: Picture, text: string, place: Place = 'apart'): Frame {
  const b = pic.bounds;
  // Beside the expression, the tape takes room from its rows.
  const tape = place === 'top' ? BESIDE + LABEL_W + TAPE_RESERVE * CELL_W + RESULT_W : 0;
  const per =
    place === 'bottom'
      ? Math.max(10, text.length)
      : Math.max(10, Math.floor((b.w - LABEL_W - tape) / RX_W));
  const lines = Math.ceil(text.length / per);
  const rowH = lines * RX_H + (lines - 1) * 6;
  const w = LABEL_W + Math.min(per, text.length) * RX_W;
  if (place === 'bottom') {
    // The tape's cells level with the expression's cells, under the NFA.
    const tapeY = b.y + b.h + 16;
    const rowBox = { x: b.x, y: tapeY + 26 + CELL_H / 2 - RX_H / 2, w, h: rowH };
    return { pic, per, rowBox, tapeAt: { x: b.x + w + BESIDE + LABEL_W, y: tapeY } };
  }
  const rowBox = { x: b.x, y: b.y - 20 - rowH, w, h: rowH };
  const tapeAt =
    place === 'top'
      ? { x: rowBox.x + rowBox.w + BESIDE + LABEL_W, y: rowBox.y + RX_H / 2 - 26 - CELL_H / 2 }
      : { x: b.x + LABEL_W, y: b.y + b.h + 16 };
  return { pic, per, rowBox, tapeAt };
}

/** The empty word is written out instead of drawn as a tape. */
const EMPTY_W = 190;

const tapeBox = (f: Frame, cells: number): Bounds => ({
  x: f.tapeAt.x - LABEL_W,
  y: f.tapeAt.y,
  w: LABEL_W + (cells ? cells * CELL_W : EMPTY_W) + RESULT_W,
  h: 26 + CELL_H + 4,
});

/**
 * The picture that draws largest on this stage (or on both a laptop and a phone). On a stage,
 * the states may also sit closer together (TIGHT), for a long expression, and the tape may go
 * beside the expression instead of under the NFA, both over the NFA or both under it.
 */
function choose(s: RxState, stage?: StageSize): Frame {
  const key = `${s.sign}|${s.text}`;
  const pics = stage
    ? [...pictures(s.frags, s.how, key), ...pictures(s.frags, s.how, key, TIGHT)]
    : pictures(s.frags, s.how, key).filter((p) => p.rows < 4);
  const frames = [
    ...pics.map((p) => frameFor(p, s.text)),
    ...(stage ? pics.map((p) => frameFor(p, s.text, 'top')) : []),
    // Both under the NFA only on a wide stage, where they would otherwise make it too tall.
    ...(stage && stage.w > stage.h ? pics.map((p) => frameFor(p, s.text, 'bottom')) : []),
  ];
  const score = (f: Frame) =>
    fitScore(padBounds(unionBounds(f.pic.bounds, f.rowBox, tapeBox(f, TAPE_RESERVE)), 12), stage);
  // Prefer fewer rows unless more rows draw clearly larger.
  return frames.reduce((best, f) => (score(f) > score(best) * 1.08 ? f : best));
}

export function view(
  step: Step<RxState, RxExtra>,
  _settings: RxSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frame = choose(s, stage);
  const { pic } = frame;
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [pic.bounds, frame.rowBox];
  const building = s.built < s.frags.length;
  const { states, moves } = drawn(s);

  // The expression, as cells; parts built so far are live, the rest grey.
  const builtCells = new Set<number>();
  for (const f of s.frags.slice(0, s.built))
    for (let i = f.span[0]; i < f.span[1]; i++) builtCells.add(i);
  const { rowBox, per } = frame;
  shapes.push({
    kind: 'text',
    id: 'rx-label',
    x: rowBox.x + LABEL_W - 10,
    y: rowBox.y + RX_H / 2 + 6,
    text: 'R =',
    size: LABEL_SIZE,
    anchor: 'end',
    mono: true,
    cls: 'label',
  });
  [...s.text].forEach((c, i) => {
    const x = rowBox.x + LABEL_W + (i % per) * RX_W;
    const y = rowBox.y + Math.floor(i / per) * (RX_H + 6);
    const live = !building || builtCells.has(i);
    shapes.push({
      kind: 'rect',
      id: `rx-${i}`,
      x,
      y,
      w: RX_W,
      h: RX_H,
      role: roles.get(`rx-${i}`),
      cls: live ? 'cell live' : 'cell',
    });
    shapes.push({
      kind: 'text',
      id: `rx-${i}-t`,
      x: x + RX_W / 2,
      y: y + RX_H / 2 + 6,
      text: c,
      size: 18,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
      role: roles.get(`rx-${i}`) === 'active' ? 'active' : undefined,
      opacity: live ? undefined : 0.6,
    });
  });

  // Frames around the pieces built and not yet used, one per row a piece spans.
  if (building && s.built > 0)
    for (const k of pending(s.frags, s.built)) {
      const f = s.frags[k]!;
      let first = true;
      for (const band of pic.bands) {
        const inside = f.states.filter((q) => pic.pos[q]!.y >= band.y1 && pic.pos[q]!.y <= band.y2);
        if (!inside.length) continue;
        const moves = f.moves.filter((m) => inside.includes(m.from) && inside.includes(m.to));
        shapes.push({
          kind: 'rect',
          id: first ? `box-${k}` : `box-${k}-${pic.bands.indexOf(band)}`,
          ...padBounds(boxAround(pic, inside, moves), 7),
          r: 10,
          cls: 'ghost',
          role: k === s.built - 1 ? 'new' : undefined,
          z: -2,
        });
        first = false;
      }
    }

  // The NFA so far, from the shared drawing, along the layout's routes.
  if (states.length) {
    const current = s.frags[s.built - 1]!;
    const accept = building
      ? pending(s.frags, s.built).flatMap((k) => s.frags[k]!.accepts)
      : s.nfa.accept;
    const active = new Set(s.run?.set ?? []);
    const look = (q: string): StateLook | undefined => (active.has(q) ? 'current' : undefined);
    const used = new Set((extra.used ?? []).map((m) => pairKey(m.from, m.to)));
    const shownStates = new Set(states);
    const shownMoves = new Set(moves.map((m) => `${m.from} ${m.on} ${m.to}`));
    const d = drawAutomaton(
      {
        states: s.nfa.states,
        alphabet: [],
        start: building ? current.start : s.nfa.start,
        accept,
        moves: s.nfa.moves,
      },
      fixedLayout(pic.pos, pic.across),
      {
        roles,
        look,
        edge: (p, q) => (used.has(pairKey(p, q)) ? 'used' : undefined),
        // A piece's start gets no arrow while building: it would read as a move into it.
        startArrow: !building,
        show: {
          state: (q) => shownStates.has(q),
          move: (m) => shownMoves.has(`${m.from} ${m.on} ${m.to}`),
        },
        route: (p, q) => pic.paths[pairKey(p, q)],
      },
    );
    shapes.push(...d.shapes);
  }

  // The word, as a tape, during a run.
  const r = s.run;
  if (r) {
    const { x, y } = frame.tapeAt;
    const n = r.word.length;
    boxes.push(tapeBox(frame, n));
    shapes.push({
      kind: 'text',
      id: 'tape-label',
      x: x - 10,
      y: y + 26 + CELL_H / 2 + 6,
      text: 'w =',
      size: LABEL_SIZE,
      anchor: 'end',
      mono: true,
      cls: 'label',
    });
    let right: number;
    if (n) {
      const b = drawTape(shapes, {
        id: 'tape',
        x,
        y,
        cells: [...r.word],
        to: n,
        // Past the last symbol the head goes, and its room stays, so the cells hold still.
        head: r.read < n ? r.read : null,
        read: r.read,
        roles,
      });
      right = b.x + b.w;
    } else {
      shapes.push({
        kind: 'text',
        id: 'tape-empty',
        x,
        y: y + 26 + CELL_H / 2 + 7,
        text: `${EPS} (the empty word)`,
        size: 18,
        mono: true,
      });
      right = x + EMPTY_W;
    }
    if (r.result) {
      const ok = r.result === 'accept';
      shapes.push({
        kind: 'text',
        id: 'result',
        x: right + 16,
        y: y + 26 + CELL_H / 2 + 6,
        text: ok ? 'accept' : 'reject',
        size: 17,
        weight: 'bold',
        role: roles.get('result') ?? (ok ? 'found' : 'error'),
      });
    }
  }

  const bounds = padBounds(unionBounds(...boxes), 12);
  return { shapes, bounds, label: describe(s) };
}
