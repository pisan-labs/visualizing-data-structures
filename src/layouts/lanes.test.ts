import { describe, expect, it } from 'vitest';
import { LAPTOP_STAGE, PHONE_STAGE } from '../render/stage';
import { initState, run, type Program } from '../viz/_threads/machine';
import { lanesInput } from '../viz/_threads/page';
import { parseProgram } from '../viz/_threads/parse';
import { drawLanes, endId, lockId, pcId, semId, stepId, varId } from './lanes';

function prog(text: string): Program {
  const p = parseProgram(text);
  if (p instanceof Error) throw p;
  return p;
}

const P = prog(`
shared count = 0
sem s = 1
thread T1
  lock(m)
  r = count
  r = r + 1
  count = r
  unlock(m)
  print(r)
thread T2
  P(s)
  lock(m)
  wait(c, m)
  unlock(m)
  V(s)
thread T3
  lock(m)
  signal(c)
  unlock(m)
`);

const states = () => {
  const out = [initState(P)];
  for (const sched of [[0], [0, 1, 1], [0, 1, 1, 0, 0, 0, 0, 2], [0, 0, 0, 0, 0, 0, 1, 1, 1]])
    out.push(run(P, sched).state);
  return out;
};

describe('lanes', () => {
  it('keeps its geometry while a run plays, on each stage', () => {
    for (const stage of [undefined, LAPTOP_STAGE, PHONE_STAGE]) {
      const drawn = states().map((s) => drawLanes(lanesInput(P, s), { stage, room: 20 }));
      for (const d of drawn) expect(d.bounds).toEqual(drawn[0]!.bounds);
    }
  });

  it('draws a shape for every id a page may mark, each id once', () => {
    for (const s of states()) {
      const { shapes } = drawLanes(lanesInput(P, s), { room: 20 });
      const ids = shapes.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of [
        stepId(0, 0),
        stepId(1, 4),
        endId(2),
        pcId(1),
        varId('count'),
        lockId('m'),
        semId('s'),
        'cond-c',
        'reg-0-r',
      ])
        expect(ids).toContain(id);
    }
  });

  it('marks a blocked thread with a dashed arrow and a note', () => {
    const s = run(P, [0, 1, 1]).state; // T2 tries to lock m, which T1 holds
    const { shapes } = drawLanes(lanesInput(P, s));
    const arrow = shapes.find((x) => x.id === pcId(1));
    expect(arrow).toMatchObject({ kind: 'arrow', dashed: true });
    expect(shapes.find((x) => x.id === 'lane-1-note')).toMatchObject({ text: 'waits for m' });
    expect(shapes.find((x) => x.id === 'lock-m-queue')).toMatchObject({ text: 'waiting: T2' });
  });

  it('puts the panel beside the lanes on a laptop and under them on a phone', () => {
    const s = initState(P);
    expect(drawLanes(lanesInput(P, s), { stage: LAPTOP_STAGE }).wide).toBe(true);
    expect(drawLanes(lanesInput(P, s), { stage: PHONE_STAGE }).wide).toBe(false);
  });

  it('keeps text readable on a laptop (11 px) and a phone (9 px)', () => {
    for (const [stage, min] of [
      [LAPTOP_STAGE, 11],
      [PHONE_STAGE, 9],
    ] as const) {
      const { shapes, bounds } = drawLanes(lanesInput(P, initState(P)), { stage, room: 20 });
      const scale = Math.min(stage.w / bounds.w, stage.h / bounds.h);
      for (const t of shapes)
        if (t.kind === 'text') expect((t.size ?? 16) * scale, t.id).toBeGreaterThanOrEqual(min);
    }
  });
});
