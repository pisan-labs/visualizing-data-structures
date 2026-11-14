import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  bitCount,
  chunkName,
  gradientText,
  randomGradients,
  ringChunks,
  ringSent,
  scatterSteps,
  sendsChunk,
  workerName,
  type RingExtra,
  type RingSettings,
  type RingState,
} from './model';

type Def = VizDef<RingState, RingSettings, RingExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/**
 * Practice for ring all-reduce. The picture shows the gradients just loaded; the questions ask
 * about the ring steps that follow. Every answer comes from running the model.
 */
export function ringPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng, n: number) {
    const settings: RingSettings = { workers: n };
    const ops: OpCall[] = [['load', gradientText(randomGradients(rng, n))]];
    const s = new Timeline(def(), settings, 1, ops).endState();
    return { settings, ops, s };
  }

  return [
    {
      id: 'value',
      title: 'A chunk after step t',
      make(rng) {
        const n = pick(rng, [3, 4, 4, 5]);
        const { settings, ops, s } = setup(rng, n);
        const t = rng.int(1, n - 1);
        const after = scatterSteps(s, t);
        const before = scatterSteps(s, t - 1);
        // A cell that changed in step t: the chunk worker i received.
        const i = rng.int(0, n - 1);
        const c = sendsChunk('rs', (i - 1 + n) % n, t - 1, n);
        const who = Array.from({ length: n }, (_, j) => j).filter(
          (j) => after.has[i]![c]! & (1 << j),
        );
        return {
          prompt: `Reduce-scatter starts from these gradients. After step **${t}** of ${n - 1}, what does **${workerName(i)}** hold for chunk **${chunkName(c)}**?`,
          setup: ops,
          settings,
          answer: { kind: 'number', value: after.v[i]![c]! },
          explain: `In step ${t}, ${workerName((i - 1 + n) % n)} sends its ${chunkName(c)} (${before.v[(i - 1 + n) % n]![c]!}) to ${workerName(i)}, which adds it to its own ${before.v[i]![c]!}. That is ${after.v[i]![c]!}: chunk ${chunkName(c)} of workers ${who.map((j) => j + 1).join(', ')} added up, ${bitCount(after.has[i]![c]!)} of the ${n}.`,
          watch: [['scatter']],
        };
      },
    },
    {
      id: 'sent',
      title: 'How much does each worker send?',
      make(rng) {
        const n = pick(rng, [2, 3, 4, 5]);
        const { settings, ops } = setup(rng, n);
        const m = pick(rng, [120, 240, 360, 600, 1200]);
        const value = ringSent(n, m);
        return {
          prompt: `Now the ring has **${n} workers** and each gradient is **${m} MB**. In a whole ring all-reduce, reduce-scatter and all-gather, how many MB does each worker send?`,
          setup: ops,
          settings,
          answer: { kind: 'number', value },
          explain: `Each chunk is ${m} / ${n} = ${m / n} MB, and each worker sends ${n - 1} chunks in each stage, ${ringChunks(n)} in all: ${ringChunks(n)} × ${m / n} = ${value} MB. A parameter server would receive all ${n} gradients, ${n * m} MB, over its one link.`,
          watch: [['allreduce']],
        };
      },
    },
    {
      id: 'owner',
      title: 'Who holds which sum?',
      make(rng) {
        const n = pick(rng, [3, 4, 5]);
        const { settings, ops, s } = setup(rng, n);
        const i = rng.int(0, n - 1);
        const done = scatterSteps(s, n - 1);
        const correct = done.has[i]!.findIndex((bits) => bitCount(bits) === n);
        const options = Array.from({ length: n }, (_, c) => chunkName(c));
        return {
          prompt: `After the whole reduce-scatter (${n - 1} steps), **${workerName(i)}** holds the complete sum of exactly one chunk. Which?`,
          setup: ops,
          settings,
          answer: { kind: 'choice', options, correct },
          explain: `Chunk ${chunkName(correct)} starts its trip at ${workerName(correct)} and moves one worker right each step, gathering a gradient each time. After ${n - 1} steps it has visited every worker and stops at ${workerName(i)}: worker i ends with chunk number i + 1 (a = 1, wrapping round).`,
          watch: [['scatter']],
        };
      },
    },
    {
      id: 'sends',
      title: 'Which chunk goes next?',
      make(rng) {
        const n = pick(rng, [3, 4, 5]);
        const { settings, ops } = setup(rng, n);
        const stage = pick(rng, ['rs', 'rs', 'ag'] as const);
        const t = rng.int(1, n - 1);
        const i = rng.int(0, n - 1);
        // The chunk, read from the model's own packets for that step.
        const tl = new Timeline(def(), settings, 1, [...ops, ['allreduce']]);
        const steps = tl.entries
          .at(-1)!
          .steps.filter(
            (st) => st.extra?.stage === stage && st.extra.packets && st.extra.step === t - 1,
          );
        const correct = steps[0]!.extra!.packets!.find((p) => p.from === i)!.chunk;
        const options = Array.from({ length: n }, (_, c) => chunkName(c));
        const stageName = stage === 'rs' ? 'reduce-scatter' : 'all-gather';
        return {
          prompt: `In step **${t}** of **${stageName}**, which chunk does **${workerName(i)}** send to ${workerName((i + 1) % n)}?`,
          setup: ops,
          settings,
          answer: { kind: 'choice', options, correct },
          explain:
            stage === 'rs'
              ? `In reduce-scatter step t (counting from 1), worker i sends chunk number i − t + 1 (a = 1, b = 2, and so on, wrapping round): worker ${i + 1} sends ${chunkName(correct)}. In step 1 each worker sends its own-numbered chunk; after that it passes on the chunk it has just added to.`
              : `In all-gather step t (counting from 1), worker i sends chunk number i − t + 2 (a = 1, b = 2, and so on, wrapping round): worker ${i + 1} sends ${chunkName(correct)}. In step 1 it sends the chunk it finished in reduce-scatter; after that it passes on the one it just received.`,
          watch: [['allreduce']],
        };
      },
    },
  ];
}
