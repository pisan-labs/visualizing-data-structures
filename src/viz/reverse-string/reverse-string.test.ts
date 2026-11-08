import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { parseText, reverseString } from '.';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import type { RevSettings, Variant } from './model';

const settings = (variant: Variant): RevSettings =>
  ({ ...reverseString.defaults, variant }) as RevSettings;

const ref = (s: string) => [...s].reverse().join('');

/** The array after the first k swaps of the outside-in reversal. */
function afterSwaps(s: string, k: number): string {
  const a = [...s];
  for (let i = 0, j = a.length - 1, done = 0; i < j && done < k; i++, j--, done++)
    [a[i], a[j]] = [a[j]!, a[i]!];
  return a.join('');
}

const wordArb = fc.stringMatching(/^[A-Za-z0-9]{1,8}$/);

describe('reverse-string', () => {
  it('reverses the rest first, building partial results on the way back', () => {
    const t = new Timeline(reverseString, settings('rest'), 1, [['reverse', 'STACK']]);
    const steps = t.entries[0]!.steps;
    expect(steps.at(-1)!.vars?.result).toBe('KCATS');
    const returned = steps.filter((s) => s.lines.includes('rec') && s.say.includes('returns "'));
    expect(returned.map((s) => s.vars?.returned)).toEqual(['KC', 'KCA', 'KCAT', 'KCATS']);
    expect(Math.max(...steps.map((s) => s.state.stack.length))).toBe(5);
  });

  it('swaps the ends in place, and stops when i passes j', () => {
    const t = new Timeline(reverseString, settings('swap'), 1, [['reverse', 'ABCD']]);
    const steps = t.entries[0]!.steps;
    expect(steps.filter((s) => s.lines.includes('swap'))).toHaveLength(2);
    expect(steps.at(-1)!.vars?.result).toBe('DCBA');
    expect(steps.find((s) => s.lines.includes('ret'))!.say).toContain('2 > 1');
  });

  it('loads without reversing, and refuses what it cannot take', () => {
    const t = new Timeline(reverseString, settings('swap'), 1, [
      ['load', 'HELLO'],
      ['reverse', 'way too long'],
      ['reverse', 'a-b'],
    ]);
    expect(
      t
        .endState()
        .cells.map((c) => c.ch)
        .join(''),
    ).toBe('HELLO');
    expect(t.endState().run).toBeNull();
    expect(t.entries[1]!.steps).toHaveLength(1);
  });

  it('matches a reference reversal, with sound frames at every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Variant>('rest', 'swap'),
        fc.array(wordArb, { minLength: 1, maxLength: 3 }),
        (variant, words) => {
          const calls: OpCall[] = words.map((w) => ['reverse', w]);
          const t = new Timeline(reverseString, settings(variant), 1, calls);
          words.forEach((w, k) => {
            const steps = t.entries[k]!.steps;
            expect(steps.at(-1)!.vars?.result).toBe(ref(w));
            const frames = variant === 'rest' ? w.length : Math.floor(w.length / 2) + 1;
            expect(Math.max(...steps.map((s) => s.state.stack.length))).toBe(frames);
            let swaps = 0;
            for (const s of steps) {
              const st = s.state;
              // Every frame was called by the frame below it.
              st.stack.forEach((id, i) => {
                expect(st.calls[id - 1]!.parent).toBe(i === 0 ? null : st.stack[i - 1]);
              });
              expect(s.vars?.depth).toBe(st.stack.length);
              // The characters only ever move by swaps.
              const now = st.cells.map((c) => c.ch).join('');
              expect([...now].sort().join('')).toBe([...w].sort().join(''));
              if (s.lines.includes('swap')) swaps++;
              if (variant === 'swap') expect(now).toBe(afterSwaps(w, swaps));
              else expect(now).toBe(w);
              // Every value returned so far is the reverse of that call's part of the string.
              for (const [id, v] of Object.entries(st.result)) {
                expect(v).toBe(ref(w.slice(st.calls[Number(id) - 1]!.i)));
              }
            }
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('writes driver input that the code tabs can run', () => {
    const calls: OpCall[] = [
      ['load', 'XY'],
      ['reverse', 'ABC'],
      ['reverse', 'no way'],
    ];
    expect(reverseString.code!.script(calls, settings('rest'))).toEqual({
      input: ['reverse ABC'],
      expected: ['CBA'],
    });
    expect(reverseString.code!.script(calls, settings('swap')).input).toEqual(['swap ABC']);
  });

  it('parses words', () => {
    expect(parseText('STACK')).toBe('STACK');
    expect(parseText(' 007 ')).toBe('007');
    expect(parseText('ABCDEFGHI')).toBeInstanceOf(Error);
    expect(parseText('a-b')).toBeInstanceOf(Error);
    expect(parseText('')).toBeInstanceOf(Error);
  });
});

describe('reverse-string practice', () => {
  const kinds = reverseString.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual(['smaller', 'depth', 'partial', 'swaps']);
  });

  it('gets every answer right, checked against the reference', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const w = String(q.watch![0]![1]);
        const a = q.answer;
        const variant = q.settings!.variant as Variant;
        if (k.id === 'smaller') {
          expect(a).toEqual({ kind: 'sequence', value: [ref(w)] });
          expect(ref(w).startsWith(ref(String(q.setup[0]![1])))).toBe(true);
        } else if (k.id === 'depth') {
          const frames = variant === 'rest' ? w.length : Math.floor(w.length / 2) + 1;
          expect(a).toEqual({ kind: 'number', value: frames });
        } else if (k.id === 'partial') {
          const suffix = /reverse\("([A-Z]+)"\)` hand back/.exec(q.prompt)![1]!;
          expect(w.endsWith(suffix)).toBe(true);
          expect(a).toEqual({ kind: 'sequence', value: [ref(suffix)] });
        } else {
          const swaps = q.prompt.includes('2nd swap') ? 2 : 1;
          expect(a).toEqual({ kind: 'sequence', value: [...afterSwaps(w, swaps)] });
        }
      }
    }
  });
});

describe('drawn text size', () => {
  // The stack beside the tree drew at 7.8 px on a phone; the tree now has the stack's font, and
  // a phone gets a narrower stack (under the tree, or with each line on a second row).
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(reverseString, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(reverseString, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
