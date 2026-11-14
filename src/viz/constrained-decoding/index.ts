import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/constrained.hpp?raw';
import javaSource from './code/java/Constrained.java?raw';
import pythonSource from './code/python/constrained.py?raw';
import agree from './examples/agree.json';
import buildIndexEx from './examples/build-index.json';
import forced from './examples/forced.json';
import laugh from './examples/laugh.json';
import noMask from './examples/no-mask.json';
import scan from './examples/scan.json';
import stuck from './examples/stuck.json';
import yesOrNo from './examples/yes-or-no.json';
import explain from './explain.md?raw';
import { buildIndex, END, LOGIT_ROWS, logitsAfter, VOCAB, walk, type Compiled } from './fsm';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseInput,
  pseudocode,
  type Choice,
  type ConExtra,
  type ConSettings,
  type ConState,
} from './model';
import { constrainedPractice } from './practice';
import { view } from './view';

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

const PATTERNS = ['yes|no', 'ye(s|ah)', '(ha)+', 'no+', 'ye?s', 'y(e|o)s', 'a(ha)*', 'n?o+'];

const preset = (label: string, make: (rng: Rng) => string): Preset => ({
  label,
  make: (rng) => [['compile', make(rng)], ['generate']],
});

export const constrained: VizDef<ConState, ConSettings, ConExtra> = {
  id: 'constrained-decoding',
  title: 'Constrained decoding with a DFA',
  family: 'Language models and decoding',
  blurb:
    'Make a language model write only text a regular expression accepts: compile the regex to a DFA, index which tokens each state allows, and mask every other token before choosing.',
  settings: [
    {
      kind: 'boolean',
      key: 'mask',
      label: 'Mask the tokens the regex forbids',
      help: 'Off, the model writes what it likes, and the DFA only says whether the text still matches.',
    },
    {
      kind: 'choice',
      key: 'index',
      label: 'Finding the allowed tokens',
      options: [
        { value: 'precompute', label: 'Build the index once (as Outlines does)' },
        { value: 'scan', label: 'Walk every token at every step' },
      ],
      help: 'Willard and Louf (2023) build the index from each state to its allowed tokens once per regex, so a step costs a lookup instead of a walk over the whole vocabulary.',
    },
    {
      kind: 'choice',
      key: 'decode',
      label: 'Decoding',
      options: [
        { value: 'greedy', label: 'Greedy: the most likely allowed token' },
        { value: 'sample', label: 'Sample from the allowed tokens' },
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
      label: 'Regex',
      placeholder: 'e.g. yes|no or (ha)+',
      maxLength: 24,
      sample: 'ye(s|ah)',
      parse: parseInput,
    },
    buttons: [
      { op: 'compile', label: 'Compile', usesInput: true, primary: true },
      { op: 'generate', label: 'Generate', usesInput: false },
      { op: 'next', label: 'Next token', usesInput: false },
      { op: 'index', label: 'Index', usesInput: false },
    ],
    random: {
      label: 'Random regex',
      make: (rng) => [['compile', pick(rng, PATTERNS)], ['generate']],
    },
    presets: [
      preset('Yes or no', () => 'yes|no'),
      preset('Laughter: (ha)+', () => '(ha)+'),
      preset('The model already obeys: ye(s|ah)', () => 'ye(s|ah)'),
      preset('A forced token: yo+', () => 'yo+'),
      preset('A letter no token has: yet', () => 'yet'),
      preset('A random regex', (rng) => pick(rng, PATTERNS)),
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'Build the index',
      best: {
        cost: 'Θ(|Q| · V)',
        why: 'Most tokens fall off at their first letter: one lookup each.',
        example: 'build-index',
      },
      average: {
        cost: 'Θ(|Q| · Σ|t|)',
        why: 'Every token is walked from every state, until it falls off or ends.',
        example: 'build-index',
      },
      worst: {
        cost: 'Θ(|Q| · Σ|t|)',
        why: 'Every token stays on the DFA to its last letter; it is paid once per regex.',
        example: 'laugh',
      },
      note: 'Σ|t| is the letters in the whole vocabulary. Willard and Louf build it once and reuse it for every request with the same regex.',
    },
    {
      op: 'One step, with the index',
      best: { cost: 'Θ(1)', why: 'Read the row σ(q).', example: 'yes-or-no' },
      average: {
        cost: 'Θ(V)',
        why: 'Applying the mask touches every logit (or only the allowed ones, kept as a list).',
        example: 'yes-or-no',
      },
      worst: { cost: 'Θ(V)', why: 'The softmax runs over all V tokens anyway.', example: 'laugh' },
    },
    {
      op: 'One step, walking every token',
      best: {
        cost: 'Θ(V)',
        why: 'Every token falls off at its first letter.',
        example: 'scan',
      },
      average: {
        cost: 'Θ(Σ|t|)',
        why: 'The whole vocabulary is walked again at every step.',
        example: 'scan',
      },
      worst: {
        cost: 'Θ(Σ|t|)',
        why: 'With 100 000 tokens, at every step: why the index is worth building.',
        example: 'scan',
      },
    },
    {
      op: 'Compile the regex',
      best: {
        cost: 'Θ(m)',
        why: 'Thompson’s NFA has 2m states for a regex of m symbols and operators.',
        example: 'yes-or-no',
      },
      average: {
        cost: 'Θ(m) to Θ(2^m)',
        why: 'The subset construction makes one DFA state per set of NFA states reached.',
        example: 'laugh',
      },
      worst: {
        cost: 'Θ(2^m)',
        why: 'Some regexes, like (a|b)*a(a|b)^k, need exponentially many DFA states.',
        example: 'stuck',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as ConSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    yesOrNo,
    noMask,
    buildIndexEx,
    laugh,
    scan,
    agree,
    forced,
    stuck,
  ] as unknown as SavedExample[],
  practice: constrainedPractice(() => constrained),
  preview: {
    example: 'yes-or-no',
    level: 2,
    hide: ['l-', 'm-', 'a-', 'p-', 'w-', 'u-', 'tab', 'ix'],
  },
  opening: 'yes-or-no',
};

const dfaLine = (c: Compiled) =>
  `dfa ${c.dfa.start} ${c.dfa.accept.join(',') || '-'} ${c.dfa.states.join(',')} ${c.dfa.moves
    .map((m) => `${m.from}:${m.on}:${m.to}`)
    .join(' ')}`;

/** The code tabs' index line: each state's allowed tokens, as "q0: yes>q3 ... | q1: ...". */
export function indexLine(c: Compiled): string {
  const { index } = buildIndex(c.dfa);
  return c.dfa.states
    .map((q) => {
      const row = index.get(q)!;
      const ok = VOCAB.flatMap((t, k) =>
        row[k] === null ? [] : [t === END ? t : `${t}>${row[k]}`],
      );
      return `${q}:${ok.map((x) => ` ${x}`).join('')}`;
    })
    .join(' | ');
}

/**
 * Driver protocol for the code tabs. "vocab <tokens>" and one "logits <prev> <logits>" per
 * row of the toy model, then per regex "dfa <start> <accept,...> <state,...> <from:symbol:to>
 * ..." (no output) and "index" (each state's allowed tokens). Each token chosen is "next <prev>
 * <state|dead> <greedy|sample> <mask 1|0> <u>", which prints the token and the state after it.
 */
function codeScript(calls: OpCall[], settings: ConSettings) {
  const t = new Timeline(constrained, settings, 1, calls);
  const input: string[] = [
    `vocab ${VOCAB.join(' ')}`,
    ...LOGIT_ROWS.map((r) => `logits ${r} ${logitsAfter(r).join(' ')}`),
  ];
  const expected: string[] = [];
  let compiled: Compiled | null = null;
  const seen = new Set<Choice>();
  const visit = (s: ConState, choice?: Choice) => {
    if (s.c !== compiled) {
      compiled = s.c;
      input.push(dfaLine(s.c), 'index');
      expected.push(indexLine(s.c));
    }
    if (!choice || choice.pick < 0 || seen.has(choice)) return;
    seen.add(choice);
    const tok = VOCAB[choice.pick]!;
    const from = choice.from;
    const to = tok === END ? from : from === null ? null : walk(s.c.dfa, from, tok).to;
    input.push(
      `next ${choice.prev} ${from ?? 'dead'} ${settings.decode} ${choice.allowed ? 1 : 0} ${choice.u ?? 0}`,
    );
    expected.push(`${tok} ${to ?? 'dead'}`);
  };
  visit(t.initial.state);
  for (const e of t.entries) {
    for (const step of e.steps)
      visit(step.state, step.extra?.work?.stage === 'pick' ? step.extra.work.choice : undefined);
    visit(e.end);
  }
  return { input, expected };
}

export default constrained;
