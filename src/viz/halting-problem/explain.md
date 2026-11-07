# The halting problem

Give me a program and an input. Will it stop? It would be lovely to have a tool that answers that: compilers could warn about infinite loops, graders could skip the submissions that hang, and nobody would sit watching a progress bar wondering. Turing showed in 1936 that no such tool exists. Not "we haven't found it yet". It cannot exist.

The proof fits on a napkin. Draw a table with a row for every machine and a column for every machine's description. Build a machine D that disagrees with the table on the diagonal. Then ask what D does on its own description. Both answers are impossible.

| Operation | What it does | Cost here |
|---|---|---|
| **Build table** | runs every program on every description | n² runs |
| **Diagonalize** | walks down the diagonal and flips each cell into D's row | n questions to H |
| **D on ⟨D⟩** | asks what D does on its own description, and refutes both answers | 4 steps of argument |
| **Run** | runs one program on one description, line by line (type `3 2` for M3 on ⟨M2⟩) | at most L·(m + 1) steps |
| **Reduce** | gets the other problem by a reduction (under More operations) | n² questions |

## The table

A Turing machine's description ⟨M⟩ is just a string, so one machine can read another machine's description as its input. Put the machines down the side and their descriptions across the top. Cell (i, j) says what Mi does when it reads ⟨Mj⟩: accept, reject, or run forever (∞).

The real table has a row for every Turing machine and never ends. This page uses six toy programs instead, nothing fancy. Each is a few numbered lines that read the input and never write:

| Line | Code | Does |
|---|---|---|
| accept | `A` | halts and accepts |
| reject | `R` | halts and rejects |
| right | `>` | moves the head right (it stops at the end) |
| left | `<` | moves the head left (it stops at cell 0) |
| goto k | `Gk` | jumps to line k |
| if end goto k | `Ek` | jumps if the head is past the last symbol |
| if c goto k | `?ck` | jumps if the head is on the symbol c |

A program's description is its code. M3 is `E6>E3>G1A`: walk two symbols at a time, accept if you land exactly on the end, and get stuck on line 3 (if end goto 3) if you don't. So M3 accepts an even-length input and loops forever on an odd one. Its own code has 9 symbols, so M3 loops on ⟨M3⟩.

Every cell on this page comes from a run, not from me typing it in. The trick is that a program that never writes has only a few configurations: which line it is on, and where the head is. M3 has 6 lines, and its own code has 9 symbols plus the end cell, so on ⟨M3⟩ it has 6·10 = 60 configurations. Run long enough and the program either halts or lands on a configuration it has been in before, and from there it does exactly the same thing again, forever. [Every program on every description](#example:the-table) builds the 4 × 4 table with 16 runs. The slowest loop shows itself by step 24. There is a cap of 1000 steps as a safety net, and it never comes into play. [A loop caught by a repeated configuration](#example:cycle-check) [Show me](#play:cycle-check)

## The diagonal

Now suppose some machine H decides A_TM: given ⟨M, w⟩ it always halts, and accepts exactly when M accepts w. Build D:

```
D = "On input ⟨M⟩:
  1. Run H on ⟨M, ⟨M⟩⟩.
  2. If H accepts, reject. If H rejects, accept."
```

D asks H about one cell per row: Mi on its own description, the diagonal. Then it does the opposite. So D's row differs from row 1 in column 1, from row 2 in column 2, and so on. Whatever is in the table, D's row is not any of its rows. On the 4 × 4 table D's row comes out as rej, acc, acc, acc. [The whole argument: table, diagonal, contradiction](#example:whole-argument) [Show me](#play:whole-argument)

Notice that D never looks off the diagonal. [D only needs the diagonal](#example:diagonal-only) runs Diagonalize on an empty table, and only the diagonal gets filled in. The other cells are there so you can see what D is different from.

If this feels familiar, it is Cantor's argument that the real numbers cannot be listed: write the list, change the i-th digit of the i-th number, and the new number is not on the list.

```check
Q: The table says M2 loops on ⟨M2⟩. In the A_TM version, what does D do on ⟨M2⟩?
- D loops too
- D rejects
* D accepts
= M2 does not accept ⟨M2⟩, so H rejects ⟨M2, ⟨M2⟩⟩, and D does the opposite. H always answers, even for a machine that loops. That is what deciding means.
```

## D on ⟨D⟩

With six toy programs, "D is none of them" is no surprise. D is not a toy program. It has to run another program and keep track of configurations, and six read-only lines can't do that.

Turing machines are different. If H is a Turing machine, then D is a Turing machine too: a few extra states around H. So D is somewhere in the full table, with its own row and its own column ⟨D⟩. Look at the cell where they meet, where the diagonal would go next.

- If D accepts ⟨D⟩, then H accepts ⟨D, ⟨D⟩⟩, so D rejects ⟨D⟩.
- If D does not accept ⟨D⟩, then H rejects ⟨D, ⟨D⟩⟩, so D accepts ⟨D⟩.

Both are impossible. Nothing can go in that cell. The only thing we assumed was H, so H does not exist: A_TM is undecidable. **D on ⟨D⟩** walks through it one case at a time.

## A_TM or HALT

Sipser does the diagonal on A_TM, the acceptance problem, and D always halts. Plenty of courses do it on HALT directly: D asks whether M halts on ⟨M⟩, and loops forever if it does. Switch **The problem** in Options to see that version. Cells become halt or ∞, and D's row has an ∞ wherever the diagonal has a halt. [The halting version: D loops where Mi halts](#example:halting-version) [Show me](#play:halting-version)

Each version gives you the other one by a reduction. Sipser's route: if R decided HALT, then S could decide A_TM. Ask R whether M halts on w. If it doesn't, reject. If it does, run M on w (now safe) and give its answer. [A decider for halting would decide acceptance](#example:reduction) The other way: change every reject in M to accept and call it M′. M′ accepts exactly when M halts, so a decider for A_TM, asked about M′, answers HALT. [Turn reject into accept: acceptance would decide halting](#example:flip-reject)

HALT is not hopeless. It is recognizable: simulate M on w and accept when it halts. If M runs forever, so does the simulation, and a recognizer is allowed to do that. What you can't have is a decider, which must also say no. And co-HALT, the pairs that don't halt, is not even recognizable: if it were, you could run both recognizers side by side and one of them would always answer, which would decide HALT. The Chomsky hierarchy page puts both on its map.

## Step caps and busy beavers

The obvious fix is a timer. Run the program for a million steps, and if it hasn't stopped, call it a loop. It is fast, it is simple, and it is wrong.

[A late halter: a step cap gives up too soon](#example:late-halter) runs M6 on ⟨M5⟩. M6 walks to the end of its input, steps back and checks the last symbol. It accepts on step 40. A cap of 30 calls it a loop. Pick a bigger cap and I can write a program that halts one step after it. [Show me](#play:late-halter)

Real machines are much worse than M6. The busy beaver numbers count the longest a halting Turing machine with n states can run, and they grow faster than any function you can compute. Five states already take 47,176,870 steps.

The cycle check works on this page only because toy programs never write. A Turing machine writes on a tape that has no end, so its configuration includes the whole tape, and it can run forever without ever repeating one. A machine that writes 1 and moves right, forever, never comes back to where it was. It is a fine way to decide halting for these six programs. It is not a way to decide halting for Turing machines, and the diagonal argument says nothing else is either.

```check
Q: A checker runs M on w for 10⁹ steps and says "loops" if M has not halted. What is wrong with it?
- Nothing, if 10⁹ is big enough
* Some machines halt after more than 10⁹ steps, and the checker calls them loops
- It is too slow to be useful
= Whatever the cap, some machine halts one step later. The checker always halts, so it is a decider; it is just a wrong one.
```

## Common mistakes

- **Thinking a step cap decides halting.** A cap always gives an answer, and some of its answers are wrong. "Has not halted yet" is not "loops".
- **Thinking the argument needs the machines listed in some real order.** It doesn't. Take any list that contains every machine, in any order. D differs from every row on the diagonal, whatever the order, and the contradiction only needs D's own row and column. Nobody has to compute the list.
- **Mixing up recognizable and decidable.** A recognizer for HALT exists: simulate and wait. It may never answer on a machine that loops. A decider must always answer, and that is the part that is impossible.
- **Thinking undecidable means no program's halting can be decided.** You can decide it for plenty of programs: these toy ones, or any program without loops. Undecidable means no single algorithm works for every machine and every input.
- **Blaming D.** D is three lines once you have H. The only assumption in the proof is H, so H is what goes.

## Try this

- [Every program on every description](#example:the-table). Before each row fills in, read the program in the legend and predict the row.
- [The whole argument: table, diagonal, contradiction](#example:whole-argument). Then switch **The problem** to HALT and press Diagonalize again. Which entries of D's row change?
- [Six programs, and D is still none of them](#example:six-programs). Run M5 on ⟨M5⟩. Why does it accept its own code?
- [A loop caught by a repeated configuration](#example:cycle-check). At which step does M3 first reach the end cell? Then try `3 4`, an even-length input.
- [A late halter: a step cap gives up too soon](#example:late-halter). Which other cell of the 6 × 6 table needs the most steps?
- [Turn reject into accept: acceptance would decide halting](#example:flip-reject). Write M4′ by hand and check it against the table.
