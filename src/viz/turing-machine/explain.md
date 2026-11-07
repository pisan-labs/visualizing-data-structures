# Turing machine

A Turing machine is a tape, a head and a small table of rules. That's it. No variables, no arrays, no function calls. It reads one cell, writes one cell, moves one cell, and changes state. Alan Turing described it in 1936, before there were computers to program, and every program you have ever run can be translated into one. Slowly.

## The idea

The tape is a row of cells, blank (`␣`) except for the input. The head sits on one cell. The machine is always in one state, and a rule says what to do for each state and symbol:

δ(q, a) = (p, b, D): in state q reading a, write b, move one cell in direction D, and go to state p.

Two states are special. Entering `accept` or `reject` halts the machine with that answer. If there is no rule for the state and the symbol under the head, the machine rejects, as in Sipser.

| Operation | What it does | Cost |
|---|---|---|
| **Load** | Read the rules into the table | O(rules) |
| **Run** w | Write w on the tape, start in q0 on cell 0, move until it halts (or 500 moves) | one step per move |
| **Start** w | Write w on the tape and stop before the first move | O(\|w\|) |
| **Step** | Make one move | O(1) |

One move is O(1): look up one rule, write one cell, move one cell. The interesting question is how many moves. The readouts count them, along with the state, the head's cell and the cells used (the cells the head has visited, which is how Sipser measures space).

## Writing the rules

Type the rules in one line, separated by `;`.

- `q0 1 -> q1 0 R` is the rule δ(q0, 1) = (q1, 0, R).
- `q1 0,y -> q1 R` leaves the symbol alone: reading 0 or y, write the same thing back and move right. Sipser's diagrams write 0→R for a rule like this.
- `_` is the blank. Symbols are single letters or digits, or `#`, `$`, `*`, `+` and `=`.
- The first rule's state is the start state, unless you say `start q2`.
- One rule per state and symbol. The machine is deterministic: it never has a choice.

The table on the stage has a row for each state and a column for each symbol. An empty cell is a missing rule, so reading that symbol in that state rejects. When the machine moves, the rule it used lights up.

The **Show the rules as** option draws the same rules as a state diagram, the way Sipser does: an arrow labelled 1→y,L means read 1, write y, move left, and 0→R means read 0, leave it, move right. It only does this for machines with up to five states. Past that, the diagram turns into spaghetti and the table is easier to read. [Unary addition](#example:unary-add) starts with the diagram.

## Configurations

Everything about a machine at one moment fits in one line. Sipser writes it as u q v: the tape holds uv, the machine is in state q, and the head is on the first symbol of v. So `xx q1 0y11` means the tape is xx0y11, the state is q1, and the head is on the 0.

A run is a list of these, each one following from the one before by a single rule. The trace under the tape shows the last six, newest at the bottom. If you want to check a machine by hand, this is how you do it: write the configuration, find the rule, write the next configuration. Tedious, but there is nowhere for a bug to hide.

```check
Q: The machine is in configuration `x q1 0y1`, and δ(q1, 0) = (q1, 0, R). What is the next configuration?
- `x q1 y1`
* `x0 q1 y1`
- `q1 x0y1`
= The head reads 0, writes 0 back and moves right, so the 0 moves from v to the end of u.
```

## 0ⁿ1ⁿ by crossing off

A finite automaton can't recognize 0ⁿ1ⁿ (some 0s followed by as many 1s) because it can't count. A Turing machine can't count either, at least not directly. It crosses things off instead.

Cross off the first 0 (write x), walk right to the first 1 and cross it off (write y), walk back to the x, and repeat. When there are no 0s left, check that only y's remain. If you run out of 1s first, or find a 0 after a 1, some state has no rule for what it reads, and the machine rejects. [0ⁿ1ⁿ by crossing off](#example:zeros-ones) [Show me](#play:zeros-ones)

How long does that take? Each 0 costs a trip to the 1s and back, about n cells each way, and there are n/2 of them. 000111 takes 25 moves. 000000111111, twice as long, takes 85. That is O(n²). Sipser uses the same language to open his chapter on time complexity. A machine with a second tape can copy the 0s over and then match them against the 1s in one pass: O(n). On one tape, the best you can do is O(n log n).

[A missing rule rejects](#example:zeros-ones-reject) shows both ways to fail. 0010 runs off the end of its 1s, and 10 is rejected before it even moves.

## One-way or two-way tape

Textbooks disagree about the tape. Sipser's goes on forever to the right only: cell 0 is the left end, and a move left from cell 0 leaves the head where it is. In Hopcroft, Motwani and Ullman, and in Linz, the tape goes on forever both ways. The **Tape** option switches between them.

The difference matters when a machine wants to grow its answer to the left. Binary increment walks to the right end and turns 1s into 0s until a 0 or a blank takes the carry. On a two-way tape, 111 becomes 1000: the carry lands on the blank in cell -1. [Binary increment](#example:increment)

Now run the same rules on a one-way tape. The carry needs a cell to the left of cell 0, and there isn't one. The head stays put, finds the 0 it just wrote, and turns it into a 1. The machine accepts, and the tape says 100. Seven plus one is four. [The carry falls off a one-way tape](#example:increment-one-way)

Neither tape is more powerful. A one-way machine can mark cell 0 and shift the number right to make room; a two-way tape can be folded in half onto a one-way tape with two tracks. Both compute exactly the same things. The machines just look different.

The **Moves** option adds S, for stay put. It doesn't add power either: S is a move right followed by a move left.

## Machines that never halt

Nothing forces a Turing machine to stop. `q0 0,1,_ -> q0 R` walks right forever. Run it and the page gives up after 500 moves, still running. [A machine that never halts](#example:walks-forever)

Could the page be smarter? Sometimes. [Flipping a cell forever](#example:flips-forever) keeps returning to the same two configurations, and a simulator that remembered every configuration would spot the loop. The walker never repeats a configuration, since its tape keeps getting longer, so that trick fails. A cleverer check would catch the walker too, but then there is a cleverer machine.

This is the halting problem. Turing proved that no program can look at any machine and any input and always say correctly whether the machine halts. Not "nobody has found one yet": there isn't one. So a run that hits the cap tells you nothing. It may halt at move 501, or never.

```check
Q: A run stops at the 500-move cap, still running. What do you know about the machine on this input?
- It never halts
- It would reject if you let it finish
* Nothing yet: it may halt later, or never
= The cap is the page giving up, not the machine. Press Step to keep going, but no number of steps can prove it never halts.
```

A machine that halts on every input is a decider: it always answers. One that accepts the right words but may run forever on the others is only a recognizer. The 0ⁿ1ⁿ and palindrome machines here are deciders. The walker recognizes nothing at all.

## When to use it

Nobody writes software for Turing machines. They are a model, the simplest one that can compute anything a computer can (that claim is the Church–Turing thesis). Use them to reason: to show that something can be computed, that something can't, or to count steps when you want a cost model with nothing hidden in it. When you want to get work done, use a real language.

They are also good for building intuition about cost. Every trick a machine needs, like crossing off, marking, carrying a symbol in its state, or walking back to a mark, costs moves. Watching the head sweep back and forth is a fair picture of why one tape is slow.

## Common mistakes

- Forgetting the left end. On a one-way tape, "move left until you find a blank" never finds one at cell 0. Mark the first cell instead.
- Forgetting the blank. The empty word starts on a blank, and so does the cell after the input. Most machines need a rule for `_` somewhere.
- Leaving out a rule by accident. That is a reject, not an error, so the machine quietly gives the wrong answer.
- Writing two rules for the same state and symbol. Then the machine would have a choice, and that is a nondeterministic machine.
- Expecting the head to come back on its own. If you want the head at the start of the answer, write the rules that walk it there.
- Reading "still running" as "loops forever".

## Try this

- [0ⁿ1ⁿ by crossing off](#example:zeros-ones). Before you press play, guess how many times the head passes cell 3.
- [A missing rule rejects](#example:zeros-ones-reject). Find the empty cell in the table that rejects 0010.
- [Palindromes over 0 and 1](#example:palindrome). The machine remembers the first symbol in its state: q1 for 0, q2 for 1. Then type 0101 and press **Run** to see where it gives up.
- [Copy a string](#example:copy) turns 011 into 011#011 in 28 moves. Try 0110 and count how many more it takes.
- [Unary addition](#example:unary-add): 11+111 becomes 11111. Then write a machine that subtracts.
- [The carry falls off a one-way tape](#example:increment-one-way). Switch **Tape** to infinite both ways and run 111 again.
- [Flipping a cell forever](#example:flips-forever) and [a machine that never halts](#example:walks-forever). [Show me](#play:walks-forever)
- Type a word, press **Start**, then press **Step** a few times and predict each configuration before it appears in the trace.
