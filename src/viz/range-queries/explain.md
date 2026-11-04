# Prefix sums and sparse tables

You have an array that does not change, and a lot of questions about it. What is the sum of `A[2]` through `A[5]`? What is the smallest value between positions 3 and 11? A loop answers each question in O(n): it reads every value in the range. Ask again and it reads them all again. Loops have no memory.

The fix is to do the work once. Build a table in one pass, and then every question is a couple of lookups. Prefix sums do this for sums, and a sparse table does it for minimums. The **Structure** option switches between the two.

## The operations

| Operation | Prefix sums | Sparse table |
|---|---|---|
| `build(A)` | O(n) | O(n log n) |
| `sum(i, j)` or `min(i, j)` | O(1) | O(1) |
| `update(i, x)` | O(n) | O(n) |
| Extra space | n + 1 entries | O(n log n) entries |

Queries are cheap and updates are not. These are structures for arrays that stay put.

## Prefix sums

`P[k]` is the sum of the first k values: `A[0] + A[1] + … + A[k − 1]`. Written as a range, that is `A[0..k)`, 0-based and half-open: it starts at `A[0]` and stops just before `A[k]`. So P has n + 1 entries, and `P[0] = 0`, the sum of no values at all. Building it is one loop, `P[k + 1] = P[k] + A[k]`, one addition per value.

Now take `sum(i, j)`, the sum of `A[i]` through `A[j]`, both ends included. `P[j + 1]` adds up everything from `A[0]` to `A[j]`. `P[i]` adds up everything before `A[i]`. Subtract, and the values before i cancel:

`sum(i, j) = P[j + 1] − P[i]`

One subtraction, whether the range has two values or two million. In the drawing, `P[k]` sits under the edge between `A[k − 1]` and `A[k]`, where its sum stops, and a query draws two arrows from the left end: the long one is `P[j + 1]`, the short one is `P[i]`. The part where they overlap is what cancels. [Show me](#play:sum-cancels).

```check
Q: A = [5, 3, 8, 1], so P = [0, 5, 8, 16, 17]. What is sum(1, 2)?
- 8
* 11
- 13
- 16
= sum(1, 2) = P[3] − P[1] = 16 − 5 = 11, which is 3 + 8.
```

## Why j + 1?

Because P counts values, and the range `A[i..j]` ends after `A[j]`. Off-by-one errors are also called fencepost errors, and prefix sums are a good place to collect them. Think of the n + 1 edges between and around the cells as fence posts numbered 0 to n. `P[k]` is the sum of everything left of post k. The range from `A[i]` to `A[j]` runs from post i to post j + 1.

The edge cases are where the formula proves itself. [A query of the whole array](#example:whole-array) is `P[n] − P[0]`, and `P[0]` is 0. [A range of one cell](#example:single-cell) is the difference of two neighbors in P, which is that one value.

Some books start A at 1 and keep `P[0] = 0`. Then `P[k]` is the sum of `A[1..k]` and the formula becomes `P[j] − P[i − 1]`. Same idea, different fence posts. Pick one convention per program.

## Sparse tables

Minimums do not subtract. Knowing the smallest value in `A[0..9]` and in `A[0..3]` tells you nothing about `A[4..9]`. So the sparse table stores minimums of windows instead, but only windows whose length is a power of two.

`M[k][i]` is the smallest of the 2^k values that start at `A[i]`. Row k = 0 is A itself: a window of one value is its own minimum. Every later row comes from the row above it, because a window of 2^k values is two windows of 2^(k − 1) side by side:

`M[k][i] = min(M[k − 1][i], M[k − 1][i + 2^(k − 1)])`

Row k has n − 2^k + 1 windows, and there are ⌊log₂ n⌋ rows above A. For 16 values that is 15 + 13 + 9 + 1 = 38 calls to min. [Show me](#play:sparse-build).

## Two windows that overlap

To answer `min(i, j)`, find the longest power of two that fits in the range: `k = ⌊log₂(j − i + 1)⌋`. One window of 2^k values starts at i. Another ends at j, so it starts at `j − 2^k + 1`. Two windows that long always cover the range, since 2^(k + 1) would not have fit. They usually overlap in the middle, and for a minimum that does no harm. The smallest value is the smallest value, even if you look at it twice.

[Show me](#play:min-overlap) a range of 10 values covered by two windows of 8. When the length is a power of two, both windows are the same one. [A range whose length is a power of two](#example:min-power-of-two).

```check
Q: Why can a sparse table answer min(i, j) with two windows that overlap, but not sum(i, j)?
- Sums need longer windows than minimums
* The values in the overlap would be counted twice, which changes a sum but not a minimum
- A sparse table cannot store negative numbers
= min(x, x) is x, but x + x is 2x. Overlapping is safe for min, max and gcd, and wrong for sums.
```

## When the array changes

Change one value and the table is out of date. With prefix sums, every `P[k]` with k > i includes `A[i]`, so all of them change. [The worst update](#play:update-first-cell) is `A[0]`, which every prefix includes. With a sparse table, row k has up to 2^k windows that contain position i, and those add up to about 2n for a position in the middle. [One change touches many windows](#example:sparse-update).

Either way an update is O(n), the same as answering a query with a loop. If your array changes as often as you query it, you want a structure that does both in O(log n): a [Fenwick tree](/fenwick-tree/) for sums, or a [segment tree](/segment-tree/) for sums, minimums and more. [Change a value, then query](#example:update-then-query) shows what you would be giving up.

## Variants

- **Two dimensions.** `P[r][c]` holds the sum of the rectangle above and left of (r, c). Any rectangle's sum is then four lookups. Image processing calls this a summed-area table or an integral image.
- **Difference arrays** run prefix sums backward. To add x to `A[i..j]` many times, add x to `D[i]` and subtract it from `D[j + 1]`, then take the prefix sums of D once at the end.
- **Other operations.** A sparse table works for any operation where looking at a value twice does no harm: min, max, gcd, bitwise and, bitwise or. For sums it can still help, if you split the range into windows that do not overlap, one per set bit of the length. That costs O(log n) per query.
- **Other names.** Prefix sums are also called running totals, cumulative sums or a scan. Python has `itertools.accumulate`, C++ has `std::partial_sum`, and Java has `Arrays.parallelPrefix`.

## When to use them, and when not to

Use prefix sums when the array is fixed and you will ask for many range sums: rainfall by month, sales by day, the number of 1s in a bit string. The build pays for itself after a handful of queries. Use a sparse table for many range minimums or maximums on a fixed array. Range minimum queries also turn up inside other algorithms, such as finding the lowest common ancestor of two nodes in a tree.

Avoid both when the array keeps changing, and avoid both for a single query, where a loop is simpler and just as fast. A sparse table also costs memory: 16 values need 38 extra entries, and a million values need about 18 million.

## Common mistakes

- Writing `P[j] − P[i]`. That leaves out `A[j]`.
- Making P the same length as A. It needs n + 1 entries, and `P[0] = 0`.
- Using `P[i − 1]` with 0-based arrays. When i = 0, there is no `P[−1]`.
- Overflow. The values may fit in an int while their total does not; the code tabs use 64-bit sums.
- Using two overlapping windows for a sum. They count the overlap twice.
- Computing ⌊log₂⌋ with floating point. Use the position of the highest set bit, or precompute a small table of logs.
- Updating a sparse table and expecting it to be cheap.

## Try this

- [The part before i cancels out](#example:sum-cancels). Before pressing play, say which two entries of P the query uses.
- [A query of the whole array](#example:whole-array) and [a range of one cell](#example:single-cell). Check that the formula still works at the edges.
- [Two windows that overlap](#example:min-overlap). Which values are looked at twice?
- [One change touches many windows](#example:sparse-update). Count the windows in each row before you play it.
- Start over with **Random values** and 16 values, then switch **Structure** in Options. Query the same range both ways.
