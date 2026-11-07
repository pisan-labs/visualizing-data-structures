import { describe, expect, it } from 'vitest';
import type { StageSize } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';
import { fitScore, padBounds, placePanels, unionBounds } from './graph';

const block = (w: number, h: number) => (out: Shape[], x: number, y: number) => {
  out.push({ kind: 'rect', id: 'p', x, y, w, h });
  return { x, y, w, h };
};

/** Where the block's top right corner lands on the stage, in pixels, as the stage draws it. */
function corner(graph: Bounds, b: Bounds, stage: StageSize) {
  const total = padBounds(unionBounds(graph, b), 14);
  const s = fitScore(total, stage);
  const margin = (stage.w - total.w * s) / 2;
  return { right: margin + (b.x + b.w - total.x) * s, top: (b.y - total.y) * s };
}

describe('panels beside a picture', () => {
  it('keep clear of the zoom buttons in pixels, at any scale', () => {
    const laptop = { w: 880, h: 384 };
    for (const k of [0.5, 1, 2, 4]) {
      const graph = { x: 0, y: 0, w: 400 * k, h: 300 * k };
      const b = placePanels([], graph, laptop, block(260 * k, 120 * k));
      expect(b.x, `scale ${k}`).toBeGreaterThan(graph.w);
      const c = corner(graph, b, laptop);
      // The buttons cover about 110 x 34 pixels in the top right corner.
      expect(c.right <= laptop.w - 110 || c.top >= 34, `scale ${k}: ${JSON.stringify(c)}`).toBe(
        true,
      );
    }
  });

  it('start at the top when the buttons are not in the way', () => {
    // A tall picture on a wide stage is centered, with room on both sides of it.
    const graph = { x: 0, y: 0, w: 120, h: 500 };
    const b = placePanels([], graph, { w: 880, h: 384 }, block(100, 100));
    expect(b.x).toBeGreaterThan(graph.w);
    expect(b.y).toBe(0);
  });
});
