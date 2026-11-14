# Top k elements

You want the 10 largest of a million numbers. Sorting all of them and taking the first 10 works. It also puts 999,990 numbers in order that nobody asked about. The trick: keep the best 10 seen so far in a min-heap, and let every new number challenge the smallest of them. Most numbers lose that challenge at once, for one comparison each.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| top k, a min-heap of size k | each value challenges the root, the smallest of the best k so far | O(n log k) |
| top k, sort everything | merge sort all n values, read off the first k | Θ(n log n) |
| top k, quickselect | partition until the k-th largest is in its place | O(n) on average, Θ(n²) worst |
| extra space, the heap | the heap holds k values; the rest can stream past | O(k) |

Why a *min*-heap for the *largest* values? Because the root is the one to beat. To get into the best k, a new value only has to be bigger than the smallest of them, and a min-heap keeps that one on top. If the new value is bigger, the root drops out and the new value takes its place. If not, it is not in the top k, and you move on. [Show me](#play:best-three)

The **Approach** option switches between the three ways. All three find the same values. `comparisons` counts two values compared; `naive total`, `pattern total` and `quickselect total` say what sorting everything, the heap and quickselect cost on this input. The heap itself is the one from [binary heaps](/binary-heap/).

## How it works

1. The first k values go into the heap, each sifting up past any bigger parent.
2. Every later value x is compared with the root. If x is not bigger, skip it.
3. If x is bigger, the root drops out, x takes the root's place and sinks below any smaller child.

At the end the heap holds the k largest, in heap order, with the k-th largest at the root.

In [The 3 largest of 9](#example:best-three), A = 5 12 3 18 7 21 9 14 2 and k = 3. The heap starts with 5, 12 and 3, and 3 rises to the root. Then 18 pushes out 3, 7 pushes out 5, 21 pushes out 7 and 14 pushes out 12. 9 and 2 each lose to the root with one comparison. The heap ends with 14 at the root and 21 and 18 below it: 16 comparisons. The values that dropped out are gray in A.

```check
Q: k = 3, and the heap holds 9, 14 and 20, with 9 at the root. Next comes 11. What happens?
- 11 is skipped
* 11 replaces 9 and sinks
- 11 replaces 20
- The heap grows to 4
= 11 > 9, the smallest of the best 3, so 9 drops out. 11 takes the root and sinks below any smaller child (here it stays, since 14 and 20 are bigger).
```

## Sort everything

The naive way: sort A from largest to smallest and read off the first k. [Sort everything first](#example:sort-everything) uses merge sort, bottom up: four passes and 24 comparisons, against the heap's 16. Sorting does not care what k is. It does the same work for k = 1.

Does the heap always win? Nope. In [Rising values](#example:rising-values) every value beats the root and sinks to a leaf: 3 comparisons each, 20 in all. Merge sort does that input in 13. On 9 values the constants decide. In one seeded run of 1,000 random values with k = 10, the heap made 1,219 comparisons and merge sort 8,702; in one of 100,000, 100,344 against 1,565,849. Most random values lose to the root, so the heap is close to one comparison per value.

Sorting has one thing going for it: the answer comes out in order, and so does every other rank. If you will ask for the top 10, then the top 50, then the median, sort once.

## Quickselect

[Quickselect](/quickselect/) partitions around a pivot until the pivot lands where the k-th largest belongs, A[n − k]. Everything after it is then at least as big. It does only the part of quicksort that matters, O(n) on average. Here the pivot is the last value of the range, as in CLRS's PARTITION.

[Quickselect with the last value as pivot](#example:quickselect-copy) looks for the value that belongs at t = 6. The pivots are 2, 5, 12, 21 and 14, and the last one lands on t: 23 comparisons. The first pivot, 2, is the smallest value, so that partition throws away only itself.

Fixed pivots have a worst case. In [Quickselect's worst case](#example:quickselect-worst) the values fall: 30 27 … 6. The pivot is the smallest value, then the largest, then the smallest of what is left, and every partition peels off one value. 33 comparisons for 9 values, against 8 for the heap. CLRS's RANDOMIZED-SELECT picks the pivot at random, which makes that very unlikely on any input.

Quickselect needs all of A in memory, and it moves values around (this page works on a copy). The heap needs room for k values and reads A once, left to right. For a stream, a file too big to load, or values arriving over the network, that settles it.

## The k-th largest

Set **Find** to the k-th largest and the same heap answers it: its root. In [The 4th largest](#example:kth-largest), the heap of the 4 largest ends with 12 at the root, so 12 is the 4th largest. 17 comparisons. Quickselect answers it directly, A[n − k], and sorting reads it off.

The k smallest is the same trick turned around: a max-heap of size k, and a new value must be smaller than the root to get in.

There is one more way that uses a heap: build a max-heap of all n values (bottom up, O(n), as [binary heaps](/binary-heap/) and [heap sort](/heap-sort/) do) and take the maximum k times, O(n + k log n). It needs all n values in memory, like quickselect.

```check
Q: You keep a min-heap of the 5 largest values seen so far. Which value is at its root?
- The largest value seen so far
* The 5th largest value seen so far
- The median of the values seen so far
- The most recent value
= The root of a min-heap is its smallest value, and the heap holds the 5 largest. The smallest of the 5 largest is the 5th largest.
```

## Ties

[Ties at the root](#example:ties-at-the-root) has A = 8 5 8 3 8 5 9 8 and k = 3. A value equal to the root does not replace it: it would not change the answer, only cost a sift. The last 8 is skipped, and the answer is 9 8 8. Which of the four 8s end up in the heap does not matter.

## Spot it

Reach for a heap of size k when the problem says:

- **the k largest, the k smallest, the top 10, the k closest, the k most frequent**: a fixed number from one end;
- **the k-th largest** (or smallest): the root of that heap;
- **a stream**, "as they arrive", "so far": you cannot sort what has not arrived yet;
- **memory for only k**, or data too big to load: the heap keeps k values and nothing else.

Three problems of our own:

- A server logs the response time of every request. Keep the 10 slowest seen so far. (A min-heap of 10 times.)
- Given the positions of many delivery vans, find the 5 closest to the depot. (A max-heap of 5 distances; a closer van replaces the farthest.)
- Count the words in a long text and report the 3 most frequent. (A hash map of counts, then a min-heap of 3 pairs.)

Look-alikes that call for something else: "the middle value after each new number" is the median, which [two heaps](/two-heaps-median/) keep. "Many sorted lists into one" is a [k-way merge](/k-way-merge/), a heap of the lists' heads. "The largest in every window of 7" slides a window, and a [monotonic queue](/monotonic-queue/) does it without a heap.

## When to use it

Use it when k is much smaller than n, and especially when the values stream past or do not fit in memory: O(n log k) time and O(k) space, and you can stop at any moment with the best k so far.

Avoid it when k is close to n: a heap of n − 1 values is a slow way to sort. Avoid it when you need the answer in order and more ranks besides: sort. And for one rank of an array already in memory, quickselect with a random pivot is the usual answer.

## Common mistakes

- Using a max-heap for the k largest. Its root is the best value, the one you want to keep, so you cannot tell what a new value has to beat.
- Letting the heap grow past k. Push only while it has room; after that, replace the root or skip.
- Reading the heap as sorted. It is in heap order: only the root is in a known place. Sort the k values at the end if you need them in order.
- Pushing every value and then popping down to k. It works, but each value costs a sift-up and a sift-down instead of one comparison.
- Quickselect with the first or last value as pivot on sorted or nearly sorted data. Pick the pivot at random.

## Try this

- [The 3 largest of 9](#example:best-three): before you play it, guess which values get pushed out of the heap.
- [Falling values](#example:falling-values), the heap's best case: how many comparisons for 9 values, and why?
- [Rising values](#example:rising-values): switch Approach to sort everything. Which wins, and does it still win with 12 values?
- [Quickselect's worst case](#example:quickselect-worst): now try the same values with the heap.
- Press Compare, pick this page with other options, and set one side to quickselect. Fill both with 12 random values and watch `comparisons`.
