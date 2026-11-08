# Interpolation search

Nobody looks up "Williams" in a phone book by opening it in the middle. You open it near the back, because W is near the end of the alphabet. Binary search ignores what the values are and always looks in the middle. Interpolation search uses the values to guess.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `search(x)` | Returns an index of x in sorted A, or -1 if x is not there | O(log log n) on evenly spread values, O(n) worst case |

Keep a window `A[lo..hi]`, as binary search does. Then pretend the values climb in a straight line from `A[lo]` to `A[hi]`. If x is a third of the way from `A[lo]` to `A[hi]`, look a third of the way from lo to hi:

`pos = lo + floor((x - A[lo]) * (hi - lo) / (A[hi] - A[lo]))`

Compare `A[pos]` with x. Too small, and `lo = pos + 1`. Too big, and `hi = pos - 1`. In bars mode the drawing shows the guess: the straight line from the top of `A[lo]` to the top of `A[hi]`, a dashed line at the height of x, and a drop from where they meet down to the slot. [Show me](#play:one-probe)

In [Evenly spread values](#example:one-probe), 55 is about halfway between 5 and 96, so the first guess is `A[6]`, and that is 55. One probe. Binary search takes 3.

## How it works

The loop runs while x could still be in the window: `lo <= hi` and `A[lo] <= x <= A[hi]`. The second part matters. It keeps pos inside the window, and it stops the search as soon as x falls outside the values that are left. In [Not there](#example:not-there), the first guess is too small, the window becomes `A[6..11]`, and 50 is below `A[6] = 55`. Done, after one probe.

One more check sits before the formula. If `A[lo] = A[hi]`, the formula divides by zero. But then every value in the window is the same, and x is between them, so x is that value. [Every value the same](#example:all-equal)

Not every guess lands. In [A guess just short](#example:just-short), the line puts 71 at 7.98, which rounds down to 7, one slot short. The second guess, inside the much smaller window, hits it.

```check
Q: A = 10, 20, 30, 40, 50, 60, 70, 80 (lo = 0, hi = 7). Where is the first guess for x = 60?
- 3
* 5
- 6
- 7
= pos = 0 + floor((60 − 10) × 7 / (80 − 10)) = floor(5) = 5, and A[5] = 60. Evenly spaced values put every guess right on x.
```

## Why log log n, and why n

On values spread evenly at random, a guess is off by about √(window size) slots. So each probe takes the window from n down to about √n, then to n^(1/4), and so on. Taking square roots, it takes only about log log n steps to get down to one value. For a million values, log₂ log₂ n is about 4.3. Binary search needs 20. (The proof is a lot harder than this hand waving. Yao and Yao, and Perl, Itai and Avni did it in the 1970s.)

That argument needs the values to be spread evenly. Take away the even spread and the guess goes wrong. [Skewed values](#example:skewed) has 1 to 19 and then one 99. The line from 1 to 99 is far too flat, so every guess for 19 lands short and the window creeps forward a slot or two at a time. 12 probes. Binary search takes 4. Make the array longer with the same shape and it gets worse: the worst case is O(n), no better than linear search. [Show me](#play:skewed)

```check
Q: Which input is worst for interpolation search?
- Evenly spaced values, like 3, 6, 9, 12, ...
* Many small values and one huge value at the end
- Values that are all the same
- Values in random order
= One huge value makes the straight line from A[lo] to A[hi] far too flat, so the guess lands short again and again. Random order is not an input at all: the search needs sorted values.
```

## When to use it

Use it on big sorted arrays whose values are spread fairly evenly: numeric ids handed out in order, timestamps from a steady stream, keys from a good hash. That is where log log n beats log n by enough to notice.

Avoid it when:

- the values bunch up (names, prices, anything with a long tail);
- the array is small, because each probe costs a subtraction, a multiplication and a division, where binary search spends one addition and one shift;
- you cannot do arithmetic on the keys at all, like strings, unless you map them to numbers first.

A common fix is to mix the two: guess with interpolation, but fall back to binary search when the guesses stop paying off. That keeps the worst case at O(log n).

## Common mistakes

- Searching unsorted values. The straight line means nothing then. This page refuses and shows you where the order breaks. [Unsorted values](#example:unsorted)
- Leaving out `A[lo] <= x <= A[hi]`. Without it, pos can land outside the window, even outside the array.
- Forgetting the `A[lo] == A[hi]` check and dividing by zero.
- Overflow. `(x - A[lo]) * (hi - lo)` can overflow an int in Java or C++ long before the answer does. The code tabs multiply in 64 bits.
- Expecting it to always beat binary search. On skewed data it loses badly.

## Try this

- [Evenly spread values](#example:one-probe): one probe. Pick other values from A and search for them.
- [A guess just short](#example:just-short): watch the line move when the window shrinks.
- [Skewed values](#example:skewed). Count the probes, then change the 99 to 20 and search again.
- Load the preset **Skewed values** at size 20. Then try **Evenly spread values** at the same size.
- Turn off **Draw the straight line** and guess pos yourself before each probe.
