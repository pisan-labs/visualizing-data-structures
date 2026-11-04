import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { nQueens } from '.';
import { type Goal, type QueenSettings, type QueenState } from './model';

const settings = (n: number, goal: Goal = 'first'): QueenSettings =>
  ({ ...nQueens.defaults, n, goal }) as QueenSettings;

/** Plain recursive backtracking, counting placements and backtracks the same way. */
function reference(n: number, all: boolean) {
  let placements = 0;
  let backtracks = 0;
  const solutions: number[][] = [];
  const q: number[] = [];
  const safe = (r: number, c: number) =>
    q.every((qc, qr) => qc !== c && Math.abs(qc - c) !== r - qr);
  const go = (r: number): boolean => {
    if (r === n) {
      solutions.push([...q]);
      return !all;
    }
    for (let c = 0; c < n; c++) {
      if (!safe(r, c)) continue;
      q.push(c);
      placements++;
      if (go(r + 1)) return true;
      q.pop();
      backtracks++;
    }
    return false;
  };
  go(0);
  return { placements, backtracks, solutions };
}

/** No two queens on the board attack each other. */
function legal(s: QueenState): boolean {
  return s.queens.every((c, r) =>
    s.queens.every((c2, r2) => r2 >= r || (c2 !== c && Math.abs(c2 - c) !== r - r2)),
  );
}

describe('n-queens', () => {
  it('finds the first solution of 4 queens after 8 placements and 4 backtracks', () => {
    const end = new Timeline(nQueens, settings(4), 1, [['solve']]).endState();
    expect(end.queens).toEqual([1, 3, 0, 2]);
    expect([end.placements, end.backtracks, end.solutions]).toEqual([8, 4, 1]);
  });

  it('counts every solution, stopping at each one from 7 queens on', () => {
    const counts: Record<number, number> = { 4: 2, 5: 10, 6: 4, 7: 40, 8: 92 };
    for (const n of [4, 5, 6, 7, 8]) {
      const t = new Timeline(nQueens, settings(n, 'all'), 1, [['solve']]);
      const want = reference(n, true);
      expect(t.endState().solutions).toBe(counts[n]);
      expect(t.endState().placements).toBe(want.placements);
      expect(t.endState().done).toBe(true);
      expect(t.endState().found).toEqual(want.solutions.slice(0, 12));
      if (n >= 7) expect(t.entries[0]!.steps).toHaveLength(counts[n]! + 1);
    }
  });

  it('shows a dead end before it backtracks, and marks the queen that attacks', () => {
    const t = new Timeline(nQueens, settings(4), 1, [['step'], ['step'], ['step']]);
    const third = t.entries[2]!.steps;
    const dead = third.find((s) => s.say.includes('dead end'))!;
    expect(dead.state.queens).toEqual([0, 2]);
    expect(dead.extra?.deadEnd).toBe(2);
    expect(third.at(-1)!.state.queens).toEqual([0]);
    const conflict = third.find((s) => s.extra?.trying)!;
    expect(conflict.level).toBe(3);
    expect(conflict.marks.map((m) => m.id)).toContain(`queen-${conflict.extra!.trying!.by}`);
  });

  it('says so when the search is over, and starts again after Clear', () => {
    const t = new Timeline(nQueens, settings(4, 'all'), 1, [
      ['solve'],
      ['solve'],
      ['clear'],
      ['step'],
    ]);
    expect(t.entries[1]!.steps).toHaveLength(1);
    expect(t.entries[1]!.steps[0]!.say).toContain('search is over');
    expect(t.endState().queens).toEqual([0]);
  });

  it('matches plain recursive backtracking, and every placement is legal when made', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 7 }),
        fc.constantFrom<Goal>('first', 'all'),
        fc.array(fc.constantFrom<OpCall>(['step'], ['solve'], ['clear']), { maxLength: 12 }),
        (n, goal, calls) => {
          const t = new Timeline(nQueens, settings(n, goal), 1, calls);
          const all = reference(n, true);
          for (let i = 0; i < t.length; i++) {
            const s = t.at(i).step.state;
            expect(legal(s)).toBe(true);
            expect(s.queens.length).toBeLessThanOrEqual(n);
            // Every queen ever placed is on the board or was taken back.
            expect(s.placements - s.backtracks).toBe(s.queens.length);
            expect(s.solutions).toBeLessThanOrEqual(all.solutions.length);
            for (const f of s.found) expect(all.solutions).toContainEqual(f);
          }
          // A search from an empty board agrees with the reference.
          t.entries.forEach((e, k) => {
            const before = k === 0 ? t.initial.state : t.entries[k - 1]!.end;
            if (e.call[0] !== 'solve' || before.placements !== 0 || before.done) return;
            const want = reference(n, goal === 'all');
            expect(e.end.placements).toBe(want.placements);
            expect(e.end.solutions).toBe(want.solutions.length);
            if (goal === 'first') expect(e.end.queens).toEqual(want.solutions[0]);
          });
        },
      ),
      { numRuns: 80 },
    );
  });

  it('takes the same moves one at a time as it does in one Solve', () => {
    for (const n of [4, 5, 6]) {
      const whole = new Timeline(nQueens, settings(n), 1, [['solve']]).endState();
      const moves = whole.placements + whole.backtracks;
      const stepped = new Timeline(
        nQueens,
        settings(n),
        1,
        Array.from({ length: moves }, () => ['step'] as OpCall),
      ).endState();
      expect(stepped).toEqual(whole);
    }
  });

  it('writes driver input that the code tabs can run', () => {
    expect(nQueens.code!.script([['step'], ['solve'], ['clear'], ['solve']], settings(4))).toEqual({
      input: ['first 4'],
      expected: ['2 4 1 3'],
    });
    expect(nQueens.code!.script([['solve']], settings(6, 'all'))).toEqual({
      input: ['count 6'],
      expected: ['4'],
    });
  });
});

describe('n-queens practice', () => {
  const kinds = nQueens.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'next-move',
      'safe-squares',
      'first-solution',
      'attackers',
    ]);
  });

  it('gets every answer right, checked against the reference', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const st = settings(Number(q.settings!.n), 'first');
        const before = new Timeline(nQueens, st, 1, q.setup).endState();
        const { queens, from } = before;
        const row = queens.length;
        const attacks = (c: number) =>
          queens.filter((qc, qr) => qc === c || Math.abs(qc - c) === row - qr).length;
        const a = q.answer;
        if (k.id === 'next-move') {
          if (a.kind !== 'choice') throw new Error('next-move is a choice');
          const safe = Array.from({ length: st.n }, (_, c) => c).filter(
            (c) => c >= from && attacks(c) === 0,
          );
          expect(a.options[a.correct]).toBe(
            safe.length
              ? `Put a queen in row ${row + 1}, column ${safe[0]! + 1}`
              : `Take back the queen in row ${row}`,
          );
        } else if (k.id === 'safe-squares') {
          expect(from).toBe(0);
          const safe = Array.from({ length: st.n }, (_, c) => c).filter((c) => attacks(c) === 0);
          expect(a).toEqual({ kind: 'number', value: safe.length });
        } else if (k.id === 'first-solution') {
          expect(a).toEqual({
            kind: 'sequence',
            value: reference(st.n, false).solutions[0]!.map((c) => String(c + 1)),
          });
        } else {
          expect(from).toBeLessThan(st.n);
          expect(a).toEqual({ kind: 'number', value: attacks(from) });
        }
      }
    }
  });
});
