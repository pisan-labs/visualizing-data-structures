import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWord } from '../_dp/kit';
import cppSource from './code/cpp/lcs.hpp?raw';
import javaSource from './code/java/Lcs.java?raw';
import pythonSource from './code/python/lcs.py?raw';
import dna from './examples/dna.json';
import lengthFour from './examples/length-four.json';
import nothingCommon from './examples/nothing-common.json';
import rowByRow from './examples/row-by-row.json';
import sameString from './examples/same-string.json';
import tieLeft from './examples/tie-left.json';
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
  type LcsExtra,
  type LcsSettings,
  type LcsState,
} from './model';
import { lcsPractice } from './practice';
import { view } from './view';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomWord(next: () => number, lo: number, hi: number, letters: string): string {
  const n = lo + Math.floor(next() * (hi - lo + 1));
  return Array.from({ length: n }, () => letters[Math.floor(next() * letters.length)]).join('');
}

export const dpLcs: VizDef<LcsState, LcsSettings, LcsExtra> = {
  id: 'dp-lcs',
  title: 'Longest common subsequence',
  family: 'Dynamic programming',
  blurb:
    'Fill a table with the LCS length of every pair of prefixes, then walk back from the corner to read off one LCS.',
  settings: [
    {
      kind: 'choice',
      key: 'tie',
      label: 'When the cell above and the cell to the left tie',
      options: [
        { value: 'up', label: 'Go up (CLRS)' },
        { value: 'left', label: 'Go left' },
      ],
      help: 'The numbers stay the same. The walk back can find a different LCS of the same length.',
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
      label: 'Two strings',
      placeholder: 'e.g. ABCBDAB BDCABA',
      maxLength: 2 * MAX_LEN + 4,
      sample: 'ABCBDAB',
      parse: parseWord(MAX_LEN),
    },
    buttons: [
      {
        op: 'load',
        label: 'Load',
        usesInput: true,
        primary: true,
        args: ['the first string', 'the second string'],
      },
      { op: 'fill', label: 'Fill the table', usesInput: false },
      { op: 'trace', label: 'Trace back', usesInput: false },
      { op: 'row', label: 'Fill one row', usesInput: false, more: true },
    ],
    random: {
      label: 'Random strings',
      make: (rng) => [
        ['load', randomWord(rng.next, 5, 8, 'ABCD'), randomWord(rng.next, 5, 8, 'ABCD')],
        ['fill'],
        ['trace'],
      ],
    },
    presets: [
      {
        label: 'Random letters A to D',
        make: (rng, size) => [
          [
            'load',
            randomWord(rng.next, size, size, 'ABCD'),
            randomWord(rng.next, size, size, 'ABCD'),
          ],
          ['fill'],
          ['trace'],
        ],
      },
      {
        label: 'DNA (A, C, G, T)',
        make: (rng, size) => [
          [
            'load',
            randomWord(rng.next, size, size, 'ACGT'),
            randomWord(rng.next, size, size, 'ACGT'),
          ],
          ['fill'],
          ['trace'],
        ],
      },
      {
        label: 'Random letters A to Z (few matches)',
        make: (rng, size) => [
          [
            'load',
            randomWord(rng.next, size, size, ALPHABET),
            randomWord(rng.next, size, size, ALPHABET),
          ],
          ['fill'],
          ['trace'],
        ],
      },
      {
        label: 'A word and itself (best case)',
        make: (rng, size) => {
          const w = randomWord(rng.next, size, size, ALPHABET);
          return [['load', w, w], ['fill'], ['trace']];
        },
      },
      {
        label: 'Nothing in common',
        make: (_rng, size) => [
          ['load', 'ABCDEFGHIJ'.slice(0, size), 'QRSTUVWXYZ'.slice(0, size)],
          ['fill'],
          ['trace'],
        ],
      },
    ],
    sizes: [4, 6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'fill the table',
      best: {
        cost: 'O(mn)',
        why: 'Every one of the m·n cells is filled once, whatever the strings.',
        example: 'same-string',
      },
      average: { cost: 'O(mn)', why: 'Each cell does one comparison and one addition or max.' },
      worst: {
        cost: 'O(mn)',
        why: 'Two 8-character strings fill 64 cells, matches or not.',
        example: 'dna',
      },
      note: 'Space: O(mn) for the table. The length alone needs only two rows, O(min(m, n)).',
    },
    {
      op: 'trace back',
      best: {
        cost: 'O(min(m, n))',
        why: 'A word and itself: every step is a diagonal match.',
        example: 'same-string',
      },
      average: {
        cost: 'O(m + n)',
        why: 'Each step moves up, left or diagonally, so it reaches the edge within m + n steps.',
        example: 'length-four',
      },
      worst: {
        cost: 'O(m + n)',
        why: 'Ups and lefts take no character, and there can be up to m + n - 1 steps in all.',
      },
      note: 'With no match at all every cell is 0, and the walk goes straight up (or left, by the tie rule), taking nothing.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LcsSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    lengthFour,
    tieLeft,
    rowByRow,
    nothingCommon,
    sameString,
    dna,
  ] as unknown as SavedExample[],
  practice: lcsPractice(() => dpLcs),
};

/**
 * Driver protocol for the code tabs: "length x y" prints the LCS length (after Fill the table);
 * "lcs x y" prints the length and the LCS the walk back finds (after Trace back). The code
 * follows the default tie rule (go up), so the expected output comes from a run with it.
 */
function codeScript(calls: OpCall[], settings: LcsSettings) {
  const t = new Timeline(dpLcs, { ...settings, tie: 'up' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const vars = e.steps.at(-1)!.vars ?? {};
    const { x, y } = e.end;
    if (e.call[0] === 'fill' && vars.length !== undefined) {
      input.push(`length ${x} ${y}`);
      expected.push(String(vars.length));
    } else if (e.call[0] === 'trace' && vars.lcs !== undefined) {
      input.push(`lcs ${x} ${y}`);
      expected.push(`${String(vars.length)} ${String(vars.lcs)}`.trim());
    }
  }
  return { input, expected };
}

export default dpLcs;
