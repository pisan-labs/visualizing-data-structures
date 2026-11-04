import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWord } from '../_dp/kit';
import cppSource from './code/cpp/edit_distance.hpp?raw';
import javaSource from './code/java/EditDistance.java?raw';
import pythonSource from './code/python/edit_distance.py?raw';
import costlyDelete from './examples/costly-delete.json';
import insertsOnly from './examples/inserts-only.json';
import intention from './examples/intention.json';
import kitten from './examples/kitten.json';
import sameWord from './examples/same-word.json';
import shift from './examples/shift.json';
import subCostsTwo from './examples/sub-costs-two.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LEN,
  ops,
  pseudocode,
  type EditExtra,
  type EditSettings,
  type EditState,
} from './model';
import { editPractice } from './practice';
import { view } from './view';

function randomWord(next: () => number, n: number, letters: string): string {
  return Array.from({ length: n }, () => letters[Math.floor(next() * letters.length)]).join('');
}

const solve = (a: string, b: string): OpCall[] => [['load', a, b], ['fill'], ['trace']];

export const dpEditDistance: VizDef<EditState, EditSettings, EditExtra> = {
  id: 'dp-edit-distance',
  title: 'Edit distance',
  family: 'Dynamic programming',
  blurb:
    'The fewest inserts, deletes and substitutions that turn one word into another, from a table of every pair of prefixes.',
  settings: [
    { kind: 'number', key: 'ins', label: 'An insert costs', min: 1, max: 5 },
    { kind: 'number', key: 'del', label: 'A delete costs', min: 1, max: 5 },
    {
      kind: 'number',
      key: 'sub',
      label: 'A substitution costs',
      min: 1,
      max: 9,
      help: 'Levenshtein distance charges 1 for each edit. A substitution that costs as much as a delete plus an insert never helps.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Two words',
      placeholder: 'e.g. kitten sitting',
      maxLength: 2 * MAX_LEN + 4,
      sample: 'kitten',
      parse: parseWord(MAX_LEN),
    },
    buttons: [
      {
        op: 'load',
        label: 'Load',
        usesInput: true,
        primary: true,
        args: ['the source word', 'the target word'],
      },
      { op: 'fill', label: 'Fill the table', usesInput: false },
      { op: 'trace', label: 'Trace back', usesInput: false },
      { op: 'row', label: 'Fill one row', usesInput: false, more: true },
    ],
    random: {
      label: 'Random words',
      make: (rng) =>
        solve(
          randomWord(rng.next, rng.int(4, 7), 'abcd'),
          randomWord(rng.next, rng.int(4, 7), 'abcd'),
        ),
    },
    presets: [
      {
        label: 'Random letters a to d',
        make: (rng, size) =>
          solve(randomWord(rng.next, size, 'abcd'), randomWord(rng.next, size, 'abcd')),
      },
      {
        label: 'A word and itself (distance 0)',
        make: (rng, size) => {
          const w = randomWord(rng.next, size, 'abcdefghij');
          return solve(w, w);
        },
      },
      {
        label: 'A word and its reverse',
        make: (rng, size) => {
          const w = randomWord(rng.next, size, 'abcdefghij');
          return solve(w, [...w].reverse().join(''));
        },
      },
      {
        label: 'Nothing in common (worst case)',
        make: (_rng, size) => solve('abcdefghi'.slice(0, size), 'rstuvwxyz'.slice(0, size)),
      },
    ],
    sizes: [3, 5, 7, 9],
  },
  explain,
  complexity: [
    {
      op: 'fill the table',
      best: {
        cost: 'O(mn)',
        why: 'Every one of the m·n cells is filled once, even for a word and itself.',
        example: 'same-word',
      },
      average: {
        cost: 'O(mn)',
        why: 'Each cell takes the minimum of three numbers.',
        example: 'kitten',
      },
      worst: {
        cost: 'O(mn)',
        why: 'Two 9-letter words fill 81 cells, whatever the costs.',
        example: 'intention',
      },
      note: 'Space: O(mn) for the table. The distance alone needs only two rows.',
    },
    {
      op: 'trace back',
      best: {
        cost: 'O(max(m, n))',
        why: 'Diagonal moves cover a letter of each word at once.',
        example: 'same-word',
      },
      average: {
        cost: 'O(m + n)',
        why: 'Every step moves up, left or diagonally, all the way to D[0][0].',
        example: 'shift',
      },
      worst: {
        cost: 'O(m + n)',
        why: 'With no diagonal move at all, each step covers one letter: m + n steps.',
      },
      note: 'Along row 0 and column 0 the walk can only insert or delete, as in one letter to banana.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as EditSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    kitten,
    intention,
    subCostsTwo,
    shift,
    costlyDelete,
    sameWord,
    insertsOnly,
  ] as unknown as SavedExample[],
  practice: editPractice(() => dpEditDistance),
};

/**
 * Driver protocol for the code tabs: "dist a b ins del sub" prints the distance (after Fill
 * the table); "align a b ins del sub" prints the distance and the edits from left to right
 * (after Trace back). The costs are the page's settings.
 */
function codeScript(calls: OpCall[], settings: EditSettings) {
  const t = new Timeline(dpEditDistance, settings, 1, calls);
  const costs = `${settings.ins} ${settings.del} ${settings.sub}`;
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const vars = e.steps.at(-1)!.vars ?? {};
    const { a, b } = e.end;
    if (e.call[0] === 'fill' && vars.distance !== undefined && vars.m !== undefined) {
      input.push(`dist ${a} ${b} ${costs}`);
      expected.push(String(vars.distance));
    } else if (e.call[0] === 'trace' && vars.ops !== undefined) {
      input.push(`align ${a} ${b} ${costs}`);
      expected.push(`${String(vars.distance)} ${String(vars.ops)}`);
    }
  }
  return { input, expected };
}

export default dpEditDistance;
