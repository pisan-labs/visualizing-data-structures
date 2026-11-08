# Timsort

Real data is rarely random. Logs arrive mostly in time order, a sorted list gets a few new items at the end, a spreadsheet column was sorted last week. Tim Peters wrote Timsort for Python in 2002 to take advantage of that: find the order that is already there, and only do the work that is left. It is now the sort behind Python's `sorted`, Java's sort for objects, Android and V8.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts A, stably | O(n) best, O(n log n) average and worst |

Timsort is a merge sort that starts from runs instead of single values.

1. **Find a natural run** at the front of what is left: values that never go down, or values that strictly go down (those get reversed in place).
2. **Grow short runs.** A run shorter than minrun is extended to minrun values with binary insertion sort.
3. **Push the run on a stack**, and merge runs off the stack when its rules say so.
4. At the end, merge everything left on the stack.

The shaded bands are the runs on the stack, labeled X (top), Y, Z and W with their lengths. [Natural runs: up, down, up](#example:natural-runs) has a rising run of 4, a falling run of 4 that gets reversed, and some short bits. [Show me](#play:natural-runs)

If the input is already sorted, step 1 finds one run of n values and that is the end of it: n - 1 comparisons, no merges. [Sorted input](#example:sorted)

## Short runs and minrun

Random values make runs of two or three. Merging hundreds of tiny runs would be slow, so Timsort grows each run to minrun values first, using binary insertion sort: binary search for where the next value goes, then shift. Insertion sort is quick on a few values, and it is stable. [Random values](#example:short-runs) builds runs of 4 this way.

Real Timsort picks minrun between 32 and 64 from n, so that n / minrun is a power of two or just under one (the merges then stay balanced). It sorts anything under 64 values with one binary insertion sort and never merges at all. With at most 20 values here, that would show nothing, so this page lets you set minrun from 2 to 8.

## The stack and its rules

Which runs should merge, and when? Merging a run of 1000 with a run of 3 wastes a pass over the 1000. Timsort wants merges between runs of similar size, like merge sort's halves. It also does not want to hold on to runs forever, because it has to remember them.

So the stack has two rules, with X on top, then Y, then Z:

- |Z| > |Y| + |X|
- |Y| > |X|

When a new run breaks a rule, Y merges with the shorter of its neighbors, and Timsort checks again. When both rules hold, the run lengths grow at least as fast as Fibonacci numbers going down the stack. So the stack is never more than about log₁.₆ n runs deep, and runs that merge are close in size.

[The stack keeps its runs growing](#example:stack-invariant) gets runs of 8, 4 and 4. The third breaks the first rule, |Z| = 8 ≤ 4 + 4, so Y and X merge into 8. Then |Y| = 8 ≤ |X| = 8, so those merge too. [Show me](#play:stack-invariant)

A bit of history: in 2015, Stijn de Gouw and colleagues tried to prove Timsort correct and found that checking only the top three runs is not enough. The rules can fail deeper in the stack, and Java's version could overflow its fixed-size stack on carefully built input. The fix adds one more check, on W: |W| > |Z| + |Y|. This page includes it. (Python has since moved to a different merge rule, powersort, for 3.11 and later; the idea is the same.)

```check
Q: The stack holds runs of length 9, 5 and 3, with 3 on top. A run of 2 is pushed. What happens?
- Nothing: every run is longer than the one above it
- Only 3 and 2 merge
* The merges cascade until one run of 19 is left
- 9 and 5 merge
= Z = 5 ≤ 3 + 2, so 3 and 2 merge: 9, 5, 5. Now 9 ≤ 5 + 5, so the two 5s merge: 9, 10. Now |Y| = 9 ≤ |X| = 10, so those merge too: 19.
```

## Merging, and galloping

To merge two neighboring runs, Timsort copies the left one to tmp (the second row) and fills A from the left, taking the smaller front value each time. On a tie it takes from tmp, the left run, which keeps the sort stable. (Real Timsort copies whichever run is shorter, and merges from the right when that is the right run. This page always copies the left one.)

Before copying anything, it gallops. That is exponential search, the jumps of 1, 3, 7, 15, ... you can see on the exponential search page. It finds how much of the front of the left run is already ≤ the right run's first value, and how much of the back of the right run is already ≥ the left run's last value. Those values are in place; skip them. In [Galloping skips what is already in place](#example:gallop), the last merge copies 2 values instead of 6 and leaves 8 values at the back untouched. Turn off **Gallop** to compare the writes. [Show me](#play:gallop)

Real Timsort also gallops in the middle of a merge, when one side wins 7 times in a row. With runs this small that almost never happens, so this page leaves it out.

```check
Q: Why does Timsort reverse only runs that strictly go down?
* So that equal values never swap places, which keeps it stable
- Because reversing is slower for equal values
- Because a run with equal values cannot be reversed
- It reverses every falling run
= Reversing 5, 3, 3 would put the second 3 in front of the first. A run that strictly falls has no equal values, so reversing it is safe.
```

## Costs and properties

- Best case O(n): one run, no merges. Reverse sorted input is one falling run, reversed: also O(n).
- Worst case O(n log n): the stack rules keep the merges balanced.
- Stable. [Equal values keep their order](#example:stable)
- Extra space O(n) in the worst case for tmp, usually much less, because galloping trims what gets copied.

## When to use it

You already do: it is the default sort in Python and for objects in Java. It shines on data with order in it, and it is never much worse than merge sort on data without. If you need an in-place sort and do not care about stability, introsort uses less memory.

## Common mistakes

- Reversing runs that are only non-increasing. Equal values then trade places, and the sort is no longer stable.
- Merging runs just because they are next to each other. Without the stack rules, merges become lopsided.
- Thinking minrun is a fixed 32. It is computed from n.
- Forgetting the extra check on W. Peters's original rules were not enough.

## Try this

- [Natural runs](#example:natural-runs): count the runs before pressing play.
- [Sorted input](#example:sorted): the best case.
- [The stack keeps its runs growing](#example:stack-invariant): predict each merge before it happens.
- Load the preset **A few long runs** at size 20, then **Random** at size 20, and compare the merges.
- Set **minrun** to 2 and to 8 on the same values. What changes?
