import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { short, two } from '../_lm/numbers';
import { ACTIONS, ANIMALS, THINGS, VOCAB } from '../_lm/vocab';
import { parseSentence } from '../self-attention/model';
import {
  D_FF,
  defaults,
  guessWhy,
  HEADS,
  normalize,
  OUT_WORDS,
  paramCount,
  runBlock,
  stream,
  type BlockExtra,
  type BlockSettings,
  type BlockState,
  type NormKind,
} from './model';

type Def = VizDef<BlockState, BlockSettings, BlockExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Sentence starts whose next word the block can guess: each kind of last word. */
function sentence(rng: Rng): string {
  const a = pick(rng, ANIMALS);
  const t = pick(rng, THINGS);
  const v = pick(rng, ACTIONS);
  return pick(rng, [
    'the',
    `the ${a}`,
    `the ${a} ${v}`,
    `the ${a} ${v} the`,
    `the ${a} sat on the`,
    `the ${a} sat on the ${t}`,
    `a ${a} ${v} the ${t}`,
  ]);
}

const COLUMN = (c: number) => `${c < 4 ? 'this word' : 'next word'}: ${HEADS[c]}`;
const vec = (v: readonly number[]) => `(${v.map(two).join(', ')})`;

/**
 * Practice for the transformer block. The picture shows the sentence after Load (the followed
 * word's x filled in); the questions ask about Run. Every answer comes from running the model.
 */
export function blockPractice(def: () => Def): PracticeKind[] {
  void def;
  function setup(rng: Rng, set: BlockSettings = defaults) {
    const text = sentence(rng);
    const words = parseSentence(text) as string[];
    const x = stream(words);
    const r = runBlock(x, set);
    const ops: OpCall[] = [['load', text]];
    return { ops, words, x, r, watch: [['run']] as OpCall[] };
  }

  return [
    {
      id: 'residual',
      title: 'The residual add',
      make(rng) {
        const { ops, words, r, watch } = setup(rng);
        const last = words[words.length - 1]!;
        const c = rng.int(0, 7);
        const x1 = r.rows.x1!;
        const f = r.ffn.out;
        return {
          prompt: `In the block, x₂ = x₁ + FFN. For **${last}**, x₁ = ${vec(x1)} and the FFN returns ${vec(f)}. What is x₂ in column ${c + 1} (${COLUMN(c)})? Two decimals.`,
          setup: ops,
          answer: { kind: 'number', value: r.rows.x2![c]!, tolerance: 0.005 },
          explain: `The residual add is elementwise: ${two(x1[c]!)} + ${two(f[c]!)} = ${two(r.rows.x2![c]!)}. ${c < 4 ? 'The FFN writes nothing into this word’s half, so these four numbers are still the embedding.' : 'The FFN adds its vote to what attention already wrote.'}`,
          watch,
        };
      },
    },
    {
      id: 'norm',
      title: 'Normalize a vector',
      make(rng) {
        const norm: NormKind = rng.int(0, 1) === 0 ? 'layer' : 'rms';
        const set: BlockSettings = { ...defaults, norm };
        const { ops, words, x, watch } = setup(rng, set);
        const v = x[x.length - 1]!;
        const { out, st } = normalize(v, norm);
        const c = v.findIndex((t) => t === Math.max(...v));
        const last = words[words.length - 1]!;
        return {
          prompt:
            norm === 'layer'
              ? `The block starts with LayerNorm (γ = 1, β = 0). **${last}**'s vector x is in the picture: eight numbers. After LayerNorm, what is its number in column ${c + 1} (${COLUMN(c)})? Two decimals; ε is too small to matter.`
              : `This block uses RMSNorm (γ = 1). **${last}**'s vector x is in the picture: eight numbers. After RMSNorm, what is its number in column ${c + 1} (${COLUMN(c)})? Two decimals; ε is too small to matter.`,
          setup: ops,
          settings: set,
          answer: { kind: 'number', value: out[c]!, tolerance: 0.006 },
          explain:
            norm === 'layer'
              ? `The mean of the eight numbers is ${two(st.mean)} and their standard deviation ${two(st.scale)}: (${two(v[c]!)} − ${two(st.mean)}) / ${two(st.scale)} = ${two(out[c]!)}.`
              : `The root mean square is √((${v
                  .map((t) => two(t))
                  .filter((t) => t !== '0.00')
                  .join(
                    '² + ',
                  )}²) / 8) = ${two(st.scale)}: ${two(v[c]!)} / ${two(st.scale)} = ${two(out[c]!)}.`,
          watch,
        };
      },
    },
    {
      id: 'params',
      title: 'Count the parameters',
      make(rng) {
        const set: BlockSettings = {
          order: pick(rng, ['pre', 'post'] as const),
          norm: pick(rng, ['layer', 'rms'] as const),
          act: pick(rng, ['relu', 'gelu', 'swiglu'] as const),
        };
        const { ops, watch } = setup(rng, set);
        const p = paramCount(set);
        const normText =
          set.norm === 'layer' ? 'LayerNorm (γ and β, 8 each)' : 'RMSNorm (γ only, 8)';
        const ffnText =
          set.act === 'swiglu'
            ? `SwiGLU (three matrices of 8 × ${D_FF}, no biases)`
            : `${set.act === 'relu' ? 'ReLU' : 'GELU'} (W₁ 8 × ${D_FF} with bias b₁, W₂ ${D_FF} × 8 with bias b₂)`;
        return {
          prompt: `This block has d_model = 8, one attention head with d_k = 2 (W_Q, W_K, W_V of 8 × 2 and W_O of 2 × 8, no biases), two ${normText} and an FFN with ${ffnText}. How many parameters does the block have?`,
          setup: ops,
          settings: set,
          answer: { kind: 'number', value: p.block },
          explain: `Norms 2 × ${p.norm} = ${2 * p.norm}, attention 3 × 16 + 16 = ${p.attn}, FFN ${set.act === 'swiglu' ? `3 × ${8 * D_FF}` : `${8 * D_FF} + ${D_FF} + ${8 * D_FF} + 8`} = ${p.ffn}: ${p.block} in all.${p.final ? ` A pre-norm model adds a final norm (${p.final} more) after its last block.` : ''}`,
          watch,
        };
      },
    },
    {
      id: 'guess',
      title: 'Guess the next word',
      make(rng) {
        const { ops, words, r, watch } = setup(rng);
        const g = OUT_WORDS[r.guess]!;
        const kind = (w: string) => {
          const v = VOCAB[w]!;
          return v.indexOf(Math.max(...v));
        };
        const others = [
          pick(rng, ANIMALS),
          pick(rng, THINGS),
          pick(rng, ACTIONS),
          pick(rng, ['the', 'on', 'and']),
        ].filter((w) => kind(w) !== kind(g));
        const options = [g, ...others.slice(0, 3)];
        // Shuffle by the RNG so the answer is not always first.
        for (let i = options.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          [options[i], options[j]] = [options[j]!, options[i]!];
        }
        return {
          prompt: `Run the block on "${words.join(' ')}" (pre-norm, LayerNorm, GELU). Which word gets the highest logit?`,
          setup: ops,
          answer: { kind: 'choice', options, correct: options.indexOf(g) },
          explain: `${g}, with probability ${short(r.probs[r.guess]!)}. ${guessWhy(r, words)}`,
          watch,
        };
      },
    },
  ];
}
