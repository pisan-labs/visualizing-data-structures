import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { short } from '../_lm/numbers';
import { ANIMALS, THINGS } from '../_lm/vocab';
import { wordName } from '../self-attention/model';
import {
  config,
  groupOf,
  sharers,
  type HeadsChoice,
  type KvChoice,
  type MhaExtra,
  type MhaSettings,
  type MhaState,
} from './model';

type Def = VizDef<MhaState, MhaSettings, MhaExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function sentence(rng: Rng): string {
  const a = pick(rng, ANIMALS);
  const t = pick(rng, THINGS);
  return pick(rng, [
    `the ${a} sat on the ${t}`,
    `the ${a} saw the ${t} and it`,
    `a ${a} ate the ${t}`,
    `the ${a} chased a ${t}`,
    `the ${a} ran under the ${t}`,
  ]);
}

const KV_TEXT: Record<KvChoice, string> = {
  mha: 'multi-head attention (a key and value head for every query head)',
  gqa: 'grouped-query attention (a key and value head for every two query heads)',
  mqa: 'multi-query attention (one key and value head for all)',
};

/**
 * Practice for multi-head attention. The picture shows the sentence after Load with the
 * question's settings; the questions ask about Attend, and every answer comes from running it.
 */
export function mhaPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, settings: MhaSettings) {
    const ops: OpCall[] = [['load', sentence(rng)]];
    const watch: OpCall[] = [['attend']];
    const t = new Timeline(def(), settings, 1, [...ops, ...watch]);
    const end = t.at(t.length - 1).step;
    return { ops, watch, s: t.endState(), vars: end.vars ?? {} };
  }
  const anySettings = (rng: Rng): MhaSettings => ({
    heads: pick(rng, ['1', '2', '4'] as HeadsChoice[]),
    kv: pick(rng, ['mha', 'gqa', 'mqa'] as KvChoice[]),
  });

  return [
    {
      id: 'width',
      title: 'How wide is a head?',
      make(rng) {
        const settings = anySettings(rng);
        const { ops, watch, vars } = setup(rng, settings);
        const cfg = config(settings);
        const askK = rng.int(0, 1) === 1;
        const value = askK
          ? Number(vars['KV heads']) * Number(vars['head width'])
          : Number(vars['head width']);
        return {
          prompt: askK
            ? `d_model = 4, with **${cfg.h} ${cfg.h === 1 ? 'head' : 'query heads'}** and ${KV_TEXT[settings.kv]}. How many numbers wide is K, all key heads side by side?`
            : `d_model = 4 is split among **${cfg.h} ${cfg.h === 1 ? 'head' : 'heads'}**. How many numbers wide is each head's query?`,
          setup: ops,
          settings,
          answer: { kind: 'number', value },
          explain: askK
            ? `Each head is 4 / ${cfg.h} = ${cfg.d} wide, and there ${cfg.hkv === 1 ? 'is 1 key head' : `are ${cfg.hkv} key heads`}: ${cfg.hkv} × ${cfg.d} = ${value}.`
            : `The heads split the embedding's 4 numbers evenly: 4 / ${cfg.h} = ${value}.`,
          watch,
        };
      },
    },
    {
      id: 'cache',
      title: 'How big is the KV cache?',
      make(rng) {
        const settings = anySettings(rng);
        const { ops, watch, s, vars } = setup(rng, settings);
        const cfg = config(settings);
        const n = s.words.length;
        const value = Number(vars['KV cache']);
        return {
          prompt: `This layer has **${cfg.h} ${cfg.h === 1 ? 'head' : 'query heads'}** of width ${cfg.d} and uses ${KV_TEXT[settings.kv]}. While generating, it keeps K and V for every word so far. How many numbers does its cache hold after these ${n} words?`,
          setup: ops,
          settings,
          answer: { kind: 'number', value },
          explain: `Per word: K and V, each ${cfg.hkv} × ${cfg.d} = ${cfg.hkv * cfg.d} numbers, so ${2 * cfg.hkv * cfg.d}. For ${n} words: ${n} × ${2 * cfg.hkv * cfg.d} = ${value}.`,
          watch,
        };
      },
    },
    {
      id: 'share',
      title: 'Who shares the keys?',
      make(rng) {
        const settings: MhaSettings = {
          heads: '4',
          kv: pick(rng, ['mha', 'gqa', 'mqa'] as KvChoice[]),
        };
        const { ops, watch } = setup(rng, settings);
        const cfg = config(settings);
        const i = rng.int(0, cfg.h - 1);
        const g = groupOf(cfg, i);
        const heads = sharers(cfg, g).map((x) => String(x + 1));
        return {
          prompt: `With 4 query heads and ${KV_TEXT[settings.kv]}, which query heads read the same keys and values as **head ${i + 1}**? List them in order, head ${i + 1} included.`,
          setup: ops,
          settings,
          answer: { kind: 'sequence', value: heads },
          explain:
            heads.length === 1
              ? `Every query head has its own key and value head, so head ${i + 1} reads key head ${g + 1} alone.`
              : `Query heads are grouped ${cfg.group} to a key head, in order: head ${i + 1} is in group ${g + 1}, with heads ${heads.join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'top',
      title: 'Where does a head look?',
      make(rng) {
        for (;;) {
          const settings: MhaSettings = { heads: '4', kv: 'mha' };
          const { ops, watch, s } = setup(rng, settings);
          const r = s.result!;
          const n = s.words.length;
          const head = rng.int(0, 3);
          const w = rng.int(1, n - 1);
          const row = r.heads[head]!.a[w]!.slice(0, w + 1);
          const sorted = [...row].sort((a, b) => b - a);
          if (sorted[0]! - sorted[1]! < 0.05) continue;
          const names = s.words.map((_, i) => wordName(s.words, i));
          const options = names.slice(0, w + 1);
          const top = row.indexOf(sorted[0]!);
          return {
            prompt: `Four heads, each with its own pattern. In **head ${head + 1}**, which word does **${names[w]}** give the most weight? (The mask lets it see itself and the words before it.)`,
            setup: ops,
            settings,
            answer: { kind: 'choice', options, correct: top },
            explain: `Head ${head + 1}'s row for ${names[w]}: ${options.map((x, j) => `${x} ${short(row[j]!)}`).join(', ')}.`,
            watch,
          };
        }
      },
    },
  ];
}
