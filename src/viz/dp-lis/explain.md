# Longest increasing subsequence

Given a sequence of numbers, find the longest subsequence whose values strictly increase. A subsequence keeps the order but may skip values: in 5, 2, 8, 6, 3, 6, 9, 7 one answer is 2, 3, 6, 9. There are 2ⁿ subsequences, so trying them all stops being fun around n = 30.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the table (O(n²)) | L[i] and P[i] for every position | Θ(n²) |
| Fill the table (tails) | The same, with binary search | O(n log n) |
| Trace back | Follows P from the end of a longest run | O(n) |

Let L[i] be the length of the longest increasing subsequence that ends exactly at a[i]. Whatever comes before a[i] in that run ends at some earlier a[j] < a[i], and the run up to a[j] should be as long as possible. So

L[i] = 1 + the largest L[j] over j < i with a[j] < a[i], or 1 if there is no such j.

The answer is the largest L[i] anywhere, since the LIS has to end somewhere. P[i] remembers which j gave the best, so we can find the run again.

## Filling the table

Fill L from left to right. For each position, compare it with every earlier one: the gray arc is the comparison, the blue arc the best predecessor so far. [Show me](#play:length-four)

```check
Q: The sequence is 4, 1, 3, 2, 5. What is L[5], for the value 5?
- 2
* 3
- 4
- 5
= 5 can follow anything before it. The best is 3 or 2, each with L = 2 (after 1), so L[5] = 3.
```

## Binary search over tails

The O(n²) method compares every pair. There is a cleverer way. Keep an array tails, where tails[k] is the smallest value that ends an increasing run of length k. Smaller tails are better: they leave more room for what comes next. tails is always sorted, so for each new value x, binary search for the first tail that is not smaller than x, and put x there. If x is bigger than every tail, it goes at the end, and the longest run just got longer. Pick **binary search over tails** under Options. [Show me](#play:patience)

It is also called patience sorting, after the card game: each tail is the top card of a pile, and a card goes on the leftmost pile whose top is not smaller.

The length of tails is the length of the LIS. tails itself is not the answer. After 3, 4, 5, 1 it holds 1, 4, 5, and 1 comes after 5 in the sequence. [Have a look](#example:tails-not-lis). To get a real subsequence, each value remembers the tail before it when it was placed, which is P again.

```check
Q: After 5, 2, 8, 6, 3, what is in tails?
- 2, 3, 6, 8
- 5, 8
* 2, 3
- 2, 6
= 5, then 2 replaces it. 8 goes at the end. 6 replaces 8, then 3 replaces 6. tails is 2, 3.
```

## Which subsequence?

Start at the end of a longest run and follow P back, then read the values left to right. There can be several longest runs. The O(n²) walk starts at the first position with the largest L and finds 2, 3, 6, 9; the tails walk starts at the last tail and finds 2, 3, 6, 7. Both are right.

## When to use it

LIS turns up in surprising places: the longest chain of nested boxes, the fewest moves to sort by taking cards out, scheduling with two orderings, and diff tools (patience diff). Use the O(n²) table when n is a few thousand and you want to see the reasoning, and tails for anything larger: a million values take about 20 million comparisons instead of 500 billion.

## Common mistakes

- Answering L[n]. The LIS need not end at the last value; take the largest L.
- Using ≤ instead of <. That finds the longest non-decreasing subsequence, a different problem. [Equal values do not increase](#example:duplicates).
- Reporting tails as the subsequence.
- Binary searching for the first tail greater than x, instead of not smaller. With duplicates, that lets 2, 2 count as increasing.

## Try this

- [Decreasing](#example:decreasing) and [increasing](#example:increasing): the two extremes.
- [Twelve values](#example:twelve). Count the comparisons with each method.
- Type `3 1 4 1 5 9 2 6 5 3 5`, press **Set sequence** and predict the length before you fill the table.
