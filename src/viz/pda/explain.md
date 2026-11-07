# Pushdown automaton

A finite automaton can't count. It has a fixed number of states, so it can't remember how many a's it has read, and aⁿbⁿ (some a's followed by as many b's) is out of reach. Give it a stack and the problem goes away: push an a for every a, pop one for every b, and check that the stack is back where it started. That machine is a pushdown automaton, a PDA.

The stack is the only memory it gets. It can't look inside, only at the top. That turns out to be about the right amount of power for the syntax of programming languages: nested parentheses, matching begin and end, expressions inside expressions.

## The idea

A PDA has states, an input alphabet, a stack alphabet, a start state and accept states. A move depends on three things: the state, the next input symbol and the symbol on top of the stack. Any of them can be left out (written ε). The move `q1 a, X → q2 β` means: in q1, read a, pop X, push the string β, and go to q2. The first symbol of β ends up on top.

| Operation | What it does | Cost |
|---|---|---|
| **Load** | Read the moves into the diagram | O(moves) |
| **Run** w, deterministic | One configuration, one move at a time | Θ(n) moves |
| **Run** w, nondeterministic | A breadth-first search over configurations | up to 200 configurations |
| **Test** | Run a batch such as `+aabb -aab` and compare | one run per word |

Everything about the machine at one moment fits in a configuration: (state, input left, stack), with the top of the stack first. The machine on this page starts in (q0, aabb, ε): state q0, all of aabb to read, and an empty stack. Sipser's machines start with an empty stack and push a marker, $, as their first move, so they can tell when the stack is back to the bottom.

[aⁿbⁿ](#example:a-n-b-n) is that machine. It pushes $, pushes an a for every a, pops an a for every b, and when $ is back on top it pops it on the way to the accept state q3. aabb takes 6 moves. On aab, one a is still on the stack when the input runs out, and q2 does not accept. [Show me](#play:a-n-b-n)

## How a run works

The input tape shows what has been read (grey) and where the head is, with the current state over it. The stack is drawn as a column, top up; whatever was just pushed is green. The panel lists configurations as state, input left, stack, one per line, with the number of moves in front.

You type a machine in one line, moves separated by `;`:

- `q0 eps, eps -> q1 $` reads nothing, pops nothing and pushes $. `eps` (or ε) can stand in for any of the three.
- `q1 b, a -> q2 eps` reads b and pops a.
- `q2 (, ( -> q2 ((` reads (, pops ( and pushes two of them, so the stack grows by one.
- `start q0`, `accept q0 q3` and `stack Z` (what the stack holds at the start) are optional.

The diagram labels each arrow the same way, `a, X → β`, one line per move.

[Balanced parentheses](#example:balanced-parentheses) is the classic. q1 means "nothing is open" and accepts. Every ( pushes, every ) pops, and when $ shows up on top an ε-move goes back to q1. On `())` the last ) finds $ on top, there is no move for that, and the machine rejects. Every move pops exactly what it expects, so there is never a choice: the machine is deterministic. [Show me](#play:balanced-parentheses)

```check
Q: The machine is in (q1, ab, a$) and makes the move q1 a, ε → q1 a. What is the next configuration?
- (q1, ab, aa$)
* (q1, b, aa$)
- (q1, b, $)
- (q1, b, a$)
= It reads the a (so b is left), pops nothing and pushes a on top of a$.
```

## Guessing: nondeterminism

Even-length palindromes, w followed by w backwards, are harder. Push the first half, then pop and match the second half. Easy, except the machine has no idea where the middle is. So it guesses: in q1 it can keep reading and pushing, or take an ε-move to q2 and start matching. One correct guess is enough to accept.

A computer can't guess, so this page searches. It keeps a queue of configurations and tries every move that fits each one, oldest first. That is breadth-first search over configurations. A configuration with no move that fits is a branch that dies. The first configuration that has read the whole word in an accept state ends the search, and its moves, followed back to the start, are the accepting computation.

[Even palindromes](#example:even-palindromes) runs abba. Watch the wrong guesses die: guess the middle after the first a, and q2 has to read b with a on top. No move fits. The search explores 15 configurations and then plays back the 7 moves that worked. [Show me](#play:even-palindromes)

Set **Show the search** to the accepting computation only and the run skips the search, says how big it was, and shows just the computation: [the accepting computation only](#example:one-computation).

When the queue runs empty, every branch has died and the machine rejects. [A word that is rejected](#example:every-branch-dies): abab is not a palindrome, and every guess of the middle fails.

Unlike finite automata, guessing adds real power here. Deterministic PDAs can do aⁿbⁿ and balanced parentheses, but no deterministic PDA accepts the even palindromes. You need the guess.

## Final state or empty stack

Textbooks disagree on how a PDA accepts. Sipser accepts by **final state**: some computation reads the whole word and ends in an accept state. Hopcroft and Ullman also allow **empty stack**: some computation reads the whole word and empties the stack. Their machines start with a symbol already on the stack (Z₀), otherwise every machine would accept ε before its first move. The **Accept by** option switches between the two; accept states are ignored by empty stack.

The two are equally powerful: you can convert either kind into the other. They are not the same machine, though. Sipser's aⁿbⁿ machine pops $ at the end, so it happens to accept the same words by empty stack. The parentheses machine keeps $ forever, so by empty stack it accepts only ε.

## From a grammar

Every context-free grammar has a PDA, and the construction is mechanical. Push the start variable S (and $ under it). Then, in one state, repeat:

- a variable on top: replace it with one of its right-hand sides (an ε-move);
- a terminal on top: it has to match the next input symbol, so read it and pop it.

When $ is back on top, everything has been matched, and an ε-move pops it on the way to the accept state. [From a grammar: S → aSb | ε](#example:grammar-to-pda) builds the PDA for aⁿbⁿ this way. The stack holds what is still to be matched, and the accepting computation follows a leftmost derivation. [Show me](#play:grammar-to-pda)

Hopcroft and Ullman's version needs one state: start with S on the stack and accept by empty stack. [Accept by empty stack](#example:empty-stack) is that machine.

Now the catch. Build the same thing from S → Sa | b and S → Sa leaves S on top. The machine can replace S with Sa, and again, and again, without reading anything. The stack grows forever and the search never runs out of new configurations. On baa breadth first still finds the accepting computation, in 8 moves. On ab there is none to find, and the search stops after 200 configurations without an answer. [Left recursion](#example:left-recursion) [Show me](#play:left-recursion)

That cap is not the PDA's fault. Whether a word is in a context-free language can always be decided: turn the grammar into Chomsky normal form and run CYK, in Θ(n³). A naive search over configurations is not that algorithm.

```check
Q: The search stops at the cap of 200 configurations without finding an accepting computation. What do you know about the word?
- It is not in the language
- It is in the language
* Nothing yet: an accepting computation might need more configurations
- The machine is deterministic
= Stopping is not rejecting. A reject needs every branch to die, and ε-moves that push can keep making new configurations forever.
```

## When to use it

Use a PDA when the language has nesting: brackets, tags, blocks, expressions. Parsers are PDAs in disguise. The LR parsers that compilers use are, under the hood, deterministic PDAs built from a grammar, which is why grammars for programming languages are written to avoid needing a guess.

Avoid it when a finite automaton will do. A stack you don't need is just more to get wrong. And a PDA cannot handle two counts at once: aⁿbⁿcⁿ needs a Turing machine.

## Common mistakes

- Forgetting the bottom marker. A PDA can't ask whether its stack is empty; it can only pop a symbol it expects. Push $ first, and popping $ means the stack is empty now.
- Pushing a string in the wrong order. In `a, X → AB` the A ends up on top. To leave X where it was and add A, push `AX`.
- Accepting before the input is used up. A configuration accepts only after it has read the whole word.
- Treating a dead branch as a rejection. One branch dying drops one guess. The word is rejected when every branch has died.
- Mixing the two kinds of acceptance. A machine built for final state usually does something odd by empty stack, and the other way round.

## Try this

- [aⁿbⁿ](#example:a-n-b-n): before each move, predict the stack. Then run aaabbb and abab.
- [Even palindromes](#example:even-palindromes): run aa and count the configurations. Then run abaaba and compare.
- [Test a batch](#example:equal-test): this machine accepts words with as many a's as b's, in any order. Add words of your own with + or - in front. Can you find one it gets wrong?
- Load `q0 a, eps -> q0 a; q0 b, a -> q1 eps; q1 b, a -> q1 eps; accept q1` and test `+ab +aabb -aab -abb`. Which word does it get wrong, and how would a $ fix it?
- Switch **Accept by** on [the parentheses](#example:balanced-parentheses) and run `()`. Why is ε the only word it accepts now?
