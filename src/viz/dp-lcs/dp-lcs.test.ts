import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { dpLcs } from '.';
import { MAX_LEN, type LcsSettings } from './model';

const settings = (tie: LcsSettings['tie'] = 'up'): LcsSettings => ({ tie });

/** The reference: the LCS length of x[:i] and y[:j] by plain recursion with a memo. */
function refLength(x: string, y: string) {
  const memo = new Map<string, number>();
  const L = (i: number, j: number): number => {
    if (i === 0 || j === 0) return 0;
    const key = `${i},${j}`;
    if (!memo.has(key))
      memo.set(
        key,
        x[i - 1] === y[j - 1] ? L(i - 1, j - 1) + 1 : Math.max(L(i - 1, j), L(i, j - 1)),
      );
    return memo.get(key)!;
  };
  return L;
}

/** The walk back from the corner under a tie rule, using the reference lengths. */
function refWalk(x: string, y: string, tie: LcsSettings['tie']) {
  const L = refLength(x, y);
  let i = x.length;
  let j = y.length;
  const moves: string[] = [];
  let lcs = '';
  while (i > 0 && j > 0) {
    if (x[i - 1] === y[j - 1]) {
      moves.push(`${i},${j}:diag`);
      lcs = x[i - 1] + lcs;
      i--;
      j--;
    } else {
      const up = L(i - 1, j);
      const left = L(i, j - 1);
      const go = up === left ? tie : up > left ? 'up' : 'left';
      moves.push(`${i},${j}:${go}`);
      if (go === 'up') i--;
      else j--;
    }
  }
  return { lcs, moves };
}

const isSubsequence = (s: string, t: string) => {
  let k = 0;
  for (const ch of t) if (ch === s[k]) k++;
  return k === s.length;
};

const wordArb = (max = 7) =>
  fc.string({ unit: fc.constantFrom('A', 'B', 'C', 'D'), minLength: 1, maxLength: max });

const run = (tie: LcsSettings['tie'], ops: OpCall[]) => new Timeline(dpLcs, settings(tie), 1, ops);

describe('longest common subsequence', { timeout: 60_000 }, () => {
  it('fills every cell like the reference, row by row, and walks back to an LCS', () => {
    fc.assert(
      fc.property(
        wordArb(),
        wordArb(),
        fc.constantFrom('up' as const, 'left' as const),
        fc.integer({ min: 0, max: 3 }),
        (x, y, tie, rows) => {
          const ops: OpCall[] = [
            ['load', x, y],
            ...Array.from({ length: rows }, () => ['row'] as OpCall),
            ['fill'],
            ['trace'],
          ];
          const t = run(tie, ops);
          const L = refLength(x, y);
          let filled = 0;
          for (let s = 0; s < t.length; s++) {
            const { step } = t.at(s);
            if (step.state.x !== x) continue;
            const cells = step.state.c.flatMap((r, i) => r.map((v, j) => ({ v, i, j })));
            const now = cells.filter((c) => c.v !== null).length;
            expect(now).toBeGreaterThanOrEqual(filled);
            filled = now;
            for (const c of cells)
              if (c.v !== null) expect(c.v, `c[${c.i}][${c.j}]`).toBe(L(c.i, c.j));
            // Rows fill in order: a cell is filled only after every cell before it in its row
            // and the whole row above.
            for (const c of cells)
              if (c.v !== null && c.i > 0 && c.j > 0) {
                expect(step.state.c[c.i - 1]![c.j]).not.toBeNull();
                expect(step.state.c[c.i]![c.j - 1]).not.toBeNull();
              }
            // The walk moves to a neighbor up, left or diagonally, diagonally only on a match.
            const path = step.extra?.path ?? [];
            for (let k = 0; k + 1 < path.length; k++) {
              const [i, j] = path[k]!;
              const [ni, nj] = path[k + 1]!;
              expect([`${i - 1},${j - 1}`, `${i - 1},${j}`, `${i},${j - 1}`]).toContain(
                `${ni},${nj}`,
              );
              if (ni < i && nj < j) expect(x[i - 1]).toBe(y[j - 1]);
            }
          }
          const end = t.entries.at(-1)!.steps.at(-1)!;
          const lcs = String(end.vars?.lcs);
          expect(lcs).toHaveLength(L(x.length, y.length));
          expect(isSubsequence(lcs, x) && isSubsequence(lcs, y)).toBe(true);
          expect(lcs).toBe(refWalk(x, y, tie).lcs);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('finds BCBA with ties going up and BDAB with ties going left', () => {
    const lcs = (tie: LcsSettings['tie']) =>
      run(tie, [['load', 'ABCBDAB', 'BDCABA'], ['fill'], ['trace']])
        .entries.at(-1)!
        .steps.at(-1)!.vars?.lcs;
    expect(lcs('up')).toBe('BCBA');
    expect(lcs('left')).toBe('BDAB');
    const dna = run('up', [['load', 'ACCGGTCG', 'GTCGTTCG'], ['fill'], ['trace']]);
    expect(dna.entries.at(-1)!.steps.at(-1)!.vars).toMatchObject({ length: 5, lcs: 'CGTCG' });
  });

  it('refuses to walk back before the table is full, and keeps the table on bad input', () => {
    const t = run('up', [
      ['trace'],
      ['load', 'AB-C', 'XY'],
      ['load', 'A'.repeat(MAX_LEN + 1), 'B'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/^Fill the table first/);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
    const partial = run('up', [['row'], ['row'], ['trace']]);
    expect(partial.entries[2]!.steps[0]!.say).toMatch(/^Fill the table first/);
    const full = run('up', [['fill'], ['row'], ['fill']]);
    expect(full.entries[1]!.steps[0]!.say).toMatch(/^Every row is filled already/);
    expect(full.entries[2]!.steps[0]!.say).toMatch(/^The table is already full/);
  });

  it('follows the tie rule in its pseudocode', () => {
    const text = (tie: LcsSettings['tie']) =>
      dpLcs.pseudocode(settings(tie)).flatMap((b) => b.lines.map((l) => l.text));
    expect(text('up')).toContain('else if c[i - 1][j] >= c[i][j - 1]');
    expect(text('left')).toContain('else if c[i][j - 1] >= c[i - 1][j]');
  });
});

describe('longest common subsequence practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 500; seed++)
      for (const item of practiceSet(dpLcs, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(10);
    return out;
  }
  const words = (q: PracticeQuestion) => [String(q.setup[0]![1]), String(q.setup[0]![2])] as const;
  const tieOf = (q: PracticeQuestion) => (q.settings?.tie ?? 'up') as LcsSettings['tie'];

  it('expects the reference value of the asked cell', () => {
    for (const q of questions('cell')) {
      const [x, y] = words(q);
      const [, i, j] = /c\[(\d+)\]\[(\d+)\]\?/.exec(q.prompt)!.map(Number);
      expect(q.answer).toEqual({ kind: 'number', value: refLength(x, y)(i!, j!) });
    }
  });

  it('expects the move the reference walk makes', () => {
    for (const q of questions('next-move')) {
      const [x, y] = words(q);
      const [, i, j] = /reaches c\[(\d+)\]\[(\d+)\]/.exec(q.prompt)!.map(Number);
      const move = refWalk(x, y, tieOf(q)).moves.find((m) => m.startsWith(`${i},${j}:`))!;
      if (q.answer.kind !== 'choice') throw new Error('not a choice');
      const picked = q.answer.options[q.answer.correct]!;
      const want = move.endsWith('diag') ? 'Diagonally' : move.endsWith('up') ? 'Up' : 'Left';
      expect(picked.startsWith(want)).toBe(true);
    }
  });

  it('expects the LCS the reference walk finds, and its length', () => {
    for (const q of questions('lcs')) {
      const [x, y] = words(q);
      expect(q.answer).toEqual({ kind: 'sequence', value: [refWalk(x, y, tieOf(q)).lcs] });
    }
    for (const q of questions('length')) {
      const [x, y] = words(q);
      expect(q.answer).toEqual({ kind: 'number', value: refLength(x, y)(x.length, y.length) });
    }
  });
});
