# Busy beaver

Take every Turing machine with n states that reads and writes only 0 and 1. Start each one on a blank tape. Some halt, some run forever. Among the ones that halt, which one keeps busy the longest? That machine is the busy beaver, and how long it runs is a number nobody can compute in general. Tibor Radó invented the game in 1962 to give us a well-defined function that no program computes.

| Operation | What it does | Cost |
|---|---|---|
| **Load** | reads a machine (bb2, bb3, bb3s, bb4, or rules such as 1RB1LB_1LA1RH) and clears the tape | O(n) for n states |
| **Step** | one move: read, write, move, change state | O(1) |
| **Run** | moves until the machine halts, repeats itself, or reaches 500 moves | O(1) per move |
| **Run moves** | a given number of moves, shown as fine detail with every tenth move a normal step | O(1) per move |
| **Reset** | a blank tape again, in state A | O(1) |

## The rules of the game

The machines on this page follow Radó's convention, the one the busy beaver papers still use:

- the tape is infinite both ways and starts as all 0s;
- there are n working states, A, B, C, ..., and a halt state H;
- every rule writes a bit, moves one cell left or right, and names the next state;
- the move into H counts as a move.

A rule is three characters. 1RB means write 1, move right, go to B. A machine is two rules per state, one for reading 0 and one for reading 1, so the 2-state champion is `1RB1LB_1LA1RH`.

Two numbers come out of it. **Σ(n)** is the most 1s any halting n-state machine leaves on the tape. **S(n)** is the most moves any halting n-state machine makes. Machines that never halt don't count; that is the whole difficulty.

| n | Σ(n) | S(n) |
|---|---|---|
| 1 | 1 | 1 |
| 2 | 4 | 6 |
| 3 | 6 | 21 |
| 4 | 13 | 107 |
| 5 | 4,098 | 47,176,870 |

[The 2-state champion: 4 ones in 6 moves](#example:two-states) is short enough to follow by hand. Watch the space-time picture under the tape: one row per move, newest at the bottom, 1s filled in. [Show me](#play:two-states)

## One record or two?

For 2 and 4 states, one machine holds both records. For 3 states it doesn't. [The most 1s](#example:most-ones) leaves 6 ones in 14 moves. [The most moves](#example:most-moves) runs 21 moves but leaves only 5. So when someone says "BB(3)", ask which one they mean. This page calls Σ the score and S the running time, and loads the first as bb3 and the second as bb3s. [Show me](#play:most-moves)

[Four states: 13 ones in 107 moves](#example:four-states) is long enough that you probably don't want every move. Run moves shows each move as fine detail, so at the normal detail level you see every tenth move. Switch to fine detail if you want all 107. [Show me](#play:four-states)

```check
Q: The 3-state machine that leaves the most 1s halts after 14 moves. Another 3-state machine halts after 21 moves with 5 ones. What is S(3)?
- 14
* 21
- 6
= S(n) is the most moves made by any halting n-state machine, whatever it leaves behind. The 21-move machine sets that record; the 14-move machine sets Σ(3) = 6.
```

## Small changes, big differences

Busy beavers are fragile. [One bit off the champion](#example:one-bit-off) changes only the last rule, from 1RH to 0RH. It still halts after 6 moves, but leaves 3 ones. [A machine that halts on its first move](#example:halts-at-once) does exactly one thing, which is the best case for running time and the worst for score.

Most machines are like these, or worse. There are (4n + 4)^(2n) machines with n states: 20,736 for n = 2, about 16.8 million for n = 3. Almost all of them halt within a few moves or never halt at all. The champions are the rare ones that do something complicated and then stop.

## Why nobody can compute S(n)

Suppose I gave you a program that computes S(n). Then you could decide, for any machine M with n states, whether M halts on a blank tape: compute S(n), run M for S(n) moves, and if it has not halted by then, it never will. That decides a version of the [halting problem](/halting-problem/), and the halting problem has no decider. So no program computes S(n). The same argument works for Σ(n).

It is worse than that. S(n) grows faster than any function you can compute. Pick any computable f, say 2ⁿ, or n!, or a tower of exponents. A machine with some fixed number of extra states, k, can compute f and keep busy for f(n) moves, so S(n + k) ≥ f(n). Feed it f(2n) instead and S overtakes f for good. There is no computable ceiling.

That doesn't stop people from finding the values one at a time. Each n needs a proof that every machine that is still running will run forever, and the proofs get harder fast:

- S(4) = 107 was proved by Allen Brady in 1983.
- S(5) = 47,176,870 was proved in 2024 by the bbchallenge collaboration, who sorted all the 5-state machines and checked the proof in Coq. The champion had been known since 1989; the hard part was proving nothing beats it.
- S(6) is at least 10↑↑15, a tower of fifteen 10s. Nobody expects to settle it.
- Machines with fewer than 800 states have been built whose halting the standard axioms of set theory cannot settle. So past some n, the value of S(n) is not just unknown, it cannot be proved.

```check
Q: You are handed a program that correctly computes S(n) for every n. What else can you now do?
- Nothing new: S(n) is just a number
* Decide whether any given machine halts on a blank tape
- Run every machine faster
= Run the machine for S(n) moves, n its number of states. If it hasn't halted by then, no halting n-state machine runs that long, so it never halts. That would decide the halting problem, so the program can't exist.
```

## A cap is not an answer

The page stops a run after 500 moves. [A machine that walks away forever](#example:walks-away) hits that cap, and you can see why it never halts: each move writes a 1 and steps onto a fresh blank cell. For that machine the cap is honest. For a 5-state machine it would call the champion a loop about 47 million moves too early.

The page also stops a run that comes back to a configuration it has seen, the same state, head position and whole tape. [A machine that comes back to where it was](#example:loops) does that after 4 moves. It has a rule into H; it never uses it. A repeat proves the machine loops. No repeat proves nothing: the walker never repeats and never halts. [Show me](#play:loops)

## When to use it

The busy beaver is not an algorithm you will use at work. It is the cleanest example of an uncomputable function, a number defined precisely and still out of reach. It is a good stress test for a Turing machine simulator, and the space-time pictures of the champions are worth a look on their own. If you are comparing models of computation, notice that changing the convention (two symbols or three, moving or staying) changes the numbers but not the conclusion.

## Common mistakes

- **Counting machines that never halt.** A machine that writes 1s forever scores nothing. Σ(n) and S(n) only count machines that halt.
- **Mixing up Σ and S.** One counts 1s, the other moves. For 3 states they come from different machines.
- **Forgetting the halting move.** In Radó's convention the move into H writes, moves and counts. The 2-state champion makes 6 moves, not 5.
- **Thinking uncomputable means unknown.** S(4) and S(5) are known exactly. Uncomputable means no single program produces S(n) for every n.
- **Trusting a step cap.** "Has not halted in a million moves" is not "never halts", whatever the cap.

## Try this

- [The 2-state champion](#example:two-states): before you press Run, step through it on paper. How many 1s after 3 moves?
- [Three states, the most 1s](#example:most-ones) and [the most moves](#example:most-moves): compare their space-time pictures. Which one wastes moves walking over 1s it already wrote?
- Load `1RB1LB_1LA0RH`, then change one rule at a time and run it again. Can you beat 4 ones with 2 states? You can't, but it's fun to try.
- Fill with **A random machine that halts** at size 3 a few times. How close do random machines get to 6 ones?
- [Four states](#example:four-states): switch the rules to a state diagram in Options. Which state does most of the walking?
