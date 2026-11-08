import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step } from '../../engine/types';
import { andList, mark, plural } from '../_dp/kit';
import { intervalsFromArg, overlaps, type Interval } from '../_intervals/kit';

export const MAX_ACTS = 11;

export type Status = 'chosen' | 'skipped' | null;

export interface ActState {
  acts: Interval[];
  /** Activity ids in the order drawn, top to bottom: as typed, then as the rule sorts them. */
  order: number[];
  /** By id − 1: picked, passed over, or not looked at yet. */
  status: Status[];
}

export type Rule = 'finish' | 'shortest' | 'start';

export interface ActSettings {
  [key: string]: Scalar;
  rule: Rule;
}

export interface ActExtra {
  /** The activity being looked at, and the chosen one it clashes with. */
  at?: number;
  clash?: number;
  /** The finish time of the last activity chosen (earliest finish rule). */
  last?: number;
  /** After the run: how many earliest finish first would choose. */
  best?: number;
}

type S = ActState;
type X = ActExtra;
type Op = OpSpec<S, ActSettings, X>;
type ActStep = Step<S, X>;
type Gen = Generator<ActStep, S, void>;

export const defaults: ActSettings = { rule: 'finish' };

/** Eleven activities from the textbook's running example. */
export const START: Interval[] = [
  [1, 4],
  [3, 5],
  [0, 6],
  [5, 7],
  [3, 9],
  [5, 9],
  [6, 10],
  [8, 11],
  [8, 12],
  [2, 14],
  [12, 16],
].map(([s, f], k) => ({ id: k + 1, s: s!, f: f! }));

export function stateFor(acts: Interval[]): S {
  return { acts, order: acts.map((a) => a.id), status: acts.map(() => null) };
}

export const init = (): S => stateFor(START);

export const actId = (id: number) => `act-${id}`;
export const name = (id: number) => `a${id}`;

const RULES: Record<Rule, { key: (a: Interval) => number; what: string; sorted: string }> = {
  finish: { key: (a) => a.f, what: 'earliest finish', sorted: 'by finish time' },
  shortest: { key: (a) => a.f - a.s, what: 'shortest', sorted: 'by length, shortest first' },
  start: { key: (a) => a.s, what: 'earliest start', sorted: 'by start time' },
};

/** The order a rule considers the activities in; ties keep the typed order. */
export function sortedBy(acts: Interval[], rule: Rule): Interval[] {
  const { key } = RULES[rule];
  return [...acts].sort((a, b) => key(a) - key(b) || a.id - b.id);
}

/** Greedy by a rule: take each activity, in the rule's order, that clashes with none taken. */
export function greedy(acts: Interval[], rule: Rule): Interval[] {
  const out: Interval[] = [];
  for (const a of sortedBy(acts, rule)) if (out.every((b) => !overlaps(a, b))) out.push(a);
  return out;
}

const iv = (a: Interval) => `${name(a.id)} [${a.s}, ${a.f})`;

const select: Op = {
  label: 'Select',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const rule = settings.rule;
    const { what, sorted } = RULES[rule];
    const acts = st.acts;
    const byId = (id: number) => acts[id - 1]!;
    const status: Status[] = acts.map(() => null);
    const order = sortedBy(acts, rule).map((a) => a.id);
    const state = (): S => ({ acts, order, status: [...status] });
    const chosen: Interval[] = [];
    let last = -Infinity;
    const vars = () => ({
      n: acts.length,
      chosen: chosen.length,
      ...(rule === 'finish' && chosen.length ? { 'last finish': last } : {}),
    });
    yield {
      state: state(),
      marks: [],
      say: `Sort the ${plural(acts.length, 'activity', 'activities')} ${sorted}: ${andList(order.map(name))}. Then take each one that fits with the ones already taken.`,
      lines: ['g.sort'],
      vars: vars(),
      level: 2,
    };
    for (const id of order) {
      const a = byId(id);
      let clash: Interval | undefined;
      if (rule === 'finish') {
        if (chosen.length && a.s < last) clash = chosen[chosen.length - 1];
      } else clash = chosen.find((b) => overlaps(a, b));
      const lastBefore = last;
      if (!clash) {
        chosen.push(a);
        status[id - 1] = 'chosen';
        last = a.f;
      } else status[id - 1] = 'skipped';
      const says =
        rule === 'finish'
          ? clash
            ? `${iv(a)} starts at ${a.s}, before the last chosen activity finishes at ${lastBefore}. Skip it.`
            : chosen.length === 1
              ? `${iv(a)} finishes first of all. Take it.`
              : `${iv(a)} starts at ${a.s}, no earlier than ${lastBefore}, when the last chosen activity finishes. Take it.`
          : clash
            ? `${iv(a)} overlaps ${iv(clash)}, which is already taken. Skip it.`
            : `${iv(a)} overlaps nothing taken so far. Take it.`;
      yield {
        state: state(),
        marks: [
          mark(actId(id), clash ? 'error' : 'found'),
          ...(clash ? [mark(actId(clash.id), 'compare')] : []),
        ],
        say: says,
        lines: clash ? ['g.loop', 'g.fits'] : ['g.loop', 'g.fits', 'g.take'],
        vars: vars(),
        level: 2,
        extra: {
          at: id,
          clash: clash?.id,
          last: rule === 'finish' && lastBefore > -Infinity ? lastBefore : undefined,
        },
      };
    }
    const end = state();
    const best = greedy(acts, 'finish').length;
    const names = andList(chosen.map((a) => name(a.id)));
    yield {
      state: end,
      marks: chosen.map((a) => mark(actId(a.id), 'found')),
      say:
        `${what[0]!.toUpperCase()}${what.slice(1)} first chose ${plural(chosen.length, 'activity', 'activities')}: ${names}.` +
        (rule === 'finish'
          ? ' No set of activities that do not overlap is larger.'
          : chosen.length < best
            ? ` Earliest finish first would choose ${best}. This rule is not safe.`
            : ` That is as many as earliest finish first, this time.`),
      lines: ['g.ret'],
      vars: { ...vars(), best },
      level: 1,
      extra: { best },
    };
    return end;
  },
};

const load: Op = {
  label: 'Load activities',
  arity: 1,
  *run(st, [arg]): Gen {
    const acts = intervalsFromArg(arg, MAX_ACTS, 'activity', 'activities');
    if (typeof acts === 'string') {
      yield {
        state: st,
        marks: [],
        say: `The activities stay as they were. ${acts}`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const next = stateFor(acts);
    yield {
      state: next,
      marks: [],
      say: `${plural(acts.length, 'activity', 'activities')}, each wanting the room from its start to its finish. Press Select.`,
      lines: [],
      vars: { n: acts.length },
      level: 1,
    };
    return next;
  },
};

export const ops = { load, select };

const Ln = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: ActSettings): PseudoBlock[] {
  const rule = settings.rule;
  const lines =
    rule === 'finish'
      ? [
          Ln(
            'g.sig',
            0,
            'activitySelector(s, f)',
            'To choose the most activities that do not overlap:',
          ),
          Ln(
            'g.sort',
            1,
            'sort the activities by finish time f',
            'put them in order of finish time;',
          ),
          Ln('g.init', 1, 'A = {}; last = -∞', 'nothing is chosen yet.'),
          Ln('g.loop', 1, 'for each activity m in that order', 'Look at each activity in turn:'),
          Ln('g.fits', 2, 'if s[m] >= last', 'if it starts after the last chosen one finishes,'),
          Ln('g.take', 3, 'A = A ∪ {m}; last = f[m]', 'take it, and remember when it finishes.'),
          Ln('g.ret', 1, 'return A', 'The chosen activities.'),
        ]
      : [
          Ln('g.sig', 0, 'greedy(s, f)', 'To choose activities greedily:'),
          Ln(
            'g.sort',
            1,
            rule === 'shortest'
              ? 'sort the activities by f - s, shortest first'
              : 'sort the activities by start time s',
            rule === 'shortest'
              ? 'put them in order of length, shortest first;'
              : 'put them in order of start time;',
          ),
          Ln('g.init', 1, 'A = {}', 'nothing is chosen yet.'),
          Ln('g.loop', 1, 'for each activity m in that order', 'Look at each activity in turn:'),
          Ln('g.fits', 2, 'if m overlaps nothing in A', 'if it overlaps nothing chosen,'),
          Ln('g.take', 3, 'A = A ∪ {m}', 'take it.'),
          Ln(
            'g.ret',
            1,
            'return A   // not always the most!',
            'The chosen activities, which may not be the most.',
          ),
        ];
  return [{ op: 'select', lines }];
}

export function initialSay(st: S): string {
  return `${plural(st.acts.length, 'activity', 'activities')} want one room, each from its start time to its finish time. Which ones can you fit, at most, with no two overlapping? Press Select, or type new activities.`;
}

export const initialVars = (st: S) => ({ n: st.acts.length });

export function describe(st: S): string {
  const parts = st.order.map((id) => {
    const a = st.acts[id - 1]!;
    const s = st.status[id - 1];
    return `${name(id)} from ${a.s} to ${a.f}${s ? ` (${s})` : ''}`;
  });
  return `Activities, top to bottom: ${parts.join('; ')}.`;
}
