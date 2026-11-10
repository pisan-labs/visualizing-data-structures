# Quicksort

Pick a value, the pivot. Move everything smaller to its left and everything bigger to its right. The pivot is now exactly where it belongs, and the two sides can be sorted on their own, the same way. Tony Hoare came up with it around 1960, and some version of it still sits inside many standard libraries.

Merge sort does its work on the way back up, when it merges. Quicksort does its work on the way down, when it partitions. Once the calls bottom out, there is nothing left to do.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts the n values in A, in place | O(n log n) on average; O(n²) in the worst case |

`quicksort(A, p, r)` partitions `A[p..r]` around a pivot, then sorts the part left of the pivot and the part right of it. The brackets at the top are the call stack. Each call partitions its range, and the drawing shades the two parts as they grow: values known to be ≤ the pivot, and values known to be bigger. [Show me](#play:lomuto)

## Lomuto's partition

CLRS uses this one. The pivot x is the last value, `A[r]`. The index i marks the end of the ≤ x part, and j looks at every other value in turn. When `A[j] ≤ x`, i moves up one and `A[j]` is swapped into the ≤ part. When j is done, swapping the pivot into `A[i + 1]` puts it between the two parts, in its final place, which is why the pivot turns green.

```check
Q: Lomuto's partition runs once on 38 81 22 57 13 64 49 30, with the last value as pivot. Where does 30 end up?
- A[0]
* A[2]
- A[3]
- A[7]
= Only two values, 22 and 13, are not bigger than 30. They end up in A[0] and A[1], and the pivot goes right after them.
```

## The worst case, and how to dodge it

Quicksort is fast when the pivot splits its range roughly in half: about log₂ n levels of calls, each doing O(n) work. It is slow when the pivot is the smallest or largest value, because then one side is empty and the other has everything else.

With the last value as pivot, [sorted input](#example:sorted-worst) is the worst case. Every pivot is the largest value left, every partition peels off one value, and the calls go n - 1 deep: 28 comparisons and 7 levels for 8 values. Watch the call stack turn into a staircase. [Show me](#play:sorted-worst)

The **Pivot** option has the usual fixes. The median of the first, middle and last values is the middle value on sorted input, so [median of three](#example:median-of-three) splits evenly: 13 comparisons, 3 levels. A [random pivot](#example:random-pivot) makes the worst case very unlikely on any input; on average it costs about 1.39 n log₂ n comparisons. The random pivots here come from the example's seed, so a replay picks the same ones.

```check
Q: Quicksort with the last value as pivot runs on 10 20 30 40 50. How many comparisons does it make?
- 5
- 7
* 10
- 25
= Each partition compares every value with the pivot and peels off only the pivot: 4 + 3 + 2 + 1 = 10.
```

## Hoare's partition

Hoare's original scheme uses the first value as pivot and two indices that walk toward each other. j walks left past values bigger than the pivot, i walks right past values smaller than it, and when both stop, the two values swap. When the indices cross, the range splits at j. The pivot is not necessarily in its final place yet, so both parts, `A[p..q]` and `A[q+1..r]`, get sorted. [Show me](#play:hoare)

Hoare's version swaps less: 7 swaps to Lomuto's 13 on the example. The swaps counter skips a value swapped with itself (Lomuto's i and j on the same slot, or a pivot already in place), so with the last value as pivot, sorted input shows 0 swaps. It also behaves better when many values are equal. With [all values equal](#example:all-equal), Lomuto puts every value on the ≤ side and gets the staircase again, while Hoare's indices stop at every value and meet in the middle.

## When to use it

For sorting arrays in memory, quicksort with a sensible pivot is usually the fastest of the comparison sorts. It sorts in place, and its inner loop is tight. The catches: it is not stable, and a bad pivot rule turns it quadratic, which is why real libraries pick pivots carefully. C++'s `std::sort` is usually an introsort: quicksort that switches to heap sort if the calls get too deep.

If you need a guarantee or stability, use merge sort.

## Common mistakes

- Recursing on `A[p..q]` after Lomuto's partition. The pivot is already in `A[q]`; including it again can recurse forever.
- Recursing on `A[p..q - 1]` after Hoare's partition. Hoare's split point is not the pivot, so that skips a value.
- Using the last value as pivot with Hoare's loop as written. If it is the largest value, the range comes back unsplit and the recursion never ends. Move the pivot to the front first, as the **Pivot** option does here.
- Forgetting that the call stack can go n deep. Recursing on the smaller side first and looping on the bigger one keeps it at O(log n).

## Try this

- [Partition around the last value](#example:lomuto). Before each partition ends, predict where the pivot lands.
- [Sorted input](#example:sorted-worst), the worst case, then the same input with [median of three](#example:median-of-three) and with [a random pivot](#example:random-pivot).
- [Hoare's partition](#example:hoare). Switch to Lomuto's and compare the counters.
- [All values equal](#example:all-equal). Switch to Hoare's partition.
- Set the detail level to Milestones. Each step is then one finished partition.
