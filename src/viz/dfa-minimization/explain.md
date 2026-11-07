# DFA minimization

Two DFAs can accept exactly the same words and still have different numbers of states. Minimization finds the smallest one. It looks for states that do the same job, states no word can tell apart, and merges them. The answer is unique: every regular language has exactly one minimal DFA, up to the names of its states.

## The idea

Two states p and q are _equivalent_ when every word takes both to accept or both to reject. If some word w takes one to accept and the other to reject, w _distinguishes_ them. Equivalent states can be merged without changing what the DFA accepts, and the minimal DFA has one state for each group of equivalent states.

With n states and k symbols:

| Step | What it does | Cost |
|---|---|---|
| Complete | a dead state takes every missing move | O(n·k) |
| Drop unreachable | a search from the start state | O(n·k) |
| Refine (Moore) | split blocks of states until they agree | O(n²·k) |
| Fill the table | mark the pairs some word separates | O(n³·k) |

Refining and filling the table are two ways to find the same groups. The page does one or the other (**Method**). [Show me](#play:two-equivalent)

## Partition refinement

Moore's method starts with two blocks: the states that accept and those that do not. The empty word already tells those apart. Then, round after round, each state gets a _signature_: the block each symbol leads to. Inside a block, states with different signatures can be told apart (a symbol takes them to blocks already known to differ), so the block splits. When a round splits nothing, each block is one state of the minimal DFA.

In [two states that do the same job](#example:two-equivalent), q3 is a copy of q0. Round 1 splits q1 off: on b it reaches the accept state, and q0 and q3 do not. Round 2 changes nothing, so q0 and q3 merge. Each block has a color and a number (#1, #2, ...), and the table shows each state's block and signature in the same colors. A block that splits keeps its number for the part with its first state, so you can watch one color break in two. [Show me](#play:two-equivalent)

How many rounds? Each round can only separate states whose shortest distinguishing word is one symbol longer than before. In [at least four symbols](#example:slow-split), one state splits off per round, and the fourth round finds nothing left to split. That is the worst case, about n rounds of O(n·k) work each. Hopcroft's algorithm picks which block to split with more carefully and runs in O(n·k·log n). It is also much harder to follow on paper. [Show me](#play:slow-split)

```check
Q: In round 2, q0 has signature (1, 2) and q3 has (1, 1). Both are in block 1. What happens?
- They stay together: they are already in the same block
* Block 1 splits: q0 and q3 end up in different blocks
- They merge into one state
= On the second symbol, q0 goes to block 2 and q3 stays in block 1. Those blocks already differ, so some word tells q0 and q3 apart.
```

## Table filling

The other textbook method (Hopcroft and Ullman, after Myhill and Nerode) works on pairs. Draw a triangle with a cell for every pair of states. Mark each pair of one accept state and one non-accept state: ε tells them apart. Then make passes. A pair p, q gets marked with symbol c when c takes it to a pair that is already marked. Stop when a pass marks nothing. The pairs left blank are equivalent.

Switch **Method** to table filling, or open [the same DFA by table filling](#example:table-filling). The pair q0, q3 is never marked, so they merge, as before. The two methods always agree: they compute the same relation. Table filling is easier on paper. Refinement is faster. [Show me](#play:table-filling)

## First: complete, then trim

Minimizing needs a complete DFA, so the first step sends every missing move to a dead state. The second drops the states the start can never reach. They do not change the language, and refinement would happily keep them. In [starts with a](#example:unreachable), q0 has no move on b, so a dead state appears; q2 and q3 cannot be reached, so they go. [Show me](#play:unreachable)

Both steps earn their keep on [the subset construction's 8 states](#example:subsets-shrink). That DFA comes from building all 8 subsets for an NFA of "contains ab". 4 of them are unreachable, and 2 of the rest are equivalent. 8 states become 3. [Show me](#play:subsets-shrink)

## When to use it

Minimize after any construction that builds more states than it needs: the [subset construction](/nfa-to-dfa/), the product of two DFAs, a regular expression turned into an NFA and then a DFA. Fewer states means smaller tables in a lexer or a hardware controller.

It is also the cleanest way to check whether two DFAs accept the same language: minimize both and compare. Same language, same minimal DFA, up to the names.

Do not expect miracles. A DFA that is already minimal stays the same size, as [even a's and even b's](#example:already-minimal) shows: all four states stay. And this method needs a DFA. Minimizing an NFA is a different, much harder problem.

## Common mistakes

- Skipping the dead state. With a move missing, a signature has a hole in it and the blocks can come out wrong.
- Stopping too early. Two states with the same signature in one round can still split in the next; stop only when a whole round changes nothing.
- Starting with every state in one block. Accept and non-accept differ from the start.
- Forgetting the unreachable states. The result accepts the right words but is not minimal.
- Getting different answers from the two methods. They always agree, so one of them went wrong.

```check
Q: A DFA has states q0 to q3 and only q3 accepts. How many blocks does partition refinement start with?
- One: all four states
* Two: { q0, q1, q2 } and { q3 }
- Four: every state on its own
= The first split is accept against non-accept, because the empty word already separates them. Later rounds split the non-accept block further if the moves disagree.
```

## Try this

- [Two states that do the same job](#example:two-equivalent): before round 1, say which state splits off and why.
- [At least four symbols](#example:slow-split): how many rounds would a chain of 8 states need? Fill with **One split per round** at size 8 and check.
- [Even a's and even b's](#example:already-minimal): why can no two of these states merge? Find a word that separates each pair.
- Load `start q0; accept q1 q2; q0 a -> q1; q0 b -> q2; q1 a,b -> q1; q2 a,b -> q2` and draw the minimal DFA on paper before you press Minimize.
