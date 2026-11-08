import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { intervalsText, type Interval } from '../_intervals/kit';
import { defaults, name, type PartExtra, type PartSettings, type PartState } from './model';

type Def = VizDef<PartState, PartSettings, PartExtra>;
type PartStep = Step<PartState, PartExtra>;

export function randomLectures(rng: Rng, n: number): Interval[] {
  return Array.from({ length: n }, (_, k) => {
    const len = rng.int(1, 4);
    const s = rng.int(8, 18 - len);
    return { id: k + 1, s, f: s + len };
  });
}

const list = (ls: Interval[]) => ls.map((l) => `${name(l.id)} = ${l.s}-${l.f}`).join(', ');

/**
 * Practice questions for interval partitioning. Answers come from running the model with seed 1,
 * the way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function partPractice(def: () => Def): PracticeKind[] {
  const steps = (ops: OpCall[], touch: PartSettings['touch'] = 'share'): PartStep[] =>
    new Timeline(def(), { ...defaults, touch }, 1, ops).entries.at(-1)!.steps;

  return [
    {
      id: 'rooms',
      title: 'How many rooms?',
      make(rng) {
        const ls = randomLectures(rng, rng.int(5, 8));
        const setup: OpCall[] = [['load', intervalsText(ls)]];
        const end = steps([...setup, ['schedule']]).at(-1)!;
        return {
          prompt: `Lectures ${list(ls)}. A lecture may start in a room the moment another ends there. How many rooms do they need?`,
          setup,
          answer: { kind: 'number', value: Number(end.vars?.rooms) },
          explain: `At time ${end.extra!.depth!.at}, ${end.extra!.depth!.depth} lectures are on at once, so at least that many rooms; greedy by start time uses exactly ${String(end.vars?.rooms)}.`,
          watch: [['schedule']],
        };
      },
    },
    {
      id: 'which-room',
      title: 'Which room?',
      make(rng) {
        const ls = randomLectures(rng, rng.int(5, 7));
        const id = rng.int(1, ls.length);
        const setup: OpCall[] = [['load', intervalsText(ls)]];
        const end = steps([...setup, ['schedule']]).at(-1)!;
        const r = end.state.room[id - 1]!;
        return {
          prompt: `Lectures ${list(ls)}. Go in order of start time (ties keep the order above); give each lecture the room free soonest if it is free by then (ties go to the lower room), or else open room R1, R2, ... in turn. Which room does ${name(id)} get? Type its number.`,
          setup,
          answer: { kind: 'number', value: r },
          explain: `${name(id)} goes in R${r}.`,
          watch: [['schedule']],
        };
      },
    },
    {
      id: 'heap-top',
      title: 'Which room is free soonest?',
      make(rng) {
        const ls = randomLectures(rng, rng.int(5, 7));
        const k = rng.int(2, ls.length - 1);
        const setup: OpCall[] = [['load', intervalsText(ls)]];
        const placed = steps([...setup, ['schedule']]).filter((s) => s.level === 2 && s.extra?.at);
        const st = placed[k - 1]!.state;
        const top = st.heap[0]!;
        return {
          prompt: `Lectures ${list(ls)}. After placing the first ${k} lectures in order of start time, when is the room at the top of the heap free?`,
          setup,
          answer: { kind: 'number', value: top.end },
          explain: `The heap holds ${st.heap.map((e) => `R${e.room} free at ${e.end}`).join(', ')}. The top is the earliest: R${top.room} at ${top.end}.`,
          watch: [['schedule']],
        };
      },
    },
    {
      id: 'closed',
      title: 'When touching clashes',
      make(rng) {
        const ls = randomLectures(rng, rng.int(5, 7));
        const setup: OpCall[] = [['load', intervalsText(ls)]];
        const end = steps([...setup, ['schedule']], 'conflict').at(-1)!;
        const share = steps([...setup, ['schedule']]).at(-1)!;
        return {
          prompt: `Lectures ${list(ls)}. This time a lecture still holds its room at its finish time, so the next one cannot start there at that moment. How many rooms do they need?`,
          setup,
          settings: { touch: 'conflict' },
          answer: { kind: 'number', value: Number(end.vars?.rooms) },
          explain: `${String(end.vars?.rooms)} rooms, the most lectures that share a moment, ends included. With half-open times it would be ${String(share.vars?.rooms)}.`,
          watch: [['schedule']],
        };
      },
    },
  ];
}
