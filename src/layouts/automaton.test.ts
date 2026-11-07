import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../engine/rng';
import type { ArrowShape, Shape, TextShape } from '../render/scene';
import type { Automaton } from '../viz/_automata/automaton';
import { parseAutomaton } from '../viz/_automata/parse';
import { randomDfa, randomNfa } from '../viz/_automata/random';
import {
  STATE_R,
  drawAutomaton,
  labelBeside,
  layers,
  layoutFromLayers,
  layoutStates,
} from './automaton';
import { curveSamples } from './route';

const machine = (text: string) => parseAutomaton(text) as Automaton;

const MACHINES = [
  'start q0; accept q2; q0 0 -> q1; q0 1 -> q0; q1 0 -> q1; q1 1 -> q2; q2 0 -> q1; q2 1 -> q0',
  'start ee; accept ee; ee a -> oe; ee b -> eo; oe a -> ee; oe b -> oo; eo a -> oo; eo b -> ee; oo a -> eo; oo b -> oe',
  'start r0; accept r0; r0 0 -> r0; r0 1 -> r1; r1 0 -> r2; r1 1 -> r0; r2 0 -> r1; r2 1 -> r2',
  'start q0; accept q3; q0 0,1 -> q0; q0 1 -> q1; q1 0,1 -> q2; q2 0,1 -> q3',
  'start q0; accept q2; q0 eps -> q1; q1 eps -> q0; q0 b -> q0; q1 a -> q2; q2 eps -> q0',
  // Long labels, as on a Turing machine's diagram.
  'start q0; accept acc; q0 0→x,R -> q1; q0 y→R -> q3; q0 ␣→R -> acc; q1 0,y→R -> q1; q1 1→y,L -> q2; q2 0,y→L -> q2; q2 x→R -> q0; q3 y→R -> q3; q3 ␣→R -> acc',
].map((t) =>
  // The parser takes single symbols; long labels go straight into the model.
  t.includes('→') ? longLabels(t) : machine(t),
);

function longLabels(text: string): Automaton {
  const moves = text
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.includes('->'))
    .map((s) => {
      const [left, to] = s.split('->').map((x) => x.trim()) as [string, string];
      const [from, ...on] = left.split(' ');
      return { from: from!, on: on.join(' '), to };
    });
  const states = [...new Set(moves.flatMap((m) => [m.from, m.to]))];
  return { states, alphabet: [], start: 'q0', accept: ['acc'], moves };
}

type Box = { l: number; r: number; t: number; b: number };

const boxOf = (s: TextShape): Box => {
  const size = s.size ?? 16;
  const w = s.text.length * size * 0.6;
  // The glyphs: from about 0.72 of the size above the baseline to 0.22 below it.
  return { l: s.x - w / 2, r: s.x + w / 2, t: s.y - size * 0.72, b: s.y + size * 0.22 };
};
const boxDist = (b: Box, p: { x: number; y: number }) =>
  Math.hypot(Math.max(b.l - p.x, 0, p.x - b.r), Math.max(b.t - p.y, 0, p.y - b.b));
const pointsOf = (a: ArrowShape) =>
  curveSamples({ a: { x: a.x1, y: a.y1 }, b: { x: a.x2, y: a.y2 }, via: a.via }, 60);

/** What each move label and note covers: its own arrow, other arrows, other labels, states. */
function conflicts(shapes: Shape[]) {
  const labels = shapes.filter(
    (s): s is TextShape => s.kind === 'text' && /(^|-)m-.*-t$|^s-.*-n$/.test(s.id),
  );
  const arrows = shapes.filter((s): s is ArrowShape => s.kind === 'arrow');
  const states = shapes.filter((s) => s.kind === 'circle' && /^s-[^-]+$/.test(s.id));
  const out: string[] = [];
  labels.forEach((t, i) => {
    const b = boxOf(t);
    const own = t.id.endsWith('-t') ? t.id.slice(0, -2) : null;
    for (const a of arrows) {
      const d = Math.min(...pointsOf(a).map((p) => boxDist(b, p)));
      if (a.id === own ? d < 1.5 : d < 1) out.push(`${t.id} on ${a.id}`);
    }
    for (const s of states)
      if (s.kind === 'circle' && boxDist(b, s) < s.r) out.push(`${t.id} on ${s.id}`);
    labels.forEach((o, j) => {
      const c = boxOf(o);
      if (
        j > i &&
        Math.min(b.r, c.r) > Math.max(b.l, c.l) &&
        Math.min(b.b, c.b) > Math.max(b.t, c.t)
      )
        out.push(`${t.id} on ${o.id}`);
    });
  });
  return out;
}

describe('state diagrams', () => {
  it('puts every label clear of its arrow, the other arrows, other labels and states', () => {
    MACHINES.forEach((a, i) => {
      for (const across of [true, false]) {
        const d = drawAutomaton(a, layoutStates(a, across), { note: (q) => `#${q.length}` });
        // Drawn down, the Turing machine's long q2 -> q0 curve runs straight through the middle
        // of the short arrow from q3 to acc, so that label has nowhere free to go.
        const forced = i === MACHINES.length - 1 && !across ? ['m-q3-acc-t on m-q2-q0'] : [];
        expect(conflicts(d.shapes), `${a.start} ${across}`).toEqual(forced);
      }
    });
  });

  it('keeps labels off states and other labels, and clear of their own arrows, in random machines', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.boolean(),
        fc.boolean(),
        (seed, nfa, across) => {
          const rng = makeRng(seed);
          const a = nfa ? randomNfa(rng, rng.int(2, 7)) : randomDfa(rng, rng.int(2, 7));
          const d = drawAutomaton(a, layoutStates(a, across));
          // Crossing another arrow can be forced by the layout; the rest never is.
          const bad = conflicts(d.shapes).filter(
            (c) => !/ on m-|on start/.test(c) || /(m-[^ ]+)-t on \1$/.test(c),
          );
          expect(bad).toEqual([]);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('draws part of a diagram with everything where the whole diagram has it', () => {
    const a = MACHINES[1]!;
    const layout = layoutStates(a);
    const whole = new Map(drawAutomaton(a, layout).shapes.map((s) => [s.id, s]));
    const part = drawAutomaton(a, layout, {
      show: { state: (q) => q !== 'oo', move: (m) => m.on === 'a' && m.to !== 'oo', start: false },
    });
    const ids = part.shapes.map((s) => s.id);
    expect(ids).not.toContain('s-oo');
    expect(ids).not.toContain('start');
    expect(ids).toContain('m-ee-oe');
    expect(ids).not.toContain('m-ee-eo');
    for (const s of part.shapes) {
      const w = whole.get(s.id)!;
      expect({ ...s, text: undefined }, s.id).toEqual({ ...w, text: undefined });
    }
  });

  it('leaves out the start arrow when asked, and takes routes from the page', () => {
    const a = machine('start p; p a -> q; q b -> r');
    const layout = layoutStates(a);
    const segs = [
      { a: { x: 0, y: 20 }, b: { x: 60, y: 80 } },
      { a: { x: 60, y: 80 }, b: { x: 250, y: 22 }, via: { x: 200, y: 90 } },
    ];
    const d = drawAutomaton(a, layout, {
      startArrow: false,
      route: (p) => (p === 'q' ? { segs, label: { x: 150, y: 120 } } : undefined),
    });
    const ids = d.shapes.map((s) => s.id);
    expect(ids).not.toContain('start');
    const first = d.shapes.find((s) => s.id === 'm-q-r-a') as ArrowShape;
    const last = d.shapes.find((s) => s.id === 'm-q-r') as ArrowShape;
    expect(first).toMatchObject({ x1: 0, y1: 20, x2: 60, y2: 80, head: 'none' });
    expect(last).toMatchObject({ x1: 60, y2: 22, via: { x: 200, y: 90 } });
    expect((d.shapes.find((s) => s.id === 'm-q-r-t') as TextShape).x).toBe(150);
  });

  it('routes a blocked arrow around the states in its way when asked', () => {
    // r sits on the line from p to q.
    const a = machine('start p; p a -> r; r a -> q; p b -> q');
    const layout = layoutFromLayers([['p'], ['r'], ['q']]);
    const arrow = drawAutomaton(a, layout, { around: 'avoid' }).shapes.find(
      (s) => s.id === 'm-p-q',
    ) as ArrowShape;
    expect(arrow.via).toBeDefined();
    const r = layout.pos.r!;
    expect(
      Math.min(...pointsOf(arrow).map((p) => Math.hypot(p.x - r.x, p.y - r.y))),
    ).toBeGreaterThan(STATE_R);
  });

  it('lays out given layers as layoutStates lays out its own', () => {
    for (const a of MACHINES)
      for (const across of [true, false])
        expect(layoutFromLayers(layers(a), across)).toEqual(layoutStates(a, across));
  });

  it('puts a label beside an arrow, on the side asked, clear of it', () => {
    const seg = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
    expect(labelBeside(seg, 'a,b', { x: 0, y: -1 }).y).toBeLessThan(-7.5);
    expect(labelBeside(seg, 'a,b', { x: 0, y: 1 }).y).toBeGreaterThan(7.5);
    const up = { a: { x: 0, y: 0 }, b: { x: 0, y: 100 } };
    expect(labelBeside(up, 'a,b', { x: 1, y: 0 }).x).toBeGreaterThan(13.5);
  });
});
