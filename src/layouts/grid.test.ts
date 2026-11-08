import { describe, expect, it } from 'vitest';
import { cellShapeId, gridScene } from './grid';

describe('the grid layout', () => {
  it('puts a prefix on every shape id and finds marks by the prefixed id', () => {
    const { shapes } = gridScene(
      { rows: 2, cols: 2 },
      {
        wall: (r, c) => r === 1 && c === 1,
        cell: () => ({ text: '1' }),
        arrows: [{ id: 'arr', from: [0, 0], to: [0, 1] }],
        roles: new Map([[cellShapeId(0, 1, 'g2-'), 'found' as const]]),
        prefix: 'g2-',
      },
    );
    expect(shapes.every((s) => s.id.startsWith('g2-'))).toBe(true);
    expect(shapes.map((s) => s.id)).toContain('g2-arr');
    expect(shapes.map((s) => s.id)).toContain('g2-wall-1-1-0');
    expect(shapes.find((s) => s.id === 'g2-cell-0-1')!.role).toBe('found');
  });

  it('draws no label for an empty header name', () => {
    const { shapes } = gridScene(
      { rows: 2, cols: 2 },
      { wall: () => false, colNames: ['', 'x'], rowNames: ['1', ''] },
    );
    const ids = shapes.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['gcol-1', 'grow-0']));
    expect(ids).not.toContain('gcol-0');
    expect(ids).not.toContain('grow-1');
  });
});
