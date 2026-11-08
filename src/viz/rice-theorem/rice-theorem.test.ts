import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { PROGRAMS, runProgram, parseCode, type Instr } from '../halting-problem/toy';
import { riceTheorem } from '.';
import { PROPS, defaults, type PropId, type RiceSettings } from './model';

const run = (calls: OpCall[], settings: RiceSettings = defaults) =>
  new Timeline(riceTheorem, settings, 1, calls);

/** Reference: M′ written out as one function, straight from its definition. */
function reference(i: number, j: number, mp: string, x: string) {
  const first = runProgram(PROGRAMS[i]!.prog, PROGRAMS[j]!.code).outcome;
  if (first === 'loop') return 'loop';
  return runProgram(parseCode(mp) as Instr[], x).outcome;
}

describe('rice-theorem', () => {
  it('builds M′ and shows it has P when M halts on w', () => {
    const t = run([['build', 3, 2], ['test', 'A'], ['decide']]);
    expect(t.entries[1]!.end.rows).toEqual([{ x: 'A', outcome: 'accept' }]);
    expect(t.endState().argued).toBe(5);
    expect(t.entries[2]!.steps[3]!.say).toContain('yes, it halts');
  });

  it('M′ loops on every input when M loops on w', () => {
    const t = run([
      ['build', 3, 1],
      ['test', 'A'],
      ['test', 'eps'],
    ]);
    expect(t.endState().rows.map((r) => r.outcome)).toEqual(['loop', 'loop']);
  });

  it('refuses tests before a build, and bad program numbers', () => {
    const t = run([
      ['test', 'A'],
      ['build', 9, 1],
    ]);
    expect(t.entries[0]!.steps[0]!.say).toContain('Build M′ first');
    expect(t.entries[1]!.steps[0]!.say).toContain('two program numbers');
  });

  it('agrees with the definition of M′ for every program, input and property (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.constantFrom<PropId>('accepts-A', 'accepts-eps', 'nonempty'),
        fc.array(fc.constantFrom('A', 'G', 'R', 'E', '1'), { maxLength: 4 }),
        (i, j, property, letters) => {
          const x = letters.join('');
          const t = run(
            [
              ['build', i, j],
              ['test', x || 'eps'],
            ],
            { property },
          );
          const end = t.endState();
          expect(end.rows.at(-1)!.outcome).toBe(reference(i - 1, j - 1, PROPS[property].code, x));
          // L(M′) has P exactly when M halts on w.
          const probe = property === 'accepts-eps' ? '' : 'A';
          const halts = runProgram(PROGRAMS[i - 1]!.prog, PROGRAMS[j - 1]!.code).outcome !== 'loop';
          expect(reference(i - 1, j - 1, PROPS[property].code, probe) === 'accept').toBe(halts);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('writes the driver script from the model', () => {
    const { input, expected } = riceTheorem.code!.script(
      [['build', 3, 2], ['test', 'A'], ['decide']],
      defaults,
    );
    expect(input).toEqual(['property accepts-A', 'build 3 2', 'test A', 'decide']);
    expect(expected).toEqual(['accept', 'yes']);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(riceTheorem, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(riceTheorem, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
