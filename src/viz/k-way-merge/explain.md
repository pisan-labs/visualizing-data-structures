# K-way merge

You have k sorted lists and want one sorted list. Five sorted files from five servers, sorted runs written to disk by a big sort, the rows of a sorted table. Gluing them together and sorting again throws away the work already done. The trick: only the front of each list can be next, so keep the k fronts in a min-heap. Its root is always the next value out.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| merge, a min-heap of heads | the root goes out; its list's next value takes its place | O(n log k) |
| merge in pairs, round by round | L1 with L2, L3 with L4, …, then again | O(n log k) |
| concatenate and sort | one array, merge sorted as if nothing were sorted | Θ(n log n) |
| extra space, the heap | one value from each list | O(k) |

Here n is the number of values in all the lists together. A list's head is its smallest value not yet taken. Every value still waiting is at least as big as its own list's head, so the smallest value left anywhere is the smallest head. A min-heap of the heads keeps that one at the root. [Show me](#play:three-lists)

The **Approach** option switches between the three ways. All three give the same list. `comparisons` counts two values compared; `naive total`, `pattern total` and `pairs total` say what concatenating and sorting, the heap and merging in pairs cost on these lists. The heap is the one from [binary heaps](/binary-heap/); each node is labeled with the list its value came from.

## How it works

1. Put each list's head into the heap.
2. Take the root out: it is the next value of the merged list.
3. If its list has more, that list's next value takes the root's place and sinks below any smaller child. If its list is used up, the heap's last value takes the root instead, and the heap shrinks.
4. Repeat until the heap is empty.

In [Three lists, one heap of heads](#example:three-lists), L1 = 1 8 12, L2 = 3 4 10 15 and L3 = 2 9 11. The heap starts with 1, 3 and 2. 1 goes out and 8, L1's next value, takes the root and sinks below 2. Then 2 goes out and L3 sends 9. And so on. L3 runs out after 11, L1 after 12, and 15 goes out last. 17 comparisons for 10 values.

```check
Q: L1 = 2 9, L2 = 4 5, L3 = 1 7. After 1 and 2 have gone out, which values are in the heap?
* 4, 7 and 9
- 4, 5 and 7
- 5, 7 and 9
- 7 and 9
= The heap holds each list's first value not yet taken. 2 left L1, so L1 sends 9; 1 left L3, so L3 sends 7; L2 still has its head, 4.
```

## Concatenate and sort

The naive way: put everything in one array and sort it. [Concatenate and sort](#example:concatenate-and-sort) runs merge sort on all 10 values: four passes, 26 comparisons, against the heap's 17. The sort never learns that the lists were sorted. Its passes merge runs of 1, then 2, then 4, building order that was already there.

Each value out of the heap costs a sift in a heap of at most k values, about 2 log₂ k comparisons at worst. Sorting costs about log₂ n per value. With a few long lists that is a big win: on 3 random lists of 1,000 values each, the heap made 5,993 comparisons and sorting 20,464.

## Merge in pairs

There is a way with no heap at all: merge L1 with L2, L3 with L4, and so on, then merge the results the same way. Each merge is the merge step of [merge sort](/merge-sort/). Every round touches every value once, and there are ⌈log₂ k⌉ rounds, so it is O(n log k) too.

[Merge in pairs](#example:merge-in-pairs) merges L1 with L2 in 6 comparisons while L3 waits, then the result with L3 in 8: 14 comparisons, fewer than the heap's 17. That is not an accident of these lists. A merge spends one comparison per value; the heap spends up to two per level as a value sinks. On 10 random lists of 100, the heap made 4,576 comparisons and the pairs 3,589.

So why the heap? Because it streams. The first value comes out after k pushes, and the heap holds one value per list, nothing else. Merging in pairs has to finish whole rounds and write a new list for every merge. For files too big for memory, or lists that arrive a value at a time, the heap is the one that works.

Merging one list at a time into a growing result is the slow way: the result is copied again for every list, O(nk).

## When the heap loses

With many short lists the heap's constant catches up with it. [Five short lists](#example:five-lists) has five lists of two: the heap makes 28 comparisons, more than sorting everything (23) and the pairs (18). The same happens at scale: with 100 random lists of 100, the heap made 105,701 comparisons, about the same as sorting all 10,000 values (107,180); the pairs made 68,591. Two comparisons per level of a heap of 100 is about 13 per value, and sorting 10,000 values costs about 13 per value too.

With k = 2 the heap is a plain merge with extra steps: [Two lists: a plain merge](#example:two-lists) takes 7 comparisons either way.

## Ties and empty lists

[Equal heads go in list order](#example:equal-heads) has three 2s at the front. The heap breaks ties by list number, so they go out from L1, then L2, then L3. Any order gives the same merged list. A fixed rule makes every run the same, and in code it saves a language from comparing whatever comes after the value (Python compares tuples field by field).

A list that is empty from the start never enters the heap. A list that runs out simply stops sending; [One long list and two short ones](#example:a-list-runs-out) shows L1 supplying the root five times in a row before 30 and 40 get a turn.

## The same heap, other questions

- **The m smallest across k sorted lists**: take the root m times and stop.
- **The k-th smallest in a grid whose rows are sorted**: each row is a list.
- **The smallest range that holds a value from every list**: keep the heads in the heap and remember the largest head. The root and that largest head make a range that covers every list. Take the root out, push its list's next value, update the largest head, and keep the narrowest range seen. Stop when a list runs out, since then no range can cover it.

```check
Q: Why does a heap of heads do better than concatenating and sorting when there are few long lists?
- The heap sorts faster than merge sort
* Only the k heads compete at a time, so a value costs O(log k) instead of O(log n)
- The heap never compares two values from the same list
- It does not: they make the same comparisons
= The lists are already sorted, so only their fronts can be next. A heap of k heads is shallow when k is small, and each value out costs a sift in it.
```

## Spot it

Reach for a heap of heads when the problem says:

- **k sorted lists, files, streams or rows**: several sequences, each already in order;
- **merge, combine, one sorted list, in time order**: one output in order;
- **the m smallest across all of them**, or the k-th smallest in sorted rows;
- **too big to load at once**: the heap holds one value per list.

Three problems of our own:

- Five sorted files of customer ids are too big to load at once. Write one sorted file with all of them.
- Three sensors each record events in time order. Produce one record of all the events in time order.
- In a grid where every row is sorted, find the 7th smallest number. (Pop the root 7 times.)

Look-alikes that call for something else: "the 10 highest of one unsorted list" is [top k](/top-k/), a heap of the best so far, not of heads. "Combine the meetings that overlap" is about intervals, not values: sort by start and merge. And "the median after each new reading" is [two heaps](/two-heaps-median/).

## Common mistakes

- Putting bare values in the heap. You need to know which list each one came from, or you cannot fetch its next value.
- Pushing every value into the heap at once. That is heap sort, O(n log n), and it ignores the sorted lists.
- Pushing the head of an empty list.
- Ties in languages that compare tuples: (value, list number) is fine. In Python, (value, iterator) fails as soon as two values are equal, because iterators cannot be compared.
- Merging the lists one at a time into a growing result: O(nk).

## Try this

- [Three lists, one heap of heads](#example:three-lists): before each value goes out, say which one it is and which value replaces it.
- [Five short lists](#example:five-lists): switch Approach to merging in pairs and compare `comparisons`.
- [Lists already in order](#example:already-in-order): why does merging in pairs need so few comparisons here?
- Load `1 9 | 2 8 | 3 7 | 4 6 | 5` and merge. Which list runs out first?
- Press Compare, pick this page with other options, and set one side to concatenate and sort. Fill both with 12 values in 5 lists.
