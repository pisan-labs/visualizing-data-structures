/**
 * Where a dynamic-programming page puts the boxes it shows with its table (an LCS, an
 * alignment, the items taken): under the table, in the room `frame.below` reserves (the usual
 * place), or right of the grid, centered on it, when the stage is wide and short and that draws
 * larger. The frame and the strip's size are fixed for an operation, so the choice holds.
 */
import type { StageSize } from '../../engine/types';
import { tableGeometry, type TableFrame, type TableGeometry } from '../../layouts/table';
import type { Bounds } from '../../render/scene';
import { pickLayout } from '../_stage/arrange';

export interface StripPlace {
  /** The frame to draw the table with: room under the grid only when the strip goes there. */
  frame: TableFrame;
  g: TableGeometry;
  beside: boolean;
  /** Left edge of the strip's boxes (its labels sit left of it), and the top of its first row. */
  left: number;
  top: number;
  bounds: Bounds;
}

/** Gap between the grid and the strip's labels, and room kept right of the strip. */
const GAP = 28;
const RIGHT = 16;

/**
 * `frame.below` is the strip's height. `boxesW` is the width of its boxes and `labelW` the room
 * its labels take left of them. `left` is where the boxes start: under the table, centered on
 * the grid as the pages always drew it; beside it, past the labels.
 */
export function placeStrip(
  frame: TableFrame,
  boxesW: number,
  labelW: number,
  stage?: StageSize,
): StripPlace {
  const g = tableGeometry(frame);
  const under: StripPlace = {
    frame,
    g,
    beside: false,
    left: (g.gridLeft + g.gridRight) / 2 - boxesW / 2,
    top: g.belowTop,
    bounds: { x: 0, y: 0, w: g.width, h: g.height },
  };
  const h = frame.below ?? 0;
  if (!stage || h === 0) return under;
  const flat: TableFrame = { ...frame, below: 0 };
  const fg = tableGeometry(flat);
  const left = fg.gridRight + GAP + labelW;
  const top = Math.max(fg.gridTop, (fg.gridTop + fg.gridBottom) / 2 - h / 2);
  const beside: StripPlace = {
    frame: flat,
    g: fg,
    beside: true,
    left,
    top,
    bounds: {
      x: 0,
      y: 0,
      w: Math.max(fg.width, left + boxesW + RIGHT),
      h: Math.max(fg.height, top + h + RIGHT),
    },
  };
  return pickLayout(stage, [under, beside]);
}
