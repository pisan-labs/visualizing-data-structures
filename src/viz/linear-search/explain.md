# Linear search

You have a list of values in no particular order, and you want to know where 35 is. There is no shortcut. Look at the first value, then the next, until you find 35 or run out of values. That's linear search. It is the first search everyone writes, and it is what Python's `list.index`, Java's `ArrayList.indexOf` and C++'s `std::find` do.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `search(x)` | Returns the index of the first x in A, or -1 if x is not there | O(n) |

Start at `A[0]` and compare each value with x. Stop at the first match and return its index. If the loop runs off the end, return -1. The drawing keeps x above the slot being checked and fades the slots already ruled out. [Show me](#play:found)

The values can be in any order. That's the whole selling point. Binary search is much faster, but only on a sorted array.

With repeated values, the search returns the first match. [Two 3s](#example:duplicates): it returns 1 and never looks at `A[3]`. If you need every match, keep going instead of returning.

```check
Q: A holds 10 values and x is not one of them. How many times does linear search compare a value with x?
* 10
- 5
- 1
- It depends on the order of the values
= There is no way to know that x is missing without comparing it with every value. The order does not help, so it is 10 every time.
```

## Counting the work

The counters track two kinds of work. **comparisons** counts `A[i] == x`. **indexChecks** counts the loop's `i < n` test. On a miss it runs once more than the comparisons, because the last check is the one that ends the loop.

- [Found after five comparisons](#example:found): 35 is in `A[4]`, so 5 comparisons and 5 index checks.
- [In the first slot](#example:first-slot): 1 comparison. The best case.
- [Not there](#example:not-found): 6 comparisons and 7 index checks for 6 values. The worst case.

If x is there and equally likely to be in any slot, a search makes (n + 1)/2 comparisons on average, about half the array. A miss costs all n. Either way it is O(n): double the array and you double the work.

## The sentinel

Each time around, the loop asks two questions: is i still inside the array, and is `A[i]` equal to x? A sentinel gets rid of the first one. Copy x into a spare slot just past the end, `A[n]`. Now the loop is sure to find x, at `A[n]` if nowhere else, so it can run `while A[i] != x` with no bounds check at all. When it stops, a single `i < n` tells a real match from the sentinel. [Show me](#play:sentinel)

On [the same miss](#example:sentinel), that's 7 comparisons and 1 index check, instead of 6 and 7. The comparisons do not go down (the extra one is with the sentinel itself); the index checks do. Knuth calls this version Algorithm Q, quick sequential search, in volume 3 of *The Art of Computer Programming*. Turn on the **Sentinel** option to try it on your own values.

The catch: you need a spare slot you are allowed to write into, and the array changes while the search runs. That rules it out for an array you only borrowed, say a `const` one or one another thread is reading. I would not expect a big speedup on a modern machine either. Measure before you bother.

```check
Q: What does the sentinel save?
* The i < n check each time around the loop
- Comparisons with x
- Looking at every value when x is missing
= Every value is still compared with x, and a miss still looks at all of them, plus the sentinel. Only the bounds check goes, apart from one at the end.
```

## When to use it

- The values are not sorted, and you will search them once or twice. Sorting first costs O(n log n), which only pays off if you then search many times.
- The array is small. For a handful of values, a plain loop is hard to beat.
- You cannot jump to the middle: a linked list, a file read from the front, a stream.

If you search the same values over and over, sort them once and use binary search, or put them in a hash table.

## Common mistakes

- Returning -1 in an `else` inside the loop. The search then gives up at the first value that is not x.
- Looping while `i <= n`, which reads one past the end.
- With a sentinel, leaving out the final `i < n` check. A miss then looks like a match at index n.
- Sorting an array just to search it once.

## Try this

- [Found after five comparisons](#example:found). Before each step, say whether the loop stops.
- [Not there](#example:not-found), then [the same search with a sentinel](#example:sentinel). Compare the counters.
- [Two 3s](#example:duplicates).
- Load 20 random values and search for one that is not there. How many comparisons? Now search for the value in `A[10]`.
