import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import {
  byId,
  defaults,
  ptText,
  randomSegs,
  writeSegs,
  type SIExtra,
  type SISettings,
  type SIState,
} from './model';
import { fmt } from './rat';

type Def = VizDef<SIState, SISettings, SIExtra>;

const setupOf = (rng: Rng, lo: number, hi: number): OpCall[] => [
  ['load', writeSegs(randomSegs(rng, rng.int(lo, hi)))],
];

/**
 * Practice for the sweep line. Every answer comes from running the model; `def` is a getter
 * to avoid an import cycle.
 */
export function segmentPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: SISettings) => new Timeline(def(), settings, 1, cs);
  const ALL: Settings = { ...defaults, mode: 'all' };

  return [
    {
      id: 'any',
      title: 'Do any two meet?',
      make(rng) {
        const setup = setupOf(rng, 3, 4);
        const end = run([...setup, ['sweep']], defaults).endState();
        const options = ['Yes', 'No'];
        const hit = end.hits[0];
        return {
          prompt: 'Do any two of these segments intersect (touching counts)?',
          setup,
          answer: { kind: 'choice', options, correct: end.answer ? 0 : 1 },
          explain: hit
            ? `Yes: ${hit.segs.map((id) => byId(end, id).name).join(' and ')} meet at ${ptText(hit)}. The sweep finds them when they first become neighbours in the status.`
            : `No. The sweep tests every pair that is ever adjacent in the status, ${end.tests} tests in all, and none of them meet.`,
          watch: [['sweep']],
        };
      },
    },
    {
      id: 'count',
      title: 'How many intersections?',
      make(rng) {
        const setup = setupOf(rng, 4, 6);
        const end = run([...setup, ['sweep']], ALL as SISettings).endState();
        return {
          prompt:
            'Bentley–Ottmann reports every point where two or more segments meet. How many points does it report?',
          setup,
          settings: ALL,
          answer: { kind: 'number', value: end.hits.length },
          explain: end.hits.length
            ? `${end.hits.map((h) => `${h.segs.map((id) => byId(end, id).name).join(' and ')} at ${ptText(h)}`).join('; ')}.`
            : 'None: no two segments meet.',
          watch: [['sweep']],
        };
      },
    },
    {
      id: 'status',
      title: 'Read the status',
      make(rng) {
        const setup = setupOf(rng, 4, 6);
        const t = run([...setup, ['sweep']], ALL as SISettings);
        const e = t.entries.at(-1)!;
        const updates = e.steps.filter(
          (st) => st.lines.includes('bo.update') && st.state.status.length >= 2,
        );
        const pick =
          updates[rng.int(0, Math.max(0, updates.length - 1))] ??
          e.steps.find((st) => st.lines.includes('bo.update'))!;
        const s = pick.state;
        const names = s.status.map((id) => byId(s, id).name);
        return {
          prompt: `The sweep line handles the event at ${ptText(s.sweep!)}. Just after it, which segments are in the status, from bottom to top? (Type none if it is empty.)`,
          setup,
          settings: ALL,
          answer: { kind: 'sequence', value: names.length ? names : ['none'] },
          explain: `Just right of x = ${fmt(s.sweep!.x)}, the vertical line crosses ${names.length ? names.join(', ') : 'nothing'}, in that order from the bottom. Segments that ended are gone; crossing segments have swapped.`,
          watch: [['sweep']],
        };
      },
    },
  ];
}
