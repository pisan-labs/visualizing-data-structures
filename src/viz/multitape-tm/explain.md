# Multi-tape Turing machine

Give a Turing machine a second tape and a lot of things get easier. Copy something, keep it, compare it later. No more walking back and forth across one tape crossing things off. So the obvious question: does the extra tape let it compute anything new? Nope. One tape can do everything two or three tapes can. It just takes longer, and this page counts how much longer.

## The idea

A k-tape machine has k tapes, each with its own head. The input starts on tape 1 and the other tapes are blank. Every head starts on cell 0. In one move, all k heads read at once, the machine looks up one rule, and then every head writes and moves at once. Sipser writes the rule as

δ(q, a1, …, ak) = (p, b1, …, bk, D1, …, Dk)

In state q with the heads reading a1 to ak: write b1 to bk, move each head by its D, go to state p. Each D is L, R or S (stay put). One tape can manage without S, but with several tapes you often want one head to wait while another walks, so Sipser includes it here. As on the [Turing machine page](/turing-machine/), the tapes go on forever to the right only, a head at cell 0 that is told to move left stays where it is, and a missing rule rejects.

| Operation | What it does | Cost |
|---|---|---|
| **Load** | Read the rules | O(rules) |
| **Run** w | Run the k-tape machine M until it halts (or 500 moves) | one step per move of M |
| **Simulate** w | Run the one-tape machine S that simulates M | many steps per move of M |
| **Start** w | Put w on the tapes, format the single tape, and stop | O(\|w\|) |
| **Step** | Simulate one move of M on the single tape | one move of M |

The two counts at the top of the drawing are the point of the page. M counts the moves of the k-tape machine. S counts the moves of the single tape's head doing the same work.

## Writing the rules

Type the rules in one line, separated by `;`. Each rule has one symbol per tape, separated by commas.

- `copy 0,_ -> copy 0,0 R,R` is δ(copy, 0, ␣) = (copy, 0, 0, R, R): tape 1 reads 0 and tape 2 reads a blank, so write 0 on both and move both heads right.
- `|` lists symbols a tape may read: `back =,0|1 -> back S,L` is two rules, one for 0 and one for 1.
- `-` in the writes leaves a tape's symbol alone: `mark 0|1|=,_ -> copy -,$ S,R` keeps whatever tape 1 has and writes $ on tape 2.
- Leave the writes out to leave every symbol alone: `check 0,0 -> check R,R`.
- `_` is the blank. The first rule's state is the start state, unless you say `start q2`.
- The number of symbols in the first rule sets the number of tapes: 2 or 3 here.

The input is one word per tape, separated by commas. `01=01` puts 01=01 on tape 1. `1011,0110` puts 1011 on tape 1 and 0110 on tape 2. Sipser puts all the input on tape 1, and so do most of the machines here.

One symbol is off limits: `#`. The single tape uses it to separate the tapes, so the machine cannot use it too. That is why the copy machine below checks w=w instead of Sipser's w#w.

## Copy, then compare

Is the word before the = the same as the word after it? With one tape, you cross off a symbol on the left, walk to the right, check its partner, walk back, and repeat. That is O(n²). With two tapes:

1. Copy the first word to tape 2.
2. Rewind tape 2.
3. Compare tape 2 against the rest of tape 1, both heads moving right.

Three passes, so O(n). 0110=0110 takes 16 moves. [Copy, then compare](#example:copy-compare) [Show me](#play:copy-compare)

Step 2 hides a problem. How does head 2 know it is back at the start? A head at cell 0 that moves left just stays there, and nothing tells the machine it bumped into the end. So the first move writes a `$` in cell 0 of tape 2, and the copy starts in cell 1. Rewinding means "move left until you see the $". It is the oldest trick for one-way tapes, and every machine on this page uses it at least once.

## Two tapes, three tapes

**Palindromes.** Copy the word to tape 2, rewind tape 2, then read tape 1 backwards while tape 2 reads forwards. A palindrome of length n takes 3n + 4 moves. The one-tape machine on the Turing machine page needs about n²/2, and no one-tape machine can do better than n² for palindromes. [Palindromes in linear time](#example:palindrome)

This machine is not clever about failures. It copies and rewinds before it compares anything, so even a word whose ends differ costs about 2n moves. [A mismatch still costs a copy](#example:palindrome-mismatch)

**Binary addition.** Put the two numbers on tapes 1 and 2 and let tape 3 hold the sum. The heads walk to the right end, then add right to left, one column per move, with the carry kept in the state (add or carry). Tape 3 gets a `c` in its first cell on the way out, which is how the machine knows it has reached the last column. 1011 + 0110 takes 10 moves and leaves 10001 on tape 3. [Binary addition with two input tapes](#example:binary-add)

The adder wants both numbers the same length. Give it 101 and 11 and tape 2 runs out first, there is no rule for that, and it rejects. Pad with 0s: 101,011. [Numbers of different lengths](#example:unequal-lengths)

**Unary multiplication.** 11\*111 is 2 × 3. Copy the first number to tape 2. For each 1 on tape 2, sweep head 1 across 111 and write a 1 on tape 3 for each 1 it passes. The sweeps alternate right and left, so the head never walks back for nothing. 13 moves, and tape 3 ends with 111111. [Unary multiplication](#example:unary-multiply)

## One tape can do it all

Sipser's Theorem 3.13: every multi-tape machine has an equivalent single-tape machine. The proof is a simulation. S puts all k tapes on its one tape, side by side:

`# 0 1 = 0 1 # ␣ #`

A `#` at each end and between the tapes, and a mark on the cell under each head. Sipser draws the mark as a dot over the symbol; the **Mark the heads** option draws a line under it instead. Either way, S's alphabet gets a second, marked copy of every symbol. Formatting the tape for 01=01 makes 9 cells and takes 16 moves.

Then, for every move of M:

1. **Scan right** from the first # to the last, and remember the marked symbols. S keeps them, and M's state, in its own state. That is fine, because there are only finitely many combinations.
2. Look up M's rule.
3. **Scan back** to the first #. At each mark, write the new symbol and move the mark the way that head moves.
4. If a mark moves right onto a #, that tape has just walked onto a cell nobody has used before. S writes a blank there and shifts everything from the # on one cell to the right, then walks back.

Press **Simulate**, or **Start** and then **Step**, and set the detail to every detail to see each mark as S passes it. [The same work on one tape](#example:copy-compare-one-tape) [Show me](#play:copy-compare-one-tape)

```check
Q: Tape 1 holds 01 with its head on cell 1. Tape 2 holds 0 with its head on cell 0. With the marked cells in brackets, what is S's tape?
- `#[0]1#[0]#`
* `#0[1]#[0]#`
- `#0[1][0]#`
= Each tape gets its own segment between #s, and the mark goes on the cell under that tape's head: cell 1 of tape 1 and cell 0 of tape 2.
```

## What it costs

01=01 takes M 10 moves. It takes S 266. That's not a typo.

Every move of M costs S two scans of its whole tape. The tape starts about as long as the input, and each move of M can add up to k cells, one per head that walks onto new ground. After t moves the tape is at most about n + kt cells long, so t moves cost S O(t·(n + kt)). For t ≥ n, that is O(t²). Sipser states it as Theorem 7.8: a t(n)-time multi-tape machine has an O(t²(n))-time single-tape equivalent.

You can watch the square happen with palindromes:

| Length | M (2 tapes) | S (simulation) |
|---|---|---|
| 4 | 16 | 444 |
| 8 | 28 | 1,184 |
| 16 | 52 | 3,720 |

M doubles each time. S grows 2.7 times, then 3.1 times, and the ratio creeps toward 4 as the words get longer. [Palindromes, simulated on one tape](#example:palindrome-one-tape)

The worst case is a machine whose heads walk onto new cells on every move: every move shifts the tape k times. Two heads that walk right forever make S use 31,908 moves for the first 100 moves of M. [Every move shifts the tape](#example:shifts-every-move) [Show me](#play:shifts-every-move)

```check
Q: On a longer input, M makes twice as many moves, and its heads keep walking onto new cells. About how many more moves does the one-tape simulation make?
- About twice as many
* About four times as many
- About eight times as many
- The same: S just copies what M does
= S's tape grows with t, and every move scans all of it. Twice the moves on a tape twice as long is four times the work.
```

One more thing. The simulation is a proof, not a design. The one-tape palindrome machine on the Turing machine page takes 153 moves on a 16-symbol palindrome. Simulating the two-tape machine takes 3,720. Both are Θ(n²), but nobody would write the simulated one by hand.

## Variants

Textbooks agree on the result and disagree on the details.

- **The mark.** Sipser dots the symbol under each virtual head. Other notes underline it, or put a hat on it. It makes no difference; the option changes the picture only.
- **Tracks instead of segments.** Hopcroft, Motwani and Ullman stack the tapes as tracks of one tape, so each cell holds a k-tuple of symbols plus a head marker for each track. Nothing needs shifting, but each move still sweeps from the leftmost head marker to the rightmost, which is O(t) cells, so the total is still O(t²).
- **Two-way tapes.** If the tapes go on forever to the left too, the simulation has to shift left as well as right. Same cost.
- **S moves.** Sipser's multi-tape definition allows S. Without it, a head that wants to wait moves right and then left, which costs a move but no power.

## When to use it

Nobody builds multi-tape machines either. They are a model, and a handy one. A second tape is a scratch pad, which makes algorithms short enough to write down and reason about. Because one tape can simulate k tapes with only a square slowdown, anything a multi-tape machine decides in polynomial time, a single-tape machine also decides in polynomial time (a polynomial squared is still a polynomial). So the class P is the same whichever model you pick, and textbooks happily switch to multi-tape machines whenever it makes a proof easier.

Where the model matters is below polynomial. Palindromes are O(n) on two tapes and Ω(n²) on one. If you care about the difference between linear and quadratic, say how many tapes you have.

## Common mistakes

- Forgetting that a head at cell 0 cannot tell it has hit the left end. Mark cell 0 (with $ or similar) if you ever need to come back.
- Writing a rule for only the symbols you expect. If tape 2 might read a blank, you need a rule for it, or the machine quietly rejects.
- Thinking the heads take turns. They read, write and move at the same time, in one move.
- Thinking the simulation makes one tape just as fast. It makes it just as powerful. The square is the price.
- Counting S's moves as k times M's. The single tape is long, and every move scans all of it.
- Using `#` in a multi-tape machine on this page. The simulation needs it.

## Try this

- [Copy, then compare](#example:copy-compare): predict the move count for 01=01 before you run it, then check (it is 10). Now press **Simulate** on 01=01 and read the two counts at the top.
- [Palindromes in linear time](#example:palindrome): find the move where head 1 stops waiting and starts walking left.
- [Binary addition with two input tapes](#example:binary-add): try 111,111. How many bits does tape 3 end with, and why one more than the inputs?
- [Unary multiplication](#example:unary-multiply): swap the numbers to 111\*11. Does the move count change?
- [The same work on one tape](#example:copy-compare-one-tape): set the detail to every detail and step through one move of M. Count the shifts.
- [Two heads that never stop](#example:walks-forever): the run hits the 500-move cap. No program can tell in general whether a machine will halt, so the page gives up.
- Write a two-tape machine that reverses its input onto tape 2, then **Simulate** it on 0011 and on 00110011.
