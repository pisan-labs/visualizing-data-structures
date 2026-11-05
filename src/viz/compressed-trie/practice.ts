import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { FAMILIES, inserts, LONERS, plural, sharedWords, shuffle } from '../_trie/words';
import { defaults, wordsOf, type RadixExtra, type RadixSettings, type RadixState } from './model';

type Def = VizDef<RadixState, RadixSettings, RadixExtra>;
type RadixStep = Step<RadixState, RadixExtra>;

const code = (s: string) => `\`${s}\``;
const q = (s: string) => `"${s}"`;
export const splitText = (was: string, top: string, bottom: string) =>
  `${q(was)} → ${q(top)} and ${q(bottom)}`;
export const mergeText = (top: string, bottom: string) =>
  `${q(top)} and ${q(bottom)} → ${q(top + bottom)}`;
export const NO_MERGE = 'No edges merge';

/** Words not in `stored` that are worth trying: the families, the loners, and edits of both. */
function candidates(rng: Rng, stored: string[]): string[] {
  const out = new Set<string>([...FAMILIES.flat(), ...LONERS]);
  for (const w of stored) {
    for (let i = 1; i < w.length; i++) out.add(w.slice(0, i));
    for (const ch of 'aeiost') {
      out.add(w + ch);
      if (w.length > 1) out.add(w.slice(0, -1) + ch);
    }
  }
  return shuffle(
    rng,
    [...out].filter((w) => !stored.includes(w) && w.length <= 10),
  );
}

/**
 * Practice questions for compressed tries. Every answer comes from running the model, so it
 * always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function radixPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  /** The steps of the last operation. */
  const lastOp = (cs: OpCall[]): RadixStep[] => {
    const t = run(cs);
    return t.entries[t.entries.length - 1]!.steps;
  };

  return [
    {
      id: 'split-pieces',
      title: 'Which edge splits, and how?',
      make(rng) {
        for (;;) {
          const stored = sharedWords(rng, rng.int(3, 5));
          const setup = inserts(stored);
          for (const w of candidates(rng, stored)) {
            const steps = lastOp([...setup, ['insert', w]]);
            const split = steps.find((st) => st.extra?.split)?.extra?.split;
            if (!split) continue;
            const { was, top, bottom } = split;
            const right = splitText(was, top, bottom);
            const wrong: string[] = [];
            if (top.length > 1)
              wrong.push(splitText(was, top.slice(0, -1), was.slice(top.length - 1)));
            if (bottom.length > 1)
              wrong.push(splitText(was, was.slice(0, top.length + 1), bottom.slice(1)));
            wrong.push('No edge splits: the word gets a new leaf');
            const options = shuffle(rng, [right, ...wrong]);
            const ends = steps.at(-1)!.lines.includes('ins.mark');
            return {
              prompt: `Insert ${code(w)} into the compressed trie shown. Which edge splits, and into which two pieces?`,
              setup,
              answer: { kind: 'choice', options, correct: options.indexOf(right) },
              explain: `${w} follows the edge ${q(was)} for ${plural(top.length, 'letter')}, ${q(top)}, then ${ends ? 'runs out' : 'goes its own way'}. The edge splits there: a new node takes ${q(top)}, and ${q(bottom)} hangs below it${ends ? `. ${w} ends at the new node` : `, next to a new leaf for the rest of ${w}`}.`,
              watch: [['insert', w]],
            };
          }
        }
      },
    },
    {
      id: 'node-count',
      title: 'How many nodes after these inserts?',
      make(rng) {
        const words = sharedWords(rng, rng.int(5, 7));
        const first = rng.int(2, 3);
        const setup = inserts(words.slice(0, first));
        const ask = inserts(words.slice(first, first + 3));
        const end = lastOp([...setup, ...ask]).at(-1)!;
        const nodes = Number(end.vars?.nodes);
        const asked = ask.map((c) => code(String(c[1])));
        return {
          prompt: `Insert ${asked.join(', ')} into the compressed trie shown, in that order. How many nodes does it have afterwards, counting the root?`,
          setup,
          answer: { kind: 'number', value: nodes },
          explain: `Besides the root, a compressed trie keeps a node only where a word ends or where the paths branch. With ${wordsOf(end.state).join(', ')}, that is ${plural(nodes - 1, 'node')}, plus the root.`,
          watch: ask,
        };
      },
    },
    {
      id: 'prefix-words',
      title: 'Which words start with this prefix?',
      make(rng) {
        const stored = sharedWords(rng, rng.int(5, 7));
        const setup = inserts(stored);
        const w = stored[rng.int(0, stored.length - 1)]!;
        const p = w.slice(0, rng.int(1, Math.min(3, w.length)));
        const last = lastOp([...setup, ['startsWith', p]]).at(-1)!;
        const found = String(last.vars?.returned ?? '')
          .split(' ')
          .filter((x) => x && x !== 'none');
        return {
          prompt: `Type every word that starts with ${code(p)}, in the order ${code(`startsWith(${p})`)} lists them.`,
          setup,
          answer: { kind: 'sequence', value: found },
          explain: `Follow ${p} down from the root, even if it ends partway along an edge. Every word below that point starts with ${p}; reading them in preorder, children from a to z, gives ${found.join(', ')}.`,
          watch: [['startsWith', p]],
        };
      },
    },
    {
      id: 'delete-merge',
      title: 'Which edges merge after a delete?',
      make(rng) {
        let stored = sharedWords(rng, rng.int(4, 6));
        let s = run(inserts(stored)).endState();
        // Edges one above the other, for the wrong answers (almost always the first try).
        const pairsOf = (st: RadixState) =>
          Object.values(st.nodes)
            .filter((n) => n.uid !== st.root && n.kids.length > 0)
            .flatMap((n) => n.kids.map((k) => mergeText(n.label, st.nodes[k]!.label)));
        while (pairsOf(s).length === 0) {
          stored = sharedWords(rng, rng.int(4, 6));
          s = run(inserts(stored)).endState();
        }
        const setup = inserts(stored);
        const w = stored[rng.int(0, stored.length - 1)]!;
        const steps = lastOp([...setup, ['delete', w]]);
        const merge = steps.find((st) => st.extra?.merge)?.extra?.merge;
        const right = merge ? mergeText(merge.top, merge.bottom) : NO_MERGE;
        const wrong = shuffle(
          rng,
          pairsOf(s).filter((x) => x !== right),
        ).slice(0, 2);
        const options = shuffle(rng, [...new Set([right, ...wrong, NO_MERGE])]);
        return {
          prompt: `Delete ${code(w)} from the compressed trie shown. Which two edges merge into one, if any?`,
          setup,
          answer: { kind: 'choice', options, correct: options.indexOf(right) },
          explain: merge
            ? `After ${w} goes, the node at the end of ${q(merge.top)} ends no word and has one child left, so it is not needed: its edge and its child's edge join into ${q(merge.top + merge.bottom)}.`
            : `After ${w} goes, every node left still ends a word or has two or more children, so nothing merges.`,
          watch: [['delete', w]],
        };
      },
    },
  ];
}
