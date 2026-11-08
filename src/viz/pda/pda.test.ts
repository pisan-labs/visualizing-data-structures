import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, StageSize } from '../../engine/types';
import {
  CAP,
  apply,
  configKey,
  formatPda,
  parsePda,
  search,
  type AcceptBy,
  type Pda,
} from '../_automata/pda';
import { randomPda } from '../_automata/pda-random';
import { pda } from '.';
import { MACHINES } from './machines';
import type { PdaExtra, PdaSettings, PdaShow } from './model';
import { TYPICAL_STAGES } from '../../render/stage';

const settings = (s: Partial<PdaSettings> = {}): PdaSettings =>
  ({ ...pda.defaults, ...s }) as PdaSettings;

const machine = (text: string) => parsePda(text) as Pda;

function allWords(alphabet: readonly string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => alphabet.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

const count = (w: string, c: string) => [...w].filter((x) => x === c).length;
const anbn = (w: string) => /^a*b*$/.test(w) && count(w, 'a') === count(w, 'b');
function balanced(w: string): boolean {
  let depth = 0;
  for (const c of w) {
    depth += c === '(' ? 1 : -1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** The language of each named machine, written directly, and how the machine accepts it. */
const LANGUAGES: Record<keyof typeof MACHINES, [AcceptBy, (w: string) => boolean | 'stopped']> = {
  anbn: ['state', anbn],
  palindromes: ['state', (w) => w.length % 2 === 0 && w === [...w].reverse().join('')],
  parens: ['state', balanced],
  grammar: ['state', anbn],
  emptyStack: ['stack', anbn],
  leftRecursion: ['state', (w) => /^ba*$/.test(w) || 'stopped'],
  equal: ['state', (w) => count(w, 'a') === count(w, 'b')],
};

type Steps = Timeline<unknown, PdaSettings, PdaExtra>['entries'][number]['steps'];
const show = (s: Steps[number]): PdaShow => s.extra!.run!;
const lastRun = (t: Timeline<unknown, PdaSettings, PdaExtra>, k: number) =>
  show(t.entries[k]!.steps.at(-1)!);

const STAGES: (StageSize | undefined)[] = [undefined, ...TYPICAL_STAGES];

describe('PDA page', () => {
  it('runs each named machine on its language, in both views of the search', () => {
    for (const [name, text] of Object.entries(MACHINES)) {
      const p = machine(text);
      const [by, lang] = LANGUAGES[name as keyof typeof MACHINES];
      const words = allWords(p.inputs, 5);
      for (const view of ['all', 'path'] as const) {
        const t = new Timeline(pda, settings({ accept: by, search: view }), 1, [
          ['load', text],
          ...words.map((w): OpCall => ['run', w || 'eps']),
        ]);
        words.forEach((w, k) => {
          const want = lang(w);
          expect(lastRun(t, k + 1).verdict, `${name} on "${w}" (${view})`).toBe(
            want === true ? 'accept' : want === false ? 'reject' : 'stopped',
          );
        });
      }
    }
  });

  it('shows real configurations, real moves and the right stack on every step', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 2, max: 5 }),
        fc.array(fc.stringMatching(/^[ab]{0,6}$/), { minLength: 1, maxLength: 3 }),
        fc.constantFrom<AcceptBy>('state', 'stack'),
        fc.constantFrom<'all' | 'path'>('all', 'path'),
        (seed, n, words, by, view) => {
          const p = randomPda(makeRng(seed), n, { grow: seed % 4 === 0 });
          const t = new Timeline(pda, settings({ accept: by, search: view }), 1, [
            ['load', formatPda(p)],
            ...words.map((w): OpCall => ['run', w || 'eps']),
          ]);
          const a = t.entries[0]!.end.machine;
          words.forEach((w, k) => {
            const where = `${formatPda(a)} on "${w}" (${by}, ${view})`;
            const sr = search(a, w, by);
            const keys = new Set(sr.nodes.map((nd) => configKey(nd.config)));
            const steps = t.entries[k + 1]!.steps;
            expect(show(steps.at(-1)!).verdict, where).toBe(sr.outcome);
            // The computation played back starts from the start configuration.
            let before = sr.nodes[0]!.config;
            for (const st of steps) {
              const r = show(st);
              expect(keys.has(configKey(r.focus)), where).toBe(true);
              for (const l of r.lines) expect(keys.has(configKey(l.config)), where).toBe(true);
              for (const q of [...r.live, ...r.dead]) expect(a.states).toContain(q);
              expect(st.vars?.state).toBe(r.focus.state);
              expect(st.vars?.height).toBe(r.focus.stack.length);
              expect(r.frame.rows).toBeGreaterThanOrEqual(Math.min(r.focus.stack.length, 8));
              // A step of the computation follows from the one before by the move it marks.
              if (st.lines.includes('run.play')) {
                const used = st.marks.find((m) => m.id.startsWith('mv-'))!;
                const move = a.moves[Number(used.id.slice(3))]!;
                expect(apply(move, before), where).toEqual(r.focus);
                before = r.focus;
              }
            }
          });
        },
      ),
      { numRuns: 150 },
    );
  });

  it('narrates a deterministic run move by move', () => {
    const t = new Timeline(pda, settings(), 1, [
      ['run', 'aabb'],
      ['run', 'aab'],
    ]);
    const says = t.entries[0]!.steps.map((s) => s.say);
    expect(says).toContain('Move 2: in q1, read a and push a, staying in q1. Now (q1, abb, a$).');
    expect(says).toContain('Move 4: in q1, read b and pop a, and go to q2. Now (q2, b, a$).');
    expect(says.at(-1)).toBe(
      'The machine has read all of aabb, and it is in q3, an accept state, so it accepts aabb. The accepting computation takes 6 moves.',
    );
    expect(t.entries[1]!.steps.at(-1)!.say).toBe(
      'The computation stops at (q2, ε, a$): the word is used up, q2 is not an accept state, and no ε-move fits. So the machine rejects aab.',
    );
    // One branch: the panel keeps the computation so far.
    expect(show(t.entries[0]!.steps[4]!).lines.map((l) => l.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('shows every branch of a guess, the ones that die, then the accepting computation', () => {
    const t = new Timeline(pda, settings(), 1, [
      ['load', MACHINES.palindromes],
      ['run', 'abba'],
    ]);
    const steps = t.entries[1]!.steps;
    const says = steps.map((s) => s.say);
    expect(says[0]).toContain('a breadth-first search follows every branch');
    expect(says).toContain(
      'Move 2: 1 configuration makes 2 new ones: (q2, abba, $) and (q1, bba, a$). (q1, abba, $) has a choice of moves, so the computation branches.',
    );
    const dies = steps.find((s) => s.say.includes('2 branches die'))!;
    expect(dies.say).toContain('(q2, bba, a$): q2 has no move that reads b with a on top');
    expect(dies.marks.filter((m) => m.role === 'error').length).toBe(2);
    const play = steps.findIndex((s) => s.lines.includes('run.play'));
    expect(says[play]).toMatch(/^Now play back the accepting computation/);
    expect(steps.slice(play, -1).every((s) => show(s).live.length === 1)).toBe(true);
    expect(says.at(-1)).toContain('the search explored 15 configurations to find it');
    // The other view shows only the computation, after a sentence about the search.
    const path = new Timeline(pda, settings({ search: 'path' }), 1, [
      ['load', MACHINES.palindromes],
      ['run', 'abba'],
    ]).entries[1]!.steps;
    expect(path[0]!.say).toContain(
      'it explored 15 configurations and found an accepting computation of 7 moves',
    );
    expect(path).toHaveLength(1 + 7 + 1);
  });

  it('stops at the cap and says why', () => {
    const t = new Timeline(pda, settings(), 1, [
      ['load', MACHINES.leftRecursion],
      ['run', 'ab'],
    ]);
    const steps = t.entries[1]!.steps;
    expect(steps.some((s) => s.say.startsWith('Moves 8 to 99 go on the same way'))).toBe(true);
    expect(steps.at(-1)!.say).toContain(
      `The search has made ${CAP} configurations, its cap, without finding an accepting one`,
    );
    expect(steps.at(-1)!.say).toContain('It does not mean ab is rejected');
    expect(show(steps.at(-1)!).verdict).toBe('stopped');
    // A deep stack is cut in narration and drawn with a count of the cells below.
    expect(steps.at(-1)!.say.length).toBeLessThan(400);
    const scene = pda.view(steps.at(-1)!, settings());
    expect(scene.shapes.find((s) => s.id === 'stack-more-t')).toMatchObject({ text: '+93' });
  });

  it('accepts by empty stack when Options says so', () => {
    const calls: OpCall[] = [
      ['load', MACHINES.emptyStack],
      ['run', 'aabb'],
    ];
    const byStack = new Timeline(pda, settings({ accept: 'stack' }), 1, calls);
    expect(byStack.entries[0]!.steps[0]!.say).toContain('S on the stack at the start');
    expect(lastRun(byStack, 1).verdict).toBe('accept');
    expect(byStack.entries[1]!.steps.at(-1)!.say).toContain('its stack is empty, so it accepts');
    const byState = new Timeline(pda, settings(), 1, calls);
    expect(byState.entries[0]!.steps[0]!.say).toContain(
      'It has no accept states, so by final state it accepts nothing',
    );
    expect(lastRun(byState, 1).verdict).toBe('reject');
    const code = (s: PdaSettings) =>
      pda.pseudocode(s)[0]!.lines.find((l) => l.id === 'run.accept')!;
    expect(code(settings()).text).toContain('r ∈ F');
    expect(code(settings({ accept: 'stack' })).text).toContain('stack is ε');
  });

  it('tests a batch', () => {
    const t = new Timeline(pda, settings(), 1, [
      ['load', MACHINES.equal],
      ['test', '+abba +ba -aab +b ab'],
    ]);
    const steps = t.entries[1]!.steps;
    expect(steps.at(-1)!.extra!.test!.rows.map((r) => r.got)).toEqual([
      'accept',
      'accept',
      'reject',
      'reject',
      'accept',
    ]);
    expect(steps.at(-1)!.say).toBe(
      'Done: 3 of 4 words do what they should. b is rejected but should be accepted.',
    );
    expect(steps.at(-1)!.marks).toEqual([{ id: 'test-3', role: 'error' }]);
  });

  it('refuses text it cannot read, naming the item', () => {
    const t = new Timeline(pda, settings(), 1, [
      ['load', 'q0 a, ZZ -> q1 AZ'],
      ['run', 'abc'],
      ['run', '+ab'],
      ['load', 'aabb'],
    ]);
    const say = (k: number) => t.entries[k]!.steps.at(-1)!.say;
    expect(say(0)).toContain('"ZZ" in "q0 a, ZZ -> q1 AZ" cannot be popped');
    expect(say(1)).toContain('"c" is not in the input alphabet {a, b}');
    expect(say(2)).toContain('Press Test');
    expect(say(3)).toContain('"aabb" is not a machine');
    expect(pda.controls.input!.parse('q0 a, Z -> q1')).toBeInstanceOf(Error);
    expect(pda.controls.input!.parse('+(()) -)(')).toBe('+(()) -)(');
  });

  it('draws one label line per move, apart, and keeps its framing through a run', () => {
    for (const ex of pda.examples) {
      const t = new Timeline(pda, settings(ex.settings as Partial<PdaSettings>), ex.seed, ex.ops);
      const p = t.entries[0]!.end.machine;
      for (const stage of STAGES)
        for (const e of t.entries.slice(1)) {
          const scenes = e.steps.map((s) => pda.view(s, t.settings, stage));
          for (const scene of scenes) {
            p.moves.forEach((_, i) =>
              expect(scene.shapes.some((s) => s.id === `mv-${i}`)).toBe(true),
            );
            const b = scene.bounds;
            for (const s of scene.shapes)
              if (s.kind === 'text' && s.id.startsWith('mv-')) {
                expect(s.x).toBeGreaterThan(b.x);
                expect(s.y).toBeLessThan(b.y + b.h);
              }
          }
          // Nothing jumps: every step of an operation has the same framing.
          expect(new Set(scenes.map((s) => JSON.stringify(s.bounds))).size, ex.id).toBe(1);
        }
      // Lines of one label sit one under another.
      const scene = pda.view(t.entries[0]!.steps.at(-1)!, t.settings);
      const ys = new Map<string, number[]>();
      p.moves.forEach((m, i) => {
        const s = scene.shapes.find((x) => x.id === `mv-${i}`)!;
        const k = `${m.from}>${m.to}`;
        ys.set(k, [...(ys.get(k) ?? []), (s as { y: number }).y]);
      });
      for (const list of ys.values()) expect(new Set(list).size).toBe(list.length);
    }
  });
});
