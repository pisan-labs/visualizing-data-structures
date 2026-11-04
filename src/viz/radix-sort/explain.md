# Radix sort

[Counting sort](/counting-sort/) is fast, but only for a small range of values: sorting values up to a million needs a million counts. Radix sort gets around that by sorting one digit at a time, and every digit has a small range, 0 to 9 in base 10. The trick is the order. It starts with the last digit, the least significant one, and works toward the front.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | One pass per digit, last digit first | O(d(n + b)) time, O(n + b) extra space, stable |

Here d is the number of digits of the largest value and b is the base. Each pass does the same three things.

1. Take the values from left to right.
2. Put each one at the back of the bucket for its digit, worked out as (value / place) mod b.
3. Collect the buckets in order, 0 to b − 1, each from front to back.

That is a stable sort by one digit. CLRS writes the pass as "use a stable sort on digit i", and counting sort on the digit does the same job without lists: the bucket sizes are the counts, and where each bucket starts is the prefix sum. [Show me](#play:three-digits)

## Why the last digit first?

After pass 1, A is sorted by its last digit. Pass 2 sorts by the digit before it, and values with the same tens digit stay in the order pass 1 left them, which is sorted by the ones. So after pass 2, A is sorted by its last two digits. Each pass adds one digit, and after the last one A is sorted. [Show me](#play:stability)

All of that depends on every pass being stable. A pass that mixed up values with the same digit would throw away the order the earlier passes built.

```check
Q: A = 21 11 22 12. Radix sort in base 10 makes its first pass, by the ones digit. What is A after it?
* 21 11 22 12
- 11 12 21 22
- 11 21 12 22
= Bucket 1 gets 21 and then 11, bucket 2 gets 22 and then 12. Collecting them gives A back unchanged. Pass 2, by the tens, then sorts it.
```

## The base

The base is the number of buckets. A bigger base means fewer digits, so fewer passes, but more buckets to visit in each one. 255 is FF in base 16, two passes; it is 255 in base 10, three passes; and it is 11111111 in base 2, eight passes. [Show me](#play:base-sixteen) In [base 2](#example:base-two) each pass splits the values by one bit. Sorting 32-bit numbers a byte at a time takes four passes with 256 buckets each.

```check
Q: The values go up to 999. How many passes does radix sort make in base 2?
- 3
- 8
* 10
- 999
= 999 is 1111100111 in base 2, ten digits, so ten passes. Base 10 needs three.
```

## What it costs

Each pass moves every value into a bucket and back, and visits every bucket: O(n + b). There are d passes, so the total is O(d(n + b)). When the keys have a fixed number of digits, d is a constant and radix sort is O(n). Nothing is ever compared, so the n log n limit for comparison sorts does not apply. [Every value in one bucket](#example:one-bucket) costs no more than any other spread.

## When to use it

Use it for keys of a fixed length: whole numbers, dates, zip codes, IDs, fixed-length strings (last character first). Avoid it for small arrays, where a simple comparison sort is less work, and when extra space is tight, since the buckets hold a copy of every value. Fractions and negative numbers need extra care.

## Common mistakes

- Starting with the first digit and sorting forward. Most significant digit first is a different algorithm, MSD radix sort, which sorts bucket by bucket.
- Using an unstable sort for a pass.
- Stopping too early. The number of passes comes from the largest value, not the first one.
- Getting the digit wrong. It is (value / place) mod b, with whole-number division.
- Forgetting negative numbers. They need a shift, or a pass of their own for the sign.

## Try this

- [Three-digit values](#example:three-digits). Before each pass, predict the order it leaves.
- [Each pass keeps the order of the one before](#example:stability).
- [Base 2](#example:base-two) and [base 16](#example:base-sixteen): count the passes and the buckets.
- [Values below the base](#example:one-pass): one pass, which is just counting sort.
- Set **Base** to 3 and sort the three-digit values again.
