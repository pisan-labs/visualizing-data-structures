# Deterministic finite automaton

A DFA is the simplest machine that reads. It has a handful of states, it looks at one symbol at a time, and for each symbol it follows exactly one arrow. When the input runs out, it is either in an accept state or it is not. That is the whole machine. No variables, no going back, no second chances.

It sounds too simple to be useful. It turns out the lexer that splits your program into tokens, the part of a network protocol that tracks whose turn it is, and the machine that sells you coffee are all finite automata.

## The idea

Sipser writes a DFA as five things: a set of states Q, an alphabet Σ, a transition function δ, a start state q0 and a set of accept states F. δ(q, c) is the state you go to from q when you read c.

| Operation | What it does | Cost |
|---|---|---|
| Run on a word w of n symbols | Start in q0, follow one move per symbol, accept if you end in F | Θ(n) |
| One move, δ(q, c) | Look up the row for q and the column for c | O(1) |
| Store the machine | One entry per state and symbol | O(\|Q\|·\|Σ\|) |

The machine on this page starts out accepting the binary words that end in 01. Its three states each remember one thing: q0 means "no 0 lately", q1 means "the last symbol was a 0", and q2 means "the word so far ends in 01". That is just enough to answer the question. [Show me](#play:ends-in-01)

## How a run works

1. Start in q0, with the head on the first symbol.
2. Read the symbol c, follow the arrow for c out of the current state, and move the head one cell right.
3. Repeat until the input runs out.
4. Accept if you are in an accept state (a double circle). Otherwise reject.

In the drawing the current state is blue, and so is the arrow just followed. The tape under the diagram greys out what has been read, and the current state rides on top of the head, so you can follow the run on the tape alone.

Every word has exactly one path through the machine. Nothing to guess and nothing to search, which is what deterministic means. It is also why a run costs Θ(n): n symbols, n moves. [Sixteen symbols take sixteen moves](#example:long-word), whatever the machine looks like.

The empty word ε reads nothing, so the machine accepts it exactly when q0 is an accept state. [The empty word](#example:empty-word) runs ε on two machines, one each way.

```check
Q: A DFA has 5 states and reads a word of 1,000 symbols, with no missing moves. How many moves does the run make?
- 5
* 1,000
- 5,000
- It depends on how many states accept
= One move per symbol, whatever the machine. The number of states limits what the machine can remember, but not how long the run takes.
```

## The state is the memory

A DFA has no variables, no stack and no counter. Everything it knows about the word so far has to fit in which state it is in. So designing a DFA is mostly asking "what do I need to remember?" and giving each possible answer a state.

[Divisible by 3 in binary](#example:div-by-3) remembers the remainder so far. Reading bit b takes remainder r to 2r + b, mod 3, so three states handle numbers of any size. [Even a's and even b's](#example:even-even) remembers two parities, and the state names say which: ee, oe, eo and oo. An a flips the first letter and a b the second. [Show me](#play:even-even)

The flip side: a language that needs memory without a bound has no DFA. Words of n a's followed by n b's would need a different state for every n, and a DFA only has finitely many. Proving that carefully is the job of the pumping lemma.

## Missing moves and the dead state

Sipser's definition says δ is a function: every state has a move on every symbol. Drawings rarely show them all. If a word can never be accepted once it starts with b, why draw the arrows that prove it?

This page follows the usual shortcut. A move that is not drawn is missing, and a missing move rejects on the spot. [Starts with ab](#example:missing-move) has no move from q0 on b, so ba is rejected after one symbol. [Show me](#play:missing-move)

Set **Missing moves** to draw the dead state and the shortcut becomes visible. Every missing move goes to a state called dead, which loops on every symbol and does not accept. [The same machine with its dead state](#example:dead-state) walks aab into dead and keeps reading to the end. Same answers, more arrows. The code tabs leave the dead state out: `run` returns nothing when a move is missing.

```check
Q: A DFA over a and b has no move from q1 on b. A run is in q1 and reads b. What happens?
- The run stays in q1 and reads the next symbol
- The run skips the b
* The word is rejected
- The machine is broken and cannot run
= A missing move is a move to a dead state that never accepts and never leaves, so the word is rejected however it goes on.
```

## Testing a machine

Writing a DFA is programming, and programs have bugs. **Test** runs a batch of words, each marked + (should accept) or - (should reject), and lines up what the machine did against what you said. In [A test batch finds a bug](#example:find-the-bug), a machine meant for "ends in ab" forgets what it was doing after aa, and aab gives it away. Fix one arrow, run the same batch again, and all six words pass. [Show me](#play:find-the-bug)

Pick test words the way you would for any code: the empty word, a single symbol, words that almost match, and words that match in a sneaky way.

## When to use it

Use a DFA when the input arrives one symbol at a time and you want a yes or a no with a fixed amount of memory: tokens in a compiler, the states of a protocol, checking input as it is typed, the moods of a game character. A run never backs up, so it can handle a stream as it arrives.

Avoid it when the language needs to count without a bound, such as balanced parentheses. That needs a stack, which is a pushdown automaton. Also watch the size. Some languages are easy to describe with an NFA but need far more DFA states. "The third symbol from the end is 1" needs 8 states as a DFA; "the tenth symbol from the end is 1" needs 1,024.

## Common mistakes

- Forgetting the empty word. If q0 is an accept state, ε is accepted.
- Two arrows with the same symbol out of one state. That is an NFA. **Load** refuses it here and says which state.
- Treating an accept state as "stop". A DFA reads the whole word; passing through an accept state on the way means nothing.
- Treating a missing move as "stay put". It rejects.
- Mixing up states and symbols. Symbols are single letters or digits; states have names such as q0.

## Try this

- [Ends in 01](#example:ends-in-01). Before each step, say which state comes next.
- [Divisible by 3](#example:div-by-3): run 110 (six) and 111 (seven). Then work out why 2r + b is the right move.
- Load `start q0; accept q0; q0 a -> q1; q1 a -> q0` and test `+eps +aa -a -aaa +aaaa`. What language is it?
- [Starts with ab](#example:missing-move), then the same machine with **Missing moves** set to draw the dead state. Count the arrows in each.
- Have a go at a DFA for the binary words with no two 1s in a row. Test it with a batch before you trust it.
