import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { stateId } from '../../layouts/automaton';
import { accepts, complete, isDeterministic, type Automaton } from '../_automata/automaton';
import { formatAutomaton, parseAutomaton } from '../_automata/parse';
import { dfa } from '.';
import { loadCall, parseBatch, parseFaInput, randomDfa, wordText } from './kit';
import { MACHINES } from './machines';
import type { DfaSettings } from './model';

const settings = (s: Partial<DfaSettings> = {}): DfaSettings =>
  ({ ...dfa.defaults, ...s }) as DfaSettings;

const machine = (text: string) => parseAutomaton(text) as Automaton;

/** Every word over the alphabet up to length n. */
function allWords(alphabet: string[], n: number): string[] {
  let level = [''];
  const out = [''];
  for (let i = 0; i < n; i++) {
    level = level.flatMap((w) => alphabet.map((c) => w + c));
    out.push(...level);
  }
  return out;
}

const count = (w: string, c: string) => [...w].filter((x) => x === c).length;

/** What each named machine is meant to accept, written directly. */
const LANGUAGES: Record<keyof typeof MACHINES, (w: string) => boolean> = {
  endsIn01: (w) => w.endsWith('01'),
  div3: (w) => w === '' || parseInt(w, 2) % 3 === 0,
  evenEven: (w) => count(w, 'a') % 2 === 0 && count(w, 'b') % 2 === 0,
  startsAb: (w) => w.startsWith('ab'),
  endsAb: (w) => w.endsWith('ab'),
  // The buggy machine: it is the endsAb language minus words that need "aab" handled right.
  endsAbBug: (w) => accepts(machine(MACHINES.endsAbBug), w),
};

function runOf(t: Timeline<unknown, DfaSettings, unknown>, k: number) {
  return (t.entries[k]!.steps.at(-1)!.extra as { run?: { verdict?: string; q: string } }).run;
}

describe('DFA', () => {
  it('runs each named machine on its language', () => {
    for (const [name, text] of Object.entries(MACHINES)) {
      const a = machine(text);
      expect(isDeterministic(a), name).toBe(true);
      for (const w of allWords(a.alphabet, 6)) {
        const want = LANGUAGES[name as keyof typeof MACHINES](w);
        expect(accepts(a, w), `${name} on ${wordText(w)}`).toBe(want);
      }
    }
    // The bug: aab ends in ab but is rejected.
    expect(accepts(machine(MACHINES.endsAbBug), 'aab')).toBe(false);
  });

  it('agrees with the reference on random machines and words, step by step', () => {
    const word = fc.stringMatching(/^[ab]{0,9}$/);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 6 }),
        fc.boolean(),
        fc.constantFrom('hide' as const, 'draw' as const),
        fc.array(word, { minLength: 1, maxLength: 4 }),
        (seed, n, partial, dead, words) => {
          const made = randomDfa(makeRng(seed), n, { partial });
          const st = settings({ dead });
          const calls: OpCall[] = [
            loadCall(made),
            ...words.map((w): OpCall => ['run', w || 'eps']),
          ];
          const t = new Timeline(dfa, st, 1, calls);
          const a = t.entries[0]!.end.machine;
          expect(a).toEqual(made);
          const drawn = dead === 'draw' ? complete(a) : a;
          words.forEach((w, k) => {
            const r = runOf(t, k + 1)!;
            expect(r.verdict, `${formatAutomaton(a)} on ${wordText(w)}`).toBe(
              accepts(a, w) ? 'accept' : 'reject',
            );
            // Each step reads at most one more symbol, and the state is where δ leads.
            let read = 0;
            for (const step of t.entries[k + 1]!.steps) {
              const run = step.extra!.run!;
              expect(drawn.states).toContain(run.q);
              expect(run.read - read).toBeGreaterThanOrEqual(0);
              expect(run.read - read).toBeLessThanOrEqual(1);
              read = run.read;
              expect(step.vars?.state).toBe(run.q);
              expect(step.vars?.steps).toBe(run.read);
              if (run.last) expect(drawn.moves).toContainEqual(run.last);
              if (step.lines.includes('run.move')) {
                expect(run.last?.to).toBe(run.q);
                expect(step.marks).toContainEqual({ id: stateId(run.q), role: 'active' });
              }
            }
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('stops at a missing move and says so, unless the dead state is drawn', () => {
    const calls: OpCall[] = [
      ['load', MACHINES.startsAb],
      ['run', 'aab'],
    ];
    const hide = new Timeline(dfa, settings(), 1, calls).entries[1]!;
    expect(hide.steps.at(-1)!.say).toContain(
      'there is no move from q1 on a. A missing move rejects',
    );
    expect(hide.steps.at(-1)!.lines).toEqual(['run.for', 'run.missing', 'run.stuck']);
    expect(hide.steps).toHaveLength(3);
    const draw = new Timeline(dfa, settings({ dead: 'draw' }), 1, calls).entries[1]!;
    expect(draw.steps.at(-1)!.extra!.run!.q).toBe('dead');
    expect(draw.steps).toHaveLength(5);
    expect(draw.steps[2]!.say).toContain('δ(q1, a) = dead, the dead state');
    // The pseudocode only has the missing-move lines when moves can be missing.
    const ids = (s: DfaSettings) => dfa.pseudocode(s)[0]!.lines.map((l) => l.id);
    expect(ids(settings())).toContain('run.missing');
    expect(ids(settings({ dead: 'draw' }))).not.toContain('run.missing');
  });

  it('tests a batch and marks the mismatches', () => {
    const t = new Timeline(dfa, settings(), 1, [
      ['load', MACHINES.endsAbBug],
      ['test', '+ab +aab -ba -eps bab'],
    ]);
    const steps = t.entries[1]!.steps;
    const table = steps.at(-1)!.extra!.test!;
    expect(table.rows.map((r) => [r.word, r.expect, r.got])).toEqual([
      ['ab', 'accept', 'accept'],
      ['aab', 'accept', 'reject'],
      ['ba', 'reject', 'reject'],
      ['', 'reject', 'reject'],
      ['bab', null, 'accept'],
    ]);
    expect(steps.at(-1)!.marks).toEqual([{ id: 'test-1', role: 'error' }]);
    expect(steps.at(-1)!.say).toContain('3 of 4 words do what they should');
    // The runs inside a test are fine detail; the rows are normal detail.
    expect(steps.filter((s) => s.level === 2).length).toBe(1 + 5);
  });

  it('keeps the old machine when the text is not a DFA', () => {
    const t = new Timeline(dfa, settings(), 1, [
      ['load', 'q0 a -> q1; q0 a -> q2'],
      ['load', 'q0 eps -> q1'],
      ['load', 'q0 ab -> q1'],
    ]);
    const says = t.entries.map((e) => e.steps.at(-1)!.say);
    expect(says[0]).toContain('q0 has 2 moves on a (to q1 and q2)');
    expect(says[1]).toContain('ε-move');
    expect(says[2]).toContain('"ab" in "q0 ab -> q1" is not a symbol');
    expect(t.endState().machine).toEqual(dfa.init(settings()).machine);
  });

  it('explains words that cannot be run', () => {
    const t = new Timeline(dfa, settings(), 1, [
      ['run', 'abc'],
      ['run', '+01'],
      ['run', 'q0 0 -> q1'],
      ['test', '+'],
    ]);
    const says = t.entries.map((e) => e.steps.at(-1)!.say);
    expect(says[0]).toContain('"a" is not in the alphabet { 0, 1 }');
    expect(says[1]).toContain('Press Test');
    expect(says[2]).toContain('press Load');
    expect(says[3]).toContain('has no word after the sign');
  });

  it('reads the input field and batches', () => {
    expect(parseFaInput('0101')).toBe('0101');
    expect(parseFaInput('+01 -10 -eps')).toBe('+01 -10 -eps');
    expect(parseFaInput('q0 a -> q1')).toBe('q0 a -> q1');
    expect(parseFaInput('q0 a -> ')).toBeInstanceOf(Error);
    expect(parseFaInput('a#b')).toBeInstanceOf(Error);
    expect(parseFaInput('  ')).toBeInstanceOf(Error);
    const a = machine(MACHINES.endsAb);
    expect(parseBatch('+ab, -ba ε', a)).toEqual([
      { word: 'ab', expect: 'accept' },
      { word: 'ba', expect: 'reject' },
      { word: '', expect: null },
    ]);
    expect(parseBatch('+ab +ac', a)).toBeInstanceOf(Error);
    expect(parseBatch(Array(9).fill('+a').join(' '), a)).toBeInstanceOf(Error);
  });
});
