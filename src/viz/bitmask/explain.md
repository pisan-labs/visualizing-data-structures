# Bitmasks and subsets

An integer is a row of bits. Read bit i as "is i in the set?" and one integer holds a whole set of small numbers. x = 37 is `00100101`, bits 0, 2 and 5 are on, so x is the set {0, 2, 5}.

Why bother? A set stored this way fits in one machine word, copies in one instruction, and can be used as an array index. Union is `|`, intersection is `&`. Dynamic programming over subsets (travelling salesman, assignment problems) stores its table indexed by masks, and that only works because a subset *is* a number.

## The operations

| Operation | Code | Cost |
|---|---|---|
| Add i to the set | `x \| (1 << i)` | O(1) |
| Remove i | `x & ~(1 << i)` | O(1) |
| Flip i | `x ^ (1 << i)` | O(1) |
| Is i in the set? | `(x >> i) & 1` | O(1) |
| Lowest set bit | `x & -x` | O(1) |
| Count the set bits | loop on `x & (x - 1)` | O(number of 1s) |
| Every subset of n items | `for mask in 0 .. 2^n - 1` | Θ(2ⁿ) |
| Every submask of x | `sub = (sub - 1) & x` | Θ(2ᵏ) for k set bits |

All of the single-bit operations follow one pattern. Build a mask with only bit i on, `1 << i`, then combine it with x. OR turns the bit on, AND with the flipped mask turns it off, XOR flips it. The other bits never move. [Show me](#play:set-clear-toggle)

## Two's complement and x & -x

Computers store -x as `~x + 1`: flip every bit, then add one. Adding one to the flipped bits carries through the trailing 1s (which were the trailing 0s of x) and stops at the first 0, which was the lowest 1 of x. Below that point, -x and x are both zeros. Above it, -x is the flip of x. So `x & -x` keeps exactly one bit: the lowest 1.

It looks like a party trick. It is the engine of the Fenwick tree, which uses it to jump between ranges. [The lowest set bit](#example:lowest-bit)

```check
Q: What is x & -x for x = 12 (binary 1100)?
- 12
* 4
- 8
- 1
= The lowest 1 of 1100 is worth 4, and x & -x keeps only that bit.
```

## Counting bits

The obvious way tests every bit, so it always does w steps for a w-bit number. Brian Kernighan's trick does better: `x & (x - 1)` clears the lowest 1. Subtracting one turns the lowest 1 into 0 and the zeros below it into 1s, and the AND throws away everything that changed. Loop until x is 0 and count the passes. The loop runs once per set bit, so 128 takes one pass and 255 takes eight. [Counting a single bit](#example:popcount-one-bit) and [counting all ones](#example:popcount-all-ones). The **Count bits by** option switches to the scan, so you can compare. [A scan looks at every bit](#example:scan-every-bit)

In practice, use the library. Python has `int.bit_count()`, Java has `Integer.bitCount`, C++20 has `std::popcount`, and most processors do it in one instruction.

## Walking every subset

The subsets of n items are the numbers 0 to 2ⁿ - 1. That's it. Counting up visits each subset once, and the bits of the counter say what is in it. [Every subset of three items](#example:all-subsets)

The submasks of a mask x are harder. You want only the numbers whose 1s are all inside x. Counting down from x and skipping the misfits wastes time, so use `sub = (sub - 1) & x`. Subtracting one makes the next smaller number, and `& x` drops the bits that are not in x, which lands on the next smaller submask. Stop after 0. A mask with k set bits has 2ᵏ submasks and the loop visits each one exactly once. [Show me](#play:submasks)

Over all masks of n bits, the submask loops add up to 3ⁿ steps, not 4ⁿ. Each bit is either outside x, in x but not in sub, or in both: three choices per bit. That 3ⁿ shows up in subset DP.

```check
Q: How many submasks does x = 10110 have (counting x and 0)?
- 3
- 5
* 8
- 22
= x has 3 set bits, and each one is kept or dropped: 2³ = 8.
```

## When to use it and when not to

Use a bitmask when the universe is small and fixed: up to 64 items for a `long`, a few more with two words. Flags, permissions, the squares a chess piece attacks, which cities a path has visited. The speed comes from doing a whole word in one instruction.

Avoid it when the set can grow past the word size or when the items are not small integers. A hash set or a sorted array is easier to read. Code full of `>>` and `&` is hard to debug, so leave a comment.

## Common mistakes

- Precedence. In C and C++, `x & 1 == 0` means `x & (1 == 0)`, which is always 0. Java reads it the same way and then refuses to compile it: `int & boolean` is a type error. Write `(x & 1) == 0`.
- Shifting too far. `1 << 31` in Java is negative, and `1 << 32` in C++ on a 32-bit int is undefined. Use `1L << i` or an unsigned type.
- Right-shifting a negative number. Java's `>>` copies the sign bit; `>>>` does not.
- Forgetting the empty set. Subset loops that start at 1 miss it, and submask loops that stop at `sub > 0` never visit 0.
- Counting with a scan when the numbers are sparse. Not wrong, just slower than it needs to be.

## Try this

- [Set, clear, toggle, test](#example:set-clear-toggle). Predict x after each step before you look.
- [The lowest set bit](#example:lowest-bit). Why is the answer for an odd number always 1?
- [The empty set](#example:empty-set). Every operation on 0, the set with nothing in it.
- Set **Bits in x** to 4 and run **All subsets of n** with 4. Every number from 0 to 15 is a subset.
- Type `0b11111` in the box, press **Set x to**, then open **More operations** and run **Submasks of x**. Thirty-two of them. Add one bit and it would be 64.
