import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { lba } from '.';
import { LEFT, RIGHT, defaults, type MachineId } from './model';

const run = (machine: MachineId, w: string) =>
  new Timeline(lba, { ...defaults, machine }, 1, [['run', w || 'eps']]);

/** References: the languages, decided directly. */
const inAnbncn = (w: string) => {
  const n = w.length / 3;
  return Number.isInteger(n) && w === 'a'.repeat(n) + 'b'.repeat(n) + 'c'.repeat(n);
};
const inPower2 = (w: string) => /^a+$/.test(w) && (w.length & (w.length - 1)) === 0;

describe('lba', () => {
  it('accepts aabbcc in 23 moves and rejects abcabc', () => {
    expect(run('anbncn', 'aabbcc').endState()).toMatchObject({ verdict: 'accept', moves: 23 });
    expect(run('anbncn', 'abcabc').endState().verdict).toBe('reject');
  });

  it('stops the doubling machine at the right marker', () => {
    const t = run('double', 'aa');
    expect(t.endState().verdict).toBe('blocked');
    expect(t.entries[0]!.steps.at(-1)!.say).toContain('An LBA may not');
  });

  it('refuses letters the machine does not read', () => {
    const t = run('power2', 'ab');
    expect(t.entries[0]!.steps.at(-1)!.say).toContain('"b" is not an input symbol');
  });

  it('decides its language and never leaves the markers (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<MachineId>('anbncn', 'power2'),
        fc.array(fc.constantFrom('a', 'b', 'c'), { maxLength: 9 }),
        (machine, letters) => {
          const w = machine === 'power2' ? 'a'.repeat(letters.length) : letters.join('');
          const t = run(machine, w);
          const end = t.endState();
          expect(end.verdict === 'accept', `${machine} ${w}`).toBe(
            machine === 'anbncn' ? inAnbncn(w) : inPower2(w),
          );
          for (const st of t.entries[0]!.steps) {
            const s = st.state;
            expect(s.tape).toHaveLength(w.length + 2);
            expect(s.tape[0]).toBe(LEFT);
            expect(s.tape.at(-1)).toBe(RIGHT);
            expect(s.head).toBeGreaterThanOrEqual(0);
            expect(s.head).toBeLessThanOrEqual(w.length + 1);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = lba.code!.script(
      [
        ['run', 'aabbcc'],
        ['run', 'abcabc'],
      ],
      defaults,
    );
    expect(input).toEqual(['machine anbncn', 'run aabbcc', 'run abcabc']);
    expect(expected).toEqual(['accept 23', 'reject 7']);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(lba, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(lba, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
