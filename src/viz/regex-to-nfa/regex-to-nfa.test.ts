import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { StageSize } from '../../engine/types';
import { STATE_R, stateId } from '../../layouts/automaton';
import type { CircleShape, Shape } from '../../render/scene';
import { accepts, closure } from '../_automata/automaton';
import {
  matches,
  parseRegex,
  readRegex,
  regexSize as size,
  showRegex,
  showRegex as show,
  type Regex,
  type UnionSign,
} from '../_automata/regex';
import regexToNfa, { parseInput } from '.';
import { construct, pending, type Construction } from '../_automata/thompson-construct';
import { TIGHT, pictures } from '../_automata/thompson-layout';
import { drawn, readWord, type RxSettings } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const parse = (text: string, union: UnionSign) => readRegex(text, { union });

const LAPTOP: StageSize = LAPTOP_STAGE;
const PHONE: StageSize = PHONE_STAGE;

/** Random expressions over {a, b}, written with the given union sign. */
function regexArb(sign: UnionSign): fc.Arbitrary<Regex> {
  const { tree } = fc.letrec<{ tree: Regex }>((tie) => ({
    tree: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      fc.constantFrom<Regex>(
        { kind: 'sym', c: 'a' },
        { kind: 'sym', c: 'b' },
        { kind: 'eps' },
        { kind: 'empty' },
      ),
      fc.tuple(tie('tree'), tie('tree')).map(([a, b]): Regex => ({ kind: 'union', a, b })),
      fc.tuple(tie('tree'), tie('tree')).map(([a, b]): Regex => ({ kind: 'concat', a, b })),
      tie('tree').map((a): Regex => ({ kind: 'star', a })),
      tie('tree').map((a): Regex => ({ kind: sign === '|' ? 'plus' : 'star', a })),
      tie('tree').map((a): Regex => ({ kind: 'opt', a })),
    ),
  }));
  return tree.filter((r) => show(r, sign).length <= 40);
}

const wordArb = fc.array(fc.constantFrom('a', 'b'), { maxLength: 7 }).map((w) => w.join(''));

describe('reading expressions', () => {
  it('reads the same tree as parseRegex, with | as union by default', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[ab|*+?()ε∅]{0,12}$/), (text) => {
        const tree = parse(text, '|');
        const kit = parseRegex(text);
        expect(tree instanceof Error, text).toBe(kit instanceof Error);
        if (!(tree instanceof Error) && !(kit instanceof Error)) expect(tree.tree.r).toEqual(kit);
      }),
      { numRuns: 2000 },
    );
  });

  it('reads eps as ε only as a word of its own', () => {
    expect(show(parseRegex('steps') as Regex)).toBe('steps');
    expect(size(parseRegex('steps') as Regex)).toBe(5);
    expect(show(parseRegex('(eps|a)b') as Regex)).toBe('(ε|a)b');
    expect((parse('a eps', '|') as Exclude<ReturnType<typeof parse>, Error>).text).toBe('aε');
    expect((parse('aeps', '|') as Exclude<ReturnType<typeof parse>, Error>).text).toBe('aeps');
  });

  it('reads + as union when asked, and keeps * and ?', () => {
    const p = parse('(a+b)*a?', '+');
    expect(p).not.toBeInstanceOf(Error);
    expect(show((p as Exclude<typeof p, Error>).tree.r, '|')).toBe('(a|b)*a?');
    expect(parse('a|b', '+')).toBeInstanceOf(Error);
    expect((parse('a|b', '+') as Error).message).toContain('+ stands for union');
    expect(parse('a+', '+')).toBeInstanceOf(Error);
  });

  it('prints what it reads, in either sign', () => {
    for (const sign of ['|', '+'] as const)
      fc.assert(
        fc.property(regexArb(sign), (r) => {
          const p = parse(show(r, sign), sign);
          expect(p).not.toBeInstanceOf(Error);
          expect((p as Exclude<typeof p, Error>).tree.r).toEqual(r);
        }),
      );
  });

  it('gives every node a span that reads as the node', () => {
    fc.assert(
      fc.property(regexArb('|'), (r) => {
        const p = parse(showRegex(r), '|') as Exclude<ReturnType<typeof parse>, Error>;
        const check = (t: typeof p.tree) => {
          const sub = parse(p.text.slice(...t.span), '|');
          expect(sub).not.toBeInstanceOf(Error);
          expect((sub as typeof p).tree.r).toEqual(t.r);
          t.kids.forEach(check);
        };
        check(p.tree);
      }),
    );
  });

  it('reads eps as ε and ignores spaces', () => {
    const p = parse(' a eps | b ', '|') as Exclude<ReturnType<typeof parse>, Error>;
    expect(p.text).toBe('aε|b');
    expect(size(p.tree.r)).toBe(4);
  });
});

describe.each(['thompson', 'sipser'] as Construction[])('%s construction', (how) => {
  for (const sign of ['|', '+'] as const)
    it(`accepts exactly the words the expression matches (union ${sign})`, () => {
      fc.assert(
        fc.property(regexArb(sign), fc.array(wordArb, { maxLength: 6 }), (r, words) => {
          const p = parse(show(r, sign), sign) as Exclude<ReturnType<typeof parse>, Error>;
          const { nfa } = construct(p, how);
          for (const w of ['', ...words])
            expect(accepts(nfa, w), `${show(r)} on "${w}"`).toBe(matches(r, w));
        }),
        { numRuns: 400 },
      );
    });

  it('builds children before parents, one fragment per part', () => {
    fc.assert(
      fc.property(regexArb('|'), (r) => {
        const p = parse(show(r), '|') as Exclude<ReturnType<typeof parse>, Error>;
        const { nfa, frags } = construct(p, how);
        frags.forEach((f, k) => {
          for (const j of f.kids) expect(j).toBeLessThan(k);
          const kidStates = f.kids.flatMap((j) => frags[j]!.states);
          expect(new Set([...kidStates, ...f.fresh]).size).toBe(f.states.length);
          expect(f.moves.length).toBe(
            f.kids.reduce((s, j) => s + frags[j]!.moves.length, 0) + f.added.length,
          );
        });
        // Each part is used by exactly one parent, and the last part is the whole NFA.
        expect(pending(frags, frags.length)).toEqual([frags.length - 1]);
        const top = frags.at(-1)!;
        expect(top.states).toEqual(nfa.states);
        expect(top.start).toBe(nfa.start);
        expect(top.accepts).toEqual(nfa.accept);
      }),
    );
  });

  it('makes at most 2 states per symbol or operator (Thompson: exactly 2)', () => {
    fc.assert(
      fc.property(regexArb('|'), (r) => {
        const p = parse(show(r), '|') as Exclude<ReturnType<typeof parse>, Error>;
        const { nfa } = construct(p, how);
        const m = size(r);
        if (how === 'thompson') expect(nfa.states.length).toBe(2 * m);
        else expect(nfa.states.length).toBeLessThanOrEqual(2 * m);
      }),
    );
  });
});

const parsed = (r: Regex, sign: UnionSign = '|') =>
  parse(show(r, sign), sign) as Exclude<ReturnType<typeof parse>, Error>;

describe('narration', () => {
  it('counts one symbol in the singular', () => {
    const t = new Timeline(regexToNfa, regexToNfa.defaults as RxSettings, 1, [['build', 'a']]);
    // Was "The expression has m = 1 symbols and operators."
    expect(t.entries[0]!.steps.at(-1)!.say).toContain('The expression has m = 1 symbol.');
  });

  // Was "(Theorem 1.54)": the construction is the proof of Lemma 1.55.
  it("cites the lemma whose proof is Sipser's construction", () => {
    const help = regexToNfa.settings.map((s) => s.help ?? '').join(' ');
    expect(help).toContain('Lemma 1.55');
    expect(help).not.toContain('1.54');
  });
});

describe('build and run', () => {
  const settingsArb = fc.record({
    construction: fc.constantFrom<Construction>('thompson', 'sipser'),
    union: fc.constantFrom<UnionSign>('|', '+'),
  });

  it('builds one piece per step and runs exactly like matches(), checking every step', () => {
    fc.assert(
      fc.property(settingsArb, fc.integer({ min: 0, max: 1e6 }), wordArb, (settings, seed, w) => {
        const r = fc.sample(regexArb(settings.union), { numRuns: 1, seed })[0]!;
        const text = show(r, settings.union);
        const t = new Timeline(regexToNfa, settings as RxSettings, 1, [
          ['build', text],
          ['run', w || 'ε'],
        ]);
        const [build, run] = t.entries;
        const { nfa, frags } = construct(parsed(r, settings.union), settings.construction);
        // Build: the opening step, one step per fragment, then the whole NFA.
        expect(build!.steps.length).toBe(frags.length + 2);
        build!.steps.forEach((step, k) => {
          const built = Math.min(k, frags.length);
          expect(step.state.built).toBe(built);
          expect(drawn(step.state).states).toEqual(
            [...new Set(frags.slice(0, built).flatMap((f) => f.fresh))].sort(
              (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
            ),
          );
        });
        expect(build!.end.nfa).toEqual(nfa);
        // Run: every set is an ε-closure after each symbol, and the answer is matches().
        for (const step of run!.steps) {
          const rs = step.state.run!;
          expect(rs.word).toBe(w);
          for (const q of rs.set) expect(nfa.states).toContain(q);
          if (step.lines.includes('run.closure') || step.lines.includes('run.close0'))
            expect(closure(nfa, rs.set)).toEqual(rs.set);
        }
        expect(run!.end.run!.result).toBe(matches(r, w) ? 'accept' : 'reject');
        expect(run!.end.run!.result === 'accept').toBe(accepts(nfa, w));
      }),
      { numRuns: 300 },
    );
  });

  it('keeps the expression and NFA when the input is not an expression or a word', () => {
    const t = new Timeline(regexToNfa, regexToNfa.defaults, 1, [
      ['build', '(ab'],
      ['run', '(a|b)'],
      ['run', 'aaaaaaaaaaaaa'],
    ]);
    const start = t.initial.state;
    for (const e of t.entries) {
      expect(e.end).toEqual(start);
      expect(e.steps).toHaveLength(1);
    }
    expect(t.entries[0]!.steps[0]!.say).toContain('A ( is never closed');
    expect(t.entries[1]!.steps[0]!.say).toContain('press Build');
    expect(readWord('eps')).toBe('');
    expect(readWord(' a b ')).toBe('ab');
    expect(parseInput('  ')).toBeInstanceOf(Error);
  });

  it('stops as soon as no state is active', () => {
    const t = new Timeline(regexToNfa, regexToNfa.defaults, 1, [['run', 'cab']]);
    const last = t.entries[0]!.steps.at(-1)!;
    expect(last.lines).toEqual(['run.dead']);
    expect(last.state.run).toMatchObject({ read: 1, set: [], result: 'reject' });
  });
});

/** Distance from p to the segment a-b. */
function segDist(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}

/** Points along an arrow shape (a quadratic curve when it has a via point). */
function arrowPoints(s: Extract<Shape, { kind: 'arrow' }>): { x: number; y: number }[] {
  const a = { x: s.x1, y: s.y1 };
  const b = { x: s.x2, y: s.y2 };
  if (!s.via) return [a, b];
  return Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * s.via!.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * s.via!.y + t * t * b.y,
    };
  });
}

describe('layout', () => {
  const caseArb = fc.record({
    r: regexArb('|'),
    how: fc.constantFrom<Construction>('thompson', 'sipser'),
  });

  it('never puts two states on top of each other, or an arrow or label through a state', () => {
    fc.assert(
      fc.property(caseArb, ({ r, how }) => {
        const p = parsed(r);
        const { nfa, frags } = construct(p, how);
        const key = `|${p.text}`;
        for (const pic of [...pictures(frags, how, key), ...pictures(frags, how, key, TIGHT)]) {
          const pts = nfa.states.map((q) => ({ q, ...pic.pos[q]! }));
          for (let i = 0; i < pts.length; i++)
            for (let j = i + 1; j < pts.length; j++)
              expect(
                Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y),
              ).toBeGreaterThanOrEqual(2 * STATE_R + 10);
          for (const m of nfa.moves) {
            const path = pic.paths[`${m.from}>${m.to}`]!;
            for (const o of pts) {
              if (o.q === m.from || o.q === m.to) continue;
              for (const seg of path.segs) {
                const arrow = {
                  kind: 'arrow',
                  id: '',
                  x1: seg.a.x,
                  y1: seg.a.y,
                  x2: seg.b.x,
                  y2: seg.b.y,
                  via: seg.via,
                } as const;
                const ps = arrowPoints(arrow);
                const d = Math.min(...ps.slice(1).map((b, k) => segDist(o, ps[k]!, b)));
                expect(
                  d,
                  `${show(r)} ${how} rows ${pic.rows}: ${m.from}>${m.to} passes ${o.q}`,
                ).toBeGreaterThan(STATE_R + 2);
              }
              expect(Math.hypot(path.label.x - o.x, path.label.y - o.y)).toBeGreaterThan(
                STATE_R + 6,
              );
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('keeps every state where it is for the whole build, on any stage', () => {
    fc.assert(
      fc.property(
        caseArb,
        fc.constantFrom<StageSize | undefined>(undefined, LAPTOP, PHONE),
        ({ r, how }, stage) => {
          const settings: RxSettings = { construction: how, union: '|' };
          const t = new Timeline(regexToNfa, settings, 1, [
            ['build', show(r)],
            ['run', 'ab'],
          ]);
          const seen = new Map<string, string>();
          let bounds = '';
          t.entries.forEach((e, op) =>
            e.steps.forEach((step) => {
              const scene = regexToNfa.view(step, settings, stage);
              for (const s of scene.shapes)
                if (s.kind === 'circle' && /^s-q\d+$/.test(s.id)) {
                  const at = `${(s as CircleShape).x},${(s as CircleShape).y}`;
                  expect(seen.get(s.id) ?? at, s.id).toBe(at);
                  seen.set(s.id, at);
                }
              // The camera holds still within an operation.
              const b = `${op}:${JSON.stringify(scene.bounds)}`;
              if (bounds.startsWith(`${op}:`)) expect(b).toBe(bounds);
              bounds = b;
            }),
          );
          expect(seen.has(stateId('q0'))).toBe(true);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('draws a long concatenation on rows on a phone, and across on a laptop', () => {
    const settings = regexToNfa.defaults;
    const t = new Timeline(regexToNfa, settings, 1, [['build', '(a|b)*a(a|b)(a|b)(a|b)']]);
    const step = t.at(t.length - 1).step;
    const span = (stage: StageSize) => {
      const ys = regexToNfa
        .view(step, settings, stage)
        .shapes.filter((s): s is CircleShape => s.kind === 'circle' && /^s-q\d+$/.test(s.id))
        .map((s) => s.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(span(PHONE)).toBeGreaterThan(span(LAPTOP) + 100);
  });
});

describe('drawn text size', () => {
  // Five (a|b) factors on two rows reached 10.3 px on a laptop with the tape under the NFA; with
  // the expression and the tape side by side under it, 11.3.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(regexToNfa, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(regexToNfa, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
