# Subset sum

You have a few whole numbers and a target T. Do some of them add up to exactly T? Each number is in or out, so n numbers have 2ⁿ subsets. Checking them all is fine for 10 numbers (1,024 subsets) and hopeless for 60.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the table | S[i][t] for every prefix of the numbers and every sum t from 0 to T | Θ(nT) time and space |
| Trace back | Walks up from S[n][T] and reads off one subset | O(n) |

Let S[i][t] be true when some of the first i numbers add up to exactly t. Number xᵢ is either out or in.

- Out: then the first i − 1 numbers must make t on their own, S[i − 1][t].
- In, if it fits (xᵢ ≤ t): then the first i − 1 numbers must make the rest, S[i − 1][t − xᵢ].

S[i][t] is true if either one is. Row 0 has no numbers, and the empty set adds up to 0, so S[0][0] is true and the rest of row 0 is false.

It is the 0/1 knapsack with the values thrown away: instead of the best value for each capacity, each cell asks a yes or no question.

## Filling the table

Fill one row per number, from sum 0 up. Each cell reads the cell straight above (leave the number out) and the cell xᵢ columns to the left in the row above (take it, marked +xᵢ). The blue arrow is the one that makes the cell true. [Show me](#play:make-nine)

Here is another way to see a row. Take the row above, shift a copy of it right by xᵢ, and lay the two on top of each other: a sum is reachable if it is reachable in either. Try it with [one row at a time](#example:row-by-row).

```check
Q: Numbers 3 and 5. Which sums from 0 to 8 does row 2 mark true?
- 3, 5 and 8
* 0, 3, 5 and 8
- 0, 3 and 5
- All of them
= Row 1 makes 0 and 3. Shift it right by 5 to get 5 and 8. Together: 0, 3, 5 and 8.
```

## Which numbers?

If S[n][T] is false, there is nothing to find. If it is true, walk up from it. At row i, ask whether the row above already reaches the current sum. If it does, leave xᵢ out and move up. If not, xᵢ must be in: take it and move left by xᵢ. Several subsets may work; this walk finds the one that leaves out the later numbers when it can. For 3, 4, 5 and 2 with target 9 it finds 4 + 5, not 3 + 4 + 2.

## Why it is pseudo-polynomial

The table has (n + 1)(T + 1) cells, so the work is Θ(nT). That looks polynomial. It is not, quite. The size of an input is how long it takes to write down, and T takes about log₂ T bits. Add one bit to T and the table doubles. A target with 30 digits gives a table with more columns than there are atoms in your laptop.

So the algorithm is fast when the numbers are small and useless when they are large. Subset sum is NP-complete, and nobody knows an algorithm that is polynomial in the number of bits. The table does not change that; it just works well when T is small. [Six numbers, target 14](#example:largest) is the largest table here, 105 cells.

```check
Q: The table for 6 numbers and target 1,000 has about 7,000 cells. About how many cells for target 1,000,000?
- About 14,000
- About 7,001
* About 7,000,000
- About 49,000,000
= The table grows with the value of T. Three more digits multiply T by 1,000, and the table with it.
```

## When to use it

Splitting a set of jobs into two equal halves, checking whether a budget can be spent exactly, picking coins or weights that hit a total. Use the table when T is at most a few million. Avoid it when the numbers are huge, or are not whole numbers; then try meet in the middle (about 2ⁿᐟ² subsets) or an approximation.

## Common mistakes

- Setting S[0][t] = true for every t. Only the empty sum, 0, is reachable with no numbers.
- Reading S[i][t − xᵢ] instead of S[i − 1][t − xᵢ]. That uses a number twice.
- Updating one row in place from small sums to large, which has the same effect. Go from large to small.
- Calling Θ(nT) polynomial. It is polynomial in T, not in the length of T.

## Try this

- [Even numbers never make an odd sum](#example:all-even). Before you fill it, which columns stay false?
- [Every number is needed](#example:needs-all) and [target 0](#example:zero-target).
- Type `1 2 4 8`, press **Set numbers**, then type `13` and press **Target**. Why is there exactly one way?
