import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { choice, ordered } from '../_recursion/kit';
import { classify, defaults, recText, type MtSettings, type MtState, type Rec } from './model';

type Def = VizDef<MtState, MtSettings, undefined>;

const recArg = (r: Rec) => `${r.a} ${r.b} ${r.d}${r.k ? ` ${r.k}` : ''}`;

/** A recurrence of a chosen kind, so every case comes up. */
function randomRec(rng: Rng, logs = true): Rec {
  const b = rng.int(2, 4);
  const d = rng.int(0, 2);
  const kind = rng.int(0, 2);
  const tie = b ** d;
  const a =
    kind === 0 ? tie : kind === 1 ? Math.min(16, tie * b) : Math.max(1, Math.floor(tie / b));
  const fixed = kind === 2 && b ** d <= a ? { a, b, d: d + 1 } : { a, b, d };
  return { ...fixed, k: logs && rng.int(0, 3) === 0 ? 1 : 0 };
}

/**
 * Practice questions for the Master theorem. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function masterPractice(def: () => Def): PracticeKind[] {
  const end = (cs: OpCall[], settings: MtSettings = defaults) =>
    new Timeline(def(), settings, 1, cs).endState();

  return [
    {
      id: 'which-case',
      title: 'Which case?',
      make(rng) {
        const r = randomRec(rng);
        const kind = end([['solve', recArg(r)]]).result!.kind;
        const options = ['Case 1', 'Case 2', 'Case 3', 'No case applies'];
        const right = { leaves: 0, equal: 1, root: 2, gap: 3 }[kind];
        return {
          prompt: `Which case of the Master theorem (CLRS form) applies to ${recText(r)}?`,
          setup: [],
          answer: ordered(options, options[right]!),
          explain: `Compare b^d = ${r.b ** r.d} with a = ${r.a}. ${
            kind === 'leaves'
              ? 'a is bigger, so the work grows per level: case 1.'
              : kind === 'root'
                ? 'b^d is bigger, so the work shrinks per level: case 3.'
                : 'They are equal, so every level ties: case 2.'
          }`,
          watch: [['solve', recArg(r)]],
        };
      },
    },
    {
      id: 'solution',
      title: 'What is T(n)?',
      make(rng) {
        const r = randomRec(rng, false);
        const right = end([['solve', recArg(r)]]).result!.answer;
        const variants: Rec[] = [
          { ...r, a: r.b ** r.d },
          { ...r, a: Math.min(16, r.b ** r.d * r.b) },
          { ...r, d: r.d + 1 },
          { ...r, k: 1 },
        ];
        const wrong = variants.map((v) => classify(v).answer);
        return {
          prompt: `Solve ${recText(r)}.`,
          setup: [],
          answer: choice(rng, right, wrong),
          explain: `a = ${r.a} and b^d = ${r.b ** r.d}, so T(n) = ${right}.`,
          watch: [['solve', recArg(r)]],
        };
      },
    },
    {
      id: 'dominates',
      title: 'Where is the work?',
      make(rng) {
        const r = randomRec(rng, false);
        const settings: MtSettings = { ...defaults, form: 'simple' };
        const kind = end([['solve', recArg(r)]], settings).result!.kind;
        const options = ['At the root', 'Spread evenly over the levels', 'At the leaves'];
        const right = kind === 'root' ? 0 : kind === 'equal' ? 1 : 2;
        return {
          prompt: `In the recursion tree of ${recText(r)}, where is most of the work done?`,
          setup: [],
          settings,
          answer: ordered(options, options[right]!),
          explain: `From one level to the next the work is multiplied by a / b^d = ${r.a}/${r.b ** r.d}. ${
            right === 0
              ? 'That is less than 1, so the levels shrink and the root does the most.'
              : right === 1
                ? 'That is 1, so every level does the same.'
                : 'That is more than 1, so the levels grow and the leaves do the most.'
          }`,
          watch: [['solve', recArg(r)]],
        };
      },
    },
    {
      id: 'unroll',
      title: 'Unroll it by hand',
      make(rng) {
        const b = rng.int(2, 3);
        const r: Rec = { a: rng.int(1, 4), b, d: rng.int(0, 2), k: 0 };
        const m = rng.int(2, 3);
        const setup: OpCall[] = [['solve', recArg(r)]];
        const rows = end([...setup, ['check']]).check!;
        const row = rows.find((x) => x.m === m)!;
        const steps = rows
          .filter((x) => x.m <= m)
          .map((x) => `T(${b ** x.m}) = ${x.t}`)
          .join(', ');
        return {
          prompt: `With T(1) = 1, what is T(${b ** m}) for ${recText(r)}?`,
          setup,
          answer: { kind: 'number', value: Number(row.t) },
          explain: `Build it up from T(1) = 1: ${steps}.`,
          watch: [['check']],
        };
      },
    },
  ];
}
