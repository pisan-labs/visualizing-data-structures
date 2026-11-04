# Fibonacci numbers

F(0) = 0, F(1) = 1, and every Fibonacci number after that is the sum of the two before it: 0, 1, 1, 2, 3, 5, 8, 13, 21, and so on. The definition is recursive, so the first program everyone writes is recursive too. It is also painfully slow. This page is about the fix, which is the whole idea of dynamic programming: work out each smaller answer once, keep it in a table, and look it up the next time it comes along.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `fib(n)` bottom-up | Fills a table F[0..n] from the left | O(n) time, O(n) space |
| `fib(n)` top-down with a memo | Recurses, but stores every answer | O(n) time, O(n) space |
| `fib(n)` plain recursion | Recurses with no table | O(φⁿ) time, about 1.618ⁿ |

The two dynamic programming versions fill the same table with the same numbers. They fill it in a different order.

## The plain recursion

```
fib(n): if n <= 1 return n, else return fib(n - 1) + fib(n - 2)
```

Short, and correct. How many calls does fib(5) make? Fifteen. fib(10) makes 177, and fib(30) makes 2,692,537 calls to produce 832,040. The two calls overlap: fib(5) calls fib(4) and fib(3), but fib(4) calls fib(3) again, and each of those calls fib(2), and so on down. fib(30) works out F(2) more than half a million times. The [Fibonacci call tree](/fibonacci-calls/) page draws every one of those calls.

## Bottom-up: fill a table

Bottom-up turns the recursion around. Start with the base cases, F[0] = 0 and F[1] = 1, then fill F[2], F[3], and so on, left to right. By the time you get to F[i], the two cells it needs are already filled, so each cell costs one addition. The arcs over the table show which two cells a value reads. [Show me](#play:bottom-up)

That is the whole cost: n - 1 additions, so O(n). [F(15) takes fourteen](#example:largest), where the plain recursion makes 1973 calls.

## Top-down: recurse, but remember

Sometimes you would rather keep the recursive code. Add a memo: an array with a cell for each F(k), all empty at the start. Before a call does any work, it looks in the memo. If the answer is there, the call returns it at once, a memo hit. If not, it works the answer out, stores it, and then returns. This is memoization (no r, you are writing a memo).

The order is the interesting part. memoFib(6) asks for F(5) first, which asks for F(4), and so on down to memoFib(1). That is the first call to finish, so F[1] is the first cell filled, then F[0], then F[2], F[3] and up to F[6]. The row of boxes under the table is the call stack; each box sits under its own cell. [Show me](#play:memo-order) Set the detail level to Milestones to see only the fills.

```check
Q: Top-down, memoFib(5) asks for F(4) before F(3). Which memo cell is filled first?
- F[0]
* F[1]
- F[2]
- F[5]
= The calls go straight down to memoFib(1), a base case and the first call to finish. F[0] comes next, from the second call memoFib(2) makes.
```

## What it costs

Bottom-up does n - 1 additions. Top-down makes 2n - 1 calls: n + 1 of them fill a cell, and the other n - 2 are memo hits that return at once. For F(9) that is 17 calls, against 109 without the memo. [Show me](#play:memo-hits) Both are O(n).

Both keep O(n) values in the table, and top-down also has up to n calls waiting on the stack. Bottom-up can drop the table altogether. F[i] only needs the last two values, so two variables are enough and the space is O(1).

```check
Q: How many additions does bottom-up fib(10) make?
* 9
- 10
- 55
- 177
= One for each cell from F[2] to F[10]; the base cases need none. 55 is F(10) itself, and 177 is how many calls the plain recursion makes.
```

## When to use it

Dynamic programming pays off when a problem breaks into smaller problems that overlap, so the same ones come up again and again. Fibonacci is the smallest example. Making change, the longest common subsequence, edit distance and the knapsack problem follow the same plan: decide what a cell means, fill in the base cases, and find the rule that fills a cell from cells that are already filled.

Bottom-up is usually a little faster, since it makes no calls, and it never runs out of stack. Top-down is often easier to write, because it is the recursion you already have, and it fills only the cells it needs. Fibonacci needs all of them, so that advantage does not show up here.

Skip the table when the smaller problems do not overlap. Merge sort splits an array into halves that share nothing, so a memo would store answers nobody asks for twice.

## Common mistakes

- Getting the base cases wrong. CLRS uses F(0) = 0 and F(1) = 1. Start with F(0) = F(1) = 1 and every answer comes out one place off.
- Filling the table in the wrong order. F[i] has to come after F[i - 1] and F[i - 2].
- Creating the memo inside the recursive function, so every call starts with an empty one. That is the plain recursion again, with extra work.
- Overflow. F(47) does not fit in a 32-bit int, and F(93) does not fit in a 64-bit long. Python does not mind.
- Deep recursion. Top-down fib(n) goes n calls deep, and Python stops at a depth of about 1000 by default.

## Try this

- [Bottom-up: fill the table from the left](#example:bottom-up). Predict each cell before it fills.
- [Top-down: cells fill as the calls finish](#example:memo-order). Which cell is first, and which is last?
- [Memo hits](#example:memo-hits). Count the calls that do no work.
- [The smallest cases](#example:base-cases): F(0), F(1) and F(2).
- Switch **Style** and run the same n again. Same table, different order.
