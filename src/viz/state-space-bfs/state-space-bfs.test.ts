import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { stateSpaceBfs as def } from '.';
import { naiveCost, patternCost, search, type SSSettings, type SSState } from './model';

/** The reference: build the whole graph first, then a plain BFS over it. */
function refLock(barred: string[], goal: string): number {
  const bar = new Set(barred);
  const all = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
  const adj = new Map<string, string[]>();
  for (const s of all) {
    const a = Number(s[0]);
    const b = Number(s[1]);
    adj.set(
      s,
      [`${(a + 1) % 10}${b}`, `${(a + 9) % 10}${b}`, `${a}${(b + 1) % 10}`, `${a}${(b + 9) % 10}`].filter(
        (t) => !bar.has(t),
      ),
    );
  }
  return bfs('00', goal, adj);
}

function refWords(words: string[], goal: string): number {
  const adj = new Map<string, string[]>();
  for (const w of words)
    adj.set(
      w,
      words.filter((v) => v !== w && [...v].filter((c, i) => c !== w[i]).length === 1),
    );
  return bfs(words[0]!, goal, adj);
}

function bfs(start: string, goal: string, adj: Map<string, string[]>): number {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    const u = queue[h]!;
    for (const v of adj.get(u) ?? [])
      if (!dist.has(v)) {
        dist.set(v, dist.get(u)! + 1);
        queue.push(v);
      }
  }
  return dist.get(goal) ?? -1;
}

const combo = fc.integer({ min: 1, max: 99 }).map((n) => String(n).padStart(2, '0'));
const lock = fc.record({
  barred: fc.uniqueArray(combo, { minLength: 1, maxLength: 10 }),
  goal: combo,
});
const POOL = 'cat cot cog dog dot hot hat hit cut cub dub tab tub tot'.split(' ');
const words = fc
  .uniqueArray(fc.constantFrom(...POOL), { minLength: 2, maxLength: 8 })
  .chain((ws) => fc.record({ words: fc.constant(ws), goal: fc.constantFrom(...ws) }));
const approaches = fc.constantFrom('pattern' as const, 'naive' as const);

function runSteps(settings: SSSettings, list: string[], goal: string) {
  const t = new Timeline(def, settings, 1, [
    ['load', list.join(' ')],
    ['search', goal],
  ]);
  return t.entries[1]!.steps;
}

function checkSteps(steps: ReturnType<typeof runSteps>, naive: boolean) {
  // The naive way's entries only ever grow, so its last step covers every earlier one.
  for (const step of naive ? steps.slice(-1) : steps) {
    const e = step.extra;
    if (!e) continue;
    expect(e.head).toBeLessThanOrEqual(e.made);
    const live = e.entries.slice(0, e.made);
    const states = live.map((x) => x.state);
    // With a visited set every state is found once; without, a state can come back.
    if (!naive) expect(new Set(states).size).toBe(states.length);
    live.forEach((x, i) => {
      if (i > 0) expect(x.d).toBeGreaterThanOrEqual(live[i - 1]!.d);
      if (x.parent !== null) expect(x.d).toBe(e.entries[x.parent]!.d + 1);
    });
  }
}

describe('state-space-bfs', () => {
  it('finds the reference distance on a lock, both ways', () => {
    fc.assert(
      fc.property(lock, approaches, ({ barred, goal }, approach) => {
        fc.pre(!barred.includes(goal));
        const steps = runSteps({ approach, puzzle: 'lock' }, barred, goal);
        const last = steps.at(-1)!;
        const want = refLock(barred, goal);
        if (last.extra!.outcome !== 'stopped') expect(last.vars?.distance).toBe(want);
        else expect(approach).toBe('naive');
        checkSteps(steps, approach === 'naive');
      }),
      { numRuns: 120 },
    );
  });

  it('finds the reference distance through a word list, both ways', () => {
    fc.assert(
      fc.property(words, approaches, ({ words, goal }, approach) => {
        const steps = runSteps({ approach, puzzle: 'words' }, words, goal);
        const last = steps.at(-1)!;
        if (last.extra!.outcome !== 'stopped') expect(last.vars?.distance).toBe(refWords(words, goal));
        checkSteps(steps, approach === 'naive');
      }),
      { numRuns: 200 },
    );
  });

  it('counts the naive work without running it, and the counters agree', () => {
    fc.assert(
      fc.property(lock, ({ barred, goal }) => {
        const s: SSState = { wheels: 2, barred, words: ['aa', 'ab'] };
        fc.pre(!barred.includes(goal));
        const d = patternCost(s, 'lock', goal).distance;
        fc.pre(d >= 0 && d <= 5);
        const run = search(s, 'lock', goal, 'naive', Infinity);
        let moves = 0;
        for (const x of run.expansions) moves += x.made;
        expect(naiveCost(s, 'lock', goal)).toEqual({ states: run.expansions.length, moves });
        // The live counters end at the pattern's own cost.
        const last = runSteps({ approach: 'pattern', puzzle: 'lock' }, barred, goal).at(-1)!;
        const p = patternCost(s, 'lock', goal);
        expect(last.vars?.states).toBe(p.states);
        expect(last.vars?.moves).toBe(p.moves);
        expect(last.vars?.['pattern total']).toBe(p.states + p.moves);
      }),
      { numRuns: 150 },
    );
  });

  it('stops the naive way when the goal cannot be reached', () => {
    const steps = runSteps({ approach: 'naive', puzzle: 'words' }, ['cat', 'cot', 'pig'], 'pig');
    const last = steps.at(-1)!;
    expect(last.extra!.outcome).toBe('stopped');
    expect(last.vars?.['naive total']).toBe(Infinity);
    expect(last.say).toMatch(/never stop/);
  });

  it('refuses goals and lists it cannot use', () => {
    const t = new Timeline(def, { approach: 'pattern', puzzle: 'lock' }, 1, [
      ['search', '123'],
      ['search', '11'],
      ['load', '00 12'],
      ['load', '12 345'],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toMatch(/2 wheels/);
    expect(t.entries[1]!.steps[0]!.say).toMatch(/barred/);
    expect(t.entries[2]!.steps[0]!.say).toMatch(/where the lock starts/);
    expect(t.entries[3]!.steps[0]!.say).toMatch(/same number of wheels/);
    const w = new Timeline(def, { approach: 'pattern', puzzle: 'words' }, 1, [
      ['search', 'frog'],
      ['load', 'cat dogs'],
    ]);
    expect(w.entries[0]!.steps[0]!.say).toMatch(/not in the word list/);
    expect(w.entries[1]!.steps[0]!.say).toMatch(/same length/);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(def, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(def, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
