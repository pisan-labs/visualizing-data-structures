import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  defaults,
  formatInstance,
  parseInstance,
  seqText,
  type Domino,
  type PcpSettings,
  type PcpState,
} from './model';

type Def = VizDef<PcpState, PcpSettings, unknown>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Instances the questions use: each has a short match that breadth first finds. */
const SOLVABLE = [
  'b/ca a/ab ca/a abc/c',
  'a/baa ab/aa bba/bb',
  'ab/a b/bb a/ab',
  'ba/a a/aab ab/b',
  'aab/a b/abb ab/b',
  'aba/a a/ab b/ba',
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Practice for the PCP page. Every answer comes from running the model. `def` is a getter to
 * avoid an import cycle.
 */
export function pcpPractice(def: () => Def): PracticeKind[] {
  const end = (calls: OpCall[], settings: Partial<PcpSettings> = {}) =>
    new Timeline(def(), { ...defaults, ...settings } as PcpSettings, 1, calls).endState();
  const tryOn = (text: string, seq: number[]) =>
    end([
      ['load', text],
      ['try', seq.map((k) => k + 1).join(' ')],
    ]).check!;
  const instance = (rng: Rng) => {
    const text = pick(rng, SOLVABLE);
    return { text, ds: parseInstance(text) as Domino[] };
  };
  const randomSeq = (rng: Rng, n: number, len: number) =>
    Array.from({ length: len }, () => rng.int(0, n - 1));

  return [
    {
      id: 'alive',
      title: 'Alive, dead or a match?',
      make(rng) {
        const { text, ds } = instance(rng);
        // Prefer a sequence that gets past its first domino, so the question is not trivial.
        let seq = randomSeq(rng, ds.length, rng.int(2, 3));
        for (let i = 0; i < 20 && tryOn(text, seq.slice(0, 1)).verdict === 'dead'; i++)
          seq = randomSeq(rng, ds.length, rng.int(2, 3));
        const c = tryOn(text, seq);
        const options = ['Alive: one string is a prefix of the other', 'Dead', 'A match'];
        const correct = c.verdict === 'match' ? 2 : c.verdict === 'dead' ? 1 : 0;
        return {
          prompt: `Lay down dominoes ${seqText(seq)}, in that order. Is the result still alive, dead, or a match?`,
          setup: [['load', text]],
          answer: { kind: 'choice', options, correct },
          explain:
            c.verdict === 'dead'
              ? `The strings disagree at column ${c.at! + 1}, after domino ${seqText(c.seq.slice(-1))}: no dominoes added later can fix that.`
              : c.verdict === 'match'
                ? `Top and bottom both spell ${c.top}.`
                : `Top ${c.top} and bottom ${c.bottom} agree as far as both go, so more dominoes might still finish a match.`,
          watch: [['try', seqText(seq)]],
        };
      },
    },
    {
      id: 'overhang',
      title: 'How far ahead?',
      make(rng) {
        const { text, ds } = instance(rng);
        let seq: number[] = [];
        let c = tryOn(text, [0]);
        for (let i = 0; i < 60; i++) {
          seq = randomSeq(rng, ds.length, rng.int(1, 3));
          c = tryOn(text, seq);
          if (c.verdict === 'alive') break;
        }
        if (c.verdict !== 'alive') {
          seq = [1];
          c = tryOn(text, seq);
        }
        const diff = Math.abs(c.top.length - c.bottom.length);
        return {
          prompt: `Lay down dominoes ${seqText(seq)}. By how many symbols is the longer string ahead of the shorter one?`,
          setup: [['load', text]],
          answer: { kind: 'number', value: diff },
          explain: `Top ${c.top || 'ε'} has ${plural(c.top.length, 'symbol')} and bottom ${c.bottom || 'ε'} has ${c.bottom.length}${c.verdict === 'dead' ? ', though they disagree, so this one is dead' : ''}: the longer is ${diff} ahead.`,
          watch: [['try', seqText(seq)]],
        };
      },
    },
    {
      id: 'first',
      title: 'Which dominoes can start a match?',
      make(rng) {
        const { text, ds } = instance(rng);
        const ok = ds
          .map((_, i) => i)
          .filter((i) => tryOn(text, [i]).verdict !== 'dead')
          .map((i) => String(i + 1));
        return {
          prompt: `A match has to start somewhere. Which of these dominoes could be the first one? Type their numbers.`,
          setup: [['load', text]],
          answer: { kind: 'sequence', value: ok },
          explain: `A first domino needs one of its strings to be a prefix of the other. That holds for ${ok.join(', ')}; ${ds.length - ok.length ? 'the others disagree with themselves' : 'it holds for every one'}.`,
          watch: [['search']],
        };
      },
    },
    {
      id: 'shortest',
      title: 'The shortest match',
      make(rng) {
        const { text, ds } = instance(rng);
        const r = end([['load', text], ['search']]).search!;
        const seq = r.found!.map((k) => String(k + 1));
        return {
          prompt: `Breadth-first search tries every sequence of 1 domino, then of 2, and so on, dominoes in number order. Which match does it find first? Type the domino numbers.`,
          setup: [['load', formatInstance(ds)]],
          answer: { kind: 'sequence', value: seq },
          explain: `${seq.join(' ')}: top and bottom both spell ${seq.map((k) => ds[Number(k) - 1]!.top).join('')}. No shorter sequence matches.`,
          watch: [['search']],
        };
      },
    },
  ];
}
