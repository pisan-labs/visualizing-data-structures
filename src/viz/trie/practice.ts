import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { FAMILIES, inserts, LONERS, plural, sharedWords, shuffle } from '../_trie/words';
import { defaults, wordsOf, type TrieExtra, type TrieSettings, type TrieState } from './model';

type Def = VizDef<TrieState, TrieSettings, TrieExtra>;
type TrieStep = Step<TrieState, TrieExtra>;

const code = (s: string) => `\`${s}\``;

/** Every strict prefix of a stored word that is not itself a word, shortest first. */
function prefixOnly(words: string[]): string[] {
  const out = new Set<string>();
  for (const w of words)
    for (let i = 1; i < w.length; i++) if (!words.includes(w.slice(0, i))) out.add(w.slice(0, i));
  return [...out].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/** The length of the longest prefix of w that starts some stored word. */
function shared(words: string[], w: string): number {
  let best = 0;
  for (const v of words) {
    let k = 0;
    while (k < Math.min(v.length, w.length) && v[k] === w[k]) k++;
    best = Math.max(best, k);
  }
  return best;
}

/**
 * Practice questions for tries. Every answer comes from running the model, so it always agrees
 * with the drawing. `def` is a getter to avoid an import cycle.
 */
export function triePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  /** The steps of the last operation. */
  const lastOp = (cs: OpCall[]): TrieStep[] => {
    const t = run(cs);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const nodes = (cs: OpCall[]) => Number(lastOp(cs).at(-1)!.vars?.nodes);
  const words = (cs: OpCall[]) => wordsOf(run(cs).endState());
  /** A trie of 4 to 6 words that share prefixes. */
  const someWords = (rng: Rng) => sharedWords(rng, rng.int(4, 6));

  return [
    {
      id: 'insert-adds',
      title: 'How many nodes does an insert add?',
      make(rng) {
        const stored = someWords(rng);
        const setup = inserts(stored);
        // Usually a word that shares a prefix with the trie; now and then one that shares none.
        const near = FAMILIES.flat().filter((w) => !stored.includes(w) && shared(stored, w) > 0);
        const far = LONERS.filter((w) => shared(stored, w) === 0);
        const pool = rng.int(0, 3) && near.length ? near : far;
        const w = pool[rng.int(0, pool.length - 1)]!;
        const before = nodes(setup);
        const added = nodes([...setup, ['insert', w]]) - before;
        const k = w.length - added;
        return {
          prompt: `Insert ${code(w)} into the trie shown. How many new nodes does it add?`,
          setup,
          answer: { kind: 'number', value: added },
          explain:
            k === 0
              ? `No letter of ${w} has an edge from the root, so each of its ${w.length} letters gets a new node.`
              : `The first ${plural(k, 'letter')} (${w.slice(0, k)}) already ${k === 1 ? 'has an edge' : 'have a path'}, so only the other ${plural(added, 'letter')} ${added === 1 ? 'needs a new node' : 'need new nodes'}.`,
          watch: [['insert', w]],
        };
      },
    },
    {
      id: 'prefix-words',
      title: 'Which words start with this prefix?',
      make(rng) {
        const stored = sharedWords(rng, rng.int(5, 7));
        const setup = inserts(stored);
        // A prefix of one of the words, one to three letters long.
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
          explain: `Follow ${p} down from the root, then visit everything below in preorder, children from a to z. Each node with a second ring is a word: ${found.join(', ')}.`,
          watch: [['startsWith', p]],
        };
      },
    },
    {
      id: 'delete-removes',
      title: 'How many nodes does a delete remove?',
      make(rng) {
        const stored = someWords(rng);
        const setup = inserts(stored);
        const w = stored[rng.int(0, stored.length - 1)]!;
        const after = nodes([...setup, ['delete', w]]);
        const removed = nodes(setup) - after;
        const rest = words([...setup, ['delete', w]]);
        const needed = rest.filter((v) => v.startsWith(w));
        return {
          prompt: `Delete ${code(w)} from the trie shown. Nodes that no longer lead to a word are removed. How many nodes go?`,
          setup,
          answer: { kind: 'number', value: removed },
          explain:
            removed === 0
              ? `${w}'s last node still leads to ${needed.join(', ')}, so only its end mark goes.`
              : `After the end mark goes, walk back up from the last letter of ${w}, removing each node with no children that ends no word. That is ${plural(removed, 'node')}; the walk stops at a node that another word still needs, or at the root.`,
          watch: [['delete', w]],
        };
      },
    },
    {
      id: 'search-result',
      title: 'What does search return?',
      make(rng) {
        const stored = someWords(rng);
        const setup = inserts(stored);
        const prefixes = prefixOnly(stored);
        const kind = rng.int(0, 2);
        let w: string;
        if (kind === 0 || (kind === 2 && prefixes.length === 0)) {
          w = stored[rng.int(0, stored.length - 1)]!;
        } else if (kind === 1) {
          // A word that leaves the trie somewhere along the way.
          const misses = shuffle(rng, [...FAMILIES.flat(), ...LONERS]).filter(
            (v) => !stored.includes(v) && !prefixes.includes(v),
          );
          w = misses.find((v) => !stored.some((s) => s.startsWith(v))) ?? 'zebra';
        } else {
          w = prefixes[rng.int(0, prefixes.length - 1)]!;
        }
        const last = lastOp([...setup, ['search', w]]).at(-1)!;
        const options = [
          'true: the word is in the trie',
          'false: some letter has no edge',
          'false: the path is there, but no word ends at its last node',
        ];
        const correct = last.vars?.found === true ? 0 : last.lines.includes('srch.miss') ? 1 : 2;
        const k = shared(stored, w);
        const explain = [
          `Every letter of ${w} has an edge, and its last node has the second ring: ${w} is a word.`,
          `Only the first ${plural(k, 'letter')} of ${w} ${k === 1 ? 'has an edge' : 'have edges'}; the next letter has none, so the search stops there.`,
          `Every letter of ${w} has an edge, but its last node has no second ring: ${w} is only the start of longer words.`,
        ][correct]!;
        return {
          prompt: `What does ${code(`search(${w})`)} return for the trie shown?`,
          setup,
          answer: { kind: 'choice', options, correct },
          explain,
          watch: [['search', w]],
        };
      },
    },
  ];
}
