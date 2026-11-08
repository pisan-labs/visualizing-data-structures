import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { randomWord } from '../_strings/kit';
import cppSource from './code/cpp/aho_corasick.hpp?raw';
import javaSource from './code/java/AhoCorasick.java?raw';
import pythonSource from './code/python/aho_corasick.py?raw';
import addPattern from './examples/add-pattern.json';
import buildLinks from './examples/build-links.json';
import dna from './examples/dna.json';
import outputLinks from './examples/output-links.json';
import outputSets from './examples/output-sets.json';
import ushers from './examples/ushers.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_TEXT,
  ops,
  parseInput,
  PATTERN_SETS,
  pseudocode,
  type AcExtra,
  type AcSettings,
  type AcState,
} from './model';
import { acPractice } from './practice';
import { view } from './view';

const lettersOf = (s: Settings | undefined) =>
  [...new Set(String(s?.patterns ?? defaults.patterns).replaceAll(' ', ''))].join('');

export const ahoCorasick: VizDef<AcState, AcSettings, AcExtra> = {
  id: 'aho-corasick',
  title: 'Aho-Corasick',
  family: 'Strings',
  blurb:
    'Search for many patterns in one pass: a trie of the patterns, failure links that say where to go when the next character does not fit, and output links for patterns hiding inside others.',
  settings: [
    {
      kind: 'choice',
      key: 'patterns',
      label: 'Patterns',
      options: Object.entries(PATTERN_SETS).map(([value, label]) => ({ value, label })),
      help: 'Add more with Add pattern, under More operations.',
    },
    {
      kind: 'choice',
      key: 'outputs',
      label: 'Patterns inside patterns',
      options: [
        { value: 'links', label: 'Output links: follow a chain' },
        { value: 'sets', label: 'Output sets: each node keeps the list (1975 paper)' },
      ],
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
      label: 'Text, or a pattern to add',
      placeholder: 'e.g. ushers',
      maxLength: MAX_TEXT + 4,
      sample: 'ushers',
      parse: parseInput,
    },
    buttons: [
      { op: 'search', label: 'Search text', usesInput: true, primary: true },
      { op: 'build', label: 'Build links', usesInput: false },
      { op: 'add', label: 'Add pattern', usesInput: true, more: true },
    ],
    random: {
      label: 'Random text',
      make: (rng) => [['search', randomWord(rng, rng.int(6, 12), 'ehirs')]],
    },
    presets: [
      {
        label: 'Random text over the patterns’ letters',
        make: (rng, n, s) => [['search', randomWord(rng, n, lettersOf(s))]],
      },
      {
        label: 'The patterns, run together',
        make: (_rng, n, s) => [
          ['search', String(s?.patterns ?? defaults.patterns).replaceAll(' ', '').repeat(4).slice(0, n)],
        ],
      },
      {
        label: 'One letter repeated',
        make: (_rng, n, s) => [['search', lettersOf(s)[0]!.repeat(n)]],
      },
      {
        label: 'No pattern letters at all',
        make: (_rng, n) => [['search', 'xyzw'.repeat(n).slice(0, n)]],
      },
    ],
    sizes: [6, 10, 16],
  },
  explain,
  complexity: [
    {
      op: 'build the trie and links',
      best: { cost: 'O(m)', why: 'm is the total length of the patterns: one node per character, one link each.' },
      average: {
        cost: 'O(m)',
        why: 'Each failure walk is paid for by the depth gained along that pattern, as in KMP.',
        example: 'build-links',
      },
      worst: {
        cost: 'O(m·σ) with a full table',
        why: 'With a table of σ children per node instead of a map, memory and time grow with the alphabet.',
        example: 'build-links',
      },
    },
    {
      op: 'search(T), z matches',
      best: { cost: 'O(n)', why: 'No pattern letters: every character stays at the root.' },
      average: {
        cost: 'O(n + z)',
        why: 'Failure hops never outnumber characters read, and each output link is one match.',
        example: 'ushers',
      },
      worst: {
        cost: 'O(n + z)',
        why: 'z can be large (a, aa, aaa in aaaa…), but each match costs one step.',
        example: 'output-links',
      },
      note: 'Without output links, following failure links to find short patterns can cost O(n·m).',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(ahoCorasick, settings as AcSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        const st = e.end;
        if (e.call[0] !== 'search' || !st.text) continue;
        input.push(`search ${st.patterns.join(',')} ${st.text}`);
        expected.push(st.matches.length ? st.matches.map((m) => `${m.at}:${m.word}`).join(' ') : 'none');
      }
      return { input, expected };
    },
  },
  examples: [ushers, buildLinks, outputLinks, outputSets, dna, addPattern] as unknown as SavedExample[],
  practice: acPractice(() => ahoCorasick),
  preview: { example: 'build-links', level: 2, hide: ['m-', 'legend-'] },
};

export default ahoCorasick;
