import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { randomWord } from '../_strings/kit';
import { choice, shuffle } from '../_strings/practice';
import { defaults, ranks, rotation, type BwtExtra, type BwtSettings, type BwtState } from './model';

type Def = VizDef<BwtState, BwtSettings, BwtExtra>;

/** A short word over a few letters, with repeats so L has runs. */
function word(rng: Rng, n: number): string {
  const base = randomWord(rng, rng.int(2, 3), 'abn');
  let w = '';
  while (w.length < n) w += rng.int(0, 2) ? base : randomWord(rng, 1, 'abn');
  return w.slice(0, n);
}

/**
 * Practice questions for the Burrows-Wheeler transform. Every answer comes from running the
 * model with the default settings. `def` is a getter to avoid an import cycle.
 */
export function bwtPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops);
  const transformed = (w: string) => run([['load', w], ['transform']]).endState();

  return [
    {
      id: 'transform',
      title: 'The transform of a word',
      make(rng) {
        const w = word(rng, rng.int(4, 6));
        const st = transformed(w);
        const l = st.l;
        const wrong = [
          [...l].reverse().join(''),
          [...st.s].sort().join(''),
          st.order.map((k) => st.s[(k + 1) % st.s.length]).join(''),
          shuffle(rng, [...l]).join(''),
        ];
        return {
          prompt: `What is the Burrows-Wheeler transform of \`${w}\`, with $ added at the end and sorting before every letter?`,
          setup: [['load', w]],
          answer: choice(rng, l, wrong),
          explain: `The sorted rotations of \`${st.s}\` end with ${[...l].map((c) => `\`${c}\``).join(', ')}, so L = \`${l}\`.`,
          watch: [['transform']],
        };
      },
    },
    {
      id: 'lf-step',
      title: 'One LF step',
      make(rng) {
        const w = word(rng, rng.int(5, 7));
        const st = run([['load', w], ['transform'], ['invert']]).endState();
        const inv = st.inv!;
        const r = rng.int(0, inv.l.length - 1);
        const c = inv.l[r]!;
        const k = ranks(inv.l)[r]!;
        const to = inv.lf[r]!;
        return {
          prompt: `L = \`${inv.l}\`, so F = \`${inv.f}\`. L[${r}] = ${c} is copy ${k} of ${c} in L. Which row of F holds the same copy? (Rows count from 0.)`,
          setup: [['load', w], ['transform']],
          answer: { kind: 'number', value: to },
          explain: `The ${c}'s in F start at row ${inv.f.indexOf(c)}, so copy ${k} is row ${inv.f.indexOf(c)} + ${k - 1} = ${to}.`,
          watch: [['invert']],
        };
      },
    },
    {
      id: 'invert',
      title: 'Which word was it?',
      make(rng) {
        const w = word(rng, rng.int(4, 6));
        const l = transformed(w).l;
        const back = run([['load', w], ['transform'], ['invert']]).endState().inv!.out;
        const wrong = [
          [...back].reverse().join(''),
          rotation(back, 1),
          [...back].sort().join(''),
          shuffle(rng, [...back]).join(''),
        ];
        return {
          prompt: `The Burrows-Wheeler transform of a word, with $ at the end, is L = \`${l}\`. What was the word?`,
          setup: [['load', w], ['transform']],
          answer: choice(rng, back, wrong),
          explain: `Start at row 0, the one starting with $, and follow LF: the walk spells \`${back}\` from its last letter to its first.`,
          watch: [['invert']],
        };
      },
    },
    {
      id: 'suffix-array',
      title: 'Rotations and the suffix array',
      make(rng) {
        const w = word(rng, rng.int(4, 6));
        const st = transformed(w);
        const r = rng.int(0, st.order.length - 1);
        const k = st.order[r]!;
        return {
          prompt: `Sort the rotations of \`${st.s}\`. Row ${r} (counting from 0) starts at which position of \`${st.s}\`? That is SA[${r}], the suffix array entry.`,
          setup: [['load', w]],
          answer: { kind: 'number', value: k },
          explain: `Row ${r} is \`${rotation(st.s, k)}\`, the rotation that starts at position ${k}. With one $, rotations sort like suffixes, so SA = ${st.order.join(' ')}.`,
          watch: [['transform']],
        };
      },
    },
  ];
}
