import { afterEach, describe, expect, it, vi } from 'vitest';
import { canCompare, keepShared, sharedControls, sharedOps } from '../engine/compare';
import type { AnyVizDef, OpCall } from '../engine/types';
import { vizzes } from '../viz/all';
import { Pair } from './pair.svelte';
import { Session } from './session.svelte';

const byId = (id: string): AnyVizDef => {
  const def = vizzes.find((d) => d.id === id);
  if (!def) throw new Error(`no page ${id}`);
  return def;
};

describe('which pages can be compared', () => {
  it('needs the second page to run the first one’s main operation', () => {
    expect(canCompare(byId('stack-array'), byId('stack-list'))).toBe(true);
    expect(canCompare(byId('bst'), byId('bst'))).toBe(true);
    // A stack and a queue share nothing that matters.
    expect(canCompare(byId('stack-array'), byId('queue-array'))).toBe(false);
  });

  it('shares only operations with the same name and number of values', () => {
    const shared = sharedOps(byId('stack-array'), byId('stack-list'));
    expect(shared.has('push')).toBe(true);
    expect(shared.has('pop')).toBe(true);
    const calls: OpCall[] = [['push', 1], ['nonsense'], ['pop']];
    expect(keepShared(calls, shared)).toEqual([['push', 1], ['pop']]);
  });

  it('offers only buttons both pages understand', () => {
    const a = byId('linked-list');
    const b = byId('doubly-linked-list');
    const shared = sharedOps(a, b);
    const controls = sharedControls(a, b);
    expect(controls.buttons.length).toBeGreaterThan(0);
    for (const button of controls.buttons) expect(shared.has(button.op)).toBe(true);
  });
});

describe('a pair of sessions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (a = 'stack-array', b = 'stack-list') => {
    const opts = { speed: 1, detail: 3 as const };
    return new Pair(new Session(byId(a), opts), new Session(byId(b), opts));
  };
  const ends = (s: Session) => s.timeline.entries.map((_, k) => s.timeline.endOf(k));

  it('keeps the same operations on both sides', () => {
    vi.useFakeTimers();
    const pair = make();
    pair.fill([
      ['push', 1],
      ['push', 2],
    ]);
    pair.run([['pop'], ['push', 3]]);
    pair.pause();
    expect(pair.a.timeline.calls).toEqual(pair.b.timeline.calls);
    expect(pair.a.timeline.calls).toHaveLength(4);
    pair.destroy();
  });

  it('runs new operations after the side that is further along', () => {
    vi.useFakeTimers();
    const pair = make();
    pair.fill([
      ['push', 1],
      ['push', 2],
      ['push', 3],
    ]);
    // The second side lags one operation behind; nothing either side holds may be dropped.
    pair.b.jump(pair.b.timeline.endOf(1));
    pair.run([['pop']]);
    pair.pause();
    expect(pair.a.timeline.calls).toEqual(pair.b.timeline.calls);
    expect(pair.a.timeline.calls).toHaveLength(4);
    pair.destroy();
  });

  it('steps forward without either side running ahead into the next operation', () => {
    const pair = make();
    pair.fill([['push', 1], ['push', 2], ['pop']]);
    // The two pages take different numbers of steps, so one side really has to wait.
    const lengths = (s: Session) => s.timeline.entries.map((e) => e.steps.length);
    expect(lengths(pair.a)).not.toEqual(lengths(pair.b));
    pair.a.jump(0);
    pair.b.jump(0);
    const seen: string[] = [];
    for (let guard = 0; !pair.atEnd && guard < 500; guard++) {
      pair.stepForward();
      expect(Math.abs(pair.a.current.op - pair.b.current.op)).toBeLessThanOrEqual(1);
      seen.push(`${pair.a.cursor},${pair.b.cursor}`);
    }
    expect(pair.atEnd).toBe(true);
    // Both sides stop together at the end of every operation.
    const ea = ends(pair.a);
    const eb = ends(pair.b);
    for (let k = 0; k < ea.length; k++) expect(seen).toContain(`${ea[k]},${eb[k]}`);
    pair.destroy();
  });

  it('steps back the same way, and jumps by operation together', () => {
    const pair = make();
    pair.fill([['push', 1], ['push', 2], ['pop']]);
    const seen: string[] = [];
    for (let guard = 0; !pair.atStart && guard < 500; guard++) {
      pair.stepBack();
      seen.push(`${pair.a.cursor},${pair.b.cursor}`);
    }
    expect(pair.a.cursor).toBe(0);
    expect(pair.b.cursor).toBe(0);
    const ea = ends(pair.a);
    const eb = ends(pair.b);
    for (let k = 0; k < ea.length - 1; k++) expect(seen).toContain(`${ea[k]},${eb[k]}`);

    pair.nextOp();
    pair.nextOp();
    expect([pair.a.cursor, pair.b.cursor]).toEqual([ea[1], eb[1]]);
    pair.prevOp();
    expect([pair.a.cursor, pair.b.cursor]).toEqual([ea[0], eb[0]]);
    pair.destroy();
  });

  it('plays to the end of both sides', () => {
    vi.useFakeTimers();
    const pair = make('bst', 'bst');
    pair.b.setSettings({ ...pair.b.settings });
    pair.fill([
      ['insert', 5],
      ['insert', 3],
      ['insert', 8],
    ]);
    pair.a.jump(0);
    pair.b.jump(0);
    pair.play();
    vi.runAllTimers();
    expect(pair.playing).toBe(false);
    expect(pair.atEnd).toBe(true);
    pair.destroy();
  });

  it('queues operations run while playing after the last one', () => {
    vi.useFakeTimers();
    const pair = make();
    pair.run([
      ['push', 1],
      ['push', 2],
      ['push', 3],
    ]);
    expect(pair.playing).toBe(true);
    pair.run([['pop']]);
    expect(pair.a.timeline.calls).toEqual([['push', 1], ['push', 2], ['push', 3], ['pop']]);
    expect(pair.b.timeline.calls).toEqual(pair.a.timeline.calls);
    pair.destroy();
  });
});

describe('a session', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const pushes: OpCall[] = [
    ['push', 1],
    ['push', 2],
    ['push', 3],
  ];

  it('queues operations run while playing after the last one', () => {
    vi.useFakeTimers();
    const s = new Session(byId('stack-array'), { speed: 1, detail: 2 });
    s.run(pushes);
    expect(s.playing).toBe(true);
    expect(s.current.op).toBe(0);
    s.run([['pop']]);
    expect(s.timeline.calls).toEqual([...pushes, ['pop']]);
    s.destroy();
  });

  it('replaces what follows the operation on screen when paused, as after an undo', () => {
    vi.useFakeTimers();
    const s = new Session(byId('stack-array'), { speed: 1, detail: 2 });
    s.fill(pushes);
    s.jump(s.timeline.endOf(0));
    s.run([['pop']]);
    expect(s.timeline.calls).toEqual([['push', 1], ['pop']]);
    s.destroy();
  });
});
