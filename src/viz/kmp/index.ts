import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  driverScript,
  loadCall,
  MAX_PATTERN,
  MAX_TEXT,
  parseInput,
  plantedText,
  randomWord,
  type MatchExtra,
  type MatchState,
} from '../_strings/kit';
import { describeMatch } from '../_strings/view';
import cppSource from './code/cpp/kmp.hpp?raw';
import javaSource from './code/java/Kmp.java?raw';
import pythonSource from './code/python/kmp.py?raw';
import buildTable from './examples/build-table.json';
import everyShift from './examples/every-shift.json';
import keepsThree from './examples/keeps-three.json';
import noMatch from './examples/no-match.json';
import overlapping from './examples/overlapping.json';
import worstCase from './examples/worst-case.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type KmpPre,
  type KmpSettings,
} from './model';
import { kmpPractice } from './practice';
import { view } from './view';

export const kmp: VizDef<MatchState<KmpPre>, KmpSettings, MatchExtra> = {
  id: 'kmp',
  title: 'Knuth-Morris-Pratt',
  family: 'Strings',
  blurb:
    'Learn from the pattern first, then slide it past whatever already matched without ever moving back in the text.',
  settings: [
    {
      kind: 'choice',
      key: 'name',
      label: 'Call the table',
      options: [
        { value: 'pi', label: 'π, the prefix function (CLRS)' },
        { value: 'failure', label: 'f, the failure function' },
      ],
      help: 'Books differ on the name. The numbers are the same.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe: describeMatch,
  controls: {
    input: {
      label: 'Text / pattern',
      placeholder: 'e.g. ABRACADABRA / ABRA',
      maxLength: MAX_TEXT + MAX_PATTERN + 8,
      sample: 'ABRACADABRA / ABRA',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'search', label: 'Search', usesInput: false },
      { op: 'next', label: 'Next alignment', usesInput: false, more: true },
      { op: 'prefix', label: 'Build the table', usesInput: false, more: true },
    ],
    random: {
      label: 'Random text',
      make: (rng) => {
        const p = randomWord(rng, rng.int(4, 6), 'AB');
        return [loadCall(plantedText(rng, 16, p, 'AB'), p), ['search']];
      },
    },
    presets: [
      {
        label: 'Random letters A and B',
        make: (rng, n) => {
          const p = randomWord(rng, rng.int(4, 6), 'AB');
          return [loadCall(plantedText(rng, n, p, 'AB'), p)];
        },
      },
      {
        label: 'Random DNA (A, C, G, T)',
        make: (rng, n) => {
          const p = randomWord(rng, rng.int(4, 6), 'ACGT');
          return [loadCall(plantedText(rng, n, p, 'ACGT'), p)];
        },
      },
      {
        label: 'Long borders: ABAB… and ABABAC',
        make: (_rng, n) => [loadCall(`${'AB'.repeat(n).slice(0, n - 2)}AC`, 'ABABAC')],
      },
      {
        label: 'Brute force’s worst case: AAA…AB and AAAB',
        make: (_rng, n) => [loadCall(`${'A'.repeat(n - 1)}B`, 'AAAB')],
      },
      {
        label: 'A match at every shift: AAA… and AAA',
        make: (_rng, n) => [loadCall('A'.repeat(n), 'AAA')],
      },
    ],
    sizes: [12, 16, 20, 24],
  },
  explain,
  complexity: [
    {
      op: 'build π (preprocessing)',
      best: {
        cost: 'O(m)',
        why: 'A pattern with no repeats: each position is one comparison with P[0].',
      },
      average: {
        cost: 'O(m)',
        why: 'q grows by at most one per position and each fallback shrinks it, so fewer than 2m comparisons.',
        example: 'build-table',
      },
      worst: {
        cost: 'O(m)',
        why: 'Even long fallback chains are paid for by the growth before them: under 2m comparisons.',
        example: 'build-table',
      },
      note: 'Space: O(m) for the table. It depends on P alone, so it is built once per pattern.',
    },
    {
      op: 'search(T, P), every match',
      best: {
        cost: 'O(n)',
        why: 'Every shift fails on its first character: n − m + 1 comparisons, the same as brute force.',
      },
      average: {
        cost: 'O(n)',
        why: 'The text pointer only moves forward, and slides skip shifts brute force would try.',
        example: 'keeps-three',
      },
      worst: {
        cost: 'O(n)',
        why: 'At most n comparisons succeed (each moves i forward) and each alignment ends with at most one failure: under 2n.',
        example: 'worst-case',
      },
      note: 'Building the table and searching together: O(n + m), whatever the text.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(kmp, settings as KmpSettings, 1, calls);
      return driverScript(t.entries, t.initial.state);
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    keepsThree,
    worstCase,
    overlapping,
    everyShift,
    noMatch,
    buildTable,
  ] as unknown as SavedExample[],
  practice: kmpPractice(() => kmp),
  preview: { example: 'keeps-three', level: 2 },
};

export default kmp;
