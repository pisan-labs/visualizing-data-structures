import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deadlockCycle, findCycle, waitFor } from './deadlock';
import {
  countOutcomes,
  CUT_OFF,
  findSchedule,
  initState,
  interleavings,
  outcomeOf,
  run,
  runnable,
  schedules,
  step,
  stuck,
  type MachineState,
  type Program,
} from './machine';
import { describeMachine, noteFor, pageStep, threadBlock } from './page';
import { formatProgram, parseProgram } from './parse';

function prog(text: string): Program {
  const p = parseProgram(text);
  if (p instanceof Error) throw p;
  return p;
}

const increments = (threads: number, times: number) =>
  prog(
    [
      'shared count = 0',
      ...Array.from({ length: threads }, (_, t) => [
        `thread T${t + 1}`,
        ...Array.from({ length: times }, () => ['r = count', 'r = r + 1', 'count = r']).flat(),
      ]).flat(),
    ].join('\n'),
  );

const RACE = increments(2, 1);

const LOCKED = prog(`
shared count = 0
thread T1
  lock(m)
  r = count
  r = r + 1
  count = r
  unlock(m)
thread T2
  lock(m)
  r = count
  r = r + 1
  count = r
  unlock(m)
`);

const OPPOSITE = prog(`
thread T1
  lock(a)
  lock(b)
  unlock(b)
  unlock(a)
thread T2
  lock(b)
  lock(a)
  unlock(a)
  unlock(b)
`);

const count = (s: MachineState) => s.mem.count!;

describe('parse', () => {
  it('reads every kind of step', () => {
    const p = prog(`
      shared x = 0, flag = 1   # two variables
      sem s = 1, t = 0
      thread A:
        r = x
        r = r + 1; r = r - 2
        x = r
        x = 5
        c = r < 3
        top: if c goto top
        if flag == 0 goto end
        goto end
        end:
      thread B
        lock m
        wait(cv, m)
        signal(cv); broadcast cv
        unlock(m)
        P(s); V t
        ok = cas(x, 0, 1)
        print(ok); print("hi")
        done
    `);
    expect(p.threads.map((t) => t.name)).toEqual(['A', 'B']);
    expect(p.shared).toEqual([
      { name: 'x', init: 0 },
      { name: 'flag', init: 1 },
    ]);
    expect(p.sems.map((s) => s.name)).toEqual(['s', 't']);
    expect(p.locks).toEqual(['m']);
    expect(p.conds).toEqual(['cv']);
    expect(p.threads[0]!.code.map((i) => i.kind)).toEqual([
      'load',
      'add',
      'add',
      'store',
      'store',
      'compare',
      'jump',
      'jump',
      'jump',
    ]);
    expect(p.threads[0]!.labels).toEqual({ top: 6, end: 9 });
    expect(p.threads[0]!.regs).toEqual(['r', 'c']);
    expect(p.threads[1]!.code.map((i) => i.text)).toEqual([
      'lock(m)',
      'wait(cv, m)',
      'signal(cv)',
      'broadcast(cv)',
      'unlock(m)',
      'P(s)',
      'V(t)',
      'ok = cas(x, 0, 1)',
      'print(ok)',
      'print("hi")',
      'done',
    ]);
  });

  it('formats a program it can read back', () => {
    for (const p of [RACE, LOCKED, OPPOSITE, increments(3, 2)])
      expect(parseProgram(formatProgram(p))).toEqual(p);
    const loop = prog('shared f = 0; thread T1; spin: if f == 0 goto spin; thread T2; f = 1');
    expect(parseProgram(formatProgram(loop))).toEqual(loop);
  });

  it('refuses a step that touches shared memory twice, and says why', () => {
    const bad = parseProgram('shared count = 0\nthread T1\n  count = count + 1');
    expect(bad).toBeInstanceOf(Error);
    expect((bad as Error).message).toMatch(/^Line 3: .*more than once/);
    expect(parseProgram('shared a = 0, b = 0; thread T1; a = b')).toBeInstanceOf(Error);
  });

  it('names what is wrong', () => {
    const msg = (t: string) => (parseProgram(t) as Error).message;
    expect(msg('r = 1')).toMatch(/thread T1/);
    expect(msg('thread T1; goto nowhere')).toMatch(/no label nowhere/);
    expect(msg('thread T1; P(s)')).toMatch(/sem s = 1/);
    expect(msg('thread T1; lock(m); r = m')).toMatch(/lock/);
    expect(msg('thread T1; r = 1 $ 2')).toMatch(/"\$"/);
    expect(msg('thread T1; thread T1')).toMatch(/two threads/);
    expect(msg('')).toMatch(/at least one thread/);
  });
});

describe('step', () => {
  it('runs load, add and store, each thread with its own register', () => {
    let s = initState(RACE);
    for (const t of [0, 1]) {
      const r = step(RACE, s, t);
      if (!r.ok) throw new Error(r.message);
      expect(r.event.read).toBe('count');
      s = r.state;
    }
    expect(s.threads.map((t) => t.regs.r)).toEqual([0, 0]);
    s = run(RACE, [0, 0, 1, 1], s).state;
    expect(count(s)).toBe(1);
    expect(s.threads.every((t) => t.status === 'done')).toBe(true);
    expect(s.schedule).toEqual([0, 1, 0, 0, 1, 1]);
  });

  it('says why a thread cannot run', () => {
    const done = run(RACE, [0, 0, 0]).state;
    const r = step(RACE, done, 0);
    expect(r).toMatchObject({ ok: false, reason: 'done' });
    expect(step(RACE, done, 5)).toMatchObject({ ok: false, reason: 'no-thread' });
    const held = run(LOCKED, [0, 1]).state;
    expect(held.threads[1]!.status).toBe('blocked');
    expect(step(LOCKED, held, 1)).toMatchObject({ ok: false, reason: 'blocked' });
    const stopped = run(RACE, [0, 0, 0, 0]);
    expect(stopped.stopped).toMatchObject({ at: 3, reason: 'done' });
  });

  it('hands a lock to the first thread in line', () => {
    const s = run(LOCKED, [0, 1, 0, 0, 0]).state;
    expect(s.locks.m).toEqual({ holder: 0, waiters: [1] });
    const r = step(LOCKED, s, 0);
    if (!r.ok) throw new Error(r.message);
    expect(r.event.woke).toEqual([1]);
    expect(r.state.locks.m).toEqual({ holder: 1, waiters: [] });
    expect(r.state.threads[1]).toMatchObject({ status: 'ready', pc: 1 });
  });

  it('faults on unlocking a lock the thread does not hold', () => {
    const p = prog('thread T1; unlock(m)');
    const r = step(p, initState(p), 0);
    expect(r.ok && r.state.threads[0]!.status).toBe('fault');
    expect(outcomeOf(p, (r as { state: MachineState }).state)).toBe('fault');
  });

  it('counts a semaphore below zero by its waiting threads', () => {
    const p = prog(
      'sem s = 0\nthread T1\n  P(s)\n  print("a")\nthread T2\n  P(s)\nthread T3\n  V(s)\n  V(s)',
    );
    let s = run(p, [0, 1]).state;
    expect(s.sems.s).toEqual({ value: -2, waiters: [0, 1] });
    s = run(p, [2], s).state;
    expect(s.sems.s).toEqual({ value: -1, waiters: [1] });
    expect(runnable(s)).toEqual([0, 2]);
    s = run(p, [0, 2], s).state;
    expect(s.out).toEqual([{ thread: 0, text: 'a' }]);
    expect(s.threads.every((t) => t.status === 'done')).toBe(true);
  });

  it('wakes a waiter on signal, which needs the lock back, and loses a signal with no waiter', () => {
    const p = prog(`
      shared ready = 0
      thread W
        lock(m)
        wait(c, m)
        unlock(m)
      thread S
        lock(m)
        ready = 1
        signal(c)
        unlock(m)
    `);
    let s = run(p, [0, 0]).state; // W waits and lets go of m
    expect(s.conds.c!.waiters).toEqual([0]);
    expect(s.locks.m!.holder).toBe(null);
    s = run(p, [1, 1, 1], s).state; // S signals while holding m
    expect(s.threads[0]).toMatchObject({ status: 'blocked', on: { kind: 'lock', name: 'm' } });
    s = run(p, [1], s).state; // S unlocks: W gets m and its wait returns
    expect(s.locks.m!.holder).toBe(0);
    expect(s.threads[0]).toMatchObject({ status: 'ready', pc: 2 });
    // Signal first: nobody is waiting, so W sleeps for ever.
    const lost = run(p, [1, 1, 1, 1, 0, 0]).state;
    expect(stuck(lost)).toBe(true);
    expect(outcomeOf(p, lost)).toBe('ready = 1, stuck');
  });

  it('runs compare-and-swap as one step', () => {
    const p = prog('shared x = 0\nthread T1\n  ok = cas(x, 0, 1)\nthread T2\n  ok = cas(x, 0, 2)');
    const s = run(p, [1, 0]).state;
    expect(s.mem.x).toBe(2);
    expect(s.threads.map((t) => t.regs.ok)).toEqual([0, 1]);
  });
});

describe('interleavings', () => {
  it('finds all 20 of two 3-step threads: 2 end at 2, 18 lose an update', () => {
    const all = interleavings(RACE, { outcome: (s) => String(count(s)) });
    expect(all.complete).toBe(true);
    expect(all.runs).toHaveLength(20);
    expect(schedules([3, 3])).toBe(20);
    expect(Object.fromEntries(all.outcomes.map((o) => [o.outcome, o.count]))).toEqual({
      '2': 2,
      '1': 18,
    });
    expect(all.outcomes[0]!.first).toEqual([0, 0, 0, 1, 1, 1]);
    expect(new Set(all.runs.map((r) => r.schedule.join(''))).size).toBe(20);
  });

  it('stops at the cap and says so', () => {
    const some = interleavings(increments(2, 2), { cap: 100 });
    expect(some.runs).toHaveLength(100);
    expect(some.complete).toBe(false);
    expect(interleavings(increments(2, 2), { cap: 924 }).complete).toBe(true);
  });

  it('counts by state what it would list by schedule', () => {
    for (const [k, n] of [
      [2, 1],
      [2, 2],
      [3, 1],
    ] as const) {
      const p = increments(k, n);
      const listed = interleavings(p, { cap: 5000 });
      const counted = countOutcomes(p);
      expect(counted.total).toBe(schedules(Array(k).fill(3 * n)));
      expect(counted.total).toBe(listed.runs.length);
      expect(counted.outcomes).toEqual(
        listed.outcomes.map(({ outcome, count }) => ({ outcome, count })),
      );
    }
    const big = countOutcomes(increments(3, 2), { outcome: (s) => String(count(s)) });
    expect(big.total).toBe(17153136);
    expect(big.outcomes.map((o) => o.outcome).sort()).toEqual(['2', '3', '4', '5', '6']);
  });

  it('blocked threads take no steps: a lock removes the lost update', () => {
    const all = interleavings(LOCKED);
    expect(all.outcomes.map((o) => o.outcome)).toEqual(['count = 2']);
    // Each run is 10 steps plus one for every time T2 (or T1) found the lock held.
    for (const r of all.runs) expect(r.schedule.length).toBeGreaterThanOrEqual(10);
  });

  it('cuts off spinning schedules at the step limit', () => {
    const p = prog('shared f = 0\nthread T1\n  spin: if f == 0 goto spin\nthread T2\n  f = 1');
    const all = interleavings(p, { maxSteps: 6 });
    expect(all.complete).toBe(true);
    expect(all.outcomes.find((o) => o.outcome === CUT_OFF)?.count).toBe(2);
    expect(countOutcomes(p, { maxSteps: 6 }).total).toBe(all.runs.length);
  });

  it('every listed outcome comes from a sequence of single steps', () => {
    const programs = [RACE, increments(3, 1), LOCKED, OPPOSITE];
    fc.assert(
      fc.property(
        fc.constantFrom(...programs),
        fc.nat({ max: 10_000 }),
        fc.array(fc.nat({ max: 3 }), { maxLength: 4 }),
        (p, pick, prefix) => {
          // Start from a state some single steps reach, then check one listed run.
          let from = initState(p);
          for (const t of prefix) {
            const r = step(p, from, t % p.threads.length);
            if (r.ok) from = r.state;
          }
          const all = interleavings(p, { from, cap: 500 });
          const r = all.runs[pick % all.runs.length]!;
          let s = from;
          for (const t of r.schedule) {
            expect(runnable(s)).toContain(t);
            const res = step(p, s, t);
            expect(res.ok).toBe(true);
            if (res.ok) s = res.state;
          }
          expect(runnable(s)).toEqual([]);
          expect(outcomeOf(p, s)).toBe(r.outcome);
          expect(s.schedule).toEqual([...from.schedule, ...r.schedule]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('finds a schedule that reaches a goal', () => {
    const lowest = findSchedule(increments(2, 2), (s) => count(s) === 2)!;
    expect(count(run(increments(2, 2), lowest).state)).toBe(2);
    expect(findSchedule(LOCKED, (s) => count(s) === 1)).toBeNull();
    expect(findSchedule(increments(3, 2), (s) => count(s) === 2)).not.toBeNull();
  });
});

describe('deadlock', () => {
  it('finds the cycle of two locks taken in opposite orders', () => {
    const s = run(OPPOSITE, [0, 1, 0, 1]).state;
    expect(stuck(s)).toBe(true);
    expect(waitFor(s).edges).toEqual([
      [0, 1, 'b'],
      [1, 0, 'a'],
    ]);
    expect(deadlockCycle(s)).toEqual([0, 1]);
    const outcomes = interleavings(OPPOSITE).outcomes.map((o) => o.outcome);
    expect(outcomes).toEqual(['done', 'stuck']);
  });

  it('sees a thread that locks its own lock as a cycle of one', () => {
    const p = prog('thread T1\n  lock(m)\n  lock(m)');
    expect(deadlockCycle(run(p, [0, 0]).state)).toEqual([0]);
  });

  it('searches as CLRS does: gray on entry, black when done, a back edge closes a cycle', () => {
    const { cycle, trace } = findCycle(4, [
      [0, 1],
      [1, 2],
      [3, 1],
      [2, 3],
    ]);
    expect(cycle).toEqual([1, 2, 3]);
    expect(trace.map((e) => e.kind)).toEqual([
      'enter',
      'edge',
      'enter',
      'edge',
      'enter',
      'edge',
      'enter',
      'edge',
    ]);
    expect(trace.at(-1)).toEqual({ kind: 'edge', from: 3, to: 1, edge: 'back' });
    expect(
      findCycle(3, [
        [0, 1],
        [1, 2],
      ]).cycle,
    ).toBeNull();
  });
});

describe('page helpers', () => {
  it('pageStep narrates, marks and points at the pseudocode line', () => {
    const r = pageStep(LOCKED, run(LOCKED, [0]).state, 1);
    if (!r.ok) throw new Error(r.say);
    expect(r.event.blocked).toEqual({ kind: 'lock', name: 'm' });
    expect(r.lines).toEqual(['t2.0']);
    expect(r.say).toBe('T2 tries to lock m, but T1 holds it, so T2 waits.');
    expect(r.marks).toContainEqual({ id: 'pc-1', role: 'compare' });
    const again = pageStep(LOCKED, r.state, 1);
    expect(again).toMatchObject({ ok: false, reason: 'blocked' });
    expect(again.marks).toEqual([{ id: 'pc-1', role: 'compare' }]);
  });

  it('writes a pseudocode block per thread, with plain English for every step', () => {
    const b = threadBlock(LOCKED, 0, 't1');
    expect(b.lines.map((l) => l.id)).toEqual(['t1.0', 't1.1', 't1.2', 't1.3', 't1.4']);
    expect(b.lines[0]!.plain).toBe('Take lock m, or wait in line until it is free.');
    expect(b.lines.every((l) => l.plain.length > 0)).toBe(true);
  });

  it('notes and describes a state in words', () => {
    const s = run(LOCKED, [0, 1]).state;
    expect(noteFor(s, 1)).toBe('waits for m');
    expect(describeMachine(LOCKED, s)).toContain('lock m held by T1');
  });
});
