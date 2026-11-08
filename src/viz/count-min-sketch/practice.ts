import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import {
  columns,
  defaults,
  hashList,
  type CmsExtra,
  type CmsSettings,
  type CmsState,
} from './model';

type Def = VizDef<CmsState, CmsSettings, CmsExtra>;
type T = Timeline<CmsState, CmsSettings, CmsExtra>;

const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;
const adds = (xs: number[]): OpCall[] => xs.map((x) => ['add', x]);

/** A short skewed stream over a few items. */
function stream(rng: Rng, n: number): number[] {
  const items = Array.from({ length: 5 }, () => rng.int(1, 60));
  return Array.from({ length: n }, () => items[Math.min(rng.int(0, 5), rng.int(0, 4))]!);
}

/**
 * Practice for the count-min sketch. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function cmsPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], s: CmsSettings): T => new Timeline(def(), s, 1, cs);
  const last = (t: T) => t.entries[t.entries.length - 1]!.steps.at(-1)!;

  return [
    {
      id: 'which-counters',
      title: 'Which counters?',
      make(rng) {
        const s: CmsSettings = { ...defaults, d: pick(rng, [2, 3]), w: pick(rng, [4, 8]) };
        const setup = adds(stream(rng, rng.int(2, 4)));
        const x = rng.int(1, 60);
        const t = run([...setup, ['add', x]], s);
        const js = t.entries
          .at(-1)!
          .steps.filter((st) => st.lines.includes('add.inc'))
          .map((st) => String(st.vars!.j));
        return {
          prompt: `The sketch has ${s.d} rows of ${s.w} counters; row i uses hᵢ(x) = ((aᵢ·x + bᵢ) mod 1009) mod ${s.w} with (aᵢ, bᵢ) = ${hashList(s.d)}. Which column does \`add(${x})\` increment in each row? List them from row 1 down.`,
          setup,
          settings: s as Settings,
          answer: { kind: 'sequence', value: js },
          explain: `${js.map((j, i) => `h${i + 1}(${x}) = ${j}`).join(', ')}. Add raises one counter in every row.`,
          watch: [['add', x]],
        };
      },
    },
    {
      id: 'estimate',
      title: 'What is the estimate?',
      make(rng) {
        const s: CmsSettings = { ...defaults };
        const xs = stream(rng, rng.int(8, 12));
        const setup = adds(xs);
        let x = rng.int(61, 99);
        while (xs.includes(x)) x++;
        const t = run([...setup, ['estimate', x]], s);
        const est = Number(last(t).vars!.estimate);
        const end = t.endState();
        const cols = columns(x, end);
        return {
          prompt: `${x} was never added. Its counters are in columns ${cols.join(', ')} of rows 1 to ${s.d}. What does \`estimate(${x})\` return?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'number', value: est },
          explain: `The counters read ${cols.map((j, i) => end.rows[i]![j]).join(', ')}; the estimate is the smallest, ${est}. ${x} was never added, so ${est ? `the estimate is ${est} too high: other items share all its counters` : 'here the estimate is exact'}.`,
          watch: [['estimate', x]],
        };
      },
    },
    {
      id: 'bound',
      title: 'The error bound',
      make(rng) {
        const s: CmsSettings = { ...defaults, w: pick(rng, [4, 8, 16]), d: pick(rng, [2, 3]) };
        const setup = adds(stream(rng, rng.int(8, 16)));
        const t = run(setup, s);
        const got = String(last(t).vars!['εN']);
        const n = t.endState().n;
        const fmt = (v: number) => String(Math.round(v * 100) / 100);
        const options = [
          ...new Set([got, fmt(n / s.w), fmt((Math.E * n) / (s.w * s.d)), fmt(Math.exp(-s.d) * n)]),
        ];
        const shuffled = options.sort((p, q) => Number(p) - Number(q));
        return {
          prompt: `The sketch has d = ${s.d} rows of w = ${s.w} counters and has seen N = ${n} items. With probability at least 1 − e^−d, every estimate is at most the true count plus εN, where ε = e/w. What is εN?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'choice', options: shuffled, correct: shuffled.indexOf(got) },
          explain: `ε = e/${s.w} ≈ ${fmt(Math.E / s.w)}, so εN ≈ ${fmt(Math.E / s.w)}·${n} ≈ ${got}. More counters per row shrink it; more rows only make the bound hold more often.`,
          watch: [['heavy']],
        };
      },
    },
    {
      id: 'heavy',
      title: 'Heavy hitters',
      make(rng) {
        const s: CmsSettings = { ...defaults, phi: pick(rng, ['0.2', '0.25'] as const) };
        const setup = adds(stream(rng, rng.int(10, 14)));
        const end = run([...setup, ['heavy']], s).endState();
        const hits = end.heavy!.map(String);
        return {
          prompt: `\`heavy()\` reports every item whose estimate is at least ${s.phi}·N, largest estimate first (ties smallest item first). List the items it reports.`,
          setup,
          settings: s as Settings,
          answer: { kind: 'sequence', value: hits.length ? hits : ['none'] },
          explain: `N = ${end.n}, so the bar is ${Number(s.phi) * end.n}. ${hits.length ? `${hits.join(', ')} reach it.` : 'No item reaches it, so the answer is none.'} An estimate is never too low, so no real heavy hitter is missed.`,
          watch: [['heavy']],
        };
      },
    },
  ];
}
