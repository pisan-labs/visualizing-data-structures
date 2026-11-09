# Counting sort

Most sorts on this site compare two values and decide which goes first. Any sort that works that way needs about n log₂ n comparisons in the worst case; you cannot beat it. Counting sort makes no comparisons at all. It only works on whole numbers in a small range, 0 to k, and then it sorts in O(n + k).

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Counts, adds up the counts, then places every value | O(n + k) time, O(n + k) extra space, stable |

It takes three passes, plus a copy at the end.

1. **Count.** C[v] = how many times v occurs in A. In bars mode the counts form a histogram.
2. **Add up.** For i from 1 to k, C[i] = C[i] + C[i − 1]. Now C[v] is how many values are ≤ v, so the values equal to v belong just before position C[v] in the output. In bars mode, the histogram turns into a staircase.
3. **Place.** Walk A from the right. For each value v, take 1 from C[v] and put v in B[C[v]].

Then B is sorted, and it is copied back into A. [Show me](#play:count-and-place)

## Why from the right?

To keep equal values in order. The last copy of a value in A is placed first, into the last slot for that value; the copy before it goes one slot to its left, and so on. Equal values come out in the order they went in, which makes counting sort stable. [Show me](#play:stable)

Does that matter for plain numbers? Not much: one 3 looks like another. It matters when the numbers are keys of bigger records, students sorted by grade, say. And it is what makes [radix sort](/radix-sort/) work, since radix sort runs counting sort once per digit and needs each pass to keep the order of the one before.

```check
Q: For values from 0 to 5, C after the prefix sums is 2 2 4 7 7 8. Walking from the right, the first value is A[7] = 3. Where does it go?
- B[7]
* B[6]
- B[3]
- B[2]
= Take 1 from C[3] = 7, which leaves 6, and put the 3 in B[6]. Seven values are ≤ 3, so the 3s fill B[4] to B[6], and the last one in A takes the last of those slots.
```

## Why O(n + k)?

The count and place passes touch each of the n values once, the adding-up pass touches each of the k + 1 counts once, and the copy back is n more. Nothing is ever compared, so the n log n limit does not apply: counting sort uses each value as an index into C, which a comparison sort is not allowed to do.

## When k makes it a bad choice

The k in O(n + k) is easy to forget. [Four values, one of them 20](#example:big-k), need 21 counts, and the adding-up pass runs 20 times for 4 values. [Show me](#play:big-k) Sort 100 values that go up to a million and C needs a million counts: 10,000 times more slots than values, nearly all of them 0. Counting sort pays off when k is no bigger than a small multiple of n; then O(n + k) is O(n). For bigger keys, [radix sort](/radix-sort/) runs counting sort on one digit at a time.

```check
Q: You need to sort 1,000 exam scores, each a whole number from 0 to 100. Is counting sort a good choice?
* Yes: k = 100 is small next to n = 1,000
- No: it only works when k is smaller than 10
- No: counting sort needs the values to be distinct
= C has 101 counts, so the work is about 1,000 + 101 + 1,000 steps. Repeated values are fine; they just add up in C.
```

## When to use it

Use it for small whole-number keys: exam scores, ages, bytes from 0 to 255, days of the year. Negative values work if you shift everything by the smallest one first. Avoid it for fractions, for long strings, and for keys spread over a huge range, and remember the extra space: B is as long as A, and C is as long as the range.

## Common mistakes

- Skipping the prefix sums, or adding them up from the wrong end.
- Walking A from the left while taking 1 from the counts. The result is sorted, but equal values come out reversed, so it is no longer stable.
- Off-by-one errors: with 0-based arrays, take 1 from C[v] before you place v, not after.
- Making C as long as A instead of k + 1.
- Using it when k is huge, or when the values are not whole numbers.

## Try this

- [Count, add up, place](#example:count-and-place). Predict C after counting, then after adding up.
- [Equal values keep their order](#example:stable). Follow the three 3s from A into B.
- [Four values, k = 20](#example:big-k). Count the additions.
- [All equal](#example:all-equal) and [reverse sorted](#example:reverse): the order of the input makes no difference.
- Switch **Draw values as** to bars. The counts become a histogram, and adding them up turns it into a staircase.
