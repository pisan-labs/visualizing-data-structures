import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { pcpDef, randomDominoes } from '.';
import {
  defaults,
  formatInstance,
  mismatchAt,
  parseInstance,
  type Domino,
  type PcpSettings,
} from './model';

const run = (text: string, settings: Partial<PcpSettings> = {}, ...more: [string, ...string[]][]) =>
  new Timeline(pcpDef, { ...defaults, ...settings } as PcpSettings, 1, [
    ['load', text],
    ['search'],
    ...more,
  ]);

const spell = (ds: Domino[], seq: number[], side: 'top' | 'bottom') =>
  seq.map((i) => ds[i]![side]).join('');

/** The reference: every sequence of up to `bound` dominoes, shortest first, in number order. */
function firstMatch(ds: Domino[], bound: number): number[] | null {
  let level: number[][] = [[]];
  for (let d = 1; d <= bound; d++) {
    const next: number[][] = [];
    for (const s of level)
      for (let i = 0; i < ds.length; i++) {
        const t = [...s, i];
        if (spell(ds, t, 'top') === spell(ds, t, 'bottom')) return t;
        next.push(t);
      }
    level = next;
  }
  return null;
}

describe('post correspondence', () => {
  it("finds Sipser's match 2 1 3 2 4", () => {
    const r = new Timeline(pcpDef, defaults, 1, [['search']]).endState().search!;
    expect(r.found).toEqual([1, 0, 2, 1, 3]);
  });

  it('proves no match when every branch dies, and only then', () => {
    const r = run('abc/ab ca/a acc/ba').endState().search!;
    expect(r.over).toBe('empty');
    expect(r.cut).toBe(0);
    const cut = run('aa/a ab/b').endState().search!;
    expect(cut.over).toBe('empty');
    expect(cut.cut).toBeGreaterThan(0);
  });

  it('skips a repeated overhang and so proves a/ab ba/ab has no match', () => {
    const plain = run('a/ab ba/ab').endState().search!;
    expect(plain.cut).toBe(1);
    const memo = run('a/ab ba/ab', { memo: true }).endState().search!;
    expect(memo).toMatchObject({ over: 'empty', cut: 0, skipped: 1 });
  });

  it('finds the 12-domino match only with a bound of 12', () => {
    expect(run('aa/baa ab/aaa aba/a').endState().search!.found).toBeNull();
    const r = run('aa/baa ab/aaa aba/a', { bound: 12 }).endState().search!;
    expect(r.found).toHaveLength(12);
    expect(r.expanded).toBe(17);
  });

  it('for the modified problem starts only with domino 1', () => {
    const r = run('b/ca a/ab ca/a abc/c', { first: 'first' }).endState().search!;
    expect(r).toMatchObject({ over: 'empty', cut: 0, expanded: 1 });
  });

  it('checks a sequence with Try', () => {
    const t = new Timeline(pcpDef, defaults, 1, [
      ['try', '2 1 3 2 4'],
      ['try', '2 3'],
      ['try', '9'],
    ]);
    expect(t.entries[0]!.end.check).toMatchObject({ verdict: 'match', top: 'abcaaabc' });
    expect(t.entries[1]!.end.check).toMatchObject({ verdict: 'dead', at: 1 });
    expect(t.entries[2]!.steps.at(-1)!.say).toContain('There is no domino 9');
  });

  it('finds the first match in breadth-first order, as a brute force does (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 2, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        fc.boolean(),
        (seed, n, bound, dfs) => {
          const ds = randomDominoes(makeRng(seed), n);
          const text = formatInstance(ds);
          const t = run(text, { bound, method: dfs ? 'dfs' : 'bfs' });
          const r = t.endState().search!;
          const want = firstMatch(ds, bound);
          if (dfs) {
            expect(r.found === null, text).toBe(want === null);
            if (r.found) expect(spell(ds, r.found, 'top')).toBe(spell(ds, r.found, 'bottom'));
          } else expect(r.found, text).toEqual(want);
          for (const st of t.entries[1]!.steps) {
            const s = st.state.search!;
            for (const p of s.frontier) {
              expect(p.seq.length).toBeLessThan(bound);
              expect(mismatchAt(p.top, p.bottom)).toBe(-1);
              expect(p.top).toBe(spell(ds, p.seq, 'top'));
            }
            if (s.tried?.verdict === 'dead')
              expect(mismatchAt(s.tried.top, s.tried.bottom)).toBe(s.tried.at);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('reads dominoes and refuses what it cannot use', () => {
    expect(parseInstance('[b/ca], [a/ab]')).toEqual([
      { top: 'b', bottom: 'ca' },
      { top: 'a', bottom: 'ab' },
    ]);
    expect((parseInstance('ab') as Error).message).toContain('not a domino');
    expect((parseInstance('abcdef/a') as Error).message).toContain('5 symbols');
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = pcpDef.code!.script(
      [['search'], ['try', '2 1 3'], ['load', 'abc/ab ca/a acc/ba'], ['search'], ['try', 'x']],
      defaults,
    );
    expect(input).toEqual([
      'dominoes b/ca a/ab ca/a abc/c',
      'search 6',
      'try 2 1 3',
      'dominoes abc/ab ca/a acc/ba',
      'search 6',
    ]);
    expect(expected).toEqual(['match 2 1 3 2 4', 'alive bottom +a', 'no match']);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(pcpDef, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(pcpDef, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
