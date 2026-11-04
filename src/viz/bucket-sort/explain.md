# Bucket sort

If you know your values are spread evenly over a range, you can beat the comparison sorts. Cut the range into n equal buckets, drop each value into its bucket, sort each bucket (they are small), and join them in order. With n values in [0, 1) and n buckets, a bucket gets about one value on average, and the whole sort takes O(n) expected time. The catch is in "spread evenly".

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Scatters into n buckets, sorts each one, joins them | O(n) expected for evenly spread values, O(n²) worst case, O(n) extra space |

It takes four steps.

1. Make n empty buckets. Bucket i covers the values from i/n up to (i + 1)/n.
2. Scatter: each value x goes to the back of bucket floor(n × x).
3. Sort each bucket with insertion sort.
4. Join the buckets, 0 to n − 1.

In the drawing, bucket i sits under A[i], and the values travel down into their buckets, up inside them while insertion sort works, and back into A at the end. [Show me](#play:spread-out)

Insertion sort is a good fit for the buckets: it is fast on a handful of values, and it is stable. Since the values also enter each bucket in the order they appear in A, the whole sort is stable.

## The worst case

Bucket sort trusts the input. If every value lands in the same bucket, the buckets do nothing, and what is left is a plain insertion sort of n values: O(n²). Eight values, all below 1/8, in reverse order, take 28 comparisons. [Show me](#play:one-bucket)

```check
Q: Eight values, all between 0.01 and 0.09, go into 8 buckets. Which buckets do they use?
* All of them land in bucket 0
- One value per bucket
- Buckets 0 and 1
= floor(8 × 0.09) = 0, so every value goes to bucket 0, and insertion sort does all the work.
```

## Whole numbers

Set **Values** to whole numbers and the buckets split the range from the smallest value to the largest instead: a value v goes to bucket floor(n × (v − min) / (max − min + 1)). [Show me](#play:integers) One outlier is enough to spoil it. Seven small numbers and a 99 stretch the range so far that the seven share bucket 0. [One outlier](#example:outlier)

## What it costs

Scattering and joining touch each value once: O(n). The insertion sorts cost about the square of each bucket's size. When the values are spread evenly, most buckets hold zero, one or two values, and CLRS shows the expected cost of each bucket is a constant, so the expected total is O(n). [Evenly spread values](#example:even) put one value in each bucket and need no comparisons at all.

```check
Q: Ten values go into 10 buckets, exactly one per bucket. How many comparisons do the insertion sorts make?
* 0
- 9
- 10
- 45
= A bucket with one value is already sorted, so insertion sort compares nothing. Joining the buckets gives the sorted array.
```

## When to use it

Use it when you know the values are spread evenly over a known range: random numbers, hash values, measurements that fill their range. Avoid it when values clump together, when a few outliers stretch the range, or when you know nothing about the distribution. A comparison sort gives a guarantee; bucket sort gives a good average.

## Common mistakes

- Feeding it values outside [0, 1). A value of exactly 1 goes to bucket n, which does not exist.
- Using far fewer buckets than values, so every bucket is crowded.
- Forgetting to sort inside the buckets, or joining them out of order.
- Expecting O(n) for clumped data. The O(n) is an average over evenly spread inputs, not a promise.

## Try this

- [Ten values, ten buckets](#example:spread-out). Before the scatter, predict each value's bucket.
- [Everything in one bucket](#example:one-bucket). Count the comparisons.
- [Evenly spread](#example:even): no comparisons at all.
- [Whole numbers](#example:integers), then [one outlier](#example:outlier).
- Load `0.1 0.11 0.12 0.13 0.9` and sort. How full is bucket 0?
