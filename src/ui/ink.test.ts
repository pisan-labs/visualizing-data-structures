import { describe, expect, it } from 'vitest';
import { Ink, INK_COLORS, strokePath } from './ink.svelte';

function draw(ink: Ink, ...points: [number, number][]) {
  const [first, ...rest] = points;
  ink.begin({ x: first![0], y: first![1] });
  ink.extend(rest.map(([x, y]) => ({ x, y })));
  ink.end();
}

describe('Present mode ink', () => {
  it('draws only with the pen', () => {
    const ink = new Ink();
    draw(ink, [0, 0], [10, 10]);
    expect(ink.strokes).toEqual([]);
    ink.toggle('pointer');
    draw(ink, [0, 0], [10, 10]);
    expect(ink.strokes).toEqual([]);
    ink.toggle('pen');
    expect(ink.tool).toBe('pen');
    draw(ink, [0, 0], [10, 10], [20, 5]);
    expect(ink.strokes).toHaveLength(1);
    expect(ink.strokes[0]!.points).toHaveLength(3);
    expect(ink.strokes[0]!.color).toBe(INK_COLORS[0].value);
  });

  it('toggles tools, and a color takes up the pen', () => {
    const ink = new Ink();
    ink.toggle('pen');
    ink.toggle('pen');
    expect(ink.tool).toBe('off');
    expect(ink.busy).toBe(false);
    ink.toggle('pointer');
    expect(ink.busy).toBe(true);
    ink.pick(INK_COLORS[2].value);
    expect(ink.tool).toBe('pen');
    draw(ink, [1, 1]);
    expect(ink.strokes[0]!.color).toBe(INK_COLORS[2].value);
  });

  it('undoes the last stroke and clears them all', () => {
    const ink = new Ink();
    ink.setTool('pen');
    draw(ink, [0, 0], [1, 1]);
    draw(ink, [5, 5], [6, 6]);
    draw(ink, [9, 9]);
    ink.undo();
    expect(ink.strokes.map((s) => s.points[0]!.x)).toEqual([0, 5]);
    ink.clear();
    expect(ink.strokes).toEqual([]);
    // Moving after the stroke ended adds nothing.
    ink.extend([{ x: 3, y: 3 }]);
    expect(ink.strokes).toEqual([]);
  });

  it('goes when the step changes, unless kept', () => {
    const ink = new Ink();
    ink.setTool('pen');
    draw(ink, [0, 0], [1, 1]);
    ink.stepChanged();
    expect(ink.strokes).toEqual([]);
    ink.keep = true;
    draw(ink, [0, 0], [1, 1]);
    ink.stepChanged();
    expect(ink.strokes).toHaveLength(1);
  });

  it('resets on leaving Present mode, keeping the color and "Keep ink"', () => {
    const ink = new Ink();
    ink.pick(INK_COLORS[1].value);
    ink.keep = true;
    draw(ink, [0, 0], [1, 1]);
    ink.reset();
    expect(ink.tool).toBe('off');
    expect(ink.strokes).toEqual([]);
    expect(ink.color).toBe(INK_COLORS[1].value);
    expect(ink.keep).toBe(true);
  });

  it('turns points into a path, and a tap into a dot', () => {
    expect(strokePath([])).toBe('');
    expect(strokePath([{ x: 1.234, y: 5 }])).toBe('M1.2 5h0.01');
    expect(
      strokePath([
        { x: 0, y: 0 },
        { x: 10.06, y: 2 },
      ]),
    ).toBe('M0 0L10.1 2');
  });
});
