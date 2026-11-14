import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { fmt } from '../_dp2/kit';
import {
  defaults,
  statesFor,
  waysInto,
  type SMExtra,
  type SMSettings,
  type SMState,
  type StateName,
} from './model';

type Def = VizDef<SMState, SMSettings, SMExtra>;

const prices = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(1, 9));

/** Random rules: the cooldown, or a fee of 1 or 2, or neither. */
function rules(rng: Rng): SMSettings {
  const k = rng.int(0, 3);
  if (k === 0) return { ...defaults, cooldown: true, fee: 0 };
  if (k === 1) return { ...defaults, cooldown: false, fee: 0 };
  return { ...defaults, cooldown: k === 3, fee: k === 2 ? rng.int(1, 2) : 0 };
}

function rulesText(s: SMSettings): string {
  const cool = s.cooldown !== false;
  const fee = Number(s.fee) || 0;
  const parts = [
    'You hold at most one item and start with 0.',
    cool ? 'After a sale you must rest the next day.' : 'You may buy again the day after a sale.',
    fee ? `Each sale costs a fee of ${fee}.` : 'There is no fee.',
  ];
  return parts.join(' ');
}

/**
 * Our own problem statements, for "spot it": three that call for this pattern, and some that
 * look alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A collector follows the daily price of one rare coin. She may own at most one coin at a time, and after each sale she must sit out a day. What is the most she can make over the month?',
    pattern: 'dp-state-machine',
    cue: ['at most one coin at a time', 'sit out a day'],
    why: 'Each day she is in one of a few states (holding, free, sitting out), and each state today comes from a state yesterday: one row per state, one column per day.',
    near: ['kadane', 'sliding-window', 'two-pointers'],
  },
  {
    problem:
      'Each hour a delivery drone is flying, charging or idle. Each hour in a mode scores points, and a drone that has just charged must idle for an hour before it flies. What is the best score over a day?',
    pattern: 'dp-state-machine',
    cue: ['flying, charging or idle', 'must idle for an hour'],
    why: 'The modes are states and the rule is a missing transition. The best score in each mode at hour t is that hour’s points plus the best of the modes allowed to come before it.',
    near: ['top-k', 'sliding-window', 'monotonic-queue'],
  },
  {
    problem:
      'A painter is offered a day’s pay for each day of the next month, but she never works three days in a row. What is the most she can earn?',
    pattern: 'dp-state-machine',
    cue: ['never works three days in a row'],
    why: 'The state is how many days in a row she has just worked: 0, 1 or 2. Working moves her up one, resting sends her back to 0, and 2 cannot work.',
    near: ['sliding-window', 'two-pointers', 'kadane'],
  },
  {
    problem:
      'A trader sees the price of a bag of coffee beans every day for a month. She buys one bag on one day and sells it on a later day. What is the largest profit?',
    pattern: 'kadane',
    cue: ['buys one bag on one day and sells it on a later day'],
    why: 'One trade is the best stretch of daily changes, or one pass keeping the lowest price so far. A state machine works too, but one running minimum is all it needs.',
    near: ['two-pointers', 'sliding-window'],
    alsoFits: ['dp-state-machine'],
  },
  {
    problem:
      'A list of daily prices. For each day, find the next day on which the price is higher.',
    pattern: 'monotonic-stack',
    cue: ['for each day', 'the next day on which the price is higher'],
    why: 'Each day asks for the next larger value. Keep the days still waiting on a stack of falling prices and settle them when a higher price comes.',
    near: ['dp-state-machine', 'sliding-window'],
  },
  {
    problem:
      'A list of daily prices. For every run of 7 days in a row, what is the highest price in it?',
    pattern: 'monotonic-queue',
    cue: ['every run of 7 days in a row', 'the highest price'],
    why: 'A fixed window sliding by one day, asking for its maximum: a queue of the days that could still be the maximum, largest at the front.',
    near: ['dp-state-machine', 'kadane'],
    alsoFits: ['sliding-window'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function smPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: SMSettings) => new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'cell',
      title: 'A state’s value on day t',
      make(rng) {
        const settings = rules(rng);
        const p = prices(rng, 5);
        const setup: OpCall[] = [['load', p.join(' ')]];
        const T = run([...setup, ['solve']], settings).endState().T;
        const states = statesFor(settings);
        // A state that is possible on that day, so the answer is a number.
        let q: StateName = states[rng.int(0, states.length - 1)]!;
        let t = rng.int(2, 5);
        if (T[states.indexOf(q)]![t] === -Infinity) {
          q = 'free';
          t = rng.int(2, 5);
        }
        const value = T[states.indexOf(q)]![t]!;
        const ways = waysInto(q, p[t - 1]!, settings.cooldown !== false, Number(settings.fee) || 0);
        const prev = (x: StateName) => fmt(T[states.indexOf(x)]![t - 1]!);
        const what: Record<StateName, string> = {
          free: 'holding nothing',
          hold: 'holding the item',
          cool: 'having just sold it that day',
        };
        return {
          prompt: `Prices by day: ${p.join(', ')}. ${rulesText(settings)} What is the most money you can have at the end of day ${t} while ${what[q]}? That is ${q}[${t}].`,
          setup,
          settings,
          answer: { kind: 'number', value },
          explain: `${q}[${t}] is the best of its ways in from day ${t - 1}: ${ways
            .map((w) => {
              const add = w.add === 0 ? '' : w.add < 0 ? ` − ${-w.add}` : ` + ${w.add}`;
              return `${w.what} (${w.from}[${t - 1}]${add} = ${prev(w.from)}${add})`;
            })
            .join(' or ')}. So ${value}.`,
          watch: [['solve']],
        };
      },
    },
    {
      id: 'profit',
      title: 'The most you can make',
      make(rng) {
        const settings = rules(rng);
        const p = prices(rng, rng.int(5, 6));
        const setup: OpCall[] = [['load', p.join(' ')]];
        const end = run([...setup, ['solve'], ['trace']], settings)
          .entries.at(-1)!
          .steps.at(-1)!;
        const profit = Number(end.vars?.profit);
        const plan = String(end.vars?.plan);
        return {
          prompt: `Prices by day: ${p.join(', ')}. Each day you may buy, sell or rest. ${rulesText(settings)} What is the most money you can end with?`,
          setup,
          settings,
          answer: { kind: 'number', value: profit },
          explain:
            plan === 'none'
              ? 'No trade pays under these rules, so the best is never to trade: 0.'
              : `Fill the table day by day and take the best state you may end in: ${profit}. One plan that makes it: ${plan.replace(/(buy|sell) (\d+)/g, '$1 on day $2').replace(/ (buy|sell)/g, ', $1')}.`,
          watch: [['solve'], ['trace']],
        };
      },
    },
    spotItKind({ page: 'dp-state-machine', rows: SPOT_ROWS, watch: [['solve'], ['trace']] }),
  ];
}
