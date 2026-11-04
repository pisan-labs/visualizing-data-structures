# Cocktail shaker sort

Cocktail shaker sort is bubble sort that changes direction after every pass. The forward pass walks left to right and carries the largest value to the end. The backward pass walks right to left and carries the smallest value to the front. Back and forth, like a cocktail shaker, until a pass finds nothing to swap.

You will also see it called shaker sort or bidirectional bubble sort.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts the n values in A, in place | O(n²); O(n) on sorted input |

Two indices, `lo` and `hi`, mark the part of the array that may still be out of order. Each forward pass fixes `A[hi]` and moves `hi` in by one. Each backward pass fixes `A[lo]` and moves `lo` in by one. The green parts of the drawing grow from both ends until they meet. [Show me](#play:shaker)

## Rabbits and turtles

Why bother going backwards? Bubble sort that walks from the front has a lopsided problem. A large value near the front races to the end in a single pass; people call it a rabbit. A small value near the end moves one step to the left per pass, no matter what; that one is a turtle. (Walk from the back, as CLRS does, and the roles flip: a large value near the front becomes the turtle.)

[A small value stuck at the end](#example:turtle) is the extreme case: 20, 30, 40, 50, 60, 70, 80 and then 10. Bubble sort walking from the front needs all 7 passes and 28 comparisons to walk the 10 home. Cocktail shaker sort carries it to `A[0]` in its first backward pass and is done after 18 comparisons. [Show me](#play:turtle)

```check
Q: Cocktail shaker sort runs on 20, 30, 40, 50, 60, 70, 80, 10. How many passes does it make?
- 2
* 3
- 7
- 8
= The first forward pass moves 80 to the end, the backward pass carries 10 to the front, and the third pass finds nothing to swap, so the sort stops.
```

## Shrinking to the last swap

After a forward pass, everything after the last swap is already in place, not just `A[hi]`. So instead of `hi = hi - 1`, we can set `hi` to where the pass last swapped, and do the same for `lo` on the way back. When only the middle of the array is out of order, the sorted ends get one look and are never touched again. On [this example](#example:last-swap) that is 15 comparisons instead of 24. Switch between the two rules with **After each pass, shrink the window**.

## What it costs

Cocktail shaker sort saves comparisons, not swaps. Each swap of two neighbors fixes exactly one pair that was out of order, which is the same deal bubble sort gets, so on the same input both make exactly the same number of swaps.

The worst case is reverse order. Nothing is gained from the second direction: 9 values take 36 comparisons and 36 swaps, n(n - 1)/2 of each. [Show me](#play:reverse)

On random input it is still O(n²). On [sorted input](#example:already-sorted) the first forward pass finds no swaps and stops after n - 1 comparisons, so the best case is O(n). Extra space is O(1), and since neighbors swap only when they are strictly out of order, [equal values keep their order](#example:duplicates). It is stable.

```check
Q: Compared with bubble sort on the same input, how many swaps does cocktail shaker sort make?
- About half as many
* Exactly the same number
- More, because it walks in both directions
= Every swap of neighbors fixes exactly one out-of-order pair, so both sorts make one swap per inversion. Cocktail shaker sort can only save comparisons.
```

## When to use it

Almost never, for the same reasons as bubble sort. If you need a simple O(n²) sort, insertion sort is faster and just as short. Cocktail shaker sort is worth a look as the obvious fix for turtles, and as a reminder that fixing one bad input does not change the worst case.

## Common mistakes

- Forgetting to move `lo` after the backward pass. The sort still works, but the backward passes keep checking the front for nothing.
- Getting the bounds of the backward loop wrong: it compares `A[j]` with `A[j - 1]`, so j stops at `lo + 1`.
- Checking for "no swaps" only once per round. A pass that swaps nothing already means the array is sorted.
- Expecting fewer swaps than bubble sort. It makes the same number.

## Try this

- [A small value stuck at the end](#example:turtle). Predict where 10 is after the first backward pass.
- [Back and forth](#example:shaker) on random values. Watch the window close from both sides.
- [Sorted input](#example:already-sorted): one pass.
- [Reverse order](#example:reverse): no help from the second direction.
- [Shrinking to the last swap](#example:last-swap). Then switch the option back to "by one" and count the extra comparisons.
- [Equal values keep their order](#example:duplicates).
- Load `15 25 35 45 55 65 75 85 95 5` here, then on the bubble sort page with passes walking from the front. Compare the counters.
