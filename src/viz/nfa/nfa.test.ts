import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { stateId } from '../../layouts/automaton';
import { accepts, closure, stepSet, type Automaton } from '../_automata/automaton';
import { formatAutomaton, parseAutomaton } from '../_automata/parse';
import { setName as setShort } from '../_automata/automaton';
import { loadCall, setText, wordText } from '../_automata/page';
import { randomNfa } from '../_automata/random';
import { nfa } from '.';
import { MACHINES } from './machines';
import type { NfaRun, NfaSettings } from './model';

const settings = (s: Partial<NfaSettings> = {}): NfaSettings =>
  ({ ...nfa.defaults, ...s }) as NfaSettings;

const machine = (text: string) => parseAutomaton(text) as Automaton;
/** A set as narration writes it. */
const S = (...qs: string[]) => setText(qs);

function allWords(alphabet: string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => alphabet.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

/** What each named machine is meant to accept, written directly. */
const LANGUAGES: Record<keyof typeof MACHINES, (w: string) => boolean> = {
  endsIn01: (w) => w.endsWith('01'),
  thirdFromEnd: (w) => w.length >= 3 && w[w.length - 3] === '1',
  aOrB: (w) => w === 'a' || w === 'b',
  has11or101: (w) => w.includes('11') || w.includes('101'),
  epsLoop: (w) => w.endsWith('a'),
  aStarOrBStar: (w) => /^(a*|b*)$/.test(w),
  doubling: (w) => /^a+$/.test(w),
};

/** The sets a run passes through, by the definition: E({q0}), then E(move(S, c)). */
function referenceRows(a: Automaton, word: string): string[][] {
  let set = closure(a, [a.start]);
  const rows = [set];
  for (const c of word) {
    set = stepSet(a, set, c);
    rows.push(set);
    if (!set.length) break;
  }
  return rows;
}

const lastRun = (t: Timeline<unknown, NfaSettings, unknown>, k: number): NfaRun =>
  (t.entries[k]!.steps.at(-1)!.extra as { run: NfaRun }).run;

describe('NFA', () => {
  it('runs each named machine on its language', () => {
    for (const [name, text] of Object.entries(MACHINES)) {
      const a = machine(text);
      const words = allWords(a.alphabet, 6);
      const t = new Timeline(nfa, settings(), 1, [
        ['load', text],
        ...words.map((w): OpCall => ['run', w || 'eps']),
      ]);
      words.forEach((w, k) => {
        const want = LANGUAGES[name as keyof typeof MACHINES](w);
        expect(accepts(a, w), `${name} on ${wordText(w)}`).toBe(want);
        expect(lastRun(t, k + 1).verdict, `${name} run on ${wordText(w)}`).toBe(
          want ? 'accept' : 'reject',
        );
      });
    }
  });

  it('agrees with the reference on random machines and words, set by set', () => {
    const word = fc.stringMatching(/^[ab]{0,8}$/);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 6 }),
        fc.constantFrom('separate' as const, 'folded' as const),
        fc.array(word, { minLength: 1, maxLength: 4 }),
        (seed, n, mode, words) => {
          const made = randomNfa(makeRng(seed), n);
          const calls: OpCall[] = [
            loadCall(made),
            ...words.map((w): OpCall => ['run', w || 'eps']),
          ];
          const t = new Timeline(nfa, settings({ closure: mode }), 1, calls);
          const a = t.entries[0]!.end.machine;
          // The text loses symbols no move uses; every word here is over {a, b}.
          if (a.alphabet.length < 2) return;
          words.forEach((w, k) => {
            const where = `${formatAutomaton(a)} on ${wordText(w)} (${mode})`;
            const r = lastRun(t, k + 1);
            expect(r.verdict, where).toBe(accepts(a, w) ? 'accept' : 'reject');
            const ref = referenceRows(a, w);
            expect(r.rows, where).toEqual(ref);
            for (const step of t.entries[k + 1]!.steps) {
              const run = step.extra!.run!;
              for (const q of run.set) expect(a.states).toContain(q);
              expect(step.vars?.active).toBe(run.set.length);
              expect(step.vars?.set).toBe(setShort(run.set));
              // Once a symbol's ε-moves have been followed, the set is the reference's.
              const closed =
                step.lines.includes('run.close') ||
                step.lines.includes('run.step') ||
                step.lines.includes('run.check');
              if (closed) expect(run.set, where).toEqual(ref[run.read]);
              for (const m of step.marks)
                if (m.id.startsWith('s-')) expect(a.states).toContain(m.id.slice(2));
            }
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('narrates the branches that die, and stops when all of them have', () => {
    const t = new Timeline(nfa, settings(), 1, [
      ['run', '0110'],
      ['load', MACHINES.aOrB],
      ['run', 'abab'],
    ]);
    const says = t.entries[0]!.steps.map((s) => s.say);
    expect(says).toContain(
      `Read 1: from ${S('q0', 'q2')}, the 1-moves reach ${S('q0')}. q2 has no move on 1, so its branch dies.`,
    );
    const dying = t.entries[0]!.steps.find((s) => s.say.includes('q2 has no move on 1'))!;
    expect(dying.marks).toContainEqual({ id: stateId('q2'), role: 'remove' });
    const dead = t.entries[2]!.steps.at(-1)!;
    // After a, the ε-move adds q5, so the set is {q2, q5}; neither moves on b.
    expect(dead.say).toBe(
      `Read b: no state in ${S('q2', 'q5')} has a move on b, so every branch dies. The set is empty, so the machine rejects abab, without reading the other 2 symbols.`,
    );
    expect(dead.extra!.run!.rows.map(setShort)).toEqual(['{q0,q1,q3}', '{q2,q5}', '∅']);
  });

  it('shows the ε-closure as its own step, or folds it in', () => {
    const calls: OpCall[] = [
      ['load', MACHINES.aOrB],
      ['run', 'b'],
    ];
    const sep = new Timeline(nfa, settings(), 1, calls).entries[1]!.steps;
    const fold = new Timeline(nfa, settings({ closure: 'folded' }), 1, calls).entries[1]!.steps;
    expect(sep.map((s) => s.lines[0])).toEqual([
      'run.start',
      'run.start',
      'run.for',
      'run.close',
      'run.check',
    ]);
    expect(fold.map((s) => s.lines.at(-1))).toEqual(['run.start', 'run.step', 'run.accept']);
    expect(sep[1]!.say).toBe(
      `Follow ε-moves from q0: they add q1 and q3. The set is E(${S('q0')}) = ${S('q0', 'q1', 'q3')}.`,
    );
    expect(fold[1]!.say).toContain(`ε-moves add q5: the set is ${S('q4', 'q5')}`);
    expect(sep.at(-1)!.extra!.run!.set).toEqual(fold.at(-1)!.extra!.run!.set);
    const ids = (s: NfaSettings) => nfa.pseudocode(s)[0]!.lines.map((l) => l.id);
    expect(ids(settings())).toContain('run.close');
    expect(ids(settings({ closure: 'folded' }))).toEqual(expect.arrayContaining(['run.step']));
  });

  it('goes round an ε-loop once', () => {
    const t = new Timeline(nfa, settings(), 1, [
      ['load', MACHINES.epsLoop],
      ['run', 'aba'],
    ]);
    expect(lastRun(t, 1).rows.map(setShort)).toEqual([
      '{q0,q1}',
      '{q0,q1,q2}',
      '{q0,q1}',
      '{q0,q1,q2}',
    ]);
  });

  it('tests a batch', () => {
    const t = new Timeline(nfa, settings(), 1, [
      ['load', MACHINES.thirdFromEnd],
      ['test', '+100 +0110 -0011 +11 111'],
    ]);
    const steps = t.entries[1]!.steps;
    const table = steps.at(-1)!.extra!.test!;
    expect(table.rows.map((r) => r.got)).toEqual([
      'accept',
      'accept',
      'reject',
      'reject',
      'accept',
    ]);
    expect(steps.at(-1)!.marks).toEqual([{ id: 'test-3', role: 'error' }]);
    expect(steps.at(-1)!.say).toContain('11 is rejected but should be accepted');
  });

  it('loads any machine, ε-moves and all', () => {
    const t = new Timeline(nfa, settings(), 1, [['load', 'q0 a -> q1; q0 a -> q2; q1 eps -> q2']]);
    expect(t.entries[0]!.steps.at(-1)!.say).toContain('Loaded an NFA with 3 states');
  });
});
