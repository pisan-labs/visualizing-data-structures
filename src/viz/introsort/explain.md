# Introsort

Quicksort is the fastest comparison sort on most inputs and quadratic on a few. Heap sort is never quadratic and usually slower. Insertion sort is slow in general and quick on a handful of values. David Musser's idea (1997) was to stop choosing: run quicksort, keep an eye on it, and call in the other two when they do better. That is introsort, short for introspective sort, and it is what C++'s `std::sort` does.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts A in place | O(n log n) best, average and worst |

Each call of quicksort gets a depth budget. The top call gets 2⌊log₂ n⌋, and every recursive call gets one less. Then each call on `A[p..r]` does one of three things:

1. **Small part** (at most k values): insertion sort it and stop.
2. **Budget used up**: heap sort it and stop.
3. **Otherwise**: partition around a median-of-3 pivot, and recurse on both sides with one less budget.

The brackets at the top are the calls waiting on each other, so the stack's height is the depth. The labels say who is handling each part, and the swaps counter adds up the swaps of all three; a value swapped with itself is not counted. [Random values](#example:typical) never gets near its budget of 6: quicksort does the work and insertion sort tidies up. [Show me](#play:typical)

## Why a depth budget

A good quicksort splits roughly in half, so its calls go about log₂ n deep. Twice that deep means the pivots have been bad again and again: this is heading for O(n²). So introsort cuts its losses. Whatever is left goes to heap sort, which is O(m log m) on a part of m values no matter what.

The cost adds up to O(n log n) in the worst case. Quicksort does at most 2 log₂ n levels of partitioning, each O(n) work in total. Heap sort finishes the leftover parts in O(n log n) at most.

```check
Q: Introsort sorts 1000 values. How deep can quicksort go before heap sort takes over?
- 10
* 18
- 32
- 500
= ⌊log₂ 1000⌋ = 9, and the budget is twice that, 18.
```

## A killer input

Median-of-3 makes the classic bad inputs (sorted, reverse sorted) harmless, which is why libraries use it. It does not make quicksort safe. In 1999 Doug McIlroy published "A killer adversary for quicksort": a comparison function that makes up the values as the sort asks about them, always giving the answer that hurts most. Run the sort once with it, write down the values it settled on, and you have an input that kills that quicksort.

The preset **Median-of-3 killer** builds one against this page's quicksort, for whatever size and settings you have. Each partition peels off only two values. In [A median-of-3 killer](#example:killer), the 20 values reach depth 8 with 4 values still unsorted, the budget is gone, and heap sort finishes them. [Show me](#play:killer)

With a budget of ⌊log₂ n⌋ instead, heap sort takes over at depth 4 on 12 values: [A smaller budget switches sooner](#example:short-budget). Musser picked 2⌊log₂ n⌋ so that quicksort gets a fair chance first.

The same rescue works for plain quicksort's worst case. [Sorted input with the last value as pivot](#example:sorted-last) peels off one value per level; at depth 8 heap sort takes the last 8.

```check
Q: Why does introsort keep quicksort at all, if heap sort is never quadratic?
- Heap sort is not in place
* Quicksort is faster on almost every input, so heap sort is only the safety net
- Heap sort cannot sort small arrays
- Quicksort is stable
= Quicksort's inner loop is tight and cache friendly. Heap sort jumps around the array and is usually slower, so introsort calls it only when quicksort is clearly in trouble.
```

## The small parts

Recursion has overhead, and for a handful of values insertion sort beats it. So parts of at most k values go to insertion sort. Libraries use k = 16. With at most 20 values here, 16 would leave quicksort nothing to do, so the page starts at 3 and lets you raise it: [Bigger small parts](#example:small-parts) uses 6.

Musser's version skips the small parts completely and runs one insertion sort over the whole array at the end. Every value is then within k slots of its place, so that last pass is O(nk). This page sorts each small part right away, which is easier to follow and does the same work.

## Costs and properties

- O(n log n) in every case.
- In place. The call stack is O(log n) deep, since the budget caps it.
- Not stable. Partitioning swaps values across long distances. [Equal values can change order](#example:unstable)

## When to use it

Whenever you call `std::sort` in C++, or `Array.Sort` in .NET, you are using it. It is the right default when you need an in-place sort and do not need stability. When you do need stability, look at merge sort or Timsort (Python's and Java's object sort).

## Common mistakes

- Thinking median-of-3 makes quicksort safe. It does not; it moves the bad inputs somewhere harder to find. McIlroy's adversary finds them.
- Setting the budget from the size of the part instead of the whole array. The budget counts down from 2⌊log₂ n⌋ for the original n.
- Forgetting that heap sort works on a part, `A[p..r]`, so the heap's index arithmetic needs the offset p.
- Expecting it to be stable.

## Try this

- [Random values](#example:typical). Watch the stack height against the budget in the variables.
- [A median-of-3 killer](#example:killer). Then set **Pivot** to the last value and load the preset **Sorted, for the last-value pivot**.
- Load the preset **Median-of-3 killer** at size 20, then switch **Depth budget** to ⌊log₂ n⌋ and load it again.
- Raise **Insertion sort parts of at most** to 8 and see how much quicksort is left with.
