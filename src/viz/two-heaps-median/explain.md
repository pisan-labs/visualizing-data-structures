# Running median with two heaps

Numbers arrive one at a time, and after each one you want the median of everything so far. Sorting after every number works and gets slow fast. The trick: split the numbers into a low half and a high half. Keep the low half in a max-heap and the high half in a min-heap. The middle of everything is then sitting on top of one heap or the other.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| add(x), two heaps | x goes into the half it belongs to; a top moves over if the sizes drift | O(log n) |
| add(x), a sorted list | x slides in from the end past every bigger value | O(n) |
| median() | the low half's top, or the mean of the two tops | O(1) |
| n values in all | heaps against a sorted list | O(n log n) against O(n²) |

Every value in the low half is no bigger than every value in the high half. The low half's largest value is its top (a max-heap), and the high half's smallest is its top (a min-heap). Keep the two halves the same size, or the low half one bigger, and the median is right there: the low half's top for an odd count, the mean of the two tops for an even one. [Show me](#play:running-median)

The **Approach** option switches to the naive way, a sorted list. Both give the same medians. `comparisons` counts two values compared, over the whole stream so far; `naive total` and `pattern total` say what the sorted list and the two heaps have cost after this value. The heaps are the ones from [binary heaps](/binary-heap/).

## How it works

For each new value x:

1. If the low half is empty or x ≤ its top, x goes into the low half. Otherwise into the high half.
2. If the low half now has two more than the high half, its top moves over to the high half.
3. If the high half now has more than the low half, its top moves over to the low half.
4. The median is the low half's top when it holds one more, or else the mean of the two tops.

Each step is a push or a pop on a heap of about n/2 values: O(log n).

In [A running median](#example:running-median), the stream is 5 15 1 3 8 7 9 10 6 and the medians are 5, 10, 5, 4, 5, 6, 7, 7.5 and 7. Watch 3. It is no bigger than 5, the low half's top, so it goes into the low half. That gives the low half 3 values against 1, so 5 moves over to the high half and 3 becomes the low top. The median of 1 3 5 15 is (3 + 5) / 2 = 4.

```check
Q: The low half holds 1, 3 and 5 (top 5) and the high half 8 and 9 (top 8). Then 6 arrives. Where does it go, and what is the median after it?
* The high half; the median is 5.5
- The low half; the median is 5
- The high half; the median is 6
- The low half; the median is 5.5
= 6 > 5, the low half's top, so it goes into the high half, whose top becomes 6. Both halves now hold 3, so nothing moves, and the median is the mean of the tops: (5 + 6) / 2 = 5.5.
```

## A sorted list

The naive way keeps every value in one sorted list. A new value goes at the end and slides left past every bigger value, one step of insertion sort. The median is the middle of the list. In [A sorted list instead](#example:sorted-list), the last value, 6, slides past 15, 10, 9, 8 and 7.

Calling a full sort after every value would be worse, O(n log n) each time. Binary search finds the place in O(log n) comparisons, but every bigger value still has to shift one slot, so an insert stays O(n).

Is two heaps always cheaper? Nope. On the 9 values above, the heaps make 25 comparisons and the sorted list 21. A rising stream is the list's best case: [A rising stream](#example:rising-stream) takes 7 comparisons for 8 values, one each, while the heaps take 20. A falling stream is its worst: [A falling stream](#example:falling-stream) slides each value past all the ones before it, 0 + 1 + … + 7 = 28 comparisons, and [the same stream with two heaps](#example:falling-heaps) takes 23.

The gap opens up with length. In one seeded run of 1,000 random values, the heaps made 13,444 comparisons and the sorted list 243,710; in one of 10,000, 185,445 against 25,188,880. The heaps grow like n log n, the list like n².

## Variants

[The lower median](#example:lower-median) switches **Median of an even count** to the lower of the two middle values, as CLRS defines the median. Then the answer is always the low half's top, and the heaps do exactly the same work.

Two other choices differ between books and solutions, and both work:

- **Which half holds the extra value.** Here the low half does, so an odd count's median is its top. Keep the extra in the high half instead and it is the high half's top.
- **Where a new value goes first.** Here x is compared with the low half's top. Another common way always pushes x into the low half, then moves the low half's top to the high half, then moves a top back if the high half got bigger. It never compares x by hand, and does a few more heap operations.

A [min-max heap](/min-max-heap/) keeps both ends of one set in reach, the smallest and the largest. The median is in the middle, so it takes two heaps facing each other.

Removing values (the median of the last w values, a sliding window) needs a heap that can delete any value, not just its top: an indexed heap, or marking values as deleted and dropping them when they reach a top. This page does not do removal.

```check
Q: After some values, the low half holds 4 values and the high half 2. What happens next?
* The low half's top moves to the high half
- The high half's top moves to the low half
- Nothing: the median is the low half's top
- Both tops swap places
= The halves must differ by at most one. The low half has two more, so its largest value, its top, moves to the high half. Now both hold 3.
```

## Spot it

Reach for two heaps when the problem says:

- **median, middle value**, "as many below as above";
- **after each new value**, "so far", "running", "as they arrive": the middle keeps moving;
- **two halves**, balanced, "the best of the weaker half": two heaps facing each other.

Three problems of our own:

- A ride-sharing app records each trip's fare as the trip ends. After every trip, show the median fare so far.
- Players join a game one at a time. After each join, split them into a weaker half and a stronger half, sizes differing by at most one, and report the best player of the weaker half. (The max-heap's top.)
- Sensor readings arrive every second. Report the median reading so far, every second.

Look-alikes that call for something else: "the 100 most expensive houses" is a fixed number from one end, [top k](/top-k/). "Twenty sorted lists into one" is a [k-way merge](/k-way-merge/). "The median of one list you already have" needs no stream: [quickselect](/quickselect/) finds it in O(n) on average.

## When to use it

Use it when values keep arriving and you need the median, or any split into two halves, after each one: O(log n) per value and O(1) per median, with no sorting.

Avoid it for one median of a list you already have: quickselect, or sorting once. Avoid it for short streams or streams that arrive nearly in rising order, where a sorted list is simpler and often cheaper. And it needs every value kept, so for a window that slides you need removal, which plain heaps do not do.

## Common mistakes

- Making both heaps min-heaps. The low half needs its largest value on top. Python's heapq gives min-heaps, so store the low half negated (Python 3.14 and later also have heappush_max and heappop_max).
- Choosing the half by size instead of by value. A value goes to the half it belongs to first; only then do the sizes get fixed.
- Rebalancing only one way. The low half can get two ahead, and the high half can get one ahead.
- Integer division for the mean. (5 + 6) / 2 is 5 in Java or C++ with ints; divide by 2.0.
- Asking for the median of nothing. With no values there is no top to read.

## Try this

- [A running median](#example:running-median): before each value, say which half it goes into and whether a top moves.
- [A falling stream](#example:falling-stream), then [the same stream with two heaps](#example:falling-heaps). Which grows faster if you keep going?
- [All the same value](#example:all-the-same): every value is equal to the low half's top. Where does each go?
- Switch **Median of an even count** to the lower value and play [A running median](#example:running-median) again. Which medians change?
- Press Compare, pick this page with other options, and set one side to a sorted list. Fill both with 12 values from the falling preset.
