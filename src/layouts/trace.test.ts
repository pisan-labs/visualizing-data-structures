import { describe, expect, it } from 'vitest';
import type { Shape } from '../render/scene';
import { drawTrace, fitLine } from './trace';

describe('the configuration trace', () => {
  it("cuts a line around its focus: Sipser's u q v, and a pushdown automaton's (q, w, stack)", () => {
    expect(fitLine({ parts: ['0000000000', 'q1', '1111111111'] }, 14)).toBe('…0000 q1 1111…');
    expect(fitLine({ parts: ['x', 'q1', '01'] }, 14)).toBe('x q1 01');
    // The state first: the input left and the stack keep their starts (the next symbol, the top).
    expect(fitLine({ parts: ['q1', 'aaaabbbb', 'AAAAZ'], focus: 0 }, 12)).toBe('q1 aaa… AAA…');
  });

  it('keeps its size as lines come, and names lines by their number', () => {
    const shapes: Shape[] = [];
    const lines = [0, 1, 2].map((n) => ({ n, index: n, parts: ['', 'q0', '01'] }));
    const b = drawTrace(shapes, { x: 0, y: 0, w: 300, title: 'Configurations', lines, keep: 6 });
    expect(b.h).toBe(22 + 6 * 20);
    expect(shapes.map((s) => s.id)).toEqual([
      'trace-title',
      'cfg-0-n',
      'cfg-0',
      'cfg-1-n',
      'cfg-1',
      'cfg-2-n',
      'cfg-2',
    ]);
    // Older lines fade; the current one does not.
    expect(shapes.find((s) => s.id === 'cfg-0')!.opacity).toBe(0.75);
    expect(shapes.find((s) => s.id === 'cfg-2')!.opacity).toBeUndefined();
  });
});
