# Rod cutting

You have a steel rod of length n and a price list: a piece of length i sells for p[i]. You can cut the rod anywhere, at whole lengths, as often as you like. Cuts are free. How should you cut it to earn the most? A rod of length n has n − 1 places to cut, each cut or not, so there are 2ⁿ⁻¹ ways to cut it. For a rod of 30 that is over 500 million.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the table | r[j], the best revenue for every length j up to n | Θ(n²) time, Θ(n) space |
| Cut the rod | Reads the pieces off s[n], s[n − s[n]], ... | O(n) |

Look at the first piece of a best cut. Say it has length i. It sells for p[i], and what is left is a rod of length j − i, which you should cut as well as possible. So

r[j] = max over i from 1 to j of (p[i] + r[j − i]), with r[0] = 0.

That is the whole trick. The best cut of a long rod is made of best cuts of shorter rods (optimal substructure), and the shorter rods come up over and over (overlapping subproblems). Solve each length once, keep the answer, and the 2ⁿ⁻¹ cuts shrink to n(n + 1)/2 sums.

## Filling the table

The table has a column per length. The top row is the price list, the middle row is r and the bottom row is s, the length of the first piece in a best cut. Fill r from left to right. Each cell tries every first piece i: the arc over the table comes from r[j − i] and is labeled with the price it adds. The blue arc is the best so far. [Show me](#play:two-and-six)

For the price list 1, 5, 8, 9, 10, 17, 17, 20, the whole rod of 8 sells for 20. Cutting it into 2 and 6 earns 5 + 17 = 22.

```check
Q: p[1] = 1, p[2] = 5, p[3] = 8, and r[0] = 0, r[1] = 1, r[2] = 5. What is r[3]?
- 6
* 8
- 9
- 10
= The first piece can be 1 (1 + r[2] = 6), 2 (5 + r[1] = 6) or 3 (8 + r[0] = 8). The best is 8: sell it whole.
```

## Top-down with a memo

You can write the same recurrence as a recursive function. Plain recursion is a disaster: cutRod(n) calls cutRod(n − 1), cutRod(n − 2), ..., and each of those calls everything below it again, Θ(2ⁿ) calls in all. Add a memo and each length is worked out once. Later calls find the answer waiting. Pick **Top-down with a memo** under Options to watch the stack go all the way down to memoCut(0) and the memo fill on the way back up. [Show me](#play:memo-calls)

Bottom-up and top-down fill the same table and do the same Θ(n²) work. Bottom-up has no recursion overhead. Top-down only solves the lengths it needs, which for rod cutting is all of them. Oh well.

## Which cuts?

r[n] tells you how much, not how. The s row remembers the first piece of each best cut. Cut off s[n], then look at s for the length that is left, and keep going until nothing is left. The pieces appear under the table, one cell per unit of length.

## Why the best price per unit fails

A natural greedy idea: cut off the piece with the best price per unit and repeat. Take prices 1, 5, 8, 9 and a rod of 4. Length 3 earns 8/3 per unit, the best ratio, so greedy cuts 3 and then 1: 9. Two pieces of 2 earn 10. [Show me](#play:density-fails)

```check
Q: Prices p[1..4] = 1, 5, 8, 9. Greedy by price per unit cuts a rod of length 4 into which pieces?
- 2 and 2
* 3 and 1
- 4
- 1, 1, 1 and 1
= Length 3 has the best ratio, 8/3. After cutting it off, only 1 is left. The best cut is 2 and 2, for 10.
```

## When to use it

The recurrence fits any problem where you split something into pieces whose values add up: cutting stock, splitting a budget across periods, breaking text into lines. Use the table when n is small enough to try every first piece, which is n up to a few thousand. Avoid it when cuts have costs or the pieces interact; then the value of a piece is not just p[i], and the recurrence needs more columns.

## Common mistakes

- Forgetting r[0] = 0. Every "sell the rest whole" case reads it.
- Filling r[j] before the lengths it reads. Bottom-up must go from short to long.
- Keeping only r. Without s you know the best revenue but not where to cut.
- Recursing without a memo. It works for n = 10. It does not finish for n = 40.
- Trusting the best price per unit. Sometimes it is right, and that is the dangerous part.

## Try this

- [Longer pieces are worth more](#example:sell-whole) and [short pieces are worth more](#example:all-ones): where does s point in each?
- [Length 10](#example:longest). Count the arcs: 55 sums.
- Type `2 5 7 8 10`, press **Set prices**, switch to top-down and press **Fill the table**. How many calls are memo hits?
- Press **Fill the next length** a few times and predict each r[j] before it fills.
