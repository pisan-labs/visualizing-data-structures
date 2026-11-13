import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  fitting,
  idleCells,
  list,
  made,
  reqOf,
  wait,
  type CbSettings,
  type CbState,
  type Policy,
  type Spec,
} from './model';

type Def = VizDef<CbState, CbSettings, unknown>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

const RULES =
  'Iteration t runs from time t to t + 1; each request in a slot writes one token per iteration (its first iteration also reads its prompt). Requests wait in line in order of arrival.';

const policyText = (p: Policy, slots: number) =>
  p === 'continuous'
    ? `continuous batching with ${slots} slots (a free slot takes the next request at the next iteration)`
    : `static batching with ${slots} slots (a batch starts when every slot is free and returns when its longest request is done)`;

/**
 * Practice for continuous batching. The picture shows the requests in the table, before any
 * iteration runs; the questions ask what Run to the end will do. Every answer comes from running
 * the model.
 */
export function batchingPractice(def: () => Def): PracticeKind[] {
  const run = (settings: CbSettings, c: OpCall[]) => new Timeline(def(), settings, 1, c).endState();

  /** Four or five requests that keep the slots busy, some arriving late. */
  function requests(rng: Rng, n = rng.int(4, 5)) {
    const specs: Spec[] = Array.from({ length: n }, (): Spec => [
      rng.int(0, 3),
      rng.int(2, 9),
      rng.int(1, 6),
    ]).sort((a, b) => a[0] - b[0]);
    const setup = fitting(specs).map((x): OpCall => ['add', ...x]);
    return { setup, watch: [['run']] as OpCall[] };
  }

  const settingsOf = (rng: Rng, policy?: Policy): CbSettings => ({
    slots: rng.int(2, 3),
    policy: policy ?? pick<Policy>(rng, ['continuous', 'static']),
  });

  return [
    {
      id: 'done',
      title: 'When is a request done?',
      make(rng) {
        const settings = settingsOf(rng);
        const { setup, watch } = requests(rng);
        const end = run(settings, [...setup, ...watch]);
        const r = pick(rng, end.reqs.slice(1));
        return {
          prompt: `With ${policyText(settings.policy, settings.slots)}, at what time is request **${r.name}** done? ${RULES}`,
          setup,
          settings,
          answer: { kind: 'number', value: r.done! },
          explain:
            settings.policy === 'continuous'
              ? `${r.name} arrives at ${r.arrive} and gets a slot at ${r.start} (a wait of ${wait(r)}). It writes ${r.out} tokens, one per iteration, so it is done at ${r.start} + ${r.out} = ${r.done}.`
              : `${r.name} gets a slot when its batch starts, at ${r.start}. Its own last token is out at ${r.last}, but a batch returns together, when its longest request is done: at ${r.done}.`,
          watch,
        };
      },
    },
    {
      id: 'idle',
      title: 'Idle slots under static batching',
      make(rng) {
        const settings = settingsOf(rng, 'static');
        const { setup, watch } = requests(rng);
        const end = run(settings, [...setup, ...watch]);
        const total = end.reqs.reduce((t, r) => t + r.out, 0);
        return {
          prompt: `With ${policyText('static', settings.slots)}, how many slot-iterations are idle from time 0 until every request is done? ${RULES}`,
          setup,
          settings,
          answer: { kind: 'number', value: idleCells(end) },
          explain: `The run takes ${end.clock} iterations, so ${settings.slots} × ${end.clock} = ${settings.slots * end.clock} slot-iterations. The requests write ${total} tokens, one per busy slot-iteration. The other ${settings.slots * end.clock} − ${total} = ${idleCells(end)} are idle.`,
          watch,
        };
      },
    },
    {
      id: 'wait',
      title: 'How long does a request wait?',
      make(rng) {
        const settings = settingsOf(rng);
        const { setup, watch } = requests(rng, 5);
        const end = run(settings, [...setup, ...watch]);
        const late = end.reqs.filter((r) => (wait(r) ?? 0) > 0);
        const r = late.length ? pick(rng, late) : end.reqs.at(-1)!;
        const ahead = end.reqs.filter(
          (x) => x.start !== null && x.start < r.start! && x.name !== r.name,
        );
        return {
          prompt: `With ${policyText(settings.policy, settings.slots)}, how many iterations does request **${r.name}** wait between arriving and getting a slot? ${RULES}`,
          setup,
          settings,
          answer: { kind: 'number', value: wait(r)! },
          explain: `${r.name} arrives at ${r.arrive} and starts at ${r.start}: a wait of ${wait(r)}.${wait(r)! > 0 ? ` ${settings.policy === 'continuous' ? `It takes the first slot to come free after ${list(ahead.map((x) => x.name))} ${ahead.length === 1 ? 'has' : 'have'} had ${ahead.length === 1 ? 'its' : 'theirs'}.` : 'It cannot join a running batch, so it waits for the batch to end.'}` : ' A slot was free when it arrived.'}`,
          watch,
        };
      },
    },
    {
      id: 'who',
      title: 'Who is in the slots?',
      make(rng) {
        const settings = settingsOf(rng);
        const { setup, watch } = requests(rng);
        const end = run(settings, [...setup, ...watch]);
        const busy = end.chart.flatMap((col, t) => (col.some((c) => c.req !== null) ? [t] : []));
        const t = pick(rng, busy.filter((x) => x > 0).length ? busy.filter((x) => x > 0) : busy);
        const who = end.chart[t]!.flatMap((c) => (c.req ? [c.req] : [])).sort();
        const lines = who.map((n) => {
          const r = reqOf(end, n);
          return `${n} runs from ${r.start} to ${r.last}`;
        });
        return {
          prompt: `With ${policyText(settings.policy, settings.slots)}, which requests are in a slot in iteration ${t} (from time ${t} to ${t + 1})? Type their letters in alphabetical order. ${RULES}`,
          setup,
          settings,
          answer: { kind: 'sequence', value: who },
          explain: `${lines.join('; ')}. So iteration ${t} runs ${list(who)}. Over the whole run the model writes ${made(end)} tokens in ${end.clock} iterations.`,
          watch,
        };
      },
    },
  ];
}
