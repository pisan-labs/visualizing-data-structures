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
import cppSource from './code/cpp/brute_force.hpp?raw';
import javaSource from './code/java/BruteForce.java?raw';
import pythonSource from './code/python/brute_force.py?raw';
import bestCase from './examples/best-case.json';
import noMatch from './examples/no-match.json';
import overlapping from './examples/overlapping.json';
import tooLong from './examples/too-long.json';
import twoMatches from './examples/two-matches.json';
import worstCase from './examples/worst-case.json';
import explain from './explain.md?raw';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BruteSettings,
} from './model';
import { brutePractice } from './practice';
import { view } from './view';

export const bruteForce: VizDef<MatchState<null>, BruteSettings, MatchExtra> = {
  id: 'brute-force-search',
  title: 'Brute-force string search',
  family: 'Strings',
  blurb:
    'Put the pattern at every shift of the text in turn and compare left to right until a mismatch.',
  settings: [],
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
    ],
    random: {
      label: 'Random text',
      make: (rng) => {
        const p = randomWord(rng, rng.int(3, 4), 'ABC');
        return [loadCall(plantedText(rng, 16, p, 'ABC'), p), ['search']];
      },
    },
    presets: [
      {
        label: 'Random letters A and B',
        make: (rng, n) => {
          const p = randomWord(rng, rng.int(3, 4), 'AB');
          return [loadCall(plantedText(rng, n, p, 'AB'), p)];
        },
      },
      {
        label: 'Random DNA (A, C, G, T)',
        make: (rng, n) => {
          const p = randomWord(rng, 4, 'ACGT');
          return [loadCall(plantedText(rng, n, p, 'ACGT'), p)];
        },
      },
      {
        label: 'Overlapping matches: ABAB… and ABABA',
        make: (_rng, n) => [loadCall('AB'.repeat(Math.ceil(n / 2)).slice(0, n), 'ABABA')],
      },
      {
        label: 'Worst case: AAA…AB and AAAB',
        make: (_rng, n) => [loadCall(`${'A'.repeat(n - 1)}B`, 'AAAB')],
      },
      {
        label: 'Best case: the first letter never matches',
        make: (rng, n) => [loadCall(randomWord(rng, n, 'BCD'), `A${randomWord(rng, 3, 'BCD')}`)],
      },
    ],
    sizes: [12, 16, 20, 24],
  },
  explain,
  complexity: [
    {
      op: 'preprocessing',
      best: { cost: 'O(1)', why: 'There is none: the first comparison happens at once.' },
      average: { cost: 'O(1)', why: 'Nothing is built from the pattern.' },
      worst: {
        cost: 'O(1)',
        why: 'No tables, so no extra memory beyond the list of matches.',
      },
    },
    {
      op: 'search(T, P), every match',
      best: {
        cost: 'O(n)',
        why: 'Every shift fails on its first comparison: n − m + 1 comparisons.',
        example: 'best-case',
      },
      average: {
        cost: 'O(n)',
        why: 'On random text most shifts fail within a character or two: fewer than 2 comparisons per shift on average, even with only two letters.',
        example: 'two-matches',
      },
      worst: {
        cost: 'O(mn)',
        why: 'Every shift compares all m characters before it fails or matches: m(n − m + 1) comparisons.',
        example: 'worst-case',
      },
      note: 'n = |T| and m = |P|. A match costs m comparisons at its shift, however clever the search.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(bruteForce, settings as BruteSettings, 1, calls);
      return driverScript(t.entries, t.initial.state);
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twoMatches,
    worstCase,
    bestCase,
    overlapping,
    noMatch,
    tooLong,
  ] as unknown as SavedExample[],
  practice: brutePractice(() => bruteForce),
};

export default bruteForce;
