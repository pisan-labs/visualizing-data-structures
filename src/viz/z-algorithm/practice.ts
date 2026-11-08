import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { randomWord } from '../_strings/kit';
import { defaults, type ZExtra, type ZSettings, type ZState } from './model';

type Def = VizDef<ZState, ZSettings, ZExtra>;

/** A word with repeats, so Z has values above 0 and the box gets used. */
function word(rng: Rng, n: number): string {
  const seed = randomWord(rng, rng.int(2, 4), rng.int(0, 1) ? 'AB' : 'ABC');
  let s = '';
  while (s.length < n) s += rng.int(0, 3) ? seed : randomWord(rng, 1, 'ABC');
  return s.slice(0, n);
}

/**
 * Practice questions for the Z-algorithm. Every answer comes from running the model with the
 * default settings. `def` is a getter to avoid an import cycle.
 */
export function zPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops);
  const zOf = (s: string) =>
    run([['load', s], ['build']])
      .endState()
      .z.map((v) => v ?? 0);

  return [
    {
      id: 'z-value',
      title: 'One Z value',
      make(rng) {
        const s = word(rng, rng.int(8, 12));
        const z = zOf(s);
        const some = z.map((v, k) => (k > 0 && v > 0 ? k : -1)).filter((k) => k > 0);
        const k =
          some.length && rng.int(0, 3)
            ? some[rng.int(0, some.length - 1)]!
            : rng.int(1, s.length - 1);
        const v = z[k]!;
        return {
          prompt: `S = \`${s}\`. What is Z[${k}], the length of the longest substring starting at S[${k}] that is also a prefix of S?`,
          setup: [['load', s]],
          answer: { kind: 'number', value: v },
          explain: v
            ? `S[${k}..${k + v - 1}] = \`${s.slice(k, k + v)}\` is a prefix of S${k + v < s.length ? `, and S[${k + v}] = ${s[k + v]} differs from S[${v}] = ${s[v]}` : ' and reaches the end'}, so Z[${k}] = ${v}.`
            : `S[${k}] = ${s[k]} differs from S[0] = ${s[0]}, so Z[${k}] = 0.`,
          watch: [['build']],
        };
      },
    },
    {
      id: 'z-array',
      title: 'The whole Z array',
      make(rng) {
        const s = word(rng, rng.int(6, 9));
        const z = zOf(s);
        return {
          prompt: `S = \`${s}\`. Type Z[1] to Z[${s.length - 1}], in order.`,
          setup: [['load', s]],
          answer: { kind: 'sequence', value: z.slice(1).map(String) },
          explain: `Z[1..${s.length - 1}] = ${z.slice(1).join(' ')}. Each value is how far S matches its own start from that position.`,
          watch: [['build']],
        };
      },
    },
    {
      id: 'box-start',
      title: 'What the box gives',
      make(rng) {
        for (let tries = 0; tries < 500; tries++) {
          const s = word(rng, rng.int(9, 13));
          const full = run([['load', s], ['build']]);
          // Positions inside the box when their turn comes, with the box set.
          const steps = full.entries[1]!.steps;
          const inside = steps
            .filter((st) => st.lines.includes('copy'))
            .map((st) => st.vars!.i as number);
          if (!inside.length) continue;
          const i = inside[rng.int(0, inside.length - 1)]!;
          const setup: OpCall[] = [
            ['load', s],
            ...Array.from({ length: i - 1 }, (): OpCall => ['next']),
          ];
          const before = run(setup).endState();
          const after = run([...setup, ['next']]);
          const first = after.entries.at(-1)!.steps.find((st) => st.lines.includes('copy'))!;
          const start = first.vars!['Z[i]'] as number;
          const { l, r } = before;
          const zm = before.z[i - l] ?? 0;
          return {
            prompt: `S = \`${s}\`, Z is filled up to Z[${i - 1}], and the box is [l, r] = [${l}, ${r}]. Before any comparison, what value does Z[${i}] start at?`,
            setup,
            answer: { kind: 'number', value: start },
            explain: `i = ${i} is inside the box, so Z[${i}] = min(r − i + 1, Z[i − l]) = min(${r - i + 1}, Z[${i - l}] = ${zm}) = ${start}.`,
            watch: [['next']],
          };
        }
        throw new Error('No position inside a box turned up.');
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const s = word(rng, rng.int(6, 9));
        const end = run([['load', s], ['build']]).endState();
        return {
          prompt: `S = \`${s}\`. How many character comparisons does the Z-algorithm make to fill Z? Count every S[Z[i]] == S[i + Z[i]] test, matches and mismatches.`,
          setup: [['load', s]],
          answer: { kind: 'number', value: end.comparisons },
          explain: `Z = ${end.z.slice(1).join(' ')} after the first position. Each position compares until a mismatch or the end of S, starting past whatever the box gave it: ${end.comparisons} in all.`,
          watch: [['build']],
        };
      },
    },
  ];
}
