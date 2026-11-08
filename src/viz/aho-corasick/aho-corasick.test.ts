import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { ahoCorasick } from '.';
import { PATTERN_SETS, ROOT, spell, type AcSettings, type PatternSet } from './model';

const run = (ops: OpCall[], s: Partial<AcSettings> = {}) =>
  new Timeline(ahoCorasick, { ...ahoCorasick.defaults, ...s }, 1, ops);

/** Every (start, word), by brute force. */
function brute(patterns: readonly string[], text: string): string[] {
  const out: string[] = [];
  for (const w of patterns)
    for (let s = 0; s + w.length <= text.length; s++) if (text.startsWith(w, s)) out.push(`${s}:${w}`);
  return out.sort();
}

/** The longest proper suffix of w that is a prefix of some pattern ('' for none). */
function refFail(patterns: readonly string[], w: string): string {
  for (let k = 1; k < w.length; k++) {
    const suf = w.slice(k);
    if (patterns.some((p) => p.startsWith(suf))) return suf;
  }
  return '';
}

const SETS = Object.keys(PATTERN_SETS) as PatternSet[];

describe('Aho-Corasick', { timeout: 60_000 }, () => {
  it('reports exactly the brute-force matches, with failure links by the definition', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SETS),
        fc.constantFrom('links' as const, 'sets' as const),
        fc.array(fc.constantFrom('a', 'b', 'c', 'e', 'h', 'i', 'r', 's', 'A', 'C', 'G', 'T'), { minLength: 1, maxLength: 16 }),
        (patterns, outputs, chars) => {
          const text = chars.join('');
          const t = run([['search', text]], { patterns, outputs });
          const end = t.endState();
          const ps = end.patterns;
          expect(end.matches.map((m) => `${m.at}:${m.word}`).sort()).toEqual(brute(ps, text));
          for (const n of end.nodes) {
            if (n.id === ROOT) continue;
            expect(spell(end.nodes, n.fail!)).toBe(refFail(ps, spell(end.nodes, n.id)));
          }
          // Every step: the current node spells a suffix of what has been read.
          for (let k = 0; k < t.length; k++) {
            const st = t.at(k).step.state;
            if (st.text !== text) continue;
            expect(text.slice(0, st.pos).endsWith(spell(st.nodes, st.cur))).toBe(true);
          }
          expect(end.hops).toBeLessThanOrEqual(text.length);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('adds a pattern, clears the links and finds it', () => {
    const t = run([['build'], ['add', 'is'], ['search', 'thisishers']]);
    expect(t.entries[1]!.end.built).toBe(false);
    expect(t.entries[1]!.end.nodes.length).toBe(t.entries[0]!.end.nodes.length + 2);
    expect(brute(t.endState().patterns, 'thisishers')).toContain('2:is');
    const say = (k: number) => t.entries[k]!.steps.at(-1)!.say;
    expect(run([['add', 'he']]).entries[0]!.steps[0]!.say).toMatch(/already a pattern/);
    expect(say(2)).toMatch(/^Done\./);
  });

  it('finds she, he and hers in ushers', () => {
    const end = run([['search', 'ushers']]).endState();
    expect(end.matches).toEqual([
      { word: 'she', at: 1 },
      { word: 'he', at: 2 },
      { word: 'hers', at: 2 },
    ]);
  });
});

describe('Aho-Corasick practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 30 && seed < 400; seed++)
      for (const item of practiceSet(ahoCorasick, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(15);
    return out;
  }
  const patterns = (q: PracticeQuestion) => String(q.settings!.patterns).split(' ');
  const text = (q: PracticeQuestion) => String(q.watch![0]![1]);

  it('agrees with brute force and the definition', () => {
    for (const q of questions('match-count'))
      expect(q.answer).toEqual({ kind: 'number', value: brute(patterns(q), text(q)).length });
    for (const q of questions('fail-target')) {
      const word = /node for `(\w+)`/.exec(q.prompt)![1]!;
      const f = refFail(patterns(q), word);
      const a = q.answer;
      if (a.kind === 'choice') expect(a.options[a.correct]).toBe(f || 'the root');
    }
    for (const q of questions('state-after')) {
      const t = text(q);
      // The longest suffix of t that is a prefix of some pattern.
      let best = '';
      for (let k = 0; k < t.length; k++)
        if (patterns(q).some((p) => p.startsWith(t.slice(k)))) {
          best = t.slice(k);
          break;
        }
      const a = q.answer;
      if (a.kind === 'choice') expect(a.options[a.correct]).toBe(best || 'the root');
    }
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(ahoCorasick, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(ahoCorasick, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
