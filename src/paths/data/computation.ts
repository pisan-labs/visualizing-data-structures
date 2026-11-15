import type { PathDef } from '../paths';

const path: PathDef = {
  id: 'computation',
  title: 'Theory of computation',
  audience: 'Students in automata, formal languages or computability',
  blurb: 'Finite automata to the halting problem in 15 pages.',
  intro:
    'Three machines, each more powerful than the last, and the question of what none of them ' +
    'can do. Each step is one page. Run the machine on the suggested input, read the lessons, ' +
    'and answer the checks; the step is done when every lesson is read and every check is ' +
    'right. The constructions (NFA to DFA, grammar to normal form) are easier to follow when ' +
    'you step through them than when you read them.',
  stages: [
    {
      title: 'Finite automata',
      steps: [
        {
          viz: 'dfa',
          example: 'div-by-3',
          note: 'One state at a time, one move per symbol. This one checks divisibility by 3.',
        },
        {
          viz: 'nfa',
          example: 'third-from-end',
          note: 'Several states at once. Easier to design, and no more powerful.',
        },
        {
          viz: 'nfa-to-dfa',
          example: 'third-from-end',
          note: 'The subset construction, and why the DFA can need many more states.',
        },
        {
          viz: 'dfa-minimization',
          example: 'table-filling',
          note: 'Merge the states that no input can tell apart.',
        },
        {
          viz: 'regex-to-nfa',
          example: 'ends-in-abb',
          note: 'Regular expressions and finite automata describe the same languages. Here is one direction.',
        },
      ],
    },
    {
      title: 'What finite automata cannot do',
      steps: [
        {
          viz: 'pumping-lemma',
          example: 'winning-string',
          note: 'The pumping lemma as a game against an opponent. Choosing the string is most of the proof.',
        },
        {
          viz: 'myhill-nerode',
          example: 'anbn-classes',
          note: 'Count the words a machine must keep apart. Infinitely many means not regular.',
        },
      ],
    },
    {
      title: 'Grammars and pushdown automata',
      steps: [
        {
          viz: 'cfg-derivation',
          example: 'two-trees',
          note: 'Rules that rewrite symbols. Two parse trees for one string means the grammar is ambiguous.',
        },
        {
          viz: 'pda',
          example: 'a-n-b-n',
          note: 'A finite automaton with a stack, enough for aⁿbⁿ.',
        },
        {
          viz: 'cfg-to-cnf',
          example: 'every-stage',
          note: 'Chomsky normal form, one stage at a time. Needed for the next step.',
        },
        {
          viz: 'cyk',
          example: 'anbn',
          note: 'Is this string in the language? A table over substrings answers it in O(n³).',
        },
      ],
    },
    {
      title: 'Turing machines and their limits',
      steps: [
        {
          viz: 'turing-machine',
          example: 'zeros-ones',
          note: 'A tape, a head and a few rules. As far as we know, this is everything a computer can do.',
        },
        {
          viz: 'multitape-tm',
          example: 'palindrome',
          note: 'More tapes are faster but no more powerful.',
        },
        {
          viz: 'halting-problem',
          example: 'whole-argument',
          note: 'No program can decide whether every program halts. The proof is a diagonal.',
        },
        {
          viz: 'chomsky-hierarchy',
          example: 'whole-map',
          note: 'Everything in this path on one map. Where does each language you met belong?',
        },
      ],
    },
  ],
};

export default path;
