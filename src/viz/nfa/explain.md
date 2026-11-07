# Nondeterministic finite automaton

An NFA is a DFA that is allowed to guess. From a state, one symbol can lead to two places, or to none, and an ε-move lets the machine jump to another state without reading anything. The NFA accepts a word if some sequence of guesses ends in an accept state. One lucky branch is enough.

That sounds like magic. The trick is that we never have to guess: we follow every branch at once by keeping the set of states the machine could be in.

## The idea

An NFA has the same five parts as a DFA (Q, Σ, δ, q0 and F), but δ(q, c) is a set of states, possibly empty, and c can be ε.

| Operation | What it does | Cost |
|---|---|---|
| Run on a word w of n symbols | Keep the set S of possible states; for each symbol, S = E(move(S, c)) | O(n·\|Q\|²) |
| ε-closure, E(S) | Add every state that ε-moves reach from S | O(\|Q\|²) at most |
| Accept? | Does the final set hold an accept state? | O(\|Q\|) |

The machine on this page starts out accepting the binary words that end in 01. q0 reads anything and stays put. Every time it reads a 0, it also guesses "this is where the final 01 starts" and moves to q1 as well. A wrong guess dies at the next symbol. [Show me](#play:ends-in-01)

The DFA page has a machine for the same language, also with three states. The DFA has to work out what to remember. The NFA just guesses and lets the wrong guesses die.

## How a run works

1. Start with E({q0}): q0 and every state its ε-moves reach.
2. Read a symbol c. From every state in the set, follow every move on c. That is move(S, c).
3. Follow ε-moves from there as far as they go. That is E(S).
4. If the set is empty, every branch has died: reject.
5. When the input runs out, accept if the set holds an accept state.

In the drawing every state in the set is blue, and so are the arrows just followed. States that ε-moves add are green, and a state whose branch dies gets a dashed outline for that step. The panel under the tape lists the set after each symbol, so you can read the whole run at a glance.

In [Branches split and die](#example:branches-die), the machine looks for 11 or 101 inside 010110. Every 1 starts a new guess at q2. Most guesses die within two symbols; one reaches q4 and stays there to the end. [Show me](#play:branches-die)

```check
Q: After the last symbol, an NFA's set is {q1, q3}. q3 is an accept state and q1 is not. Does the NFA accept?
* Yes
- No, because q1 does not accept
- Only if every branch ends in q3
- It depends on the order the branches ran in
= An NFA accepts when any branch accepts. One accept state in the final set is enough.
```

## ε-moves and the closure

An ε-move reads nothing. It lets you glue machines together. [a|b with ε-moves](#example:a-or-b) enters an a part and a b part at once and joins them again at q5. That is how Thompson's construction turns a regular expression into an NFA, one piece at a time.

E(S) is S plus every state you can reach from it with ε-moves alone. By default the page shows the closure as its own step after each symbol, so you can see what the ε-moves add. Set **ε-closure** to fold it in and each symbol becomes one step: [the same run, folded](#example:folded).

ε-moves can go round in circles. In [the ε-loop](#example:eps-loop), q0 and q1 have ε-moves to each other. Following arrows would go on forever, but the closure only adds states it has not seen yet, so it stops as soon as both are in. [Show me](#play:eps-loop)

The empty word is where ε-moves matter most. [The empty word](#example:empty-word) starts in q0, which does not accept, but its ε-moves reach two states that do, so ε is accepted.

## Sets, not branches

Why keep sets? Because branches multiply. In [Sixteen branches, two states](#example:many-branches), every a sends each branch to both q0 and q1, so four a's make 16 branches. Forty a's would make about a trillion. They all sit in q0 or q1, so the set holds two states the whole time. Following branches one at a time takes exponential time; keeping the set costs O(|Q|²) per symbol. [Show me](#play:many-branches)

The sets are also how the DFA comes back. Every NFA has a DFA that accepts the same words: its states are the sets the NFA can be in (the subset construction). So guessing adds no power to a finite automaton. It saves states. Sometimes it saves a lot of them: an NFA with |Q| states can need 2^|Q| sets. [The third symbol from the end is 1](#example:third-from-end) takes 4 states here and 8 as a DFA.

```check
Q: An NFA has 10 states. At most how many of them can be in its set at once?
- 1
* 10
- 2¹⁰ = 1,024
- 10 times the length of the word
= The set is a subset of the 10 states. 2¹⁰ counts the different sets it could be, which is why a DFA built from this NFA can need up to 1,024 states.
```

## When to use it

Use an NFA to describe a language. It is often much smaller than the DFA and much easier to get right: guess where the interesting part starts, check it, done. Regular expressions turn into NFAs naturally. Some regex engines then run the NFA directly with sets, the way this page does; others build a DFA first.

Avoid running an NFA when every bit of speed counts. A DFA does one lookup per symbol, while the set simulation can do |Q|² work per symbol. Convert it to a DFA first, as long as the DFA does not blow up.

## Common mistakes

- Forgetting the ε-closure of the start state. The run starts with E({q0}), which may hold more than q0.
- Following ε-moves before a symbol but not after it. The closure comes after every symbol.
- Thinking a dying branch rejects the word. It only drops that guess. The word is rejected when every branch has died, or when the final set has no accept state.
- Requiring every branch to accept. One is enough.
- Tracing each branch separately on paper. Merge branches that reach the same state; that is the whole point of the set.

## Try this

- [Ends in 01](#example:ends-in-01): before each symbol, predict the next set. Then check it against the panel.
- [The third symbol from the end is 1](#example:third-from-end): run 1000 and 0111. Which guesses die, and when?
- Load `q0 a,b -> q0; q0 a -> q1; q1 b -> q2; accept q2` and test `+ab +aab -ba -eps +bab`. Then build the same language on the DFA page and compare the two machines.
- Switch **ε-closure** between its two settings on [a|b](#example:a-or-b) and count the steps.
- Add `q2 eps -> q0` to the ends-in-01 machine. Does the language change? Why not?
