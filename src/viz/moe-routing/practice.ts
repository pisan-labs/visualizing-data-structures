import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { short, two } from '../_lm/numbers';
import { ACTIONS, ANIMALS, embed, THINGS } from '../_lm/vocab';
import { wordName } from '../self-attention/model';
import {
  capacity,
  defaults,
  E,
  EXPERTS,
  parseTokens,
  route,
  type MoeExtra,
  type MoeSettings,
  type MoeState,
} from './model';

type Def = VizDef<MoeState, MoeSettings, MoeExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Sentences with something to route: small words that crowd one expert, a few nouns. */
function sentence(rng: Rng): string {
  const a = pick(rng, ANIMALS);
  const b = pick(rng, ANIMALS);
  const t = pick(rng, THINGS);
  const v = pick(rng, ACTIONS);
  return pick(rng, [
    `the ${a} ${v} on the ${t}`,
    `the ${a} and the ${b} ${v}`,
    `a ${a} ${v} the ${t} and it`,
    `the ${a} ${v} under the ${t}`,
    `${a} ${b} ${v} the ${t}`,
  ]);
}

const pair = (es: number[]) =>
  es.length === 0
    ? 'none: it passes by on the residual'
    : [...es]
        .sort((x, y) => x - y)
        .map((e) => EXPERTS[e]!)
        .join(' and ');

/**
 * Practice for mixture-of-experts routing. The picture shows the sentence after Score (the
 * router's logits and probabilities); the questions ask about Route. Every answer comes from
 * running the model.
 */
export function moePractice(def: () => Def): PracticeKind[] {
  void def;
  function setup(rng: Rng, set: MoeSettings) {
    const text = sentence(rng);
    const words = parseTokens(text) as string[];
    const x = words.map(embed);
    const r = route(x, set);
    const ops: OpCall[] = [['load', text], ['score']];
    const names = words.map((_, i) => wordName(words, i));
    return { ops, words, names, r, watch: [['route']] as OpCall[] };
  }

  return [
    {
      id: 'experts',
      title: 'Which experts does a token use?',
      make(rng) {
        const set: MoeSettings = { ...defaults, cf: pick(rng, ['1', '1.25'] as const) };
        const { ops, words, names, r, watch } = setup(rng, set);
        // Prefer a token that lost an assignment, when there is one.
        const hit = r.assignments.filter((a) => !a.kept).map((a) => a.token);
        const t = hit.length && rng.int(0, 1) === 0 ? pick(rng, hit) : rng.int(0, words.length - 1);
        const mine = r.assignments.filter((a) => a.token === t);
        const kept = mine.filter((a) => a.kept).map((a) => a.expert);
        const wanted = mine.map((a) => a.expert);
        const options = [pair(kept)];
        for (const o of [
          pair(wanted),
          ...[0, 1, 2, 3].flatMap((i) =>
            [0, 1, 2, 3].filter((j) => j > i).map((j) => pair([i, j])),
          ),
        ])
          if (
            !options.includes(o) &&
            options.length < 4 &&
            (o === pair(wanted) || rng.int(0, 2) === 0)
          )
            options.push(o);
        for (const o of [pair([]), pair([0, 1]), pair([2, 3]), pair([0, 3])])
          if (!options.includes(o) && options.length < 4) options.push(o);
        for (let i = options.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          [options[i], options[j]] = [options[j]!, options[i]!];
        }
        const lost = mine.filter((a) => !a.kept);
        return {
          prompt: `Top-2 token choice, capacity factor ${set.cf}: every expert has room for ${r.cap}, filled with first choices (in sentence order) before second choices. After capacity, which experts process **${names[t]}**?`,
          setup: ops,
          settings: set,
          answer: { kind: 'choice', options, correct: options.indexOf(pair(kept)) },
          explain: `${names[t]}'s two highest logits are ${mine.map((a) => `${EXPERTS[a.expert]} (${two(r.logits[t]![a.expert]!)})`).join(' and ')}. ${lost.length ? `${lost.map((a) => EXPERTS[a.expert]).join(' and ')} ${lost.length === 1 ? 'was' : 'were'} already full, so that assignment is dropped.` : 'Both had room.'} Expert loads asked for: ${r.wanted.map((c, e) => `${EXPERTS[e]} ${c}`).join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'dropped',
      title: 'How many tokens are dropped?',
      make(rng) {
        const set: MoeSettings = {
          k: '1',
          cf: pick(rng, ['1', '1.25'] as const),
          routing: 'token',
        };
        const { ops, words, names, r, watch } = setup(rng, set);
        return {
          prompt: `Top-1 routing (each token goes to its highest logit), ${E} experts, capacity factor ${set.cf}. Each expert has room for ⌈${set.cf} × ${words.length} / ${E}⌉ tokens, filled in sentence order. How many tokens are dropped?`,
          setup: ops,
          settings: set,
          answer: { kind: 'number', value: r.orphans.length },
          explain: `Capacity ${r.cap}. The experts are asked for ${r.wanted.map((c, e) => `${EXPERTS[e]} ${c}`).join(', ')}, so ${r.wanted.map((c) => Math.max(0, c - r.cap)).join(' + ')} = ${r.orphans.length} go over.${r.orphans.length ? ` Dropped: ${r.orphans.map((t) => names[t]).join(', ')}.` : ''}`,
          watch,
        };
      },
    },
    {
      id: 'weight',
      title: 'The gate weight',
      make(rng) {
        const set: MoeSettings = { ...defaults };
        const { ops, words, names, r, watch } = setup(rng, set);
        const t = rng.int(0, words.length - 1);
        const mine = r.assignments.filter((a) => a.token === t).sort((a, b) => a.rank - b.rank);
        const [first, second] = [mine[0]!, mine[1]!];
        const l1 = r.logits[t]![first.expert]!;
        const l2 = r.logits[t]![second.expert]!;
        return {
          prompt: `Top-2 routing: **${names[t]}** takes its two highest logits and puts a softmax over just those two. What weight does its first choice, ${EXPERTS[first.expert]}, get? Two decimals.`,
          setup: ops,
          settings: set,
          answer: { kind: 'number', value: first.weight, tolerance: 0.005 },
          explain: `The two logits are ${two(l1)} and ${two(l2)}. e^${two(l1)} / (e^${two(l1)} + e^${two(l2)}) = 1 / (1 + e^(${two(l2)} − ${two(l1)})) = ${two(first.weight)}; ${EXPERTS[second.expert]} gets ${short(second.weight)}.`,
          watch,
        };
      },
    },
    {
      id: 'capacity',
      title: 'Expert capacity',
      make(rng) {
        const set: MoeSettings = {
          k: pick(rng, ['1', '2'] as const),
          cf: pick(rng, ['1', '1.25', '1.5', '2'] as const),
          routing: 'token',
        };
        const { ops, words, watch } = setup(rng, set);
        const cap = capacity(words.length, set);
        return {
          prompt: `${words.length} tokens, ${E} experts, top-${set.k} routing, capacity factor ${set.cf}. How many slots does each expert have? (Capacity is ⌈factor × k × tokens / experts⌉.)`,
          setup: ops,
          settings: set,
          answer: { kind: 'number', value: cap },
          explain: `${set.cf} × ${set.k} × ${words.length} / ${E} = ${two((Number(set.cf) * Number(set.k) * words.length) / E)}, rounded up: ${cap}. In all, ${E} × ${cap} = ${E * cap} slots for ${Number(set.k) * words.length} assignments.`,
          watch,
        };
      },
    },
  ];
}
