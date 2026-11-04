# Fibonacci call tree

The Fibonacci numbers start 0, 1, 1, 2, 3, 5, 8, 13, and each one is the sum of the two before it. Written as recursion, that is two lines of code. It is also one of the slowest ways to compute anything that has ever made it into a textbook. This page shows why.

## One call makes two more

Here is the recursion, written the way CLRS writes it.

```
fib(n)
  if n <= 1
    return n
  x = fib(n - 1)
  y = fib(n - 2)
  return x + y
```

Every call above the base cases makes two more calls, and each of those makes two more. The tree of calls branches at every level.

| | Without a memo | With a memo |
|---|---|---|
| Calls for fib(n) | 2 fib(n + 1) − 1 | 2n − 1 |
| Time | Θ(φⁿ), about 1.6ⁿ | O(n) |
| Stack depth | O(n) | O(n) |

[Show me](#play:fifteen-calls)

## Reading the tree

Each box is a call, and its children are the calls it makes: `fib(n - 1)` on the left, `fib(n - 2)` on the right. A call finishes everything on its left before it starts its right call, so the calls happen top to bottom, down the left edge first. The highlighted path from the top to the running call is exactly the call stack. Finished calls are dimmed and show what they returned.

With more than 15 calls the boxes shrink to just the number n, so the whole tree still fits. The counts under the tree say how many times each fib(k) has been called so far.

## The same work, again and again

In `fib(5)`, the call `fib(3)` happens twice: once on the left edge, and again as the second call of `fib(5)` itself. Both times it does all of its own calls over again. `fib(2)` happens three times. A badge such as "2nd" marks each call that redoes a subproblem it has already solved. [fib(3) computed three times](#example:three-times)

The counts form a pattern. In `fib(n)`, the call `fib(k)` happens fib(n − k + 1) times, for k ≥ 1. The waste is a Fibonacci number too.

```check
Q: Without a memo, how many calls does `fib(5)` make, counting the first one?
- 5
- 8
* 15
- 31
= `fib(5)` is one call, plus the 9 calls of `fib(4)`, plus the 5 calls of `fib(3)`: 1 + 9 + 5 = 15.
```

## Exponential time, linear stack

The number of calls follows its own recurrence: C(n) = 1 + C(n − 1) + C(n − 2), with C(0) = C(1) = 1. That works out to 2 fib(n + 1) − 1, and fib(n) grows like φⁿ, where φ ≈ 1.618 is the golden ratio. Each step up in n costs about 1.6 times as much. `fib(8)` makes 67 calls. `fib(30)` makes about 2.7 million. `fib(40)` makes over 330 million, to compute one number. [67 calls](#example:explosion)

The stack is a different story. It only ever holds one path down the tree, so it is never more than n frames deep. The time is exponential and the space is linear. Mixing the two up is a common exam mistake.

## Remember the answers

The fix is to remember each answer the first time it is computed. Before computing `fib(n)`, look in the memo; if `n` is there, return it at once.

```
fib(n)
  if n <= 1
    return n
  if memo[n] is known
    return memo[n]
  x = fib(n - 1)
  y = fib(n - 2)
  memo[n] = x + y
  return memo[n]
```

Turn on **Remember answers** and run the same n. The tree keeps its shape, but the second `fib(3)` is answered from the memo, and every call it would have made is drawn dashed. Only the left edge is computed, so `fib(n)` makes 2n − 1 calls: 15 for `fib(8)` instead of 67. [Show me](#play:memo-five)

This is top-down dynamic programming: the same recursion, plus a table. Computing the table bottom-up with a loop needs no stack at all, and keeping only the last two values needs O(1) space.

```check
Q: With the memo, how many calls does `fib(8)` make?
- 8
* 15
- 34
- 67
= `fib(8)` down to `fib(2)` are computed once each (7 calls), `fib(2)` also calls `fib(1)` and `fib(0)` (2 more), and each of the 6 computed calls above `fib(2)` makes one second call that the memo or a base case answers at once. 7 + 2 + 6 = 15.
```

## When to use it, when to avoid it

Never compute Fibonacci numbers with the plain recursion in real code. It is here because it makes exponential growth visible in a way a formula does not. Reach for a memo whenever a recursion keeps solving the same subproblems: the tree is the clue. In Python, `functools.cache` adds a memo to a function in one line. For Fibonacci itself a loop is simpler still.

## Common mistakes

- Thinking the stack grows like the tree. It doesn't: only one path is on the stack at a time.
- Giving each recursive call a fresh memo. The memo has to be shared by all the calls, or nothing is remembered.
- Making the two calls before checking the memo. The check has to come first.
- Forgetting how fast fib(n) grows. `fib(47)` no longer fits in a 32-bit `int`, and `fib(93)` is too big for a 64-bit `long`.

## Try this

- [fib(5) makes 15 calls](#example:fifteen-calls). Before you press play, guess how many times `fib(2)` is computed.
- [fib(4): the first repeat](#example:fib-four) and [the base cases](#example:base-cases).
- [fib(3) three times](#example:three-times) and [67 calls](#example:explosion). Set detail to Milestones to jump from repeat to repeat.
- [The memo on fib(5)](#example:memo-five) and [on fib(8)](#example:memo-eight). Count the dashed calls.
- Type `1 2 3 4 5 6 7` and press **Call fib**. The calls go 1, 3, 5, 9, 15, 25, 41.
