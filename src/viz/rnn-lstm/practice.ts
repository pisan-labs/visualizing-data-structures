import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import { ANIMALS, THINGS } from '../_lm/vocab';
import {
  defaults,
  parseSentence,
  pullText,
  readAll,
  wordName,
  type LstmRow,
  type RnnExtra,
  type RnnRow,
  type RnnSettings,
  type RnnState,
} from './model';

type Def = VizDef<RnnState, RnnSettings, RnnExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/** Sentences that start with an animal, of 2 to 8 words, some with a second or third animal. */
export function practiceSentence(rng: Rng): string {
  const [a, b, c] = [pick(rng, ANIMALS), pick(rng, ANIMALS), pick(rng, ANIMALS)];
  const t = pick(rng, THINGS);
  return pick(rng, [
    `${a} sat on the ${t} and it slept`,
    `${a} ran under the ${t} and it sat`,
    `${a} slept on a ${t}`,
    `${a} saw the ${t}`,
    `${a} ate`,
    `${a} sat and the ${b} ate it`,
    `${a} saw a ${b} and a ${c}`,
    `${a} chased the ${b}`,
  ]);
}

const LSTM: RnnSettings = { ...defaults, model: 'lstm' };

/**
 * Practice for recurrent networks. The picture shows the sentence after the words read so far;
 * the questions ask about the next word, or about reading the rest. Every answer comes from
 * running the model.
 */
export function rnnPractice(def: () => Def): PracticeKind[] {
  /** A sentence with `before` words read (at least one), and the next word to come. */
  function partway(rng: Rng, settings: RnnSettings) {
    for (;;) {
      const text = practiceSentence(rng);
      const words = parseSentence(text) as string[];
      if (words.length < 2) continue;
      const before = rng.int(1, words.length - 1);
      const setup: OpCall[] = [
        ['load', text],
        ...Array.from({ length: before }, (): OpCall => ['step']),
      ];
      const s = new Timeline(def(), settings, 1, setup).endState();
      const rows = readAll(words, settings.model, Number(settings.w));
      const names = words.map((_, i) => wordName(words, i));
      return { words, names, before, setup, s, rows, watch: [['step']] as OpCall[] };
    }
  }

  return [
    {
      id: 'hidden',
      title: 'The memory after a word',
      make(rng) {
        const w = pick(rng, ['0.5', '0.8', '1.5'] as const);
        const settings: RnnSettings = { model: 'rnn', w };
        const { names, before, setup, rows, watch } = partway(rng, settings);
        const r = rows[before] as RnnRow;
        const hPrev = rows[before - 1]!.h;
        return {
          prompt: `The plain RNN, with w = ${w}, reads **${names[before]}** next. What is its memory h after that word? h = tanh(w·h + x·U), where x·U is the word's animal feature. Two decimals.`,
          setup,
          settings,
          answer: { kind: 'number', value: r.h, tolerance: 0.01 },
          explain: `h = tanh(${w} × ${two(hPrev)} + ${two(r.input)}) = tanh(${two(r.push + r.input)}) = ${two(r.h)}.${
            r.input === 0
              ? ` The word ${names[before]} is not an animal, so nothing new comes in and the memory ${Math.abs(r.h) < Math.abs(hPrev) ? 'shrinks' : 'moves'}.`
              : ''
          }`,
          watch,
        };
      },
    },
    {
      id: 'gate',
      title: 'A gate’s value',
      make(rng) {
        const { names, before, setup, s, rows, watch } = partway(rng, LSTM);
        const r = rows[before] as LstmRow;
        const a = two(s.x[before]![0]!);
        const forget = rng.int(0, 1) === 0;
        return {
          prompt: forget
            ? `The LSTM reads **${names[before]}** next. Its forget gate is f = σ(−6 × animal + 3), where animal is the word's first number. What is f? Two decimals.`
            : `The LSTM reads **${names[before]}** next. Its input gate is i = σ(6 × animal − 3), where animal is the word's first number. What is i? Two decimals.`,
          setup,
          settings: LSTM,
          answer: { kind: 'number', value: forget ? r.f : r.i, tolerance: 0.005 },
          explain: forget
            ? `f = σ(−6 × ${a} + 3) = σ(${two(r.zf)}) = 1 / (1 + e^${two(-r.zf)}) = ${two(r.f)}. ${r.f < 0.5 ? 'An animal: the cell lets go of the old one.' : 'Not an animal: the cell keeps what it holds.'}`
            : `i = σ(6 × ${a} − 3) = σ(${two(r.zi)}) = 1 / (1 + e^${two(-r.zi)}) = ${two(r.i)}. ${r.i > 0.5 ? 'An animal: write it into the cell.' : 'Not an animal: write almost nothing.'}`,
          watch,
        };
      },
    },
    {
      id: 'cell',
      title: 'The cell after a word',
      make(rng) {
        const { names, before, setup, rows, watch } = partway(rng, LSTM);
        const r = rows[before] as LstmRow;
        const cPrev = (rows[before - 1] as LstmRow).c;
        return {
          prompt: `The LSTM reads **${names[before]}** next, and its gates come out at f = ${two(r.f)}, i = ${two(r.i)} and g = ${two(r.g)}. What is the cell c after that word? c = f·c + i·g, with the old c in the picture. Two decimals.`,
          setup,
          settings: LSTM,
          answer: { kind: 'number', value: r.c, tolerance: 0.01 },
          explain: `c = ${two(r.f)} × ${two(cPrev)} + ${two(r.i)} × ${two(r.g)} = ${two(r.f * cPrev)} + ${two(r.i * r.g)} = ${two(r.c)}.${
            r.f > 0.5
              ? ' The forget gate is open, so the cell keeps most of what it had.'
              : ' The forget gate is nearly shut, so the old cell is mostly dropped.'
          }`,
          watch,
        };
      },
    },
    {
      id: 'remembers',
      title: 'Which model remembers word 1?',
      make(rng) {
        const text = practiceSentence(rng);
        const words = parseSentence(text) as string[];
        const rnn = readAll(words, 'rnn', 0.8).at(-1)!.pull;
        const lstm = readAll(words, 'lstm', 0).at(-1)!.pull;
        const options = ['Only the LSTM', 'Only the plain RNN', 'Both', 'Neither'];
        const keepsR = rnn >= 0.5;
        const keepsL = lstm >= 0.5;
        const correct = keepsL && keepsR ? 2 : keepsL ? 0 : keepsR ? 1 : 3;
        const animals = words.filter((w) => ANIMALS.includes(w)).length;
        return {
          prompt: `Both models read all of "${text}": the plain RNN with w = 0.8, and the LSTM. Whose memory is still pulled at least half as much by word 1 (∂m/∂m₁ ≥ 0.5) after the last word?`,
          setup: [['load', text]],
          settings: LSTM,
          answer: { kind: 'choice', options, correct },
          explain: `The plain RNN's pull is ${pullText(rnn)}: every step multiplies it by w(1 − h²), at most 0.8. The LSTM's is ${pullText(lstm)}: every step multiplies it by its forget gate, ${
            animals > 1
              ? 'and the later animal shuts that gate (about 0.05 to 0.14).'
              : 'about 0.95 for every word that is not an animal.'
          }`,
          watch: [['run']],
        };
      },
    },
  ];
}
