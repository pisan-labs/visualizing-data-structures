import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import { ARG_BAND, argAndFormula } from '../hash-open/grid';
import {
  describe,
  keyPos,
  nodeId,
  nodes,
  ownerOf,
  RING,
  SERVER_NAMES,
  type RingExtra,
  type RingNode,
  type RingSettings,
  type RingState,
} from './model';

const MARGIN = 14;
const R = 120;
/** Room around the ring for node boxes and the 0/90/180/270 labels. */
const PAD = 58;
const RING_W = 2 * (R + PAD);
const NODE_W = 34;
const NODE_H = 24;
const PANEL_W = 300;
const ROW = 30;
const KEY_GAP = 32;
const KEYS_PER_LINE = 7;

const serverRole = (sv: string) => groupRole(SERVER_NAMES.indexOf(sv) + 1);

/** Ring position p as a point, 0 at the top and going clockwise. */
function at(p: number, r: number, cx: number, cy: number) {
  const a = (p / RING) * 2 * Math.PI;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** The ring at (0, 0) with its nodes and key dots. */
function ring(state: RingState, extra: RingExtra, roles: Map<string, MarkRole>): Shape[] {
  const cx = R + PAD;
  const cy = R + PAD;
  const out: Shape[] = [{ kind: 'circle', id: 'ring', x: cx, y: cy, r: R, cls: 'ring' }];
  for (const p of [0, 90, 180, 270]) {
    const q = at(p, R + 46, cx, cy);
    out.push({
      kind: 'text',
      id: `tick-${p}`,
      x: q.x,
      y: q.y + 5,
      text: String(p),
      size: 13,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
  }
  // Keys: dots on the ring, colored by their server.
  for (const { uid, key } of state.keys) {
    const p = keyPos(key).value;
    const q = at(p, R, cx, cy);
    const owner = ownerOf(state, key);
    const id = `v${uid}`;
    out.push({
      kind: 'circle',
      id,
      x: q.x,
      y: q.y,
      r: 7,
      role: roles.get(id) ?? (owner ? serverRole(owner) : undefined),
    });
    if (roles.has(id) || extra.moved?.includes(uid)) {
      const t = at(p, R - 28, cx, cy);
      out.push({
        kind: 'text',
        id: `kl-${uid}`,
        x: t.x,
        y: t.y + 5,
        text: String(key),
        size: 13,
        anchor: 'middle',
        weight: 'bold',
      });
    }
  }
  const all: RingNode[] = [...nodes(state.servers, state.v), ...(extra.pending ?? [])];
  // A node close to the one before it moves out from the ring, so the boxes do not overlap.
  all.sort((a, b) => a.pos - b.pos || (a.label < b.label ? -1 : 1));
  let prev: { pos: number; outside: boolean } | null = null;
  for (const n of all) {
    const outside: boolean = !!prev && !prev.outside && n.pos - prev.pos < 12;
    prev = { pos: n.pos, outside };
    const q = at(n.pos, outside ? R + 28 : R, cx, cy);
    const id = nodeId(n.label);
    out.push({
      kind: 'rect',
      id,
      x: q.x - NODE_W / 2,
      y: q.y - NODE_H / 2,
      w: NODE_W,
      h: NODE_H,
      r: 6,
      cls: 'cell live',
      role: roles.get(id) ?? serverRole(n.server),
      z: 3,
    });
    out.push({
      kind: 'text',
      id: `nl-${n.label}`,
      x: q.x,
      y: q.y + 5,
      text: n.label,
      size: 14,
      anchor: 'middle',
      weight: 'bold',
      z: 4,
    });
  }
  if (extra.walk) {
    const { from, to } = extra.walk;
    const span = (to - from + RING) % RING;
    const a = at(from, R + 14, cx, cy);
    const b = at(to, R + 14, cx, cy);
    const mid = at(from + span / 2, R + 14 + Math.min(60, span / 3), cx, cy);
    out.push({
      kind: 'arrow',
      id: 'walk',
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      via: mid,
      role: 'active',
    });
  }
  return out;
}

/** One row per server: its color, its load and its keys, at (0, 0). */
function panel(state: RingState, roles: Map<string, MarkRole>): { shapes: Shape[]; h: number } {
  const out: Shape[] = [];
  const byServer = new Map<string, { uid: number; key: number }[]>();
  for (const sv of state.servers) byServer.set(sv, []);
  for (const item of state.keys) {
    const o = ownerOf(state, item.key);
    if (o) byServer.get(o)!.push(item);
  }
  let y = 0;
  for (const sv of [...state.servers].sort()) {
    const keys = byServer.get(sv)!;
    const id = `srv-${sv}`;
    out.push({
      kind: 'rect',
      id,
      x: 0,
      y,
      w: 28,
      h: 24,
      r: 5,
      cls: 'cell live',
      role: roles.get(id) ?? serverRole(sv),
    });
    out.push({
      kind: 'text',
      id: `sl-${sv}`,
      x: 14,
      y: y + 17,
      text: sv,
      size: 14,
      anchor: 'middle',
      weight: 'bold',
    });
    out.push({
      kind: 'text',
      id: `sn-${sv}`,
      x: 36,
      y: y + 17,
      text: `${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`,
      size: 13,
      cls: 'label',
    });
    keys.forEach(({ uid, key }, q) => {
      out.push({
        kind: 'text',
        id: `pk-${uid}`,
        x: 100 + (q % KEYS_PER_LINE) * KEY_GAP,
        y: y + 17 + Math.floor(q / KEYS_PER_LINE) * 20,
        text: String(key),
        size: 13,
        anchor: 'middle',
        mono: true,
        role: roles.get(`v${uid}`) ? 'active' : undefined,
      });
    });
    y += ROW + Math.max(0, Math.ceil(keys.length / KEYS_PER_LINE) - 1) * 20;
  }
  if (!state.servers.length)
    out.push({
      kind: 'text',
      id: 'srv-none',
      x: 0,
      y: 17,
      text: 'no servers yet',
      size: 14,
      cls: 'label',
    });
  return { shapes: out, h: Math.max(y, ROW) };
}

export function view(
  step: Step<RingState, RingExtra>,
  _settings: RingSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const r = ring(state, extra, roles);
  const p = panel(state, roles);
  const fullPanel = 8 * ROW;
  const arrange = (ph: number) => [
    {
      bounds: {
        x: 0,
        y: 0,
        w: MARGIN + RING_W + 16 + PANEL_W + MARGIN,
        h: Math.max(ARG_BAND + RING_W, ARG_BAND + 10 + ph) + 8,
      },
      rx: MARGIN,
      ry: ARG_BAND,
      px: MARGIN + RING_W + 16,
      py: ARG_BAND + 10,
    },
    {
      bounds: {
        x: 0,
        y: 0,
        w: Math.max(RING_W, PANEL_W) + 2 * MARGIN,
        h: ARG_BAND + RING_W + 8 + ph + 8,
      },
      rx: MARGIN + (Math.max(RING_W, PANEL_W) - RING_W) / 2,
      ry: ARG_BAND,
      px: MARGIN,
      py: ARG_BAND + RING_W + 8,
    },
  ];
  const full = arrange(fullPanel);
  const which = full.indexOf(pickLayout(stage, full));
  const L = arrange(p.h)[which]!;
  const shapes: Shape[] = [
    ...translate(r, L.rx, L.ry),
    ...translate(p.shapes, L.px, L.py),
    ...argAndFormula(extra.arg, extra.formula, MARGIN, roles.get('arg-box'), () => 'arg'),
  ];
  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: L.bounds, label };
}
