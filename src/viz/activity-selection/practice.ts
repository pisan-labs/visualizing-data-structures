import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { intervalsText, type Interval } from '../_intervals/kit';
import { defaults, name, type ActExtra, type ActSettings, type ActState, type Rule } from './model';

type Def = VizDef<ActState, ActSettings, ActExtra>;
type ActStep = Step<ActState, ActExtra>;

export function randomActs(rng: Rng, n: number, T = 16): Interval[] {
  return Array.from({ length: n }, (_, k) => {
    const len = rng.int(1, 6);
    const s = rng.int(0, T - len);
    return { id: k + 1, s, f: s + len };
  });
}

const listActs = (acts: Interval[]) =>
  acts.map((a) => `${name(a.id)} = [${a.s}, ${a.f})`).join(', ');
const RULE_NAME: Record<Rule, string> = {
  finish: 'earliest finish first',
  shortest: 'shortest first',
  start: 'earliest start first',
};

/**
 * Practice questions for activity selection. Answers come from running the model with seed 1,
 * the way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function actPractice(def: () => Def): PracticeKind[] {
  const last = (ops: OpCall[], rule: Rule): ActStep =>
    new Timeline(def(), { ...defaults, rule }, 1, ops).entries.at(-1)!.steps.at(-1)!;
  const chosenOf = (st: ActStep) =>
    st.state.order.filter((id) => st.state.status[id - 1] === 'chosen');

  return [
    {
      id: 'count',
      title: 'How many fit?',
      make(rng) {
        const acts = randomActs(rng, rng.int(5, 8));
        const setup: OpCall[] = [['load', intervalsText(acts)]];
        const end = last([...setup, ['select']], 'finish');
        const chosen = chosenOf(end);
        return {
          prompt: `Activities ${listActs(acts)}. Times are half-open: one may start when another finishes. At most how many can share one room?`,
          setup,
          settings: { rule: 'finish' },
          answer: { kind: 'number', value: chosen.length },
          explain: `Earliest finish first takes ${chosen.map(name).join(', ')}, and no larger set fits.`,
          watch: [['select']],
        };
      },
    },
    {
      id: 'chosen',
      title: 'Which ones, in order?',
      make(rng) {
        const acts = randomActs(rng, rng.int(5, 7));
        const setup: OpCall[] = [['load', intervalsText(acts)]];
        const end = last([...setup, ['select']], 'finish');
        const chosen = chosenOf(end).map(name);
        return {
          prompt: `Activities ${listActs(acts)}. Run earliest finish first (ties keep the order above). Type the activities it takes, in the order it takes them, such as a3 a1.`,
          setup,
          settings: { rule: 'finish' },
          answer: { kind: 'sequence', value: chosen },
          explain: `In order of finish time, each activity that starts no earlier than the last one taken finishes: ${chosen.join(', ')}.`,
          watch: [['select']],
        };
      },
    },
    {
      id: 'other-rule',
      title: 'Another rule',
      make(rng) {
        const rule: Rule = rng.int(0, 1) ? 'shortest' : 'start';
        const acts = randomActs(rng, rng.int(5, 7));
        const setup: OpCall[] = [['load', intervalsText(acts)]];
        const end = last([...setup, ['select']], rule);
        const chosen = chosenOf(end);
        const best = Number(end.vars?.best);
        return {
          prompt: `Activities ${listActs(acts)}. How many does ${RULE_NAME[rule]} take? It sorts by ${rule === 'shortest' ? 'length' : 'start time'} (ties keep the order above) and takes each activity that overlaps none taken.`,
          setup,
          settings: { rule },
          answer: { kind: 'number', value: chosen.length },
          explain: `It takes ${chosen.map(name).join(', ')}: ${chosen.length}. The most that fit is ${best}${chosen.length < best ? ', so this rule falls short here' : ''}.`,
          watch: [['select']],
        };
      },
    },
    {
      id: 'safe',
      title: 'Is the rule right here?',
      make(rng) {
        const rule: Rule = rng.int(0, 1) ? 'shortest' : 'start';
        const acts = randomActs(rng, rng.int(4, 6), 12);
        const setup: OpCall[] = [['load', intervalsText(acts)]];
        const end = last([...setup, ['select']], rule);
        const got = chosenOf(end).length;
        const best = Number(end.vars?.best);
        const yes = 'Yes, as many as possible';
        const no = 'No, fewer than possible';
        return {
          prompt: `Activities ${listActs(acts)}. Does ${RULE_NAME[rule]} fit as many activities as possible here?`,
          setup,
          settings: { rule },
          answer: { kind: 'choice', options: [yes, no], correct: got === best ? 0 : 1 },
          explain: `It fits ${got}; the most possible is ${best}. ${got === best ? 'Right this time, but the rule is not safe in general.' : 'The rule is not safe.'}`,
          watch: [['select']],
        };
      },
    },
  ];
}
