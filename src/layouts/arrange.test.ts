import { describe, expect, it } from 'vitest';
import type { Shape } from '../render/scene';
import { translate } from './arrange';

describe('translate', () => {
  it('moves every point of a shape, the curve point of an arrow too', () => {
    const shapes: Shape[] = [
      { kind: 'arrow', id: 'a', x1: 0, y1: 0, x2: 10, y2: 0, via: { x: 5, y: 8 } },
      { kind: 'arrow', id: 'b', x1: 0, y1: 0, x2: 10, y2: 0 },
      { kind: 'circle', id: 'c', x: 1, y: 2, r: 3, enterFrom: { x: 4, y: 5 } },
      { kind: 'polygon', id: 'p', points: [{ x: 0, y: 0 }] },
    ];
    expect(translate(shapes, 100, 50)).toEqual([
      { kind: 'arrow', id: 'a', x1: 100, y1: 50, x2: 110, y2: 50, via: { x: 105, y: 58 } },
      { kind: 'arrow', id: 'b', x1: 100, y1: 50, x2: 110, y2: 50 },
      { kind: 'circle', id: 'c', x: 101, y: 52, r: 3, enterFrom: { x: 104, y: 55 } },
      { kind: 'polygon', id: 'p', points: [{ x: 100, y: 50 }] },
    ]);
  });
});
