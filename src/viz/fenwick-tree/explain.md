# Fenwick tree

[Prefix sums](/range-queries/) answer any range sum with one subtraction, until the array changes. Then they need O(n) to catch up. A Fenwick tree gives up a little query speed to fix that: adding to a value and asking for a prefix sum both take O(log n). It is an array of n numbers and two loops of three lines each. You'll also see it called a binary indexed tree, or BIT. Peter Fenwick described it in 1994, for the frequency tables used in data compression.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `add(i, delta)` | `A[i] += delta` | O(log n) |
| `prefix(i)` | `A[1] + … + A[i]` | O(log n) |
| `sum(l, r)` | `prefix(r) − prefix(l − 1)` | O(log n) |
| `build(A)` | Fill T from A | O(n) |

Everything is 1-based, as usual for Fenwick trees. The reason is a bit trick, and index 0 would break it.

## Each entry covers a power of two

The tree is an array T, the same size as A. `T[i]` holds the sum of the values that end at `A[i]`, and how many there are depends on the lowest set bit of i, written `i & −i`:

- 12 is 1100 in binary, so its lowest set bit is 100₂ = 4. `T[12]` covers 4 values, `A[9..12]`.
- 6 is 110, lowest set bit 2. `T[6]` covers `A[5..6]`.
- Every odd number ends in 1, so an odd `T[i]` covers just `A[i]`.
- A power of two is a single 1 bit, so `T[8]` covers `A[1..8]`, the whole prefix.

The drawing shows these ranges as a staircase of boxes over the values they cover, one level per size. Under the boxes is T as it sits in memory, then A, then every index in binary with its lowest set bit boxed. Nothing in memory is shaped like a tree. The tree is in the ranges: every box sits inside a bigger one, until you reach a box with no room above it.

```check
Q: Which values does T[12] cover?
- A[1..12]
* A[9..12]
- A[11..12]
- A[12] only
= 12 = 1100₂, and its lowest set bit is 100₂ = 4. T[12] covers the 4 values that end at A[12]: A[9..12].
```

## The lowest set bit

`i & −i` looks like a typo. It isn't. In two's complement, `−i` is "flip every bit of i, then add 1". The flip turns the zeros at the end of i into ones, and adding 1 carries through them and stops at the lowest set bit. So i and −i agree on that bit and the zeros after it, and disagree everywhere above. AND them together and only the lowest set bit is left: `12 & −12 = 4`.

The two loops below use it in opposite directions. Removing the lowest set bit moves to the range just left of the current one. Adding it moves to the next range that contains the current one.

## Prefix sums: clear the lowest bit

`prefix(i)` starts at i, adds `T[i]`, then clears the lowest set bit and repeats until i is 0. Take `prefix(13)`. 13 is 1101, so `T[13]` covers `A[13]`. Clear the last bit: 1100 = 12, and `T[12]` covers `A[9..12]`. Clear again: 1000 = 8, and `T[8]` covers `A[1..8]`. One more and i is 0. Three entries, one per 1 bit of 13, and their ranges fit together into `A[1..13]` with no gaps and no overlaps. [Show me](#play:prefix-thirteen).

A number below 2^k has at most k 1 bits, so the walk takes at most ⌊log₂ n⌋ + 1 steps. [The longest query](#example:longest-query) is 15 = 1111, which reads four entries. [A power of two](#example:whole-array) reads one.

```check
Q: Which entries of T does prefix(11) read, in order?
* T[11], T[10], T[8]
- T[11], T[12], T[16]
- T[8], T[2], T[1]
- T[11], T[9], T[1]
= 11 = 1011₂. Clearing the lowest set bit gives 1010₂ = 10, then 1000₂ = 8, then 0. (T[11], T[12], T[16] is the path an add would take.)
```

## Range sums

A range sum is two prefix sums: `sum(l, r) = prefix(r) − prefix(l − 1)`. The `l − 1` is the same fence-post business as with plain prefix sums. With 1-based indices, `prefix(l − 1)` is everything before `A[l]`, and `prefix(0)` is 0.

The two walks often share entries. [A range of one cell](#example:single-cell), `sum(7, 7)`, reads `T[7]`, `T[6]` and `T[4]`, then reads `T[6]` and `T[4]` again to subtract them. Five reads to find one value. Oh well, it's still O(log n).

## Add: add the lowest bit

`add(i, delta)` has to change every entry whose range contains position i. Start at i, add delta to `T[i]`, then add the lowest set bit to i and repeat while i ≤ n. Each step lands on the next bigger range that contains the one before. `add(5, 3)` visits 5 = 101, 6 = 110, 8 = 1000 and 16 = 10000. [Show me](#play:add-climbs).

Each step at least doubles the lowest set bit, so this walk is also at most ⌊log₂ n⌋ + 1 steps. [The longest update](#example:longest-update) starts at 1, because every power of two covers `A[1]`.

## Building the tree

You can build T with one `add` per value: n walks of up to log n steps, O(n log n). [Building with one add per value](#example:build-by-adds) makes 48 additions for 16 values.

There's a better way. Copy A into T. Then go through i = 1 to n, and add `T[i]` into its parent, `T[i + (i & −i)]`, if there is one. When the loop reaches i, every range inside `T[i]` has already passed its total up, so `T[i]` is complete and ready to pass on. That is n − 1 additions at most, O(n). [Show me](#play:build-linear). The **Build** option switches between the two; build the same list both ways and compare the build cost.

## When to use one, and when not to

Use a Fenwick tree when the array changes and you keep asking for sums: running totals that get corrected, frequency tables, leaderboards, counting inversions (walk the array and ask how many bigger values came before each one). It is short enough to write from memory, and it needs n + 1 numbers and nothing else.

It needs an operation you can undo. Sums work, and so does xor, because a range is the difference of two prefixes. Minimums don't subtract, so a Fenwick tree cannot answer `min(l, r)`. If you need range minimums or maximums with updates, or an update that changes a whole range at once, use a [segment tree](/segment-tree/). If the array never changes, plain [prefix sums](/range-queries/) are simpler and answer in O(1).

## Variants

- **Range update, point query.** Store differences instead of values: to add x to `A[l..r]`, call `add(l, x)` and `add(r + 1, −x)`. The current value of `A[i]` is then `prefix(i)`.
- **Range update, range query.** Two Fenwick trees together can do both in O(log n).
- **Two dimensions.** A Fenwick tree of Fenwick trees sums rectangles of a grid in O(log² n).
- **Searching.** Walking down the bits from the top finds the smallest i with `prefix(i) ≥ k` in O(log n). With counts in A, that is the k-th smallest value.
- **0-based versions** exist, with different bit tricks. They are easy to get subtly wrong, which is a good reason to keep the 1-based one.

## Common mistakes

- Calling `add(0, x)`. `0 & −0` is 0, so i never moves and the loop never ends.
- Mixing a 0-based array with the 1-based tree. Shift by one in exactly one place.
- Expecting `T[i]` to be `A[i]`, or to be the prefix sum up to i. It is `A[i]` only for odd i, and the prefix sum only for powers of two.
- Writing `prefix(r) − prefix(l)`. That leaves out `A[l]`.
- Using `add` to set a value. `add(i, x)` adds. To set `A[i]` to x, add `x − A[i]`, which means keeping a copy of A or computing `sum(i, i)` first.
- Building with n adds and calling it O(n).

## Try this

- [Three ranges make prefix(13)](#example:prefix-thirteen). Before pressing play, write 13 in binary and predict the entries.
- [An add climbs through every range that contains i](#example:add-climbs). Check that each box contains the one before it.
- [The longest query](#example:longest-query) and [the longest update](#example:longest-update). Which indices give the longest walks for n = 12?
- [Adds followed by queries](#example:add-then-query). The sums change straight away, and T never needs a rebuild.
- Start over with **Random values** and 16 values, then switch **Build** in Options and compare the build cost.
