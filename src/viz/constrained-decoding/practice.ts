import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import { buildIndex, compile, logitsAfter, VOCAB, walk, type Compiled } from './fsm';
import { defaults, prevOf, textOf, type ConExtra, type ConSettings, type ConState } from './model';

type Def = VizDef<ConState, ConSettings, ConExtra>;

/** Regexes over the vocabulary's letters (y, e, s, n, o, h, a), small enough to walk by hand. */
const REGEXES = [
  'yes|no',
  'ye(s|ah)',
  '(ha)+',
  'no+',
  'ye?s',
  '(ha)*h',
  'o(h|n)',
  'a(ha)*',
  'y(e|o)s',
  'n?o+',
];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

/**
 * Practice with the default settings (masked, the index, greedy). The picture is the DFA after
 * Compile; answers come from walking it and running the model.
 */
export function constrainedPractice(def: () => Def): PracticeKind[] {
  const compiled = (rng: Rng) => {
    const regex = pick(rng, REGEXES);
    return { regex, c: compile(regex) as Compiled, ops: [['compile', regex]] as OpCall[] };
  };

  return [
    {
      id: 'allowed',
      title: 'The allowed tokens in a state',
      make(rng) {
        const { c, ops } = compiled(rng);
        const q = pick(rng, c.dfa.states);
        const row = buildIndex(c.dfa).index.get(q)!;
        const ok = VOCAB.filter((_, k) => row[k] !== null);
        return {
          prompt: `The vocabulary is ${VOCAB.join(' ')}. Which tokens does the index allow in state **${q}** of the DFA for ${c.text}? Type them in that order, separated by spaces (</s> counts if ${q} accepts).`,
          setup: ops,
          answer: { kind: 'sequence', value: ok },
          explain: `Walk each token's letters from ${q}; it is allowed if every letter has a move. ${ok
            .filter((t) => t !== '</s>')
            .map((t) => `${t} ends in ${row[VOCAB.indexOf(t)]}`)
            .join(
              ', ',
            )}${c.dfa.accept.includes(q) ? `, and ${q} accepts, so </s> is allowed` : ''}. Everything else falls off the DFA.`,
          watch: [['index']],
        };
      },
    },
    {
      id: 'where',
      title: 'Where does a token lead?',
      make(rng) {
        for (;;) {
          const { c, ops } = compiled(rng);
          const q = pick(rng, c.dfa.states);
          const t = pick(
            rng,
            VOCAB.filter((x) => x.length >= 2 && x !== '</s>'),
          );
          const w = walk(c.dfa, q, t);
          // Mostly tokens that stay on the DFA, which are the ones worth walking.
          if (w.to === null && rng.int(0, 2) > 0) continue;
          const options = [...c.dfa.states, 'masked'];
          return {
            prompt: `In the DFA for ${c.text}, the text is in state **${q}** and the model picks the token **${t}**. Where does the DFA end up, or is ${t} masked there?`,
            setup: ops,
            answer: {
              kind: 'choice',
              options,
              correct: w.to === null ? options.length - 1 : options.indexOf(w.to),
            },
            explain:
              w.to === null
                ? `From ${q}, ${t.slice(0, w.lookups - 1) ? `${t.slice(0, w.lookups - 1)} leads to ${w.path.at(-1)}, and then ` : ''}${t[w.lookups - 1]} has no move: the text would leave the regex, so the mask sets ${t}'s logit to −∞.`
                : `Follow the letters one move at a time: ${w.path.join(' → ')}. One token, ${t.length} moves.`,
            watch: [['index']],
          };
        }
      },
    },
    {
      id: 'next',
      title: 'The next token',
      make(rng) {
        for (;;) {
          const { c, ops: base } = compiled(rng);
          const steps = rng.int(0, 2);
          const ops: OpCall[] = [
            ...base,
            ...Array.from({ length: steps }, () => ['next'] as OpCall),
          ];
          const s = new Timeline(def(), defaults, 1, ops).endState();
          if (s.done || s.state === null) continue;
          const prev = prevOf(s);
          const z = logitsAfter(prev);
          const after = new Timeline(def(), defaults, 1, [...ops, ['next']]).endState();
          const chosen = after.out.at(-1);
          if (!chosen) continue;
          const named = VOCAB.map((t, k) => ({ t, l: z[k]! }))
            .filter((x) => x.l !== 0)
            .sort((a, b) => b.l - a.l);
          const options = shuffle(
            rng,
            [...new Set([...named.map((x) => x.t), VOCAB[chosen.tok]!])].slice(0, 5),
          );
          if (!options.includes(VOCAB[chosen.tok]!)) continue;
          const allowed = buildIndex(c.dfa).index.get(s.state)!;
          return {
            prompt: `The text so far is ${textOf(s) ? `"${textOf(s)}"` : 'empty'}, in state **${s.state}** of the DFA for ${c.text}. After ${prev === '<s>' ? 'the prompt' : `the token ${prev}`} the model's logits are ${named.map((x) => `${x.t} ${two(x.l)}`).join(', ')}, and 0 for every other token. Which token does constrained greedy decoding pick?`,
            setup: ops,
            answer: { kind: 'choice', options, correct: options.indexOf(VOCAB[chosen.tok]!) },
            explain: `From ${s.state} the index allows ${VOCAB.filter((_, k) => allowed[k] !== null).join(', ')}. The rest get −∞, and the largest logit left is ${VOCAB[chosen.tok]} (${two(z[chosen.tok]!)}).${named[0] && named[0].t !== VOCAB[chosen.tok] ? ` The model's favourite, ${named[0].t}, is masked.` : ''}`,
            watch: [['next']],
          };
        }
      },
    },
  ];
}
