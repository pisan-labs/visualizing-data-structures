import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { choice } from '../_recursion/kit';
import type { ResSettings, ResState } from './model';

type Def = VizDef<ResState, ResSettings, undefined>;

/** Practice for reservoir sampling. Every answer comes from running the model. */
export function reservoirPractice(def: () => Def): PracticeKind[] {
  const run = (settings: ResSettings, calls: OpCall[]) => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries[t.entries.length - 1]!.steps;
  };
  return [
    {
      id: 'keep',
      title: 'Chance to be kept',
      make(rng) {
        const k = rng.int(1, 4);
        const i = rng.int(k + 1, 12);
        const steps = run({ k }, [['stream', i]]);
        // The keep chance the model shows when item i arrives.
        const shown = String(
          [...steps].reverse().find((s) => s.state.stream.length === i)!.vars?.['keep chance'],
        );
        return {
          prompt: `The reservoir holds k = ${k}. Item ${i} arrives. With what probability is it kept?`,
          setup: [['stream', i - 1]],
          settings: { k },
          answer: choice(rng, shown, [`1/${i}`, `${k}/${i - 1}`, `1/${k}`, `${i - k}/${i}`]),
          explain: `Draw j from 1 to ${i} and keep the item when j ≤ ${k}: probability ${k}/${i}. That is exactly the share of the ${i} items seen so far that a fair sample of ${k} should hold.`,
          watch: [['offer', 'X']],
        };
      },
    },
    {
      id: 'size',
      title: 'How full is it?',
      make(rng) {
        const k = rng.int(2, 4);
        const n = rng.int(1, 8);
        const end = run({ k }, [['stream', n]]).at(-1)!.state;
        const full = end.slots.filter((u) => u !== null).length;
        return {
          prompt: `k = ${k}. After ${n} ${n === 1 ? 'item has' : 'items have'} streamed by, how many slots of the reservoir hold an item?`,
          setup: [],
          settings: { k },
          answer: { kind: 'number', value: full },
          explain: `The first ${k} items fill the slots, and after that items only replace each other: min(${n}, ${k}) = ${full}.`,
          watch: [['stream', n]],
        };
      },
    },
    {
      id: 'final',
      title: 'Chance to end in the sample',
      make(rng) {
        const k = rng.int(1, 3);
        const n = rng.int(k + 2, 10);
        const p = rng.int(1, n);
        // Every item ends with the chance the last one had to get in: read it off the model.
        const steps = run({ k }, [['stream', n]]);
        const right = String(
          [...steps].reverse().find((st) => st.state.stream.length === n)!.vars?.['keep chance'],
        );
        return {
          prompt: `k = ${k}, and the stream has ${n} items. What is the chance that item ${p} is in the reservoir at the end?`,
          setup: [],
          settings: { k },
          answer: choice(rng, right, [`${k}/${p}`, `1/${n}`, `${k}/${n - p + 1}`, `1/${p}`]),
          explain:
            p <= k
              ? `Item ${p} goes in for free, then must survive items ${k + 1} to ${n}: each replaces it with probability 1/i, so it survives with (${k}/${k + 1})·…·(${n - 1}/${n}) = ${right}.`
              : `Item ${p} gets in with probability ${k}/${p}, then must survive items ${p + 1} to ${n}: (${k}/${p})·(${p}/${p + 1})·…·(${n - 1}/${n}) = ${right}. Every item ends up with the same ${right}.`,
          watch: [['stream', n]],
        };
      },
    },
  ];
}
