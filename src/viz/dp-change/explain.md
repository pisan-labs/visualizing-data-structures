# Making change

You have coins of a few sizes and an amount to pay. What is the fewest number of coins that pays it exactly? Most of us grab the biggest coin that fits, then the biggest coin that fits what is left, and so on. That is the greedy method. With coins 1, 5, 10 and 25 it works. With coins 1, 3 and 4 it does not: greedy pays 6 as 4 + 1 + 1, three coins, when 3 + 3 does it with two.

Dynamic programming gets it right every time. It works out the answer for every smaller amount first.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `change(A)`, fewest coins | Fills F[0..A] and pays A with the fewest coins | O(A·k) time, O(A) space |
| `change(A)`, number of ways | Counts the ways to make A, ignoring order | O(A·k) time, O(A·k) space |

Here k is the number of coin sizes. Let F[a] be the fewest coins that make a, with F[0] = 0. Whatever the best way to pay a is, its last coin is one of the k coins. If that coin is c, the rest, a − c, has to be paid as cheaply as possible too. So F[a] is the smallest F[a − c] + 1 over the coins c that fit. The table fills from 0 up, so F[a − c] is always ready when F[a] needs it.

## Filling the table

The arcs over F show the cells F[a] reads, one arc per coin, and the blue arc wins. The row under F, coin, remembers which coin won. [Show me](#play:greedy-fails)

When no coin fits, or every F[a − c] is ∞, the amount cannot be made at all, and F[a] = ∞. With coins 3 and 5, the amounts 1, 2, 4 and 7 are impossible. [Show me](#play:greedy-stuck)

```check
Q: With coins 1, 3 and 4, F[5] = 2, F[3] = 1 and F[2] = 2. What is F[6]?
- 1
* 2
- 3
- 4
= F[6] is the smallest of F[5] + 1 = 3, F[3] + 1 = 2 and F[2] + 1 = 3. The 3 wins, and coin[6] = 3.
```

## Which coins?

F[A] says how many coins, not which ones. The coin row says which. coin[A] is the last coin paid, so pay it and move left to A − coin[A]. Repeat until you reach 0. That is the traceback, and it costs one step per coin.

## Why greedy fails

Greedy commits to the largest coin before it looks at what is left. For 6 with coins 1, 3 and 4, taking the 4 leaves 2, and 2 costs two more coins. The table compares all three first choices: 6 − 1 = 5 costs 2 coins, 6 − 3 = 3 costs 1, and 6 − 4 = 2 costs 2. The 3 wins.

Greedy can also get stuck. With coins 3 and 5, it pays 11 with 5 + 5 and then has no coin for the last 1, while the table finds 3 + 3 + 5.

For some coin systems greedy is always right; they are called canonical. US coins (1, 5, 10, 25) are canonical, and so are [1, 5 and 10](#example:greedy-works). Add a 6 to those and greedy pays 10 as 6 + 1 + 1 + 1 + 1 instead of 5 + 5. If you are not sure about your coins, use the table.

## Counting the ways

Switch **Find** to the number of ways. Now the order of the coins does not matter: 1 + 3 and 3 + 1 are the same way. The table gets a row per coin, and row i may use only the first i coins. W[i][a] = W[i − 1][a] + W[i][a − c], where c is coin i. The first term counts the ways that skip coin i (the cell above). The second counts the ways that use it at least once: pay one c, then make a − c with the same coins (the cell c to the left, in the same row). [Show me](#play:count-ways)

Why rows? If every cell simply added up W[a − c] over all the coins, the way the fewest-coins table takes a minimum, it would count 1 + 3 and 3 + 1 separately. That counts orderings, not ways. The code tabs keep a single row and update it one coin at a time: the same numbers in O(A) space.

```check
Q: With coins 1 and 2, how many ways are there to make 4?
- 2
* 3
- 4
- 5
= 1+1+1+1, 1+1+2 and 2+2. Counting the orders too gives 5, because 1+1+2, 1+2+1 and 2+1+1 would all count.
```

## What it costs

Each of the A amounts tries each coin that fits, so the time is O(A·k). [Five coins and amount 12](#example:most-work) take 50 tries. The ways table has (k + 1)(A + 1) cells, one addition each, and [thirteen ways to make 12](#example:many-ways) cost no more than one.

O(A·k) looks polynomial, but A is a number, not a length. An amount with 30 digits would need a table with about 10³⁰ cells. Algorithms like this are called pseudo-polynomial: fast for amounts up to a few million, hopeless for huge ones.

## When to use it

Use the table when the coins might not be canonical, when some amounts might be impossible, or when you need the number of ways. Greedy is faster and needs no table, so it is the right tool for coins you know are canonical, which is why cashiers get away with it.

## Common mistakes

- Starting F[a] at 0 instead of ∞. The minimum then never changes.
- Adding 1 to "infinity". A sentinel like `INT_MAX` overflows when you add 1, which is why the Java and C++ tabs check for it first.
- Looping over amounts on the outside and coins on the inside when counting ways. That counts orderings.
- Forgetting that some amounts are impossible. F[A] = ∞ is an answer too: it cannot be done.
- Trusting greedy because it worked on the first few amounts you tried.

## Try this

- [Coins 1, 3 and 4, amount 6](#example:greedy-fails). Predict F[6] before the table gets there.
- [Coins 3 and 5, amount 11](#example:greedy-stuck). Which cells are ∞, and why?
- [Coins 1, 5 and 10](#example:greedy-works). Then set the coins to 1 5 6 and make 10.
- [How many ways to make 6?](#example:count-ways) List them by hand first.
- Switch **Find** and run the same amount again. One table keeps the smallest choice in each cell, the other adds them up.
