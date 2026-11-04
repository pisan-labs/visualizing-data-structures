# Merge sort

Merge sort splits the array in half, sorts each half, and then merges the two sorted halves into one. Sorting each half is the same problem again, smaller, so the halves get split too, all the way down to single values. A single value is already sorted, which is where the recursion stops. All the real work happens in the merge, on the way back up.

John von Neumann came up with it in 1945. It is still the sort behind a lot of real libraries.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts the n values in A | O(n log n) on every input; O(n) extra space |

`mergeSort(A, p, r)` sorts `A[p..r]`. If the range has one value, there is nothing to do. Otherwise it splits at `q = floor((p + r) / 2)`, sorts `A[p..q]`, sorts `A[q+1..r]`, and merges them. The brackets at the top of the drawing are the call stack: the long one at the top is the first call, and each bracket below it is a call it is waiting on. [Show me](#play:top-down)

## The merge

Merging two sorted runs is easy, and it is fast. Copy them into L and R. Then look at the front of each one, move the smaller value into `A[k]`, and step forward in that run. When one run is used up, copy what is left of the other. Every comparison places one value, so merging n values takes at most n - 1 comparisons.

In the drawing, L and R sit in the row under A, right below the slots they came from. The values travel down into L and R and back up into A in order. The faded numbers left in A are old copies; the merge writes over them.

Older editions of CLRS put a sentinel, ∞, at the end of L and R, so the loop never has to check whether a run is empty. The version here copies the leftovers instead, which needs no fake value.

```check
Q: How many comparisons does merge make to combine L = 1 2 3 with R = 4 5 6?
* 3
- 5
- 6
- 9
= Each comparison takes from L, and after three of them L is empty. The rest of R is copied without comparing anything.
```

## Bottom-up

The recursion only decides which pairs of runs get merged, and in what order. You can do the same thing with two loops. First merge pairs of single values into runs of 2, then pairs of runs of 2 into runs of 4, and so on until one run is left. No call stack. The **Style** option switches to it, and the brackets then show the runs being merged and the runs they become. [Show me](#play:bottom-up)

## What it costs

Splitting in half gives about log₂ n levels of calls, and the merges on each level handle all n values once. That is O(n log n) whatever the input looks like.

The input does change the number of comparisons, a little. [Sorted input](#example:sorted-input) empties L first in every merge: 12 comparisons for 8 values. [Interleaved values](#example:worst-case) keep both runs going to the end: 17 comparisons, the most merge sort ever needs on 8 values. Both make the same 24 writes, because every value is written once per level. Uneven halves, like [seven values](#example:odd-size), are no problem; the merge does not care how long L and R are.

The price is memory: L and R need room for up to n values. Merge sort is stable, because on a tie the merge takes from L, and L holds the values that came first. [Show me](#play:duplicates)

```check
Q: Which 8 values make merge sort do the most comparisons?
- 80 70 60 50 40 30 20 10
* 10 50 30 70 20 60 40 80
- 10 20 30 40 50 60 70 80
= Reverse order empties R first in every merge, just as sorted input empties L first: 12 comparisons each. The interleaved values keep both runs going to the end of every merge: 17.
```

## When to use it

When you need a guaranteed O(n log n), or a stable sort, or both. Python's built-in sort and Java's sort for objects are both built on merging (Timsort), and they are stable for that reason. Merge sort also works well on linked lists, where merging needs no extra space, and on data too big for memory, where you sort chunks and then merge them from disk.

Avoid it when memory is tight. For arrays of plain numbers, a good quicksort is usually faster in practice, since it sorts in place.

## Common mistakes

- Splitting at `(p + r) / 2` and then recursing on `A[p..q - 1]`, which loses `A[q]`. The halves are `A[p..q]` and `A[q+1..r]`.
- Forgetting to copy the leftovers after the main loop. The sorted array then has old copies at the end.
- Using `<` instead of `<=` when comparing the fronts. It still sorts, but it is no longer stable.
- Allocating new L and R arrays on every call in a tight loop. Real implementations allocate one helper array once and reuse it.

## Try this

- [Split, sort the halves, merge](#example:top-down). Before each merge, predict the order the values come back up.
- [Bottom-up: runs of 1, 2, 4, 8](#example:bottom-up). Same values, no recursion.
- [Sorted input](#example:sorted-input) and [interleaved runs](#example:worst-case): count the comparisons.
- [Seven values](#example:odd-size): uneven halves.
- [Ties go to L](#example:duplicates).
- Set the detail level to Milestones. Each step is then one finished merge.
