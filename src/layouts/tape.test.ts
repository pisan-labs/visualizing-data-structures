import { describe, expect, it } from 'vitest';
import type { Shape } from '../render/scene';
import { BLANK, drawTape, tapeWindow } from './tape';

describe('the tape layout', () => {
  it('keeps the head inside the window, which moves in half-window steps', () => {
    for (let head = 0; head < 40; head++) {
      const w = tapeWindow(head, 10, { lo: 0 });
      expect(head).toBeGreaterThanOrEqual(w.from);
      expect(head).toBeLessThan(w.to);
      expect(w.from).toBeGreaterThanOrEqual(0);
    }
    // Moving one cell seldom moves the window.
    const moves = Array.from(
      { length: 39 },
      (_, h) => tapeWindow(h, 10, { lo: 0 }).from !== tapeWindow(h + 1, 10, { lo: 0 }).from,
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

  it('stays still while the cells used fit, and keeps its width at the end of a word', () => {
    // A two-way tape: the first window has a spare cell on each side of what was used.
    const home = tapeWindow(0, 12, {});
    for (const head of [-2, 0, 5, 7])
      expect(tapeWindow(head, 12, { used: { lo: -2, hi: 7 } })).toEqual(home);
    expect(tapeWindow(9, 12, { used: { lo: 0, hi: 9 } })).not.toEqual(home);
    // A one-way tape may use cell 0, its first cell.
    expect(tapeWindow(4, 12, { lo: 0, used: { lo: 0, hi: 10 } })).toEqual({ from: 0, to: 12 });
    // A word of 5 symbols and the empty cell after it: just those 6 cells.
    expect(tapeWindow(3, 12, { lo: 0, hi: 5 })).toEqual({ from: 0, to: 6 });
    // A word of 16: the window ends at cell 16 and stays 12 cells wide.
    for (const head of [12, 14, 16])
      expect(tapeWindow(head, 12, { lo: 0, hi: 16 })).toEqual({ from: 5, to: 17 });
  });

  it('draws cells left of 0, and keeps the room for the head without one', () => {
    const shapes: Shape[] = [];
    const b = drawTape(shapes, {
      x: 0,
      y: 0,
      cells: ['1', '_', '0'],
      first: -2,
      from: -3,
      to: 2,
      head: null,
    });
    const text = (id: string) => (shapes.find((s) => s.id === id) as { text: string }).text;
    expect([-3, -2, -1, 0, 1].map((i) => text(`tape-${i}-t`))).toEqual([
      BLANK,
      '1',
      BLANK,
      '0',
      BLANK,
    ]);
    const top = (shapes.find((s) => s.id === 'tape-0') as { y: number }).y;
    const withHead: Shape[] = [];
    drawTape(withHead, { x: 0, y: 0, cells: ['0'], to: 2, head: 0 });
    expect((withHead.find((s) => s.id === 'tape-0') as { y: number }).y).toBe(top);
    expect(b.h).toBe(26 + 36);
  });

  it('wraps onto rows, with the head and the wall on their own rows', () => {
    const shapes: Shape[] = [];
    const b = drawTape(shapes, {
      x: 0,
      y: 0,
      cells: [...'abcdefg'],
      to: 7,
      rows: { width: 3, pitch: 100 },
      head: 4,
      left: true,
    });
    const at = (id: string) => shapes.find((s) => s.id === id) as { x: number; y: number };
    expect(at('tape-3').x).toBe(0);
    expect(at('tape-3').y - at('tape-0').y).toBe(100);
    expect(at('tape-6').y - at('tape-0').y).toBe(200);
    expect((shapes.find((s) => s.id === 'tape-head') as { x1: number }).x1).toBe(1.5 * 34);
    expect(at('tape-end').y).toBe(at('tape-0').y - 4);
    expect(new Set(shapes.map((s) => s.id)).size).toBe(shapes.length);
    expect(b.w).toBe(3 * 34 + 6);
    expect(b.h).toBe(200 + 26 + 36);
    // A head on no row draws none.
    const none: Shape[] = [];
    drawTape(none, { x: 0, y: 0, cells: ['a'], to: 1, rows: { width: 3, pitch: 50 }, head: 1 });
    expect(none.some((s) => s.id === 'tape-head')).toBe(false);
  });

  it('names cells by a key, and brings new cells in from where they came from', () => {
    const shapes: Shape[] = [];
    const uids = [7, 3, 9];
    drawTape(shapes, {
      id: 'w',
      x: 0,
      y: 0,
      cells: ['a', 'b', 'c'],
      to: 3,
      headRoom: 'none',
      key: (i) => uids[i]!,
      enter: (i) => (i === 2 ? { x: 100, y: 50 } : undefined),
    });
    const rects = shapes.filter((s) => s.kind === 'rect').map((s) => s.id);
    expect(rects).toEqual(['w-7', 'w-3', 'w-9']);
    expect(shapes.find((s) => s.id === 'w-9')!.enterFrom).toEqual({ x: 100, y: 50 });
    expect(shapes.find((s) => s.id === 'w-9-t')!.enterFrom).toEqual({ x: 117, y: 74 });
    expect(shapes.find((s) => s.id === 'w-7')!.enterFrom).toBeUndefined();
  });
});
