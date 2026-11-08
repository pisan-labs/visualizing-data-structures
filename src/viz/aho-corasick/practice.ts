import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { choice, shuffle } from '../_strings/practice';
import {
  defaults,
  PATTERN_SETS,
  ROOT,
  spell,
  type AcExtra,
  type AcSettings,
  type AcState,
  type PatternSet,
} from './model';

type Def = VizDef<AcState, AcSettings, AcExtra>;

const SETS = Object.keys(PATTERN_SETS) as PatternSet[];

/** A text made of pieces of the patterns, so there are matches and failures. */
function text(rng: Rng, patterns: readonly string[], n: number): string {
  const letters = [...new Set(patterns.join(''))].join('');
  let t = '';
  while (t.length < n) {
    const p = patterns[rng.int(0, patterns.length - 1)]!;
    t += rng.int(0, 2)
      ? p.slice(rng.int(0, p.length - 1))
      : letters[rng.int(0, letters.length - 1)]!;
  }
  return t.slice(0, n);
}

/**
 * Practice questions for Aho-Corasick. Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function acPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], s: AcSettings) => new Timeline(def(), s, 1, ops);
  const pick = (rng: Rng): AcSettings => ({
    ...defaults,
    patterns: SETS[rng.int(0, SETS.length - 1)]!,
  });
  const names = (st: AcState) =>
    st.nodes.map((n) => (n.id === ROOT ? 'the root' : spell(st.nodes, n.id)));

  return [
    {
      id: 'fail-target',
      title: 'Where does a failure link go?',
      make(rng) {
        const s = pick(rng);
        const st = run([['build']], s).endState();
        const deep = st.nodes.filter((n) => n.depth >= 2);
        const v = deep[rng.int(0, deep.length - 1)]!;
        const all = names(st);
        const right = all[v.fail!]!;
        const word = spell(st.nodes, v.id);
        const suffixes = [...word].map((_, k) => word.slice(k + 1)).filter((x) => x);
        return {
          prompt: `Patterns ${PATTERN_SETS[s.patterns]}. Where does the failure link of the node for \`${word}\` point?`,
          settings: s,
          setup: [],
          answer: choice(rng, right, [
            ...suffixes,
            'the root',
            word.slice(0, -1) || 'the root',
            ...all.slice(1, 4),
          ]),
          explain:
            v.fail === ROOT
              ? `No proper suffix of \`${word}\` is a node of the trie, so the link goes to the root.`
              : `\`${right}\` is the longest proper suffix of \`${word}\` that is also in the trie.`,
          watch: [['build']],
        };
      },
    },
    {
      id: 'match-count',
      title: 'How many matches?',
      make(rng) {
        const s = pick(rng);
        const patterns = s.patterns.split(' ');
        const t = text(rng, patterns, rng.int(6, 9));
        const end = run([['search', t]], s).endState();
        return {
          prompt: `Patterns ${PATTERN_SETS[s.patterns]}. How many matches does Aho-Corasick report in \`${t}\`? Count overlapping matches and patterns inside other patterns.`,
          settings: s,
          setup: [['build']],
          answer: { kind: 'number', value: end.matches.length },
          explain: end.matches.length
            ? `${end.matches.map((m) => `\`${m.word}\` at ${m.at}`).join(', ')}: ${end.matches.length} in all.`
            : 'No pattern occurs in the text.',
          watch: [['search', t]],
        };
      },
    },
    {
      id: 'state-after',
      title: 'Where does the scan stand?',
      make(rng) {
        const s = pick(rng);
        const patterns = s.patterns.split(' ');
        const t = text(rng, patterns, rng.int(4, 7));
        const end = run([['search', t]], s).endState();
        const all = names(end);
        const right = all[end.cur]!;
        return {
          prompt: `Patterns ${PATTERN_SETS[s.patterns]}. After scanning \`${t}\`, which node is the automaton at? (Name a node by the string it spells.)`,
          settings: s,
          setup: [['build']],
          answer: choice(rng, right, [
            ...shuffle(
              rng,
              all.filter((x) => x !== right),
            ).slice(0, 3),
            'the root',
          ]),
          explain: `The node is the longest suffix of \`${t}\` that is a node of the trie: ${right === 'the root' ? 'none, so the root' : `\`${right}\``}.`,
          watch: [['search', t]],
        };
      },
    },
    {
      id: 'hops',
      title: 'How many failure-link hops?',
      make(rng) {
        const s = pick(rng);
        const patterns = s.patterns.split(' ');
        const t = text(rng, patterns, rng.int(5, 8));
        const end = run([['search', t]], s).endState();
        return {
          prompt: `Patterns ${PATTERN_SETS[s.patterns]}, links built. Scanning \`${t}\`, how many times does the automaton follow a failure link? (Output links do not count.)`,
          settings: s,
          setup: [['build']],
          answer: { kind: 'number', value: end.hops },
          explain: `${end.hops} hop${end.hops === 1 ? '' : 's'}: each one happens when the current node has no edge for the next character. There are never more hops than characters read.`,
          watch: [['search', t]],
        };
      },
    },
  ];
}
