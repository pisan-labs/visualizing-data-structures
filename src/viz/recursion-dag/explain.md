# Recursion tree vs memoized DAG

A recursive function can be drawn two ways. The call tree has a box for every call. The DAG (directed acyclic graph) has a box for every different subproblem, and an arrow for every call one subproblem makes to another. When subproblems repeat, the two pictures come apart fast. This page draws both, side by side, from the same run.

## Two pictures of one recursion

Run `fib(5)`. On the left, the tree gets a new box for every call, 15 in all. On the right, the DAG only gets a box the first time a subproblem shows up. When the tree calls `fib(3)` a second time, the DAG draws an arrow to the `fib(3)` box it already has, and the ×2 badge counts how many tree calls landed there. [Show me](#play:fib-five)

| | Tree | DAG |
|---|---|---|
| Boxes for fib(n) | 2 fib(n + 1) − 1 calls | n + 1 subproblems |
| Arrows | one per call below the top | 2(n − 1) |
| Calls with a memo | | 2n − 1 |

## Why the DAG is the memoized run

A memo stores each answer the first time it is computed. After that, a call to the same subproblem returns at once, so its whole subtree disappears. What is left is exactly the DAG: one computation per box, and one call per arrow. Count them and you have the cost of the memoized recursion: one call for the top box plus one per arrow. For `fib(5)` that is 1 + 8 = 9 calls, against 15 in the tree.

```check
Q: The DAG of `fib(n)` has n + 1 boxes, and every box above `fib(1)` has two arrows. How many calls does the memoized `fib(10)` make?
- 11
* 19
- 20
- 177
= 9 boxes (`fib(10)` down to `fib(2)`) have two arrows each: 18 arrows. One call per arrow, plus the first call: 19. The tree makes 177.
```

## Exponential against linear

The tree for `fib(n)` grows by about 1.6 times for every step up in n. The DAG grows by one box and two arrows. At `fib(8)` it is 67 calls against 15, and the gap only gets wider: at `fib(30)` it is about 2.7 million against 59. [fib(8)](#example:fib-eight)

The stack is the same in both: at most n frames, one path down the tree. The memo trades O(n) extra space for the exponential time.

## Binomial coefficients

C(n, k) counts the ways to choose k things out of n. Either you take the last thing, and choose k − 1 of the other n − 1, or you leave it and choose k of them: C(n, k) = C(n − 1, k − 1) + C(n − 1, k). Taking none or all of them is one way, so C(n, 0) = C(n, n) = 1. Switch **Recursion** to binomial coefficients and run `4 2`. [Show me](#play:binom-four-two)

The DAG lays the subproblems out like Pascal's triangle, because that is what it is: each entry is the sum of the two above it. The tree is much bigger. Every leaf of the tree returns 1, so the tree has C(n, k) leaves and 2 C(n, k) − 1 calls, and C(n, n / 2) grows like 2ⁿ / √n. The DAG has at most (k + 1)(n − k + 1) boxes. [The worst case for n = 6](#example:binom-six-three)

## When to use a memo, and when it does nothing

A memo pays off when the tree repeats subproblems. Draw the tree for a small input and look for repeated boxes: that is the clue. Not every recursion has them. `C(6, 1)` never meets the same subproblem twice, so its tree and its DAG are the same 11 boxes, and a memo only adds bookkeeping. Merge sort is the same: its halves never overlap. [Nothing to share](#example:nothing-shared)

Using a memo this way is top-down dynamic programming. Filling the same table bottom-up with loops needs no recursion at all, and is what the dynamic programming pages do.

## Common mistakes

- Counting boxes in the DAG as the number of calls. The memoized run makes one call per arrow, plus the first one.
- Expecting a memo to help every recursion. It only helps when subproblems repeat.
- Keying the memo on the wrong thing. For C(n, k) the key is the pair (n, k), not n alone.
- Forgetting that the memo itself costs space: one entry per box.

## Try this

- [fib(5)](#example:fib-five). Watch the ×k badges in the DAG: each one counts the tree calls that land on that box.
- [A base case](#example:fib-base) and [fib(8)](#example:fib-eight).
- [C(4, 2)](#example:binom-four-two) and [C(6, 3)](#example:binom-six-three). Find Pascal's triangle in the DAG.
- [C(6, 1)](#example:nothing-shared): the tree and the DAG match box for box.
- Type `2`, then `3`, `4`, `5` and `6`, and compare the readouts: tree calls against memo calls.
