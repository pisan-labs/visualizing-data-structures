# Bitonic sorting network

Every sort on this site so far decides what to compare next based on what it has seen. A sorting network does not. Its comparisons are wired in before any value arrives, the same ones every time. That sounds like a step backwards. It is what you want in hardware, on a GPU, or anywhere many comparisons can happen at once: if the plan is fixed, a thousand comparators can run in the same clock tick.

Ken Batcher's bitonic network (1968) is the classic one.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts A, n a power of two | n log n (log n + 1) / 4 comparators, in log n (log n + 1) / 2 parallel steps |

Draw one horizontal wire per index. The values enter on the left and travel right. A **comparator** joins two wires: when a pair of values reaches it, the smaller goes out on one wire and the larger on the other. Here each comparator is an arrow pointing to the wire that gets the larger value.

Comparators that touch different wires can work at the same time. So the network is drawn in **columns**: one column is one parallel step. The values sit just after the columns they have passed. [Eight wires, six columns](#example:eight) [Show me](#play:eight)

## Stages and columns

A sequence is **bitonic** if it goes up and then down (or is a rotation of one that does). Batcher's trick is that a bitonic sequence of n values can be sorted by one column of n/2 comparators and then two independent halves of the same problem. Repeat, and log n columns sort it.

So the network builds sorted blocks of 2, then 4, then 8:

- **Stage 1** sorts every pair. 1 column.
- **Stage 2** takes two sorted pairs and merges them into a sorted block of 4. 2 columns.
- **Stage s** merges two sorted blocks of 2^(s-1) into one of 2^s, with s columns.

With log n stages that is 1 + 2 + ... + log n = log n (log n + 1) / 2 columns. For 16 values: 10 columns of 8 comparators, 80 comparators in all. [Sixteen wires](#example:sixteen)

```check
Q: How many columns does a bitonic network for 32 values have?
- 5
- 10
* 15
- 80
= log₂ 32 = 5 stages, with 1 + 2 + 3 + 4 + 5 = 15 columns.
```

## Two ways to draw it

**Flip, then half-cleaners** (the default, as in CLRS's chapter on sorting networks). Every comparator points the same way: smaller value up. The first column of a stage is a **flip**: in each block, the first value meets the last, the second meets the second to last, and so on. That turns two sorted halves into the bitonic shape the rest needs. Then come **half-cleaners**: compare values half a block apart, then a quarter, down to neighbors. Overlapping comparators in a column are drawn side by side, but they still run at the same time.

**Batcher's original** sorts the blocks of a stage up and down in turn, so neighboring blocks already form a bitonic sequence and no flip is needed. Some comparators point up instead. Switch **Network** to compare: [Batcher's version](#example:alternating). Same number of comparators, same number of columns.

## Oblivious, and why that matters

The network does exactly the same comparisons on every input of a given size. [Sorted input](#example:sorted) still runs all 24 comparators for 8 values; nothing swaps, but nothing is skipped either. The swaps counter counts only the comparators whose two values are out of order and trade places. The word for this is *data-oblivious*.

That costs comparisons. Θ(n log² n) is more than merge sort's n log n. What it buys:

- **Parallel time** of O(log² n). With n/2 comparators working at once, 16 values take 10 steps; a million take 210.
- **No branches.** A comparator is a min and a max. GPUs, SIMD instructions and circuits love that.
- **Nothing leaks.** Since the comparisons never depend on the data, the timing does not either, which matters in some security settings.

```check
Q: A bitonic network sorts 8 values that are already sorted. How many comparisons does it make?
- 0
- 7
* 24
- 28
= It always runs every comparator: 8 / 2 = 4 per column, 6 columns. Sorted input just means no swaps.
```

## Powers of two only

The construction halves blocks again and again, so n has to be a power of two. This page refuses anything else: [Six values](#example:not-power). In practice you pad the input with "infinity" values up to the next power of two and throw them away at the end. (There are versions for any n, but they are messier.)

It is not stable: a comparator can swap two values a long way apart, jumping over an equal value in between.

## When to use it

On a GPU, in an FPGA, in a SIMD routine sorting 8 or 16 values at a time, or as the inner loop of a bigger parallel sort. On one ordinary processor, use a normal sort: you would be doing more comparisons for nothing.

## Common mistakes

- Counting comparisons and concluding it is slow. Count columns: that is the time when they run in parallel.
- Forgetting the flip (or the alternating directions). Two sorted halves are not bitonic as they stand: one of them has to be reversed, and the flip does that.
- Running it on n that is not a power of two.
- Thinking a sorted input makes it faster. It never does.

## Try this

- [Four wires](#example:four): follow one value through all three columns.
- [Eight wires, six columns](#example:eight): at the end of each stage, check that every block is sorted.
- [Batcher's version](#example:alternating): find the comparators that point up.
- Set **Detail** to Every detail to watch one comparator at a time, then back to Normal to see whole columns.
