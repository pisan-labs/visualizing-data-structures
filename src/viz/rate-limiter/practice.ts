import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  dec,
  KIND_NAME,
  KINDS,
  MAX_T,
  type Kind,
  type RLExtra,
  type RLSettings,
  type RLState,
} from './model';

type Def = VizDef<RLState, RLSettings, RLExtra>;

const req = (t: number): OpCall => ['request', t];
const list = (ts: number[]) => ts.join(', ');

/** Our own problem statements, for "spot it". */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A sign-in page must turn away anyone who tries more than 5 passwords in any 10 minutes, counting exactly, as each attempt comes in.',
    pattern: 'rate-limiter',
    cue: ['more than 5', 'in any 10 minutes', 'as each attempt comes in'],
    why: 'Each attempt is checked on arrival against the last 10 minutes: a sliding log keeps the times of the last 5 that got through, and is exact.',
    near: ['sliding-window', 'monotonic-queue', 'prefix-sum-hashmap'],
  },
  {
    problem:
      'A public API lets each key make 600 calls an hour on average, but a burst of up to 20 calls at once is fine.',
    pattern: 'rate-limiter',
    cue: ['on average', 'a burst of up to 20'],
    why: 'A steady rate with a burst allowance is a token bucket: 20 tokens at most, refilled at 600 an hour.',
    near: ['sliding-window', 'two-heaps-median', 'top-k'],
  },
  {
    problem:
      'A chat server with millions of users mutes anyone who posts more than 3 messages in 5 seconds, and can keep only a few numbers per user.',
    pattern: 'rate-limiter',
    cue: ['more than 3 messages in 5 seconds', 'only a few numbers per user'],
    why: 'A log per user is too much memory; two counts and a weighted estimate (a sliding window counter) or a token bucket fit in a few numbers.',
    near: ['sliding-window', 'frequency-counting', 'lru-cache'],
  },
  {
    problem:
      'Given yesterday’s request times, sorted, find the busiest stretch of 60 seconds: the most requests in any 60 seconds.',
    pattern: 'sliding-window',
    cue: ['yesterday’s request times, sorted', 'the most requests in any 60 seconds'],
    why: 'Every time is known up front, so nothing is refused: slide a window over the sorted times, moving its left end on whenever it spans more than 60 seconds.',
    near: ['rate-limiter', 'sweep-line'],
    alsoFits: ['two-pointers'],
  },
  {
    problem:
      'Readings arrive one a second. After each one, report the largest reading of the last 10 minutes.',
    pattern: 'monotonic-queue',
    cue: ['after each one', 'the largest reading of the last 10 minutes'],
    why: 'The largest in a moving window: a deque of readings in decreasing order drops what can never be the largest again.',
    near: ['rate-limiter', 'top-k', 'two-heaps-median'],
    alsoFits: ['sliding-window'],
  },
  {
    problem:
      'From a day of server logs, list the 10 users who made the most requests.',
    pattern: 'top-k',
    cue: 'the 10 users who made the most',
    why: 'Count each user’s requests, then keep the 10 largest counts in a min-heap of size 10. Nothing is turned away, so it is not rate limiting.',
    near: ['rate-limiter', 'lfu-cache'],
    alsoFits: ['frequency-counting'],
  },
];

/** n request times after `from`, a few seconds apart, never past MAX_T. */
function times(rng: Rng, from: number, n: number, most = 3): number[] {
  const out: number[] = [];
  let t = from;
  for (let i = 0; i < n; i++) {
    t = Math.min(MAX_T, t + rng.int(0, most));
    out.push(t);
  }
  return out;
}

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function rlPractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[], settings: RLSettings) => new Timeline(def(), settings, 1, calls);
  const base = (limiter: Kind): RLSettings => ({ limiter, limit: 3, window: '10' });

  return [
    {
      id: 'which-pass',
      title: 'Which requests pass?',
      make(rng) {
        const limiter = KINDS[rng.int(0, KINDS.length - 1)]!;
        const settings = base(limiter);
        let setup: OpCall[] = [];
        let ask: number[] = [];
        let ok: boolean[] = [];
        for (let tries = 0; tries < 30; tries++) {
          const first = times(rng, rng.int(0, 4), rng.int(1, 3));
          ask = times(rng, first.at(-1)! + rng.int(0, 4), rng.int(4, 6));
          setup = first.map(req);
          const t = run([...setup, ...ask.map(req)], settings);
          ok = t.endState().reqs.slice(first.length).map((r) => r.ok === true);
          if (ok.some((x) => x) && ok.some((x) => !x)) break;
        }
        const pass = ask.filter((_, i) => ok[i]);
        const verdicts = ask.map((t, i) => `${t} ${ok[i] ? 'passes' : 'is refused'}`);
        const rule: Record<Kind, string> = {
          fixed: 'The fixed window counts the requests let through in its window, [0, 10), [10, 20) and so on, and starts over at each edge.',
          log: 'The sliding log lets a request through while fewer than 3 times are logged in the last 10 seconds, (t − 10, t].',
          counter:
            'The sliding window counter lets a request through while curr + prev × (10 − (t − start)) / 10 is under 3.',
          bucket:
            'The bucket gains 0.3 tokens a second up to 3, and a request needs a whole token.',
        };
        return {
          prompt: `A ${KIND_NAME[limiter]} lets 3 requests through per 10 seconds; the picture shows the requests so far. Next, requests arrive at ${list(ask)}. Which of them pass? Type their times in order.`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'sequence', value: pass.map(String) },
          explain: `${rule[limiter]} One at a time: ${verdicts.join(', ')}.`,
          watch: ask.map(req),
        };
      },
    },
    {
      id: 'tokens-left',
      title: 'Tokens left at time t',
      make(rng) {
        const settings = base('bucket');
        const setup = times(rng, rng.int(0, 3), rng.int(2, 4), 2).map(req);
        const last = Number(setup.at(-1)![1]);
        const a = Math.min(MAX_T, last + rng.int(1, 5));
        const b = Math.min(MAX_T, a + rng.int(0, 4));
        const t = run([...setup, req(a), req(b)], settings);
        const end = t.endState();
        const left = end.units / 10;
        const says = t.entries.slice(-2).map((e) => e.steps.map((s) => s.say).join(' '));
        return {
          prompt: `The bucket holds at most 3 tokens and gains 0.3 a second; each request let through takes one. The picture shows it after the requests so far. Requests then arrive at ${a} and ${b}. How many tokens are left right after the request at ${b}? Give it to one decimal place.`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: left, tolerance: 0.005 },
          explain: `At ${a}: ${says[0]} At ${b}: ${says[1]} So ${dec(end.units, 10)} tokens are left.`,
          watch: [req(a), req(b)],
        };
      },
    },
    {
      id: 'estimate',
      title: 'The counter’s estimate',
      make(rng) {
        const settings = base('counter');
        // Some requests in one window, then one in the next.
        const w = 10 * rng.int(0, 2);
        const setup = times(rng, w + rng.int(0, 5), rng.int(2, 4), 2).map(req);
        const t0 = w + 10 + rng.int(0, 8);
        const t = run([...setup, req(t0)], settings);
        const e = t.entries.at(-1)!;
        const est = e.steps.find((s) => s.extra?.est !== undefined)!;
        const value = est.extra!.est! / 10;
        return {
          prompt: `A sliding window counter lets 3 requests through per 10 seconds; the picture shows the requests so far. A request arrives at ${t0}. What estimate of the last 10 seconds does the counter work out for it? Give it to one decimal place.`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value, tolerance: 0.005 },
          explain: `${e.steps[0]!.say} ${est.say}`,
          watch: [req(t0)],
        };
      },
    },
    spotItKind({
      page: 'rate-limiter',
      rows: SPOT_ROWS,
      watch: [7, 8, 9, 10, 11, 12].map(req),
    }),
  ];
}
