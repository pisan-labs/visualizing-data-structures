/**
 * The languages Place puts on the map, each with its claims: one that puts it in a region (a
 * machine or a grammar that shows it is at least that low) and one that keeps it out of the
 * region inside (a pumping lemma or a diagonal argument). Claims are written once; the level
 * names in them follow the page's naming setting.
 */
import type { RegionId } from './levels';

export type LangId =
  'an' | 'abstar' | 'aibj' | 'anbn' | 'pal' | 'anbncn' | 'ww' | 'pow2' | 'diag' | 'halt' | 'cohalt';

/** The kind of argument that keeps a language out of a level. */
export type Tool = 'pump-regular' | 'pump-cf' | 'diagonal' | 'reduction' | 'complement';

export const TOOL_TEXT: Record<Tool, string> = {
  'pump-regular': 'The pumping lemma for regular languages',
  'pump-cf': 'The pumping lemma for context-free languages',
  diagonal: 'Diagonalization: a machine run on its own description',
  reduction: 'A reduction from A_TM, which diagonalization shows is undecidable',
  complement: 'Complements: recognizable both ways would make it decidable',
};

/** Level names as the narration writes them (by name, or "Type 2 (context-free)"). */
export type Words = (r: RegionId) => string;

export interface Claim {
  /** `in`: the language is in this region. `out`: it is not. */
  kind: 'in' | 'out';
  region: RegionId;
  /** What shows it, in a few words, for the panel. */
  short: string;
  /** The claim in full, for the narration. */
  say: (w: Words) => string;
  /** For an `out` claim, the kind of argument. */
  tool?: Tool;
}

export interface Language {
  id: LangId;
  /** What a learner types for Place, as the page lists it. */
  key: string;
  /** The language as the subject of a sentence, when its token does not read as one. */
  noun?: string;
  /** The token on the map. */
  token: string;
  /** The panel's title: the language in set notation. */
  title: string;
  /** What a learner may type for Place, besides the id (compared without spaces or case). */
  aliases: string[];
  /** The innermost region the language belongs to. */
  home: RegionId;
  claims: Claim[];
  /** Words in the language, for tests: a reference predicate over a, b and c. */
  member?: (w: string) => boolean;
  /** A grammar a claim names, for tests. */
  grammar?: string;
}

const count = (w: string, c: string) => [...w].filter((x) => x === c).length;
const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

export const LANGUAGES: Language[] = [
  {
    id: 'an',
    key: 'a*',
    token: 'aⁿ',
    title: 'aⁿ = { aⁿ : n ≥ 0 }, also written a*',
    aliases: ['a^n', 'aⁿ', 'a*'],
    home: 'reg',
    grammar: 'S -> aS | eps',
    member: (w) => /^a*$/.test(w),
    claims: [
      {
        kind: 'in',
        region: 'reg',
        short: 'a one-state DFA that loops on a; or S → aS | ε',
        say: (w) =>
          `A finite automaton with one accepting state and a loop on a accepts exactly the words aⁿ, and the right-linear grammar S → aS | ε generates them. So aⁿ is ${w('reg')}.`,
      },
    ],
  },
  {
    id: 'abstar',
    key: '(ab)*',
    token: '(ab)*',
    title: '(ab)* = { ε, ab, abab, ababab, … }',
    aliases: ['(ab)*', 'abab'],
    home: 'reg',
    grammar: 'S -> abS | eps',
    member: (w) => /^(ab)*$/.test(w),
    claims: [
      {
        kind: 'in',
        region: 'reg',
        short: 'the regular expression (ab)*; or S → abS | ε',
        say: (w) =>
          `The regular expression (ab)* describes it, and a DFA with two states accepts it: a moves from the start to the middle state and b moves back. The right-linear grammar S → abS | ε generates it too. So (ab)* is ${w('reg')}.`,
      },
    ],
  },
  {
    id: 'aibj',
    key: 'a*b*',
    token: 'aⁱbʲ',
    title: 'aⁱbʲ = { aⁱbʲ : i, j ≥ 0 }, also written a*b*',
    aliases: ['a*b*', 'aⁱbʲ', 'a^ib^j', 'aibj'],
    home: 'reg',
    grammar: 'S -> aS | B; B -> bB | eps',
    member: (w) => /^a*b*$/.test(w),
    claims: [
      {
        kind: 'in',
        region: 'reg',
        short: 'a DFA with two states: one for the a’s, one for the b’s',
        say: (w) =>
          `It looks like aⁿbⁿ, but nothing has to match. A DFA stays in its first state on a’s, moves to a second state on the first b, and dies on an a after that. The grammar S → aS | B; B → bB | ε is right-linear. So aⁱbʲ is ${w('reg')}: counting is what makes aⁿbⁿ harder.`,
      },
    ],
  },
  {
    id: 'anbn',
    key: 'anbn',
    token: 'aⁿbⁿ',
    title: 'aⁿbⁿ = { aⁿbⁿ : n ≥ 0 }',
    aliases: ['aⁿbⁿ', 'a^nb^n'],
    home: 'cf',
    grammar: 'S -> aSb | eps',
    member: (w) => /^a*b*$/.test(w) && count(w, 'a') === count(w, 'b'),
    claims: [
      {
        kind: 'in',
        region: 'cf',
        short: 'S → aSb | ε generates it; a PDA pushes each a and pops one per b',
        say: (w) =>
          `The grammar S → aSb | ε generates aⁿbⁿ, one a and one b per step. A pushdown automaton recognizes it too: push each a, pop one for each b. So aⁿbⁿ is ${w('cf')}.`,
      },
      {
        kind: 'out',
        region: 'reg',
        tool: 'pump-regular',
        short: 'pumping lemma: pump y in aᵖbᵖ and the a’s outnumber the b’s',
        say: (w) =>
          `It is not ${w('reg')}. Suppose it were, with pumping length p, and take s = aᵖbᵖ. Any split s = xyz with |xy| ≤ p and |y| ≥ 1 puts y among the a’s, so xy²z has more a’s than b’s and is not in the language. That contradicts the pumping lemma.`,
      },
    ],
  },
  {
    id: 'pal',
    key: 'pal',
    noun: 'The language of palindromes',
    token: 'palindromes',
    title: 'Palindromes: words over {a, b} that read the same backwards',
    aliases: ['palindromes', 'palindrome', 'wwr'],
    home: 'cf',
    grammar: 'S -> aSa | bSb | a | b | eps',
    member: (w) => /^[ab]*$/.test(w) && w === [...w].reverse().join(''),
    claims: [
      {
        kind: 'in',
        region: 'cf',
        short: 'S → aSa | bSb | a | b | ε builds them from the outside in',
        say: (w) =>
          `S → aSa | bSb | a | b | ε builds a palindrome from the outside in, one matching pair per step. A pushdown automaton pushes the first half, guesses the middle, and matches the second half against the stack. So palindromes are ${w('cf')}.`,
      },
      {
        kind: 'out',
        region: 'reg',
        tool: 'pump-regular',
        short: 'pumping lemma: pump y in aᵖbaᵖ',
        say: (w) =>
          `They are not ${w('reg')}. Take s = aᵖbaᵖ, with p the pumping length. Since |xy| ≤ p, y lies in the first block of a’s, so xy²z has more a’s before the b than after it, and is not a palindrome.`,
      },
    ],
  },
  {
    id: 'anbncn',
    key: 'anbncn',
    token: 'aⁿbⁿcⁿ',
    title: 'aⁿbⁿcⁿ = { aⁿbⁿcⁿ : n ≥ 0 }',
    aliases: ['aⁿbⁿcⁿ', 'a^nb^nc^n'],
    home: 'cs',
    grammar: 'S -> T | eps; T -> aTBC | aBC; CB -> BC; aB -> ab; bB -> bb; bC -> bc; cC -> cc',
    member: (w) =>
      /^a*b*c*$/.test(w) && count(w, 'a') === count(w, 'b') && count(w, 'b') === count(w, 'c'),
    claims: [
      {
        kind: 'in',
        region: 'cs',
        short: 'an LBA crosses off one a, one b and one c per pass',
        say: (w) =>
          `A linear-bounded automaton decides it without leaving the input: check the word is a’s, then b’s, then c’s, and cross off one of each per pass until all are gone or one kind runs out first. The non-contracting grammar S → T | ε; T → aTBC | aBC; CB → BC; aB → ab; bB → bb; bC → bc; cC → cc generates it too. So aⁿbⁿcⁿ is ${w('cs')}.`,
      },
      {
        kind: 'out',
        region: 'cf',
        tool: 'pump-cf',
        short: 'pumping lemma for CFLs: vxy in aᵖbᵖcᵖ misses a letter',
        say: (w) =>
          `It is not ${w('cf')}, by the pumping lemma for context-free languages. Take s = aᵖbᵖcᵖ. In any split s = uvxyz with |vxy| ≤ p and |vy| ≥ 1, vxy is too short to touch all three letters, so pumping up raises one or two of the counts and leaves the third behind.`,
      },
    ],
  },
  {
    id: 'ww',
    key: 'ww',
    token: 'ww',
    title: 'ww = { ww : w is a word over {a, b} }',
    aliases: ['copy'],
    home: 'cs',
    member: (w) =>
      /^[ab]*$/.test(w) && w.length % 2 === 0 && w.slice(0, w.length / 2) === w.slice(w.length / 2),
    claims: [
      {
        kind: 'in',
        region: 'cs',
        short: 'an LBA finds the middle, then compares the halves',
        say: (w) =>
          `A linear-bounded automaton decides it inside the input: check the length is even, find the middle by marking symbols from both ends in turn, then compare the two halves symbol by symbol. So ww is ${w('cs')}.`,
      },
      {
        kind: 'out',
        region: 'cf',
        tool: 'pump-cf',
        short: 'pumping lemma for CFLs: pump aᵖbᵖaᵖbᵖ',
        say: (w) =>
          `It is not ${w('cf')}. Take s = aᵖbᵖaᵖbᵖ. vxy spans at most p symbols. Inside the first half, pumping up moves the middle so the second half starts with b; inside the second half, the first half ends with a; across the middle, pumping down leaves aᵖbⁱaʲbᵖ with i or j below p. None of these is ww. Mirroring (palindromes) needs a stack; copying needs more.`,
      },
    ],
  },
  {
    id: 'pow2',
    key: 'pow2',
    token: 'a^(2ⁿ)',
    title: 'a^(2ⁿ) = { aᵏ : k is a power of 2 }',
    aliases: ['a^(2^n)', 'a^(2ⁿ)', 'powers'],
    home: 'cs',
    member: (w) => /^a+$/.test(w) && isPow2(w.length),
    claims: [
      {
        kind: 'in',
        region: 'cs',
        short: 'a TM halves the a’s, never leaving the input',
        say: (w) =>
          `A Turing machine decides it by halving: cross off every other a, reject if an odd number above one was left, and repeat until one a remains. It never leaves the input, so it is a linear-bounded automaton, and a^(2ⁿ) is ${w('cs')}.`,
      },
      {
        kind: 'out',
        region: 'cf',
        tool: 'pump-cf',
        short: 'pumping lemma for CFLs: lengths jump from 2ᵏ to 2ᵏ⁺¹',
        say: (w) =>
          `It is not ${w('cf')}. Take s = aᵐ with m = 2ᵏ larger than the pumping length p. Pumping up once adds |vy| a’s, between 1 and p, so the length lands strictly between 2ᵏ and 2ᵏ⁺¹, and that is no power of 2.`,
      },
    ],
  },
  {
    id: 'diag',
    key: 'diag',
    noun: 'D, the LBA diagonal language,',
    token: 'LBA diagonal',
    title: 'D = { ⟨M⟩ : M is an LBA that does not accept ⟨M⟩ }',
    aliases: ['d', 'lba', 'lbadiagonal', 'dlba'],
    home: 'dec',
    claims: [
      {
        kind: 'in',
        region: 'dec',
        short: 'decidable: run the LBA on ⟨M⟩ until it repeats, then flip',
        say: (w) =>
          `The LBA diagonal language D is ${w('dec')}. On an input of n cells, an LBA has only finitely many configurations, so a decider can run M on ⟨M⟩ until it accepts, rejects or repeats a configuration, and then flip the answer.`,
      },
      {
        kind: 'out',
        region: 'cs',
        tool: 'diagonal',
        short: 'diagonalization: an LBA for D would accept itself exactly when it does not',
        say: (w) =>
          `D is not ${w('cs')}. Suppose some LBA B recognized D. Then ⟨B⟩ is in D exactly when B does not accept ⟨B⟩, exactly when ⟨B⟩ is not in D. That is a contradiction, and LBAs recognize exactly the context-sensitive languages.`,
      },
    ],
  },
  {
    id: 'halt',
    key: 'halt',
    token: 'HALT',
    title: 'HALT = { ⟨M, w⟩ : M is a TM that halts on w }',
    aliases: ['halting', 'haltingproblem'],
    home: 're',
    claims: [
      {
        kind: 'in',
        region: 're',
        short: 'a TM simulates M on w and accepts if it halts',
        say: (w) =>
          `HALT is ${w('re')}: a Turing machine simulates M on w and accepts when the simulation halts. If M runs forever, so does the simulation, and a recognizer is allowed to do that.`,
      },
      {
        kind: 'out',
        region: 'dec',
        tool: 'reduction',
        short: 'undecidable: a decider for HALT would decide A_TM',
        say: (w) =>
          `HALT is not ${w('dec')}. A decider for it would decide A_TM = { ⟨M, w⟩ : M accepts w }: ask whether M halts on w, and if it does, run M on w to see whether it accepts. Diagonalization shows A_TM has no decider: hand a would-be decider its own description and do the opposite of what it says.`,
      },
    ],
  },
  {
    id: 'cohalt',
    key: 'cohalt',
    token: 'co-HALT',
    title: 'co-HALT = { ⟨M, w⟩ : M does not halt on w }',
    aliases: ['co-halt', 'complement', 'nothalt'],
    home: 'all',
    claims: [
      {
        kind: 'out',
        region: 're',
        tool: 'complement',
        short: 'if it were recognizable, HALT would be decidable',
        say: (w) =>
          `co-HALT is not ${w('re')}. HALT is. A language is decidable exactly when it and its complement are both recognizable: run the two recognizers side by side, and one of them must accept. HALT is not decidable, so its complement cannot be recognizable.`,
      },
    ],
  },
];

export const LANGUAGE = new Map(LANGUAGES.map((l) => [l.id, l]));

const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

/** The language a learner typed: its id or one of its aliases, ignoring spaces and case. */
export function findLanguage(text: string): Language | null {
  const t = squash(text);
  if (!t) return null;
  return (
    LANGUAGES.find(
      (l) =>
        l.id === t ||
        squash(l.key) === t ||
        squash(l.token) === t ||
        l.aliases.some((a) => squash(a) === t),
    ) ?? null
  );
}

/** The names a learner can type, one per language. */
export const LANGUAGE_KEYS = LANGUAGES.map((l) => l.key);
