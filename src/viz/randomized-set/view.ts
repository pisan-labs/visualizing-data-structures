import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import { fmt, opLabel, type Rect } from '../_design1/kit';
import {
  describe,
  idxId,
  keyId,
  MAX_SIZE,
  vid,
  type RSExtra,
  type RSSettings,
  type RSState,
} from './model';

/**
 * The array A with its indices, and under it (beside it, on a phone) the hash map: one entry per
 * value, its key over (or left of) the index it maps to, in the order the keys went in. Values
 * keep their ids, so a remove shows the last value sliding into the hole.
 */
interface Geometry {
  /** Slot i of A. */
  slot(i: number): Rect;
  /** Where slot i's index is written. */
  index(i: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  /** Map entry k: its key box and its index box. */
  key(k: number): Rect;
  idx(k: number): Rect;
  aName: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  mapName: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  /** The small label naming the map's index boxes. */
  idxName: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  bounds: Bounds;
}

const HEAD = 46;

/** A across the top, the map under it: for a wide laptop stage. */
function rows(map: boolean): Geometry {
  const x0 = 72;
  const w = 52;
  const h = 44;
  const ay = HEAD;
  const ky = ay + h + 52;
  const kh = 38;
  const ih = 30;
  return {
    slot: (i) => ({ x: x0 + i * w, y: ay, w, h }),
    index: (i) => ({ x: x0 + i * w + w / 2, y: ay + h + 19, anchor: 'middle' }),
    key: (k) => ({ x: x0 + k * w, y: ky, w, h: kh }),
    idx: (k) => ({ x: x0 + k * w, y: ky + kh, w, h: ih }),
    aName: { x: x0 - 14, y: ay + h / 2 + 6, anchor: 'end' },
    mapName: { x: x0 - 14, y: ky + kh / 2 + 6, anchor: 'end' },
    idxName: { x: x0 - 14, y: ky + kh + ih / 2 + 5, anchor: 'end' },
    bounds: { x: 0, y: 0, w: x0 + MAX_SIZE * w + 16, h: (map ? ky + kh + ih : ay + h + 24) + 14 },
  };
}

/** A down the left, the map beside it: for a tall phone stage. */
function columns(map: boolean): Geometry {
  const ax = 48;
  const w = 64;
  const h = 40;
  const mx = ax + w + 64;
  const kw = 60;
  const iw = 48;
  const y0 = HEAD + 30;
  return {
    slot: (i) => ({ x: ax, y: y0 + i * h, w, h }),
    index: (i) => ({ x: ax - 10, y: y0 + i * h + h / 2 + 5, anchor: 'end' }),
    key: (k) => ({ x: mx, y: y0 + k * h, w: kw, h }),
    idx: (k) => ({ x: mx + kw, y: y0 + k * h, w: iw, h }),
    aName: { x: ax + w / 2, y: y0 - 12, anchor: 'middle' },
    mapName: { x: mx + kw / 2, y: y0 - 12, anchor: 'middle' },
    idxName: { x: mx + kw + iw / 2, y: y0 - 12, anchor: 'middle' },
    bounds: {
      x: 0,
      y: 0,
      w: Math.max(300, (map ? mx + kw + iw : ax + w) + 24),
      h: y0 + MAX_SIZE * h + 16,
    },
  };
}

const valueSize = 18;

export function view(step: Step<RSState, RSExtra>, settings: RSSettings, stage?: StageSize): Scene {
  const { state, extra } = step;
  const map = approachOf(settings) === 'pattern';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const g = pickLayout(stage, [columns(map), rows(map)]);
  const shapes: Shape[] = [];
  const middle = (r: Rect, size: number) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 + size * 0.35 });

  for (let i = 0; i < MAX_SIZE; i++) {
    const item = state.a[i];
    const id = `a-${i}`;
    shapes.push({
      kind: 'rect',
      id,
      ...g.slot(i),
      cls: item ? 'cell live' : 'cell',
      role: roles.get(id) ?? (item ? roles.get(vid(item.uid)) : undefined),
      opacity: item ? 1 : 0.45,
    });
    shapes.push({
      kind: 'text',
      id: `ai-${i}`,
      ...g.index(i),
      text: String(i),
      size: 13,
      cls: 'index',
      mono: true,
      opacity: item ? 1 : 0.6,
    });
    if (item) {
      shapes.push({
        kind: 'text',
        id: vid(item.uid),
        ...middle(g.slot(i), valueSize),
        text: fmt(item.value),
        size: valueSize,
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(vid(item.uid)),
        enterFrom: { x: g.slot(i).x + g.slot(i).w / 2, y: 6 },
      });
    }
  }
  shapes.push({
    kind: 'text',
    id: 'a-name',
    ...g.aName,
    text: 'A',
    size: 16,
    mono: true,
    cls: 'label',
    role: roles.get('a-name'),
  });

  if (map) {
    shapes.push(
      {
        kind: 'text',
        id: 'map-name',
        ...g.mapName,
        text: 'map',
        size: 15,
        mono: true,
        cls: 'label',
        role: roles.get('map-name'),
      },
      {
        kind: 'text',
        id: 'map-idx-name',
        ...g.idxName,
        text: 'index',
        size: 13,
        mono: true,
        cls: 'label',
      },
    );
    state.map.forEach((e, k) => {
      const kr = roles.get(keyId(e.key));
      const ir = roles.get(idxId(e.key));
      shapes.push(
        { kind: 'rect', id: keyId(e.key), ...g.key(k), r: 4, cls: 'cell live', role: kr },
        {
          kind: 'text',
          id: `${keyId(e.key)}-t`,
          ...middle(g.key(k), 16),
          text: fmt(e.key),
          size: 16,
          anchor: 'middle',
          weight: 'bold',
          role: kr,
        },
        { kind: 'rect', id: idxId(e.key), ...g.idx(k), r: 4, cls: 'cell', role: ir ?? kr },
        {
          kind: 'text',
          id: `${idxId(e.key)}-t`,
          ...middle(g.idx(k), 15),
          text: String(e.index),
          size: 15,
          anchor: 'middle',
          mono: true,
          role: ir ?? kr,
        },
      );
    });
  }

  if (extra?.label) shapes.push(opLabel(extra.label, roles.get('op-label')));
  return { shapes, bounds: g.bounds, label: describe(state) };
}
