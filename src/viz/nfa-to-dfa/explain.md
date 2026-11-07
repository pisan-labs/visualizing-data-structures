# NFA to DFA

An NFA gets to guess. Reading `0110`, it can be in three states at once, and it accepts if any one of its guesses works out. A DFA cannot guess: one state at a time, one move per symbol, no ε-moves. Yet for every NFA there is a DFA that accepts exactly the same words. The subset construction builds it, and the trick is simple: each DFA state is a _set_ of NFA states, every state the NFA could be in right now.

## The idea

With n states in the NFA:

| Operation | What it does | Cost |
|---|---|---|
| `E(S)`, the ε-closure | S, plus every state its ε-moves reach | O(n²) |
| one DFA move | follow c from every state of a set, then take E | O(n²) |
| `SUBSETS(N)` | the whole DFA, one set at a time | up to 2ⁿ sets |

The DFA starts in E({q0}): q0 plus everything ε-moves reach from it. From a set T on a symbol c, follow every c-move out of every state of T, then add what ε-moves reach. That set is where the DFA goes. Keep going until no new sets turn up. [Show me](#play:ends-in-ab)

A set accepts if it holds at least one accept state of the NFA: some guess worked out. The empty set ∅ is a perfectly good DFA state too. Every guess died. It loops on every symbol and never accepts, so it is the dead state.

## How it works

The page builds the DFA breadth first, as in Sipser's proof of Theorem 1.39, but only for the sets it actually reaches:

1. Start with A = E({q0}) and put it in a queue.
2. Take T from the front of the queue.
3. For each symbol c, in order: M is every state one c-move from a state of T, and U = E(M). If U is a new set, it becomes the next DFA state (B, C, ...) and joins the queue. Either way, the DFA moves from T to U on c.
4. Repeat until the queue is empty.

The table on the stage is the whole algorithm: one row per DFA state, its NFA states, and where it goes on each symbol. → marks the start state and \* an accept state. The DFA grows beside the NFA, each state already in the spot it ends up in. Set **Detail** to the finest level to see M and E(M) as separate steps.

```check
Q: An NFA has ε-moves q0 → q1 and q1 → q2, and no others. What is E({q0})?
- { q0 }
- { q0, q1 }
* { q0, q1, q2 }
- { q1, q2 }
= The closure keeps following ε-moves from the states it has added, so q1 brings in q2. And it always keeps q0 itself.
```

## ε-moves

ε-moves are where most conversions by hand go wrong. In [a's, then b's, then c's](#example:eps-chain), two ε-moves chain three loops. The start set already holds all three states, so the DFA accepts the empty word. Every set the construction finds is closed under ε-moves. Forget the closure after a move and the DFA rejects `ac`, which the NFA accepts. [Show me](#play:eps-chain)

## The blow-up

How big can the DFA get? An NFA with n states has 2ⁿ subsets, so at most 2ⁿ DFA states. That sounds like a worry for theory books. It is not.

In [the third symbol from the end is 1](#example:third-from-end), the NFA guesses which 1 is third from the end, with 4 states. The DFA cannot guess, so it remembers the last three symbols: 8 states, one for each combination. [The fourth symbol from the end](#example:fourth-from-end) takes 5 NFA states and 16 DFA states. Each new NFA state doubles the DFA. [Show me](#play:third-from-end)

Most of the time it is much tamer. [Ends in ab](#example:ends-in-ab) has a 3-state NFA and a 3-state DFA. No blow-up at all.

## Reachable subsets or all of them

Sipser's proof makes every subset a state. Switch **Subsets** to all of them to see that version. For [ends in ab](#example:all-subsets), all 8 subsets get a row and a circle, but only 3 can be reached from the start. The other 5 are dead weight: no word ever visits them. So real implementations, and this page by default, build only the sets they reach. The proof is simpler with all of them. The program is faster without. [Show me](#play:all-subsets)

## Dead states

[Starts with ab](#example:dead-state) shows where ∅ comes from. q0 has no move on b, so from {q0} on b there is nowhere to be: the set is empty. NFAs leave out moves all the time. The subset construction fills every one of them in, with ∅ if need be, so the DFA it builds is complete. [Show me](#play:dead-state)

## What it costs

Each DFA state needs a move per symbol, and each move is a union plus an ε-closure, O(n²) for an NFA of n states. So k DFA states cost O(k·|Σ|·n²), and k is anywhere from 1 to 2ⁿ. You only find out by building it.

The payoff comes later. Running the DFA on a word of length m takes Θ(m), one lookup per symbol. Simulating the NFA directly, keeping the set of current states as you read, costs O(m·n²) every time.

## When to use it

Use it when the same automaton will read a lot of input: a lexer, a `grep` that compiles its pattern, a protocol checker. Build once, run fast. It is also the proof that NFAs recognize exactly the regular languages, no more than DFAs do.

Avoid it when the DFA would blow up. "The 20th symbol from the end is 1" is a 21-state NFA and a DFA of over a million states. Simulate the NFA instead, or build DFA states lazily, only when the input needs them. The DFA you get is often bigger than it has to be, too. [DFA minimization](/dfa-minimization/) shrinks it.

## Common mistakes

- Forgetting the ε-closure of the start state, or after a move.
- Taking the closure before the move and not after. E(M) comes after M.
- Leaving out ∅. It is a real state, and without it the DFA is not complete.
- Making a set accept only when all its states accept. One accept state is enough.
- Giving one set two names. {q0, q1} and {q1, q0} are the same state.

```check
Q: A DFA state is the set { q0, q2 }. The NFA's only accept state is q2. Does the DFA state accept?
* Yes: one way of reading the word so far ends in q2
- No: q0 does not accept
- Only if q0 has an ε-move to q2
= The set is every state the NFA could be in. If any of them accepts, the NFA accepts the word, so the DFA state accepts.
```

## Try this

- [Ends in ab](#example:ends-in-ab): before each step, say what the set will be. Does any set hold q1 without q0?
- [The third symbol from the end](#example:third-from-end): which DFA states accept, and what do their sets have in common?
- [All 8 subsets](#example:all-subsets): which rows never get an arrow into them?
- Fill with **n-th symbol from the end is 1** at size 5 and watch the queue grow.
- Load `start q0; accept q1; q0 a -> q0; q0 a -> q1; q1 b -> q1`. How many states will the DFA have? Press Convert and check.
