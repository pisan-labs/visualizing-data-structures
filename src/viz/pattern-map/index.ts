import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/pattern_map.hpp?raw';
import javaSource from './code/java/PatternMap.java?raw';
import pythonSource from './code/python/pattern_map.py?raw';
import arrayFamily from './examples/array-family.json';
import concurrencyFamily from './examples/concurrency-family.json';
import hallBookings from './examples/hall-bookings.json';
import halfwayNode from './examples/halfway-node.json';
import kLargest from './examples/k-largest.json';
import lockOrder from './examples/lock-order.json';
import middleOfList from './examples/middle-of-list.json';
import riverLevels from './examples/river-levels.json';
import warmestBlock from './examples/warmest-block.json';
import wholeMap from './examples/whole-map.json';
import explain from './explain.md?raw';
import { CUES, FAMILIES, PROBLEMS, cue, node } from './map';
import {
  defaults,
  describe,
  findCue,
  findFamily,
  init,
  initialSay,
  initialVars,
  ops,
  parseInput,
  pseudocode,
  shownFinds,
  type PmSettings,
  type PmState,
} from './model';
import { mapPractice } from './practice';
import { view } from './view';

const pickCue = (rng: Rng): OpCall => ['pick', CUES[rng.int(0, CUES.length - 1)]!.text];
const problem = (p: number): OpCall => ['which', String(p + 1)];

const presets: Preset[] = [
  { label: 'Follow a random cue', make: (rng) => [pickCue(rng)] },
  {
    label: 'Follow several random cues',
    make: (rng, n) => Array.from({ length: Math.max(1, n) }, () => pickCue(rng)),
  },
  {
    label: 'A random family',
    make: (rng) => [['family', String(rng.int(1, FAMILIES.length))]],
  },
  {
    label: 'A random problem',
    make: (rng) => [problem(rng.int(0, PROBLEMS.length - 1))],
  },
  {
    label: 'A problem with a look-alike cue',
    make: (rng) => {
      const traps = PROBLEMS.map((p, i) => (p.finds.some((f) => f.trap) ? i : -1)).filter(
        (i) => i >= 0,
      );
      return [problem(traps[rng.int(0, traps.length - 1)]!)];
    },
  },
  { label: 'Every family in turn', make: () => FAMILIES.map((f): OpCall => ['family', f.name]) },
  { label: 'Every problem in turn', make: () => PROBLEMS.map((_, i) => problem(i)) },
  { label: 'The whole map', make: () => [['map']] },
];

export const patternMap: VizDef<PmState, PmSettings> = {
  id: 'pattern-map',
  title: 'Which pattern fits? (a map)',
  family: 'Patterns map',
  blurb:
    'The front door of the coding-interview pathway: short cues from problem statements, the pattern each one calls for, and the page that teaches it. Follow a cue, show a family, or read one of our problems cue by cue, ruling out the look-alikes.',
  settings: [
    {
      kind: 'boolean',
      key: 'lookalikes',
      label: 'Rule out look-alike cues',
      help: 'Some statements hold words that look like another pattern’s cue. With this on, Which pattern? follows those too, and says why they do not fit.',
    },
    {
      kind: 'boolean',
      key: 'naive',
      label: 'Say what the naive way costs',
      help: 'The pattern pages put the naive solution beside the pattern. With this on, reaching a pattern ends with both costs.',
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
      label: 'Cue, family or problem',
      placeholder: 'e.g. the k largest, Heap patterns, or 3',
      maxLength: 80,
      sample: 'the k largest',
      parse: parseInput,
    },
    buttons: [
      { op: 'pick', label: 'Follow cue', usesInput: true, primary: true },
      { op: 'family', label: 'Show family', usesInput: true },
      { op: 'which', label: 'Which pattern?', usesInput: true },
      { op: 'map', label: 'Whole map', usesInput: false, more: true },
    ],
    random: {
      label: 'Random problem',
      make: (rng) => [problem(rng.int(0, PROBLEMS.length - 1))],
    },
    presets,
    sizes: [1, 3, 5],
  },
  explain,
  complexity: [
    {
      op: 'follow(cue), cues kept in a hash map',
      best: {
        cost: 'O(1)',
        why: 'One lookup of a short phrase, then two hops: to the pattern, then to its page.',
        example: 'k-largest',
      },
      average: {
        cost: 'O(1) expected',
        why: 'Hash the cue’s words and look in one bucket; the 89 cues spread over the table.',
        example: 'middle-of-list',
      },
      worst: {
        cost: 'O(c)',
        why: 'If all c cues hashed to one bucket, the lookup would compare the phrase with each of them.',
        example: 'lock-order',
      },
      note: 'The map itself is the easy part. The skill is in seeing that a statement’s words are a cue at all.',
    },
    {
      op: 'show(F), a family of p patterns and c cues',
      best: {
        cost: 'Θ(p + c)',
        why: 'Every pattern and every cue is drawn once, even in a family of two.',
        example: 'array-family',
      },
      average: { cost: 'Θ(p + c)', why: 'One step per pattern, with its cues drawn beside it.' },
      worst: {
        cost: 'Θ(p + c)',
        why: 'Concurrency is the largest: 9 patterns and 15 cues, still one step per pattern.',
        example: 'concurrency-family',
      },
    },
    {
      op: 'which(problem), k cues in the statement',
      best: {
        cost: 'Θ(1)',
        why: 'One cue: read it, follow it, and the answer is the pattern it points to.',
        example: 'halfway-node',
      },
      average: {
        cost: 'Θ(k)',
        why: 'Two steps per cue, read and follow, and one more for the answer.',
        example: 'river-levels',
      },
      worst: {
        cost: 'Θ(k)',
        why: 'A look-alike costs its two steps too: it is followed, then ruled out.',
        example: 'warmest-block',
      },
      note: 'These statements hold one to three cues. Finding every cue phrase of a list in any text is a string search: Aho-Corasick does it in one pass over the text.',
    },
    {
      op: 'map(), f families',
      best: {
        cost: 'Θ(f)',
        why: 'One step per family, and one for the total.',
        example: 'whole-map',
      },
      average: { cost: 'Θ(f)', why: 'The same 11 steps and 1 more on every run.' },
      worst: { cost: 'Θ(f)', why: 'Nothing depends on the input.', example: 'whole-map' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    kLargest,
    middleOfList,
    lockOrder,
    arrayFamily,
    concurrencyFamily,
    riverLevels,
    warmestBlock,
    hallBookings,
    halfwayNode,
    wholeMap,
  ] as unknown as SavedExample[],
  practice: mapPractice(() => patternMap),
  preview: { example: 'array-family', level: 2 },
};

/**
 * Driver protocol for the code tabs. The code is the map as data and two lookups:
 *   "follow <cue>"     prints the pattern's id, or "none" for words that are not a cue
 *   "family <name>"    prints the family's pattern ids, in map order, separated by spaces
 * Which pattern? follows each cue it reads, so it becomes one "follow" line per cue; the whole
 * map, one "family" line per family. The page finds a cue from part of its words; the code only
 * from all of them, so a cue the page found is sent with its full words.
 */
function codeScript(calls: OpCall[], settings: PmSettings) {
  const t = new Timeline(patternMap, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const follow = (text: string, id: string) => {
    input.push(`follow ${text}`);
    expected.push(id);
  };
  const family = (f: number) => {
    input.push(`family ${FAMILIES[f]!.name}`);
    expected.push(FAMILIES[f]!.nodes.join(' '));
  };
  for (const e of t.entries) {
    const [op, arg] = e.call;
    const last = e.steps.at(-1)!;
    const refused = last.lines.some((l) => l.endsWith('.sig'));
    if (op === 'pick') {
      const q = findCue(String(arg ?? ''));
      if (refused || !q) {
        // Words the page found no cue in are no cue to the code either.
        const words = String(arg ?? '').trim();
        if (words && !/\s{2}|[\r\n]/.test(words)) {
          input.push(`follow ${words}`);
          expected.push('none');
        }
      } else follow(q.text, e.end.node!);
    } else if (op === 'family' && !refused) {
      family(e.end.family);
    } else if (op === 'which' && !refused) {
      for (const f of shownFinds(PROBLEMS[e.end.problem]!, settings))
        follow(cue(f.cue).text, cue(f.cue).node);
    } else if (op === 'map') {
      FAMILIES.forEach((_, f) => family(f));
    }
  }
  return { input, expected };
}

export default patternMap;
