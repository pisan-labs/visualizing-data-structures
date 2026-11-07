import { describe, expect, it } from 'vitest';
import type { Shape } from '../render/scene';
import { BLANK, drawTape, tapeWindow } from './tape';

describe('the tape layout', () => {
  it('keeps the head inside the window, which moves in half-window steps', () => {
    for (let head = 0; head < 40; head++) {
      const w = tapeWindow(head, 10, 0);
      expect(head).toBeGreaterThanOrEqual(w.from);
      expect(head).toBeLessThan(w.to);
      expect(w.from).toBeGreaterThanOrEqual(0);
    }
    // Moving one cell seldom moves the window.
    const moves = Array.from(
      { length: 39 },
      (_, h) => tapeWindow(h, 10, 0).from !== tapeWindow(h + 1, 10, 0).from,
    );
    expect(moves.filter(Boolean).length).toBeLessThan(10);
  });

  it('draws blanks past the end, greys what was read, and marks the head', () => {
    const shapes: Shape[] = [];
    const b = drawTape(shapes, {
      x: 0,
      y: 0,
      cells: ['a', 'b'],
      to: 4,
      head: 1,
      headLabel: 'q1',
      read: 1,
    });
    const text = (id: string) => (shapes.find((s) => s.id === id) as { text: string }).text;
    expect(text('tape-0-t')).toBe('a');
    expect(text('tape-3-t')).toBe(BLANK);
    expect(text('tape-head-t')).toBe('q1');
    expect(shapes.find((s) => s.id === 'tape-0')!.opacity).toBe(0.5);
    expect(shapes.find((s) => s.id === 'tape-1')!.role).toBe('active');
    expect(new Set(shapes.map((s) => s.id)).size).toBe(shapes.length);
    expect(b.w).toBe(4 * 34);
  });
});
