import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/pumping.hpp?raw';
import javaSource from './code/java/Pumping.java?raw';
import pythonSource from './code/python/pumping.py?raw';
import abcContextFree from './examples/abc-context-free.json';
import anbnPumpsBoth from './examples/anbn-pumps-both-sides.json';
import chooseTheSplit from './examples/choose-the-split.json';
import defendLoses from './examples/defend-loses.json';
import defendRegular from './examples/defend-regular.json';
import easyString from './examples/easy-string.json';
import looksLikeAnbn from './examples/looks-like-anbn.json';
import primes from './examples/primes.json';
import regularPumps from './examples/regular-pumps.json';
import squares from './examples/squares.json';
import tooShort from './examples/too-short.json';
import winningString from './examples/winning-string.json';
import wwContextFree from './examples/ww-context-free.json';
import explain from './explain.md?raw';
import { adversary, pieces, proverI, pump, type Parts } from './game';
import { LANGUAGES, MAX_S, lang, type LangId, type Lemma } from './languages';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  inputKind,
  ops,
  pseudocode,
  ROLE_LABEL,
  type PumpExtra,
  type PumpSettings,
  type PumpState,
} from './model';
import { pumpingPractice } from './practice';
import { view } from './view';

/** The input box: a language, a string, a split or a number, each meant for its own button. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t)
    return new Error(
      'Type a language such as anbn, a string such as aaabbb, a split such as a|ab|bbb, or a number for i.',
    );
  const kind = inputKind(t);
  if (kind === 'number') return Number(t);
  if (kind === 'other')
    return new Error(
      `"${t}" is not a language, string, split or number on this page. Type a language such as anbn or (ab)*, a string of a, b, c, ( and ), a split such as a|ab|bbb, or i from 0 to 5.`,
    );
  return t;
}

/** A split as the Split button takes it: pieces with bars, ε for an empty one. */
export const splitInput = (s: string, parts: Parts): string =>
  pieces(s, parts)
    .map((w) => w || 'ε')
    .join('|');

/**
 * One game: in the prover's role, the string and then an i that beats the adversary's split (or
 * 2, when none does); in the adversary's role, the split the page would pick in its place.
 */
export function gameCalls(id: LangId, s: string, settings: PumpSettings): OpCall[] {
  const l = lang(id);
  const start: OpCall = ['language', l.key];
  if (settings.role === 'defend') {
    const page = l.prover(settings.p, settings.lemma);
    const r = adversary(l, page, settings.p, settings.lemma);
    return [start, ['split', splitInput(page, r.tried[r.pick]!.parts)]];
  }
  const r = adversary(l, s, settings.p, settings.lemma);
  const i = proverI(l, s, r.tried[r.pick]!.parts, settings.lemma) ?? 2;
  return [start, ['string', s], ['pump', i]];
}

const settingsOf = (s?: Settings): PumpSettings => ({ ...defaults, ...(s as PumpSettings) });

function play(label: string, id: LangId, s?: (p: number, lemma: Lemma) => string): Preset {
  return {
    label,
    make: (_rng, _size, raw) => {
      const st = settingsOf(raw);
      return gameCalls(id, (s ?? lang(id).prover)(st.p, st.lemma), st);
    },
  };
}

/** A string in L at least max(n, p) long and at most MAX_S. */
function sampleIn(rng: Rng, id: LangId, n: number, p: number): string {
  const l = lang(id);
  for (let k = Math.max(n, p); k >= p; k--) {
    const w = l.sample(rng, k);
    if (w.length <= MAX_S && w.length >= p && l.member(w)) return w;
  }
  return l.prover(p, 'regular');
}

export const pumpingLemma: VizDef<PumpState, PumpSettings, PumpExtra> = {
  id: 'pumping-lemma',
  title: 'The pumping lemma game',
  family: 'Automata and computability',
  blurb:
    'Prove a language is not regular, or not context-free, as a game against an adversary: pick a long string, let the adversary split it, and pump it out of the language.',
  settings: [
    {
      kind: 'choice',
      key: 'lemma',
      label: 'Lemma',
      options: [
        { value: 'regular', label: 'Regular: s = xyz, |xy| ≤ p, |y| ≥ 1' },
        { value: 'cf', label: 'Context-free: s = uvxyz, |vxy| ≤ p, |vy| ≥ 1' },
      ],
      help: 'The context-free lemma pumps two pieces, v and y, at once, and lets them sit anywhere in s as long as they are within p symbols of each other.',
    },
    {
      kind: 'choice',
      key: 'role',
      label: 'Your role',
      options: [
        { value: 'prove', label: ROLE_LABEL.prove },
        { value: 'defend', label: ROLE_LABEL.defend },
      ],
      help: 'The prover picks s and i and wants to pump s out of L. The adversary picks p and the split and wants every pumped string to stay in L.',
    },
    {
      kind: 'number',
      key: 'p',
      label: 'Pumping length p',
      min: 2,
      max: 5,
      help: 'The adversary picks p. A proof has to win whatever p is, so try a few.',
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
      label: 'Language, string, split or i',
      placeholder: 'e.g. anbn, aaaabbbb, a|a|aabbbb or 2',
      maxLength: 60,
      sample: 'aaaabbbb',
      parse: parseInput,
    },
    buttons: [
      { op: 'language', label: 'Language', usesInput: true },
      { op: 'string', label: 'String', usesInput: true, primary: true },
      { op: 'pump', label: 'Pump', usesInput: true },
      { op: 'split', label: 'Split', usesInput: true },
    ],
    presets: [
      play('aⁿbⁿ with s = aᵖbᵖ', 'anbn'),
      play('(ab)*: every string pumps', 'abstar'),
      play('a*b*: looks like aⁿbⁿ, but pumps', 'astarbstar'),
      play('Balanced parentheses, too easy a string', 'paren', (p) => '()'.repeat(p)),
      play('Balanced parentheses with (ᵖ)ᵖ', 'paren'),
      play('wwᴿ with aᵖbbaᵖ', 'wwr'),
      play('ww', 'ww'),
      play('aⁿbⁿcⁿ with aᵖbᵖcᵖ', 'anbncn'),
      play('a^(n²)', 'squares'),
      play('aⁿ, n prime', 'primes'),
      {
        label: 'Random language and string',
        make: (rng, size, raw) => {
          const st = settingsOf(raw);
          const l = LANGUAGES[rng.int(0, LANGUAGES.length - 1)]!;
          return gameCalls(l.id, sampleIn(rng, l.id, size, st.p), st);
        },
      },
    ],
    sizes: [6, 10, 14],
  },
  explain,
  complexity: [
    {
      op: 'The adversary’s search, regular lemma (|s| = n)',
      best: {
        cost: 'Θ(p²·n)',
        why: 'p(p + 1)/2 splits, each pumped for i = 0 to 5 and tested in Θ(n): n = p, the shortest legal string.',
        example: 'winning-string',
      },
      average: {
        cost: 'Θ(p²·n)',
        why: 'The number of splits depends only on p, since x and y lie in the first p symbols.',
        example: 'regular-pumps',
      },
      worst: {
        cost: 'Θ(p²·n)',
        why: 'Every split is tried, even after one survives, so the page can count them.',
        example: 'easy-string',
      },
      note: 'With the bound on i a constant (5 here), each split costs a constant number of membership tests on strings of length O(n + p).',
    },
    {
      op: 'The adversary’s search, context-free lemma (|s| = n)',
      best: {
        cost: 'Θ(p³·n²)',
        why: 'vxy can start anywhere: about n·p³/6 splits, each tested in Θ(n).',
        example: 'abc-context-free',
      },
      average: {
        cost: 'Θ(p³·n²)',
        why: 'Every start, and every way to cut p symbols into v, x and y.',
        example: 'anbn-pumps-both-sides',
      },
      worst: {
        cost: 'Θ(p³·n²)',
        why: 'For aᵖbᵖaᵖbᵖ (ww) that is hundreds of splits, which is why the page shows one step per start.',
        example: 'ww-context-free',
      },
    },
    {
      op: 'Is w in L? (|w| = m)',
      best: {
        cost: 'O(1)',
        why: 'Some answers come at once: ww and wwᴿ reject an odd length before reading a symbol.',
        example: 'defend-loses',
      },
      average: {
        cost: 'Θ(m)',
        why: 'One pass: count the a’s and b’s, track the open parentheses, or compare the halves.',
        example: 'winning-string',
      },
      worst: {
        cost: 'Θ(m)',
        why: 'aⁿ with n prime counts m symbols, then trial division costs O(√m) more.',
        example: 'primes',
      },
    },
    {
      op: 'A proof with the lemma',
      best: {
        cost: 'one string, every split',
        why: 'aᵖbᵖ: one sentence (y is all a’s) covers every split at once.',
        example: 'winning-string',
      },
      average: {
        cost: 'a few cases',
        why: 'The context-free lemma usually needs cases: where vxy sits, and which letters it touches.',
        example: 'ww-context-free',
      },
      worst: {
        cost: 'no proof',
        why: 'For a regular language no string beats every split, and a few non-regular languages pump too.',
        example: 'regular-pumps',
      },
      note: 'The search here checks one p and one string. A proof has to argue for every p, which no search can do.',
    },
  ],
  practice: pumpingPractice(() => pumpingLemma),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settingsOf(settings)),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    winningString,
    regularPumps,
    tooShort,
    easyString,
    chooseTheSplit,
    looksLikeAnbn,
    defendLoses,
    defendRegular,
    abcContextFree,
    anbnPumpsBoth,
    wwContextFree,
    squares,
    primes,
  ] as unknown as SavedExample[],
  preview: { example: 'winning-string', level: 3 },
};

/**
 * Driver protocol for the code tabs, one line per move the model made:
 *   adversary <lemma> <lang> <p> <s>          "splits <n> survive <k> pick <lengths>"
 *   pump <lemma> <lang> <s> <lengths> <i>      "<xyⁱz, or eps> in" or "... out"
 *   prover <lemma> <lang> <s> <lengths>        "i <the page's i>" or "none"
 * <lemma> is regular or cf; <lengths> are the pieces' lengths (3 or 5 numbers). Moves the model
 * refused leave no lines.
 */
function codeScript(calls: OpCall[], settings: PumpSettings) {
  const t = new Timeline(pumpingLemma, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const { lemma } = settings;
  for (const e of t.entries) {
    const last = e.steps.at(-1)!;
    const st = e.end;
    if (st.s === null || !st.parts) continue;
    const lengths = st.parts.join(' ');
    if (e.call[0] === 'string' && last.lines.includes('string.pick')) {
      input.push(`adversary ${lemma} ${st.lang} ${st.p} ${st.s}`);
      expected.push(`splits ${st.search!.splits} survive ${st.search!.survivors} pick ${lengths}`);
    }
    if (e.call[0] === 'pump' && last.lines.includes('pump.test') && st.i !== null) {
      const w = pump(st.s, st.parts, st.i, lemma);
      input.push(`pump ${lemma} ${st.lang} ${st.s} ${lengths} ${st.i}`);
      expected.push(`${w || 'eps'} ${st.tried[st.i] ? 'in' : 'out'}`);
    }
    if (
      e.call[0] === 'split' &&
      (last.lines.includes('split.win') || last.lines.includes('split.lose'))
    ) {
      input.push(`prover ${lemma} ${st.lang} ${st.s} ${lengths}`);
      expected.push(st.winner === 'page' ? `i ${st.i}` : 'none');
    }
  }
  return { input, expected };
}

export default pumpingLemma;
