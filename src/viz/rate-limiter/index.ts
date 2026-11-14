import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/rate_limiters.hpp?raw';
import javaSource from './code/java/RateLimiters.java?raw';
import pythonSource from './code/python/rate_limiters.py?raw';
import bucketRefills from './examples/bucket-refills.json';
import counterEstimate from './examples/counter-estimate.json';
import edgeBurst from './examples/edge-burst.json';
import estimateTooStrict from './examples/estimate-too-strict.json';
import flood from './examples/flood.json';
import logIsExact from './examples/log-is-exact.json';
import quietThenBurst from './examples/quiet-then-burst.json';
import steadyUnderLimit from './examples/steady-under-limit.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LIMIT,
  MAX_SAME,
  MAX_T,
  ops,
  params,
  pseudocode,
  readTime,
  WINDOWS,
  type RLExtra,
  type RLSettings,
  type RLState,
} from './model';
import { rlPractice } from './practice';
import { view } from './view';

const req = (t: number): OpCall => ['request', t];

/** Times in order, at most MAX_SAME at one second and none past MAX_T. */
function tidy(times: number[]): number[] {
  const out: number[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const c = Math.min(MAX_T, Math.max(0, t));
    if (out.filter((x) => x === c).length < MAX_SAME) out.push(c);
  }
  return out;
}

function randomTimes(rng: Rng, n: number): number[] {
  return tidy(Array.from({ length: n }, () => rng.int(0, MAX_T)));
}

const presets: Preset[] = [
  {
    label: 'Random times',
    make: (rng, n) => randomTimes(rng, n).map(req),
  },
  {
    label: 'A burst at a window edge',
    make: (rng, n, settings) => {
      const { L, W } = params({ ...defaults, ...settings } as RLSettings);
      const edge = W * rng.int(1, Math.max(1, Math.floor(20 / W)));
      const burst = [
        ...Array.from({ length: L }, (_, i) => edge - 1 - Math.floor((i * 2) / Math.max(1, L))),
        ...Array.from({ length: L }, (_, i) => edge + Math.floor((i * 2) / Math.max(1, L))),
      ];
      const rest = Array.from({ length: Math.max(0, n - burst.length) }, () => rng.int(0, MAX_T));
      return tidy([...burst, ...rest]).map(req);
    },
  },
  {
    label: 'Evenly spaced at the limit',
    make: (rng, n, settings) => {
      const { L, W } = params({ ...defaults, ...settings } as RLSettings);
      const gap = Math.max(1, Math.ceil(W / L));
      const start = rng.int(0, 3);
      return tidy(Array.from({ length: n }, (_, i) => start + i * gap)).map(req);
    },
  },
  {
    label: 'A flood at one second',
    make: (rng, n) => {
      const t = rng.int(2, 12);
      const flood = Array(Math.min(n, MAX_SAME)).fill(t);
      const later = Array.from({ length: Math.max(0, n - MAX_SAME) }, (_, i) => t + 4 + 3 * i);
      return tidy([...flood, ...later]).map(req);
    },
  },
  {
    label: 'Quiet, then a burst',
    make: (rng, n) => {
      const late = rng.int(25, 33);
      const burst = Array.from({ length: Math.max(1, n - 2) }, (_, i) => late + Math.floor(i / 3));
      return tidy([0, 1, ...burst]).map(req);
    },
  },
  {
    label: 'One over the limit in every window',
    make: (_rng, n, settings) => {
      const { L, W } = params({ ...defaults, ...settings } as RLSettings);
      const times: number[] = [];
      for (let w = 0; times.length < n && w <= MAX_T; w += W)
        for (let i = 0; i <= L && times.length < n; i++) times.push(w + Math.floor(i / 2));
      return tidy(times).map(req);
    },
  },
];

export const rateLimiter: VizDef<RLState, RLSettings, RLExtra> = {
  id: 'rate-limiter',
  title: 'Rate limiter',
  family: 'Design a data structure',
  blurb:
    'Let at most L requests through per W seconds: a fixed window counter (simple, but a burst slips through at a window edge), a sliding log (exact, one time kept per request), a sliding window counter (an estimate from two counts) and a token bucket, on the same request times.',
  settings: [
    {
      kind: 'choice',
      key: 'limiter',
      label: 'Limiter',
      options: [
        { value: 'counter', label: 'Sliding window counter: 3 numbers, an estimate' },
        { value: 'log', label: 'Sliding log: exact, one time per request' },
        { value: 'bucket', label: 'Token bucket: a steady rate, bursts up to L' },
        { value: 'fixed', label: 'Fixed window counter: the obvious design' },
      ],
      help: 'The same requests through each design. Use Compare with this same page to put two side by side.',
    },
    {
      kind: 'number',
      key: 'limit',
      label: 'Limit L (requests per window, and the bucket’s size)',
      min: 1,
      max: MAX_LIMIT,
    },
    {
      kind: 'choice',
      key: 'window',
      label: 'Window W',
      options: WINDOWS.map((w) => ({ value: w, label: `${w} seconds` })),
      help: 'The token bucket gains L tokens every W seconds, the same long-run rate.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Request time (s)',
      placeholder: 'e.g. 12, or 7 8 9 10',
      maxLength: 80,
      sample: '39',
      parse: (token: string): Value | Error => {
        if (!token.trim()) return new Error('Type a time first.');
        return readTime(token);
      },
    },
    buttons: [
      { op: 'request', label: 'Request', usesInput: true, primary: true, bulk: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: {
      label: 'Random requests',
      make: (rng) => [['clear'], ...randomTimes(rng, 10).map(req)],
    },
    presets,
    sizes: [6, 10, 16],
  },
  explain,
  complexity: [
    {
      op: 'fixed window counter, per request',
      best: {
        cost: 'O(1)',
        why: 'One comparison with the window, one with the count.',
        example: 'steady-under-limit',
      },
      average: { cost: 'O(1)', why: 'The same two numbers for every request.' },
      worst: {
        cost: 'O(1)',
        why: 'Always O(1). What it gets wrong is the count: up to 2L can pass in W seconds across an edge.',
        example: 'edge-burst',
      },
    },
    {
      op: 'sliding log, per request',
      best: {
        cost: 'O(1)',
        why: 'Nothing old to drop: one look at the oldest time and the log’s size.',
        example: 'log-is-exact',
      },
      average: {
        cost: 'O(1) amortized',
        why: 'Each logged time is dropped once, so the drops average out to one per request.',
        example: 'log-is-exact',
      },
      worst: {
        cost: 'O(L)',
        why: 'After a quiet spell, one request drops a whole log of L times.',
        example: 'flood',
      },
    },
    {
      op: 'sliding window counter, per request',
      best: {
        cost: 'O(1)',
        why: 'Same window: one multiply-and-add and a comparison.',
        example: 'counter-estimate',
      },
      average: { cost: 'O(1)', why: 'A new window only moves curr into prev.' },
      worst: {
        cost: 'O(1)',
        why: 'Always O(1). The estimate can be off both ways, since it assumes the previous window was even.',
        example: 'estimate-too-strict',
      },
    },
    {
      op: 'token bucket, per request',
      best: {
        cost: 'O(1)',
        why: 'One refill (a multiply and a min) and a comparison.',
        example: 'bucket-refills',
      },
      average: { cost: 'O(1)', why: 'No timers: the refill is worked out when a request comes.' },
      worst: {
        cost: 'O(1)',
        why: 'However long the quiet, the refill is one min with the capacity.',
        example: 'quiet-then-burst',
      },
    },
    {
      op: 'memory per client',
      best: {
        cost: '2 numbers',
        why: 'The fixed window (start, count) and the token bucket (tokens, last refill).',
        example: 'edge-burst',
      },
      average: {
        cost: '3 numbers',
        why: 'The sliding window counter: start, prev and curr.',
        example: 'counter-estimate',
      },
      worst: {
        cost: 'O(L)',
        why: 'The sliding log keeps one time per request let through in the last W seconds, up to L.',
        example: 'flood',
      },
      note: 'Per client: a server limiting a million users keeps a million of these.',
    },
    {
      op: 'most let through in any W seconds',
      best: {
        cost: 'L',
        why: 'The sliding log never lets more through: it counts the last W seconds exactly.',
        example: 'log-is-exact',
      },
      average: {
        cost: 'a little over L, at times',
        why: 'The sliding window counter’s estimate can let one or two extra through.',
        example: 'counter-estimate',
      },
      worst: {
        cost: '2L',
        why: 'The fixed window: L just before an edge and L just after. A full bucket plus its refill comes close too.',
        example: 'edge-burst',
      },
    },
  ],
  practice: rlPractice(() => rateLimiter),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RLSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    edgeBurst,
    logIsExact,
    counterEstimate,
    bucketRefills,
    steadyUnderLimit,
    flood,
    estimateTooStrict,
    quietThenBurst,
  ] as unknown as SavedExample[],
  opening: 'edge-burst',
  preview: { example: 'edge-burst', level: 2 },
};

/**
 * Driver protocol for the code tabs:
 *   new <fixed|log|counter|bucket> L W
 *   req t   ->  "pass" | "refuse"
 *   clear   ->  "ok"
 * Requests the model does not take (bad times, out of order, too many at one second) are left
 * out: the model changes nothing.
 */
function codeScript(calls: OpCall[], settings: RLSettings) {
  const p = params(settings);
  const t = new Timeline(rateLimiter, settings, 1, calls);
  const input = [`new ${p.kind} ${p.L} ${p.W}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    if (e.call[0] === 'clear') {
      input.push('clear');
      expected.push('ok');
    } else if (e.end.reqs.length > before.reqs.length) {
      const r = e.end.reqs.at(-1)!;
      input.push(`req ${r.t}`);
      expected.push(r.ok ? 'pass' : 'refuse');
    }
    before = e.end;
  }
  return { input, expected };
}

export default rateLimiter;
