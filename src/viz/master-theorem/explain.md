# Recurrences and the Master theorem

A divide-and-conquer algorithm splits a problem of size n into a pieces of size n/b, solves each piece the same way, and does some extra work f(n) to split and combine. Its running time is a recurrence:

T(n) = a·T(n/b) + f(n)

Merge sort is T(n) = 2T(n/2) + n: two halves, plus n to merge. Binary search is T(n) = T(n/2) + 1: one half, plus one comparison. The Master theorem reads off the answer without solving anything, as long as the recurrence has this shape.

## Draw the tree

Don't memorize the theorem first. Draw the recursion tree, and the theorem falls out.

The root is one call on size n and does f(n) work. Level 1 has a calls on size n/b. Level i has aⁱ calls on size n/bⁱ. The size reaches 1 after log_b n levels, so there are log_b n + 1 levels, and the bottom level has a^(log_b n) leaves. That number is the same as n^(log_b a), which looks like a typo but isn't: take log_b of both and you get (log_b n)(log_b a) either way.

Press **Solve** and the drawing expands the tree one level at a time and writes down the work of each level, beside the tree when there is room and under it when not. [Show me](#play:merge-sort)

## Three ways it can go

With f(n) = n^d, level i does aⁱ · (n/bⁱ)^d = n^d · (a/b^d)ⁱ work. So the work per level is a geometric series with ratio a/b^d, and there are only three things a geometric series can do.

- **It shrinks** (a < b^d). The root does the most work and everything below adds up to a constant times it. T(n) = Θ(n^d). [The root dominates](#example:root-wins)
- **It stays the same** (a = b^d). Every level does n^d and there are about log n levels. T(n) = Θ(n^d log n). Merge sort lives here.
- **It grows** (a > b^d). The leaves do the most work, and there are n^(log_b a) of them. T(n) = Θ(n^(log_b a)). [Leaves dominate: Karatsuba](#example:leaves-win)

That is the whole theorem, in its simplified form. The **Form of the theorem** option switches to it. [The simplified form](#example:simple-form)

```check
Q: What is T(n) = 4T(n/2) + n?
- Θ(n)
- Θ(n log n)
* Θ(n²)
- Θ(n⁴)
= a = 4 is bigger than b^d = 2, so the leaves win: n^(log₂ 4) = n².
```

## The CLRS version

CLRS states the same idea by comparing f(n) with n^(log_b a), the work of the leaves.

1. If f(n) is polynomially smaller than n^(log_b a), T(n) = Θ(n^(log_b a)).
2. If f(n) = Θ(n^(log_b a) lgᵏ n) for some k ≥ 0, T(n) = Θ(n^(log_b a) lgᵏ⁺¹ n).
3. If f(n) is polynomially bigger, and a·f(n/b) ≤ c·f(n) for some c < 1 (the regularity condition), T(n) = Θ(f(n)).

Case 2 is more general than "the levels tie": with k = 1, T(n) = 2T(n/2) + n lg n comes out as Θ(n lg² n). [A log factor in case 2](#example:log-factor)

The regularity condition only matters for strange f. For any n^d lgᵏ n with d bigger than log_b a, it holds.

## The gap

"Polynomially smaller" means smaller by a factor of n^ε for some ε > 0. A log is not enough. T(n) = 2T(n/2) + n / lg n has f a little smaller than n, but only by a log, so case 1 does not apply, and case 2 needs k ≥ 0. No case fits. Summing the levels by hand gives n · (1 + 1/2 + 1/3 + ... + 1/lg n), which is Θ(n lg lg n). [The gap between the cases](#example:the-gap)

```check
Q: Which case applies to T(n) = 2T(n/2) + n / lg n?
- Case 1, because f(n) is smaller than n
- Case 2, with k = -1
* None of them
= f(n) is smaller than n only by a log factor, not by a power of n, and case 2 needs k ≥ 0.
```

## Check with numbers

Don't trust a formula you can't test. **Check with numbers** works out T(n) exactly for n = b, b², b³, ..., starting from T(1) = 1, and divides by the answer. If the answer is right, the ratio settles toward a constant. If it keeps growing, the answer is too small. For merge sort the ratio heads to 1, because T(2ᵐ) = 2ᵐ(m + 1) exactly.

## When the theorem doesn't apply

- Unequal pieces: T(n) = T(n/3) + T(2n/3) + n. Draw the tree anyway (or use Akra-Bazzi). It is Θ(n log n).
- Subtracting instead of dividing: T(n) = T(n - 1) + n is Θ(n²), and T(n) = 2T(n - 1) + 1 is Θ(2ⁿ). Neither has the a·T(n/b) shape.
- a < 1, or a that depends on n. The theorem needs a constant a ≥ 1 and b > 1.
- f in the gap, as above.

## Common mistakes

- Comparing f(n) with n^a or n^b instead of n^(log_b a).
- Forgetting the log in case 2. Θ(n) for merge sort is wrong by a factor of log n.
- Rounding log₂ 3 to 1.5 and then claiming n^1.5. It is about 1.585.
- Using case 3 without the regularity condition. For polynomials it holds; for things like f(n) = n(2 - cos n) it doesn't.
- Calling n / lg n "polynomially smaller" than n. It isn't.

## Try this

- [Binary search](#example:binary-search). The tree is a chain. Why is the answer the number of levels?
- [Strassen's matrix multiply](#example:strassen). Change the 7 to an 8 and solve again. That is the school method.
- Type `T(n) = 9T(n/3) + n^2` and press **Solve**. Which case? Then try `9 3 1` and `9 3 3`.
- Try `2 4 0` and `2 4 1`. Can you predict the answers before pressing Solve?
