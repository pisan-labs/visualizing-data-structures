import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  drawLink,
  drawNode,
  NODE,
  nodeWidth,
  type Box,
  type NodeStatus,
  type Pt,
} from '../../layouts/linked';
import type { Scene, Shape } from '../../render/scene';
import { pickLayout } from '../_stage/arrange';
import { ARG_BAND, argAndFormula } from '../hash-open/grid';
import {
  describe,
  nid,
  type ChainExtra,
  type ChainSettings,
  type ChainState,
  type Entry,
} from './model';

/**
 * The table is a row of buckets (two or three rows when m is large), and each bucket's chain
 * hangs below it, first node on top. Nodes are the linked layout's [key | next] boxes; links
 * run straight down, except around a node that is being linked in or taken out.
 */
const NW = nodeWidth('single');
/** Centre of the next field, measured from a node's left edge. */
const FIELD_X = NODE.single.value + NODE.single.field / 2;
const VALUE_X = NODE.single.value / 2;
const COL_GAP = 10;
const PITCH = NW + COL_GAP;
const MARGIN = 14;
const MIN_W = 440;
/** Band across the top for the key and its hash. */
const TOP = ARG_BAND;
const LABEL = 16;
const BUCKET_W = 40;
const BUCKET_H = 30;
const DROP = 16;
const GAP_Y = 14;
const ROW_GAP = 10;
/** Rows leave room for chains this long, so the camera holds still while chains are short. */
const MIN_LEN = 2;
const MAX_COLS = 7;

type Status = 'live' | 'pending' | 'removing';

interface Drawn {
  entry: Entry;
  status: Status;
}

/** The nodes drawn under bucket b, in order, with a pending or departing node in place. */
function drawnChain(state: ChainState, extra: ChainExtra, b: number): Drawn[] {
  const out: Drawn[] = state.buckets[b]!.map((entry) => ({
    entry,
    status: extra.removing?.bucket === b && extra.removing.uid === entry.uid ? 'removing' : 'live',
  }));
  const p = extra.pending;
  if (p && p.bucket === b) out.splice(p.at, 0, { entry: p.entry, status: 'pending' });
  return out;
}

export function grid(m: number): { rows: number; cols: number } {
  const rows = Math.ceil(m / MAX_COLS);
  return { rows, cols: Math.ceil(m / rows) };
}

/** Chain length assumed when choosing rows for a stage: a fixed guess, so the choice holds. */
const GUESS_LEN = 4;

/**
 * Rows of buckets for the stage: the usual (at most seven to a row), or on a wide, short stage
 * all in one row, or on a narrow one fewer to a row, whichever draws largest with chains of
 * GUESS_LEN nodes. It depends only on m and the stage, so it holds while chains grow.
 */
function gridFor(m: number, nh: number, stage?: StageSize): { rows: number; cols: number } {
  const usual = grid(m);
  if (!stage) return usual;
  const options = [usual];
  for (let rows = 1; rows <= m; rows++) {
    const cols = Math.ceil(m / rows);
    if (Math.ceil(m / cols) === rows && rows !== usual.rows) options.push({ rows, cols });
  }
  const band = LABEL + BUCKET_H + DROP + GUESS_LEN * (nh + GAP_Y) - GAP_Y + 8;
  return pickLayout(
    stage,
    options.map((g) => ({
      ...g,
      bounds: {
        x: 0,
        y: 0,
        w: Math.max(MIN_W, 2 * MARGIN + g.cols * PITCH - COL_GAP),
        h: TOP + g.rows * (band + ROW_GAP) - ROW_GAP + 8,
      },
    })),
  );
}

export function view(
  step: Step<ChainState, ChainExtra>,
  settings: ChainSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const pairs = settings.mode === 'pairs';
  // A little shorter than the linked layout's 40, so long chains fit on short screens.
  const NH = pairs ? 46 : 34;
  const m = state.m;
  const { rows, cols } = gridFor(m, NH, stage);
  const chains = Array.from({ length: m }, (_, b) => drawnChain(state, extra, b));

  const tableW = cols * PITCH - COL_GAP;
  const W = Math.max(MIN_W, 2 * MARGIN + tableW);
  const x0 = (W - tableW) / 2;
  const band = (len: number) => LABEL + BUCKET_H + DROP + len * (NH + GAP_Y) - GAP_Y + 8;
  const rowTop: number[] = [];
  let y = TOP;
  for (let r = 0; r < rows; r++) {
    rowTop.push(y);
    let len = MIN_LEN;
    for (let b = r * cols; b < Math.min(m, (r + 1) * cols); b++)
      len = Math.max(len, chains[b]!.length);
    y += band(len) + ROW_GAP;
  }
  const H = y - ROW_GAP + 8;

  const colX = (b: number) => x0 + (b % cols) * PITCH;
  const top = (b: number) => rowTop[Math.floor(b / cols)]!;
  const bucketBox = (b: number): Box => ({
    x: colX(b) + (NW - BUCKET_W) / 2,
    y: top(b) + LABEL,
    w: BUCKET_W,
    h: BUCKET_H,
  });
  const nodeBox = (b: number, j: number): Box => ({
    x: colX(b),
    y: top(b) + LABEL + BUCKET_H + DROP + j * (NH + GAP_Y),
    w: NW,
    h: NH,
  });

  const shapes: Shape[] = [];

  /**
   * Down from `from` to the top of node t. If node t - 1 is skipped, go around it: on the right
   * for a next pointer, on the left for T[b] (so it never crosses the skipped node's own arrow).
   */
  const route = (b: number, from: Pt, t: number, skip: boolean, side: 1 | -1 = 1): Pt[] => {
    const T = nodeBox(b, t);
    if (!skip) return [from, { x: from.x, y: T.y }];
    const S = nodeBox(b, t - 1);
    const gx = side > 0 ? S.x + S.w + COL_GAP / 2 : S.x - COL_GAP / 2;
    return [
      from,
      { x: from.x, y: S.y - 7 },
      { x: gx, y: S.y - 7 },
      { x: gx, y: S.y + S.h + 7 },
      { x: from.x, y: S.y + S.h + 7 },
      { x: from.x, y: T.y },
    ];
  };

  for (let b = 0; b < m; b++) {
    const chain = chains[b]!;
    const bb = bucketBox(b);
    const cx = bb.x + bb.w / 2;
    const cy = bb.y + bb.h / 2;
    const headId = `T${b}`;
    shapes.push({
      kind: 'text',
      id: `idx-${b}`,
      x: cx,
      y: top(b) + 13,
      text: String(b),
      size: 14,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
    shapes.push({
      kind: 'rect',
      id: headId,
      ...bb,
      r: 4,
      cls: 'cell live',
      role: roles.get(headId),
    });

    /** Position of the node a pointer leaving position j lands on (j = -1 for T[b]). */
    const target = (j: number): number | null => {
      for (let t = j + 1; t < chain.length; t++) if (chain[t]!.status === 'live') return t;
      return null;
    };

    const linkRole = roles.get(`${headId}.head`);
    const first = target(-1);
    if (first === null) {
      shapes.push(
        ...drawLink(
          `${headId}.head`,
          [
            { x: cx - 7, y: cy + 10 },
            { x: cx + 7, y: cy - 10 },
          ],
          { role: linkRole, head: false },
        ),
      );
    } else {
      shapes.push(dot(`${headId}.head`, { x: cx, y: cy }, linkRole));
      shapes.push(
        ...drawLink(`${headId}.head`, route(b, { x: cx, y: cy }, first, first > 0, -1), {
          role: linkRole,
        }),
      );
    }

    chain.forEach((d, j) => {
      const box = nodeBox(b, j);
      const id = nid(d.entry.uid);
      const status: NodeStatus = d.status === 'live' ? 'live' : 'pending';
      const parts = drawNode({ id, text: String(d.entry.key), status }, box, 'single', roles);
      if (pairs) {
        for (const s of parts) {
          if (s.id === `${id}.v` && s.kind === 'text') {
            s.y = box.y + 20;
            s.size = Math.min(s.size ?? 16, 15);
          }
        }
        const v = d.entry.value ?? '–';
        parts.push({
          kind: 'text',
          id: `${id}.val`,
          x: box.x + VALUE_X,
          y: box.y + 38,
          text: v,
          size: v.length <= 3 ? 13 : 11,
          anchor: 'middle',
          role: d.entry.value === null ? 'stale' : undefined,
        });
      }
      shapes.push(...parts);

      // Where this node's next points.
      let t: number | null;
      if (d.status === 'pending') {
        const nextUid = extra.pending!.next;
        const k = chain.findIndex((x) => x.entry.uid === nextUid);
        t = k < 0 ? null : k;
      } else if (d.status === 'removing') {
        t = j + 1 < chain.length ? j + 1 : null;
      } else {
        t = target(j);
      }
      const lid = `${id}.next`;
      const role = roles.get(lid);
      const fx = box.x + FIELD_X;
      const fy = box.y + box.h / 2;
      if (t === null) {
        shapes.push(
          ...drawLink(
            lid,
            [
              { x: fx - 7, y: fy + 11 },
              { x: fx + 7, y: fy - 11 },
            ],
            { role, head: false, dashed: d.status !== 'live' },
          ),
        );
      } else {
        shapes.push(dot(lid, { x: fx, y: fy }, role));
        shapes.push(
          ...drawLink(lid, route(b, { x: fx, y: fy }, t, t > j + 1), {
            role,
            dashed: d.status !== 'live',
          }),
        );
      }
    });
  }

  shapes.push(
    ...argAndFormula(extra.arg, extra.formula, MARGIN, roles.get('arg-box'), (u) => `${nid(u)}.v`),
  );

  return { shapes, bounds: { x: 0, y: 0, w: W, h: H }, label: label(step, settings) };
}

/** The dot in a pointer field, as the linked layout draws it. */
function dot(id: string, p: Pt, role?: MarkRole): Shape {
  return {
    kind: 'circle',
    id: `${id}:dot`,
    x: p.x,
    y: p.y,
    r: 3.5,
    cls: 'arrowhead',
    role,
    z: 1.6,
  };
}

function label(step: Step<ChainState, ChainExtra>, settings: ChainSettings): string {
  const { state, extra = {} } = step;
  const parts = [describe(state, settings)];
  if (extra.formula) parts.push(`${extra.formula}.`);
  if (extra.pending) parts.push(`A new node for ${extra.pending.entry.key} is not linked in yet.`);
  if (extra.removing) parts.push('One node is being unlinked.');
  return parts.join(' ');
}
