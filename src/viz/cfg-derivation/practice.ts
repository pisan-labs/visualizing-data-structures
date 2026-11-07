import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { formText, nextVariable, parseGrammar, type Grammar, type Sym } from '../_grammar/grammar';
import { defaults, type CfgExtra, type CfgSettings, type CfgState } from './model';

type Def = VizDef<CfgState, CfgSettings, CfgExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const word = (rng: Rng, n: number, from: string) =>
  Array.from({ length: n }, () => pick(rng, [...from])).join('');

/** Grammars for practice, with words to ask about and a known word in and out of each. */
const SETS: {
  grammar: string;
  name: string;
  words: (rng: Rng) => string;
  member: string;
  others: string[];
}[] = [
  {
    grammar: 'S -> aSb | eps',
    name: 'aⁿbⁿ',
    member: 'aabb',
    others: ['abab', 'ba', 'aab'],
    words: (rng) => {
      if (rng.int(0, 1)) return 'a'.repeat(rng.int(1, 3)) + 'b'.repeat(rng.int(1, 3));
      return word(rng, rng.int(2, 5), 'ab');
    },
  },
  {
    grammar: 'S -> aSa | bSb | a | b | eps',
    name: 'palindromes',
    member: 'abba',
    others: ['ab', 'aab', 'abaa'],
    words: (rng) => {
      const half = word(rng, rng.int(1, 2), 'ab');
      if (rng.int(0, 2) === 0) return word(rng, rng.int(2, 5), 'ab');
      return half + (rng.int(0, 1) ? pick(rng, ['a', 'b']) : '') + [...half].reverse().join('');
    },
  },
  {
    grammar: 'S -> (S) | SS | eps',
    name: 'balanced parentheses',
    member: '(())',
    others: [')(', '(()', '())('],
    words: (rng) => word(rng, 2 * rng.int(1, 3), '()'),
  },
  {
    grammar: 'E -> E+T | T; T -> T*F | F; F -> (E) | a',
    name: 'expressions with precedence',
    member: 'a+a*a',
    others: ['a+', '+a', 'a**a'],
    words: (rng) => {
      const ops = Array.from({ length: rng.int(1, 2) }, () => pick(rng, ['+', '*']));
      return `a${ops.map((o) => `${o}a`).join('')}`;
    },
  },
];

/** Grammars whose leftmost derivations are unique, so "how many steps" has one answer. */
const UNAMBIGUOUS = [SETS[0]!, SETS[1]!, SETS[3]!];

/**
 * Practice for the derivation page. Every answer comes from running the model, so it agrees with
 * what the page shows. `def` is a getter to avoid an import cycle.
 */
export function cfgPractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  /** The leftmost derivation the page finds, as forms, or null. */
  const derivation = (grammar: string, w: string): Sym[][] | null => {
    const end = run([
      ['load', grammar],
      ['derive', w || 'eps'],
    ]).endState();
    const r = end.run;
    if (!r) return null;
    const g = end.grammar;
    let form: Sym[] = [g.start];
    const forms = [form];
    for (const s of r.steps) {
      form = [...form.slice(0, s.at), ...g.rules[s.rule]!.rhs, ...form.slice(s.at + 1)];
      forms.push(form);
    }
    return forms;
  };

  return [
    {
      id: 'in-language',
      title: 'Which word is in the language?',
      make(rng) {
        const set = pick(rng, SETS);
        const yes: string[] = [];
        const no: string[] = [];
        for (let tries = 0; tries < 60 && (yes.length < 1 || no.length < 3); tries++) {
          const w = set.words(rng);
          if (!w || yes.includes(w) || no.includes(w)) continue;
          (derivation(set.grammar, w) ? yes : no).push(w);
        }
        const right = yes[0] ?? set.member;
        for (const o of set.others) if (no.length < 3 && !no.includes(o)) no.push(o);
        const options = shuffle(rng, [right, ...no.slice(0, 3)]);
        const correct = options.indexOf(right);
        return {
          prompt: `The grammar on the stage generates ${set.name}. Which of these words can it derive?`,
          setup: [['load', set.grammar]],
          answer: { kind: 'choice', options, correct },
          explain: `Only ${right} has a derivation. Derive finds it; the search for each of the others runs out of forms.`,
          watch: [['derive', right]],
        };
      },
    },
    {
      id: 'steps',
      title: 'How many steps?',
      make(rng) {
        const set = pick(rng, UNAMBIGUOUS);
        let w = set.words(rng);
        let forms = derivation(set.grammar, w);
        for (let tries = 0; !forms && tries < 40; tries++) {
          w = set.words(rng);
          forms = derivation(set.grammar, w);
        }
        if (!forms) {
          w = set.grammar.startsWith('E') ? 'a+a' : 'ab';
          forms = derivation(set.grammar, w)!;
        }
        const steps = forms.length - 1;
        return {
          prompt: `How many steps does a leftmost derivation of ${w || 'ε'} take with this grammar? Each step applies one rule.`,
          setup: [['load', set.grammar]],
          answer: { kind: 'number', value: steps },
          explain: `${forms.map((f) => formText(f)).join(' ⇒ ')}: ${steps} steps, one for each inner node of the parse tree.`,
          watch: [['derive', w || 'eps']],
        };
      },
    },
    {
      id: 'next-form',
      title: 'What comes next?',
      make(rng) {
        const set = pick(rng, UNAMBIGUOUS);
        let w = set.words(rng);
        let forms = derivation(set.grammar, w);
        for (let tries = 0; (!forms || forms.length < 3) && tries < 40; tries++) {
          w = set.words(rng);
          forms = derivation(set.grammar, w);
        }
        if (!forms || forms.length < 3) {
          w = set.grammar.startsWith('E') ? 'a+a' : 'aabb';
          forms = derivation(set.grammar, w)!;
        }
        const g = parseGrammar(set.grammar) as Grammar;
        const k = rng.int(1, forms.length - 2);
        const at = forms[k]!;
        const right = formText(forms[k + 1]!);
        // Wrong answers: another rule for the leftmost variable, or the rule on the rightmost.
        const wrong = new Set<string>();
        const i = nextVariable(at, 'leftmost');
        const j = nextVariable(at, 'rightmost');
        for (const r of g.rules) {
          if (r.lhs === at[i])
            wrong.add(formText([...at.slice(0, i), ...r.rhs, ...at.slice(i + 1)]));
          if (j !== i && r.lhs === at[j])
            wrong.add(formText([...at.slice(0, j), ...r.rhs, ...at.slice(j + 1)]));
        }
        wrong.delete(right);
        const options = shuffle(rng, [right, ...shuffle(rng, [...wrong]).slice(0, 3)]);
        return {
          prompt: `In the leftmost derivation of ${w || 'ε'}, which form comes right after ${formText(at)}?`,
          setup: [['load', set.grammar]],
          answer: { kind: 'choice', options, correct: options.indexOf(right) },
          explain: `The full derivation is ${forms.map((f) => formText(f)).join(' ⇒ ')}. A leftmost step always replaces the leftmost variable, with the rule that still leads to ${w || 'ε'}.`,
          watch: [['derive', w || 'eps']],
        };
      },
    },
    {
      id: 'two-trees',
      title: 'One tree or two?',
      make(rng) {
        const cases: [string, string, string][] = [
          [
            'E -> E+E | E*E | (E) | a',
            'expressions without precedence',
            pick(rng, ['a+a*a', 'a+a+a', 'a*a+a', 'a*(a+a)', 'a+a']),
          ],
          [
            'E -> E+T | T; T -> T*F | F; F -> (E) | a',
            'expressions with precedence',
            pick(rng, ['a+a*a', 'a+a+a', 'a*a+a']),
          ],
          [
            'S -> iS | iSeS | a',
            'if statements, with i for "if", e for "else"',
            pick(rng, ['iiaea', 'iaea', 'iia']),
          ],
          ['S -> aSb | eps', 'aⁿbⁿ', pick(rng, ['ab', 'aabb', 'aaabbb'])],
        ];
        const [grammar, name, w] = pick(rng, cases);
        const end = run([
          ['load', grammar],
          ['ambiguity', w],
        ]).endState();
        const two = !!end.second?.shown;
        const options = ['Two parse trees', 'Exactly one parse tree'];
        return {
          prompt: `This grammar is for ${name}. Does ${w} have two different parse trees?`,
          setup: [['load', grammar]],
          answer: { kind: 'choice', options, correct: two ? 0 : 1 },
          explain: two
            ? `It does: the search finds two different leftmost derivations of ${w}, so two trees.`
            : `Only one: the search tries every form that could lead to ${w} and finds a single leftmost derivation.`,
          watch: [['ambiguity', w]],
        };
      },
    },
  ];
}
