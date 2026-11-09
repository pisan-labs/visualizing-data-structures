import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { readRegex, showRegex, type Regex } from '../_automata/regex';
import { randomRegex, randomWord } from '../_automata/regex-random';
import { EMPTY, EPSILON, concat, nullable, rightNest, show, simplify, star, union } from './derive';
import { defaults, type RdSettings, type RdState } from './model';

type Def = VizDef<RdState, RdSettings, unknown>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const code = (s: string) => `\`${s}\``;

/**
 * The derivative with a common mistake, for wrong options: 'nu' forgets that c may come off the
 * second part of rs when the first can be empty; 'star' drops the star after d_c(r).
 */
function wrong(r: Regex, c: string, bug: 'nu' | 'star'): Regex {
  const d = (x: Regex) => wrong(x, c, bug);
  switch (r.kind) {
    case 'empty':
    case 'eps':
      return EMPTY;
    case 'sym':
      return r.c === c ? EPSILON : EMPTY;
    case 'union':
      return union(d(r.a), d(r.b), 'aci');
    case 'concat': {
      const left = concat(d(r.a), simplify(r.b, 'aci'));
      return bug === 'nu' || !nullable(r.a) ? left : union(left, d(r.b), 'aci');
    }
    case 'star':
      return bug === 'star' ? d(r.a) : concat(d(r.a), simplify(r, 'aci'));
    case 'plus':
      return bug === 'star' ? d(r.a) : concat(d(r.a), star(simplify(r.a, 'aci'), 'aci'));
    case 'opt':
      return d(r.a);
  }
}

/**
 * Practice for the derivatives page. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function rdPractice(def: () => Def): PracticeKind[] {
  const end = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls).endState();
  /** A small expression with a star or a concatenation whose first part can be empty. */
  const expression = (rng: Rng): string => {
    for (let i = 0; i < 30; i++) {
      const text = showRegex(randomRegex(rng, rng.int(2, 4)));
      if (/\*/.test(text) && text.length <= 14) return text;
    }
    return pick(rng, ['(a|b)*b', 'a*ab', '(ab)*a', 'a(a|b)*']);
  };
  const treeOf = (text: string) => rightNest((readRegex(text) as { tree: { r: Regex } }).tree.r);

  return [
    {
      id: 'derivative',
      title: 'Take a derivative',
      make(rng) {
        const text = expression(rng);
        const c = pick(rng, ['a', 'b']);
        const p = end([
          ['load', text],
          ['derive', c],
        ]).panel!;
        const right = p.kind === 'derive' ? show(p.rows.at(-1)!.d, '|') : '∅';
        const r = treeOf(text);
        const options = [right];
        for (const x of [
          show(wrong(r, c, 'nu'), '|'),
          show(wrong(r, c, 'star'), '|'),
          show(union(simplify(r, 'aci'), EPSILON, 'aci'), '|'),
          '∅',
          'ε',
          show(simplify(r, 'aci'), '|'),
        ])
          if (!options.includes(x) && options.length < 4) options.push(x);
        // Put the right answer in a random place.
        const at = rng.int(0, options.length - 1);
        [options[0], options[at]] = [options[at]!, options[0]!];
        return {
          prompt: `What is d_${c}(${code(text)}), simplified?`,
          setup: [['load', text]],
          answer: { kind: 'choice', options, correct: at },
          explain: `Work up from the parts: d_${c}(${code(text)}) = ${code(right)}. A concatenation whose first part can be empty lets ${c} come off the second part too, and a star keeps itself after one copy.`,
          watch: [['derive', c]],
        };
      },
    },
    {
      id: 'nullable',
      title: 'Does it match ε?',
      make(rng) {
        const text = showRegex(randomRegex(rng, rng.int(2, 4)));
        const yes = nullable(treeOf(text));
        const verdict = end([
          ['load', text],
          ['match', 'eps'],
        ]).panel!;
        const accepts = verdict.kind === 'match' && verdict.verdict === 'accept';
        return {
          prompt: `Is ν(${code(text)}) true: does the expression match the empty word?`,
          setup: [['load', text]],
          answer: { kind: 'choice', options: ['Yes', 'No'], correct: accepts ? 0 : 1 },
          explain: yes
            ? 'Yes: a star or ? matches ε, a union does if either side does, and a concatenation does if both parts do.'
            : 'No: some part that must be read, a symbol or a + of one, cannot be skipped.',
          watch: [['match', 'eps']],
        };
      },
    },
    {
      id: 'match',
      title: 'Match by derivatives',
      make(rng) {
        const text = expression(rng);
        const w = randomWord(rng, rng.int(2, 4));
        const p = end([
          ['load', text],
          ['match', w],
        ]).panel!;
        const yes = p.kind === 'match' && p.verdict === 'accept';
        const last = p.kind === 'match' ? show(p.rows.at(-1)!.r, '|') : '∅';
        return {
          prompt: `Take derivatives of ${code(text)} by the symbols of ${w}, one at a time. Does ${w} match?`,
          setup: [['load', text]],
          answer: { kind: 'choice', options: ['Yes, it matches', 'No'], correct: yes ? 0 : 1 },
          explain: `After the last derivative, what is left is ${code(last)}; ν of it is ${yes}, so ${w} ${yes ? 'matches' : 'does not match'}.`,
          watch: [['match', w]],
        };
      },
    },
    {
      id: 'states',
      title: 'How many states?',
      make(rng) {
        const text = pick(rng, [
          expression(rng),
          '(a|b)*abb',
          '(a|b)*a(a|b)',
          'a*b*',
          '(ab|b)*',
          'a(a|b)*b',
        ]);
        const p = end([['load', text], ['dfa']]).panel!;
        const n = p.kind === 'dfa' ? p.states.length : 1;
        const accepting = p.kind === 'dfa' ? p.states.filter((q) => q.nu).length : 0;
        return {
          prompt: `Build the DFA of derivatives of ${code(text)}, simplifying with the similarity rules. How many states does it have, a dead state ∅ included if it turns up?`,
          setup: [['load', text]],
          answer: { kind: 'number', value: n },
          explain: `Breadth first from r, by each symbol, until no new expression turns up: ${n} distinct expressions, ${accepting} of them nullable (accepting).`,
          watch: [['dfa']],
        };
      },
    },
  ];
}
