import type { Rng } from '../../engine/rng';
import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { L, mark, wholeArg } from '../_recursion/kit';

export interface ResSettings {
  [key: string]: Scalar;
  /** Reservoir size. */
  k: number;
}

export const defaults: ResSettings = { k: 2 };

export const MAX_STREAM = 16;
export const MAX_TRIALS = 5000;
/** Trials sample from a stream of this many items. */
export const TRIAL_N = 8;

export interface Item {
  v: string;
  uid: number;
}

export interface ResState {
  k: number;
  /** The items seen so far, in order (item i is stream[i − 1]). */
  stream: Item[];
  /** The random draw made for each item (null for the first k, which always go in). */
  draws: (number | null)[];
  /** The reservoir: the uid in each slot, or null. */
  slots: (number | null)[];
  nextUid: number;
  /** The item just handled (1-based), its draw, and what happened to it. */
  at: number | null;
  action: 'fill' | 'keep' | 'skip' | null;
  /** How often each stream position ended in the reservoir over the trials. */
  counts: number[] | null;
  trials: number;
}

type S = ResState;
type RStep = Step<S, undefined>;
type Op = OpSpec<S, ResSettings, undefined>;

export function init(st: ResSettings): S {
  return {
    k: st.k,
    stream: [],
    draws: [],
    slots: Array.from({ length: st.k }, () => null),
    nextUid: 1,
    at: null,
    action: null,
    counts: null,
    trials: 0,
  };
}

/** Algorithm R on values, with draws from rng: the final reservoir. */
export function sample<T>(stream: readonly T[], k: number, rng: Rng): T[] {
  const r: T[] = [];
  stream.forEach((x, idx) => {
    const i = idx + 1;
    if (i <= k) r.push(x);
    else {
      const j = rng.int(1, i);
      if (j <= k) r[j - 1] = x;
    }
  });
  return r;
}

const snapOf = (s: S): S => ({
  ...s,
  stream: s.stream.map((x) => ({ ...x })),
  draws: [...s.draws],
  slots: [...s.slots],
  counts: s.counts && [...s.counts],
});

function makeStep(
  s: S,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  ms: [string, MarkRole][] = [],
): RStep {
  const i = s.stream.length;
  return {
    state: snapOf(s),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: {
      i,
      k: s.k,
      'keep chance': i > s.k ? `${s.k}/${i}` : i ? '1' : null,
      trials: s.trials,
    },
    level,
  };
}

export const streamId = (uid: number) => `s-${uid}`;
export const slotId = (k: number) => `slot-${k}`;

const valueOf = (s: S, uid: number | null) =>
  uid === null ? '?' : (s.stream.find((x) => x.uid === uid)?.v ?? '?');

/** Offer one item to the reservoir, as steps. */
function* offer(s: S, v: string, rng: Rng): Generator<RStep, void, void> {
  const uid = s.nextUid++;
  s.stream.push({ v, uid });
  const i = s.stream.length;
  s.at = i;
  const k = s.k;
  if (i <= k) {
    s.slots[i - 1] = uid;
    s.draws.push(null);
    s.action = 'fill';
    yield makeStep(
      s,
      `Item ${i}, ${v}: the reservoir is not full yet (k = ${k}), so ${v} goes into slot ${i}.`,
      ['fill'],
      2,
      [
        [streamId(uid), 'new'],
        [slotId(i - 1), 'new'],
      ],
    );
    return;
  }
  yield makeStep(
    s,
    `Item ${i}, ${v}: keep it with probability k/i = ${k}/${i}. Draw j from 1 to ${i}.`,
    ['draw'],
    3,
    [[streamId(uid), 'active']],
  );
  const j = rng.int(1, i);
  s.draws.push(j);
  if (j <= k) {
    const out = valueOf(s, s.slots[j - 1]!);
    s.slots[j - 1] = uid;
    s.action = 'keep';
    yield makeStep(
      s,
      `j = ${j} ≤ ${k}: keep ${v}. It replaces ${out} in slot ${j}.`,
      ['if', 'replace'],
      2,
      [
        [streamId(uid), 'found'],
        [slotId(j - 1), 'new'],
      ],
    );
  } else {
    s.action = 'skip';
    yield makeStep(
      s,
      `j = ${j} > ${k}: skip ${v}. The reservoir stays as it is (that happens with probability ${i - k}/${i}).`,
      ['if'],
      2,
      [[streamId(uid), 'stale']],
    );
  }
}

const reject = (s: S, say: string): RStep => makeStep(s, say, [], 1);

const offerOp: Op = {
  label: 'Offer item',
  arity: 1,
  *run(s, [raw], { rng }) {
    const v = String(raw ?? '').trim();
    if (!v || v.length > 3) {
      yield reject(s, 'Type an item of 1 to 3 characters. Nothing was offered.');
      return s;
    }
    if (s.stream.length >= MAX_STREAM) {
      yield reject(s, `The drawing holds ${MAX_STREAM} items. Press Reset to start a new stream.`);
      return s;
    }
    const st = snapOf(s);
    st.counts = null;
    yield* offer(st, v, rng);
    const kept = st.slots.map((u) => valueOf(st, u)).join(' ');
    yield makeStep(st, `Reservoir after ${st.stream.length} items: ${kept}.`, [], 1);
    return snapOf(st);
  },
};

const streamOp: Op = {
  label: 'Stream 1 to n',
  arity: 1,
  *run(s, [raw], { settings, rng }) {
    const n = wholeArg(raw, 1, MAX_STREAM);
    if (n === null) {
      yield reject(
        s,
        `Type how many items to stream, from 1 to ${MAX_STREAM}. Nothing was streamed.`,
      );
      return s;
    }
    const st = init(settings);
    yield makeStep(
      st,
      `A new stream of ${n} items, 1 to ${n}, seen one at a time. Keep a uniform sample of k = ${settings.k} without knowing n in advance.`,
      ['init'],
      2,
    );
    for (let v = 1; v <= n; v++) yield* offer(st, String(v), rng);
    const kept = st.slots.map((u) => valueOf(st, u)).join(' ');
    yield makeStep(
      st,
      `Done: the sample is ${kept}. Every one of the ${n} items had the same chance, ${Math.min(n, settings.k)}/${n}, of ending up here.`,
      [],
      1,
    );
    return snapOf(st);
  },
};

const resetOp: Op = {
  label: 'Reset',
  arity: 0,
  *run(_s, _args, { settings }) {
    const st = init(settings);
    yield makeStep(st, 'A new, empty stream.', ['init'], 1);
    return st;
  },
};

const trialsOp: Op = {
  label: 'Run trials',
  arity: 1,
  *run(s, [raw], { settings, rng }) {
    const t = wholeArg(raw, 1, MAX_TRIALS);
    if (t === null) {
      yield reject(s, `Type how many trials to run, from 1 to ${MAX_TRIALS}. Nothing was run.`);
      return s;
    }
    const k = settings.k;
    const st = snapOf(s);
    st.counts = Array.from({ length: TRIAL_N }, () => 0);
    st.trials = 0;
    const even = (t * k) / TRIAL_N;
    yield makeStep(
      st,
      `Sample k = ${k} from a stream of ${TRIAL_N} items, ${t} times, and count how often each item ends in the sample. A fair sampler keeps each one ${k}/${TRIAL_N} of the time: about ${Math.round(even * 10) / 10}.`,
      ['init'],
      2,
    );
    const items = Array.from({ length: TRIAL_N }, (_, i) => i);
    const checkpoints = [10, 100, 1000].filter((c) => c < t);
    for (let r = 1; r <= t; r++) {
      for (const i of sample(items, k, rng)) st.counts[i]!++;
      st.trials = r;
      if (checkpoints.includes(r))
        yield makeStep(st, `After ${r} trials: ${st.counts.join(', ')}.`, ['init'], 2);
    }
    yield makeStep(
      st,
      `${t} trials: ${st.counts.join(', ')}. Item 1 had to survive ${TRIAL_N - k} chances of being replaced and item ${TRIAL_N} had only one chance to get in, ${t >= 500 ? `yet the counts even out near ${Math.round(even)}` : `yet each expects the same ${Math.round(even * 10) / 10}; with this few trials, chance still shows`}.`,
      [],
      1,
    );
    return snapOf(st);
  },
};

export const ops = { offer: offerOp, stream: streamOp, reset: resetOp, trials: trialsOp };

export function pseudocode(st: ResSettings): PseudoBlock[] {
  const k = st.k;
  const lines = [
    L('init', 0, `R = empty reservoir of size k = ${k}`, `Start with ${k} empty slots.`),
    L('fill', 1, 'if i ≤ k:  R[i] = item i', 'The first k items go straight in.'),
    L('draw', 1, 'else j = RANDOM(1, i)', 'After that, draw a random j from 1 to i,'),
    L('if', 1, '  if j ≤ k', 'and if j lands on a slot (probability k/i),'),
    L('replace', 2, 'R[j] = item i', 'the new item replaces what is there.'),
  ];
  const head = L(
    'loop',
    0,
    'for each item i = 1, 2, … of the stream',
    'For each item as it arrives:',
  );
  return [
    { op: 'offer', lines: [lines[0]!, head, ...lines.slice(1)] },
    { op: 'stream', lines: [lines[0]!, head, ...lines.slice(1)] },
    { op: 'reset', lines: [lines[0]!] },
    {
      op: 'trials',
      lines: [
        L(
          'init',
          0,
          'repeat t times: sample a stream of 8, count who is kept',
          'Sample many times and count how often each item is kept.',
        ),
      ],
    },
  ];
}

export function initialSay(_s: S, st: ResSettings): string {
  return `Type items and press Offer (or a number and press Stream 1 to n). The reservoir keeps k = ${st.k} of them, a fair sample of everything seen so far.`;
}

export function initialVars(): Record<string, Scalar> {
  return { i: 0, trials: 0 };
}

export function describe(s: S): string {
  const parts = [
    s.stream.length
      ? `Stream so far: ${s.stream.map((x) => x.v).join(' ')}. Reservoir: ${s.slots.map((u) => valueOf(s, u)).join(' ')}.`
      : `Empty stream; reservoir of ${s.k}.`,
  ];
  if (s.counts)
    parts.push(
      `Over ${s.trials} trials, items 1 to ${TRIAL_N} were kept ${s.counts.join(', ')} times.`,
    );
  return parts.join(' ');
}
