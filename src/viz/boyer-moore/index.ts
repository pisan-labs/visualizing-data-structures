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
import cppSource from './code/cpp/horspool.hpp?raw';
import javaSource from './code/java/Horspool.java?raw';
import pythonSource from './code/python/horspool.py?raw';
import bothRules from './examples/both-rules.json';
import everyShift from './examples/every-shift.json';
import goodSuffix from './examples/good-suffix.json';
import noMatch from './examples/no-match.json';
import skips from './examples/skips.json';
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
  type BmPre,
  type BmSettings,
} from './model';
import { bmPractice } from './practice';
import { view } from './view';

const WORDS = 'THEQUICKBROWNFOXJUMPSOVERALAZYDOGWHILEWEWATCH';

export const boyerMoore: VizDef<MatchState<BmPre>, BmSettings, MatchExtra> = {
  id: 'boyer-moore',
  title: 'Boyer-Moore',
  family: 'Strings',
  blurb:
    'Compare from the right end of the pattern, and use what failed to slide it as far as it can safely go.',
  settings: [
    {
      kind: 'choice',
      key: 'rules',
      label: 'Shift rules',
      options: [
        { value: 'horspool', label: "Bad character only (Horspool's simplification)" },
        { value: 'full', label: 'Bad character and good suffix: take the bigger shift' },
      ],
      help: 'Horspool always looks up the text character under the end of P. Full Boyer-Moore uses the character that failed and the part that matched.',
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
      { op: 'tables', label: 'Build the tables', usesInput: false, more: true },
    ],
    random: {
      label: 'Random text',
      make: (rng) => {
        const p = randomWord(rng, rng.int(3, 5), 'ABCD');
        return [loadCall(plantedText(rng, 16, p, 'ABCD'), p), ['search']];
      },
    },
    presets: [
      {
        label: 'Random letters A to D',
        make: (rng, n) => {
          const p = randomWord(rng, rng.int(3, 5), 'ABCD');
          return [loadCall(plantedText(rng, n, p, 'ABCD'), p)];
        },
      },
      {
        label: 'Many different letters (long jumps)',
        make: (rng, n) => {
          const p = randomWord(rng, rng.int(4, 6), WORDS);
          return [loadCall(plantedText(rng, n, p, WORDS), p)];
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
        label: 'Worst case for Horspool: AAA…A and BAAA',
        make: (_rng, n) => [loadCall('A'.repeat(n), 'BAAA')],
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
      op: 'build the tables (preprocessing)',
      best: {
        cost: 'O(m + σ)',
        why: 'One pass over P, plus filling an entry for each of the σ characters of the alphabet.',
      },
      average: {
        cost: 'O(m + σ)',
        why: "Horspool's table and the last-occurrence table are one pass each.",
        example: 'two-matches',
      },
      worst: {
        cost: 'O(m + σ)',
        why: 'The good-suffix table can be built in O(m) too, with borders, as KMP builds π. This page computes each entry from its definition, which is slower but easier to follow.',
        example: 'both-rules',
      },
      note: 'σ is the size of the alphabet: 256 for bytes.',
    },
    {
      op: 'search(T, P), every match',
      best: {
        cost: 'O(n / m)',
        why: 'Text characters that are not in P make it slide m places after one comparison each.',
        example: 'skips',
      },
      average: {
        cost: 'O(n / m)',
        why: 'On random text with a big alphabet most slides are close to m. With four letters (DNA) they are shorter, and the gain over brute force is smaller.',
        example: 'no-match',
      },
      worst: {
        cost: 'O(mn)',
        why: 'AAA…A and BAAA make Horspool slide one place after m comparisons. Full Boyer-Moore avoids that case, but still costs O(mn) when P occurs at every shift, unless Galil’s rule is added.',
        example: 'worst-case',
      },
      note: 'Galil’s rule remembers the part already matched after a full match, which makes full Boyer-Moore O(n + m) in the worst case.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(boyerMoore, settings as BmSettings, 1, calls);
      return driverScript(t.entries, t.initial.state);
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    twoMatches,
    skips,
    noMatch,
    worstCase,
    goodSuffix,
    bothRules,
    everyShift,
  ] as unknown as SavedExample[],
  practice: bmPractice(() => boyerMoore),
};

export default boyerMoore;
