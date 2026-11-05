import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { and, buildCall, choice, randomValues } from '../_range/kit';
import { midOf, nodesOf, tagText, type SegExtra, type SegSettings, type SegState } from './model';

type Def = VizDef<SegState, SegSettings, SegExtra>;
type SegStep = Step<SegState, SegExtra>;

const SUM: SegSettings = { combine: 'sum' };
const MIN: SegSettings = { combine: 'min' };

const CASES = ['No overlap', 'Full overlap', 'Partial overlap'];

/** A range l..r of at least two values. */
function someRange(rng: Rng, n: number): [number, number] {
  const l = rng.int(0, n - 2);
  return [l, rng.int(l + 1, n - 1)];
}

/**
 * Practice questions for segment trees. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function segmentPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: SegSettings) => new Timeline(def(), settings, 1, cs);
  const lastOp = (cs: OpCall[], settings: SegSettings): SegStep[] => {
    const t = run(cs, settings);
    return t.entries[t.entries.length - 1]!.steps;
  };
  /** The node a step is about, and which case of the query it shows. */
  const visits = (steps: SegStep[]) =>
    steps
      .filter((st) => ['q.none', 'q.full', 'q.part'].some((l) => st.lines.includes(l)))
      .map((st) => ({
        node: String(st.vars?.node),
        kind: st.lines.includes('q.none') ? 0 : st.lines.includes('q.full') ? 1 : 2,
        step: st,
      }));
  const tree = (rng: Rng, lo: number, hi: number) => {
    const n = rng.int(lo, hi);
    return { n, setup: [buildCall(randomValues(rng, n, 1, 20))] };
  };

  return [
    {
      id: 'query-answer',
      title: 'What does the query return?',
      make(rng) {
        const settings = rng.int(0, 2) === 0 ? MIN : SUM;
        const min = settings.combine === 'min';
        const { n, setup } = tree(rng, 6, 12);
        const [l, r] = someRange(rng, n);
        const steps = lastOp([...setup, ['query', l, r]], settings);
        const ans = Number(steps.at(-1)!.vars?.[min ? 'min' : 'sum']);
        const whole = visits(steps).filter((v) => v.kind === 1);
        return {
          prompt: `Each node of the tree holds the ${min ? 'minimum' : 'sum'} of its range. What does \`query(${l}, ${r})\` return?`,
          setup,
          settings,
          answer: { kind: 'number', value: ans },
          explain: `The query takes ${whole.length === 1 ? 'one node' : `${whole.length} nodes`} whole: ${and(whole.map((v) => `${v.node} = ${v.step.state.val[nodeNumber(v.step)]!}`))}. ${min ? 'The smallest' : 'Their sum'} is ${ans}.`,
          watch: [['query', l, r]],
        };
      },
    },
    {
      id: 'full-nodes',
      title: 'How many nodes are taken whole?',
      make(rng) {
        const { n, setup } = tree(rng, 8, 16);
        const [l, r] = someRange(rng, n);
        const whole = visits(lastOp([...setup, ['query', l, r]], SUM)).filter((v) => v.kind === 1);
        return {
          prompt: `\`query(${l}, ${r})\` adds up the nodes it can take whole: full overlap, a node whose range lies inside [${l}, ${r}]. How many such nodes does it use?`,
          setup,
          settings: SUM,
          answer: { kind: 'number', value: whole.length },
          explain: `${and(whole.map((v) => v.node))}. Together they cover [${l}, ${r}] exactly, and each one is the biggest node that fits where it is.`,
          watch: [['query', l, r]],
        };
      },
    },
    {
      id: 'which-case',
      title: 'Which case is it at this node?',
      make(rng) {
        const { n, setup } = tree(rng, 8, 16);
        // Never the whole array, which the root would answer on its own.
        const l = rng.int(0, n - 3);
        const r = rng.int(l + 1, n - 2);
        const seen = visits(lastOp([...setup, ['query', l, r]], SUM)).filter(
          (v) => v.node !== `[0, ${n - 1}]`,
        );
        const pick = seen[rng.int(0, seen.length - 1)]!;
        const right = CASES[pick.kind]!;
        const why = [
          `${pick.node} and [${l}, ${r}] share no index, so the node adds nothing.`,
          `${pick.node} lies inside [${l}, ${r}], so the query takes its value whole.`,
          `Part of ${pick.node} is inside [${l}, ${r}] and part is not, so the query asks both children.`,
        ][pick.kind]!;
        return {
          prompt: `\`query(${l}, ${r})\` reaches node ${pick.node}. Which case is it there?`,
          setup,
          settings: SUM,
          answer: choice(rng, right, CASES, 3),
          explain: why,
          watch: [['query', l, r]],
        };
      },
    },
    {
      id: 'lazy-push',
      title: 'A tag pushed down',
      make(rng) {
        const n = 8;
        const values = randomValues(rng, n, 1, 20);
        const x = rng.int(1, 9);
        // An add that leaves a tag on at least one inner node.
        let add: OpCall = ['add', 0, 1, x];
        for (let tries = 0; tries < 50; tries++) {
          const [l, r] = someRange(rng, n);
          const end = run([buildCall(values), ['add', l, r, x]], SUM).endState();
          if (end.lazy.some((t) => t !== 0)) {
            add = ['add', l, r, x];
            break;
          }
        }
        const setup = [buildCall(values), add];
        const before = run(setup, SUM).endState();
        const tagged = nodesOf(n).filter((nd) => before.lazy[nd.v] !== 0);
        const u = tagged[rng.int(0, tagged.length - 1)]!;
        const m = midOf(u.lo, u.hi);
        const watch: OpCall[] = [['query', u.lo, u.lo]];
        const after = run([...setup, ...watch], SUM).endState();
        const child = after.val[2 * u.v]!;
        const old = before.val[2 * u.v]!;
        const len = m - u.lo + 1;
        return {
          prompt: `After \`${add[0]}(${add.slice(1).join(', ')})\`, node [${u.lo}, ${u.hi}] holds the tag ${tagText(before.lazy[u.v]!)}. Then \`query(${u.lo}, ${u.lo})\` passes through it and pushes the tag down. What is the value of its left child, node [${u.lo}, ${m}], right after the push?`,
          setup,
          settings: SUM,
          answer: { kind: 'number', value: child },
          explain: `The left child covers ${len === 1 ? 'one value' : `${len} values`} and still shows ${old}, from before the add. The push adds ${x} to each of them: ${old} + ${x} × ${len} = ${child}.`,
          watch,
        };
      },
    },
  ];
}

/** The node number a query step is about: the active node mark. */
function nodeNumber(st: SegStep): number {
  const m = st.marks.filter((k) => k.role === 'active' && k.id.startsWith('node-')).at(-1);
  return Number(m?.id.slice(5));
}
