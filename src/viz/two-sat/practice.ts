import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { plural } from '../_graph/graph';
import {
  braces,
  defaults,
  formulaText,
  litName,
  parseFormula,
  randomFormula,
  type SatExtra,
  type SatRun,
  type SatSettings,
  type SatState,
} from './model';

type Def = VizDef<SatState, SatSettings, SatExtra>;

/**
 * Practice for 2-SAT. Every answer comes from running the model: satisfiability, the
 * components, the arcs and the values are read from the run's last step.
 */
export function satPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, want?: (r: SatRun) => boolean) {
    for (let k = 0; ; k++) {
      const n = rng.int(2, 4);
      const text = randomFormula(rng, n, rng.int(0, 1) ? 1.5 : 2.2);
      const s = parseFormula(text) as SatState;
      const setup: OpCall[] = [['load', text]];
      const watch: OpCall[] = [['run']];
      const t = new Timeline(def(), defaults, 1, [...setup, ...watch]);
      const r: SatRun = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
      if (!want || want(r) || k > 40) return { s, setup, watch, r };
    }
  }

  return [
    {
      id: 'sat',
      title: 'Satisfiable or not?',
      make(rng) {
        const { s, setup, watch, r } = setupRun(rng);
        const options = ['Satisfiable', 'Unsatisfiable'];
        return {
          prompt: `Can every clause of ${formulaText(s)} be true at once?`,
          setup,
          answer: { kind: 'choice', options, correct: r.sat ? 0 : 1 },
          explain: r.sat
            ? `Yes: ${s.vars.map((v, i) => `${v} = ${r.value[i] ? 'TRUE' : 'FALSE'}`).join(', ')} works. No variable shares a component with its negation.`
            : `No. ${litName(s, 2 * r.conflict!)} and ${litName(s, 2 * r.conflict! + 1)} are in the same strongly connected component, so each implies the other.`,
          watch,
        };
      },
    },
    {
      id: 'arcs',
      title: 'How many implications?',
      make(rng) {
        const { s, setup, watch, r } = setupRun(rng);
        return {
          prompt: `Build the implication graph of ${formulaText(s)}: two arcs per clause, each arc only once. How many arcs does it have?`,
          setup,
          answer: { kind: 'number', value: r.arcs.length },
          explain: `${plural(r.arcs.length, 'arc')}: ${r.arcs.map(([x, y]) => `${litName(s, x)} → ${litName(s, y)}`).join(', ')}. A clause with one literal, or one repeated, adds fewer.`,
          watch,
        };
      },
    },
    {
      id: 'components',
      title: 'How many components?',
      make(rng) {
        const { s, setup, watch, r } = setupRun(rng);
        return {
          prompt: `How many strongly connected components does the implication graph of ${formulaText(s)} have? Count every literal, used or not.`,
          setup,
          answer: { kind: 'number', value: r.comps.length },
          explain: `${plural(r.comps.length, 'component')}: ${r.comps.map((c) => braces(c.map((k) => litName(s, k)))).join(', ')}.`,
          watch,
        };
      },
    },
    {
      id: 'value',
      title: 'Which value does the algorithm pick?',
      make(rng) {
        const { s, setup, watch, r } = setupRun(rng, (r) => r.sat === true);
        if (!r.sat) {
          const options = ['Satisfiable', 'Unsatisfiable'];
          return {
            prompt: `Is ${formulaText(s)} satisfiable?`,
            setup,
            answer: { kind: 'choice', options, correct: 1 },
            explain: `No: ${litName(s, 2 * r.conflict!)} and its negation share a component.`,
            watch,
          };
        }
        const v = rng.int(0, s.vars.length - 1);
        const options = ['TRUE', 'FALSE'];
        return {
          prompt: `Solve ${formulaText(s)} with Kosaraju's algorithm (vertices a, ¬a, b, ¬b, ... in that order). Which value does it give ${s.vars[v]}?`,
          setup,
          answer: { kind: 'choice', options, correct: r.value[v] ? 0 : 1 },
          explain: `${s.vars[v]} = ${r.value[v] ? 'TRUE' : 'FALSE'}: the component of ${r.value[v] ? s.vars[v] : `¬${s.vars[v]}`} comes later in topological order. Other satisfying assignments may exist; this is the one the rule picks.`,
          watch,
        };
      },
    },
  ];
}
