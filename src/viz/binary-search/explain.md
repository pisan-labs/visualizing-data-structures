# Binary search

I am thinking of a number between 1 and 100. You guess, and I say higher or lower. Start at 50, and every answer rules out half of what is left. Seven guesses are always enough. Binary search is the same game, played on a sorted array.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `search(x)` | Returns an index of x in sorted A, or -1 if x is not there | O(log n) |

Keep a window, `A[lo..hi]`, where x has to be if it is anywhere. It starts as the whole array. Look at the middle value, `A[mid]` with `mid = floor((lo + hi) / 2)`. If it is x, you are done. If it is smaller than x, x can only be to its right, so `lo = mid + 1`. If it is bigger, `hi = mid - 1`. Each look (a probe) throws away half the window. The drawing fades what has been thrown away and keeps x above the value it is compared with. [Show me](#play:found)

Halving adds up fast. 20 values take at most 5 probes, a million at most 20, a billion at most 30. In general it is at most ⌊log₂ n⌋ + 1.

## It needs sorted values

All of this rests on one comparison telling you which half to drop. That only works if A is sorted: everything left of `A[mid]` is no bigger and everything right of it is no smaller. On unsorted values, binary search can throw away the half that holds x, and it will not notice. So this page refuses to search an unsorted A and shows you where the order breaks. **Sort A** sorts it, but only when you ask. [Unsorted: refuse, then sort first](#example:unsorted)

Sorting costs O(n log n), more than one linear search. It pays off when you search the same values many times.

```check
Q: A holds 1000 sorted values. At most how many values does binary search look at?
* 10
- 32
- 500
- 1000
= 2⁹ = 512 ≤ 1000 < 1024 = 2¹⁰, so ⌊log₂ 1000⌋ + 1 = 10. Each probe halves the window, and 10 halvings take 1000 down to nothing.
```

## Down to an empty window

When x is not there, the window keeps shrinking until it is empty. In [Not there](#example:not-found), 40 is not in A: after four probes lo = 6 and hi = 5, and the search returns -1. [Show me](#play:not-found)

The empty window still tells you something. Everything left of lo is smaller than x and everything from lo on is bigger, so lo is where x would go to keep A sorted. Java's `Arrays.binarySearch` returns that too: on a miss it returns `-(lo + 1)`. [Where 40 would go](#example:insertion-point) returns -7. The -1 is there so that "it would go at 0" (-1) is not mixed up with "found it at 0" (0). Set **What to return** to Insertion point to try it.

```check
Q: A search misses, and the window ends empty with lo = hi + 1. What is lo?
* Where x would go: the index of the first value bigger than x
- The index of the value closest to x
- Always n, one past the end
- -1
= Everything left of lo is smaller than x and everything from lo on is bigger, so x belongs at lo. That is the insertion point.
```

## Repeated values

With repeated values, an exact match can stop at any copy. In [Five 7s](#example:duplicates), the first probe hits `A[3] = 7` and returns 3, though the first 7 is in `A[1]`. That is a correct answer, just maybe not the one you wanted.

**First occurrence** treats a match as a candidate. It remembers it in r and keeps looking left. [Show me](#play:first-occurrence)

**Lower bound** and **upper bound** never stop early. They narrow the window until it is empty and return lo: the first value ≥ x for lower bound, the first value > x for upper bound. Their window is half-open, `A[lo..hi-1]`, so hi starts at n, one past the end, and `hi = mid` keeps mid as a candidate. On the same values, [lower bound](#example:lower-bound) returns 1 and [upper bound](#example:upper-bound) returns 6, so there are 6 - 1 = 5 sevens. C++'s `std::lower_bound` and `std::upper_bound` and Python's `bisect_left` and `bisect_right` are these two.

## Loop or recursion

The **Style** option switches to a recursive version. Each call makes one probe and then calls itself on the half that is left; the brackets at the top are the calls waiting on each other. [Recursive: one call per probe](#example:recursive) searches 20 values for 70, which is not there: five probes, then a sixth call with an empty window returns -1, and every call passes the -1 back up. [Show me](#play:recursive)

The calls are at most ⌊log₂ n⌋ + 2 deep, so the stack is never a problem. Each call either answers or hands the rest of the work to one more call, so the loop and the recursion make the same probes. Most libraries use the loop.

## Common mistakes

Binary search is short and easy to get wrong. Jon Bentley gave it as an exercise to professional programmers (it is in *Programming Pearls*), and about 90% of them found bugs in their own programs. The usual suspects:

- Searching values that are not sorted.
- Mixing up the two windows. With `while lo <= hi`, the window is `A[lo..hi]` and a miss on the left means `hi = mid - 1`. With `while lo < hi`, it is `A[lo..hi-1]` and you write `hi = mid`. Use `hi = mid` with `lo <= hi`, and the loop can run forever once lo = hi.
- `lo = mid` instead of `lo = mid + 1`. When hi = lo + 1, mid = lo, and the window can stop shrinking.
- Overflow. In Java or C++, `(lo + hi) / 2` overflows when lo + hi is bigger than the largest int. Joshua Bloch wrote in 2006 that Java's own `Arrays.binarySearch` had this bug for years. Write `lo + (hi - lo) / 2`.
- Expecting the first copy of x from an exact match.

## Try this

- [Found on the fourth probe](#example:found). Before each probe, say which half goes.
- [Right in the middle](#example:first-probe): the best case, one probe.
- [Not there](#example:not-found). Then set **What to return** to Insertion point and run it again.
- [Five 7s](#example:duplicates) with each of the five ways to return.
- [Unsorted: refuse, then sort first](#example:unsorted).
- Start over with 20 sorted values and one that is not there. Count the probes. Can you make it take more than 5?
