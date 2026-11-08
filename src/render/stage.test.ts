import { describe, expect, it } from 'vitest';
import { drawCircular } from '../layouts/circular-array';
import { clearOfButtons } from '../layouts/graph';
import { shapesBounds } from './scene';
import { ZOOM_CORNER, ZOOM_STRIP, zoomCorner } from './stage';

const laptop = { w: 880, h: 384 };
const phone = { w: 360, h: 536, strip: true };

describe('the zoom buttons', () => {
  it('cover 118 x 42 px of a laptop drawing and none of a phone drawing', () => {
    expect(ZOOM_CORNER).toEqual({ w: 118, h: 42 });
    expect(ZOOM_STRIP.top).toBe(46);
    expect(zoomCorner(laptop)).toEqual(ZOOM_CORNER);
    expect(zoomCorner(phone)).toBeNull();
  });

  it('move a panel in the top right corner down on a laptop only', () => {
    const graph = { x: 0, y: 0, w: 400, h: 300 };
    const block = { x: 430, y: 0, w: 260, h: 120 };
    expect(clearOfButtons(block, graph, laptop).y).toBeGreaterThan(0);
    expect(clearOfButtons(block, graph, phone)).toEqual(block);
  });

  it('keep a value going into the last cell of a long row clear of them', () => {
    const draw = (stage?: typeof laptop) =>
      drawCircular({
        layout: 'row',
        capacity: 12,
        slots: Array(12).fill(null),
        live: () => false,
        front: 0,
        rear: 11,
        readouts: [],
        roles: new Map(),
        incoming: { uid: 1, value: 77, at: 11 },
        stage,
      });
    const onLaptop = draw(laptop);
    const s = Math.min(laptop.w / onLaptop.bounds.w, laptop.h / onLaptop.bounds.h);
    const box = shapesBounds(onLaptop.shapes, 0)!;
    expect((box.y - onLaptop.bounds.y) * s).toBeGreaterThanOrEqual(ZOOM_CORNER.h - 0.5);
    // On a phone the buttons have their own strip, so the row needs no room for them.
    expect(draw(phone).bounds.h).toBeLessThan(onLaptop.bounds.h);
  });
});
