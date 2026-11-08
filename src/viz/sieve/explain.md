# Sieve of Eratosthenes

You want every prime up to n. You could test each number by trial division, which costs about √k divisions for each k. Eratosthenes (the librarian at Alexandria who also measured the Earth) had a better idea: don't test anything. Cross out the multiples of each prime, and whatever is never crossed out is prime.

```
mark every k in 2..n as not crossed out
for p = 2 while p·p ≤ n
  if p is not crossed out
    p is prime
    for j = p·p to n step p
      cross out j
every k not crossed out is prime
```

| | Cost |
|---|---|
| Time | O(n log log n) cross-outs |
| Memory | O(n): one mark per number |
| Trial division, for comparison | up to √k divisions for each k: O(n √n) |

log log n is tiny. For n = a billion it is about 3. So the sieve is linear time in practice.

## How it works

Start at 2. Nobody crossed it out, so it is prime. Cross out 4, 6, 8, ... Next is 3: still there, so prime. Cross out 9, 12, 15, ... 4 is crossed out, skip it. 5 is prime. And so on. [The primes up to 100](#play:primes-to-100)

On a phone the grid has rows of 10, so the multiples of 2, 5 and 10 line up in columns and the multiples of 3 and 9 make diagonals. (A laptop gets longer rows, and the patterns tilt.) Crossed-out numbers fade with a slash through them. Primes get a colored box.

```check
Q: Running the sieve up to 50, which is the first number p = 7 crosses out?
- 14
- 21
* 49
- 7
= 49 = 7². 14, 21, 28, 35 and 42 have the smaller prime factors 2, 3 or 5, so they are already gone.
```

## Two shortcuts

**Start at p².** Every multiple of p below p², like 7·2, 7·3, 7·4, 7·5 and 7·6, has a smaller prime factor, so a smaller prime crossed it out already. Set **Cross out multiples of p from** to 2p to see the waste: [the same primes, more cross-outs](#example:start-at-2p).

**Stop at √n.** If k ≤ n is composite, k = a·b with a ≤ b, so a ≤ √k ≤ √n. So every composite number up to n has a prime factor no bigger than √n, and is crossed out by the time p passes √n. Set **Stop** to p = n and watch the primes past √n cross out nothing at all. [Going past the square root](#example:no-stop-at-root)

Neither shortcut changes the answer. Both change the work. Starting at 2p, the prime 3 crosses out 6, 12, 18 and every other multiple of 6 a second time.

## Why n log log n

Prime p crosses out about n/p numbers. Add that up over the primes up to √n: n·(1/2 + 1/3 + 1/5 + 1/7 + ...). The sum of the reciprocals of the primes grows like log log n (Euler showed it diverges, but only just). So the total is n log log n. The counter **cross-outs** counts every one of them, including numbers that were crossed out already; **crossed out** counts the numbers.

```check
Q: Up to 100, the sieve makes 104 cross-outs but only 74 numbers are crossed out. Why the difference?
- The counter has a bug
* Some numbers, like 12 = 2²·3, are crossed out by more than one prime
- The primes cross themselves out
- Numbers below p² are crossed out twice
= 12 is crossed out by 2 (at 12) and again by 3 (from 9: 9, 12). A number is hit once for each prime factor p with p² no bigger than the number, so 6 is hit only once: 3 starts at 9.
```

## The linear sieve

The extra cross-outs bother some people (me included, a little). The linear sieve (Gries and Misra) crosses out each composite exactly once, by its smallest prime factor: for each k, and each prime p no bigger than k's smallest prime factor, cross out p·k. That is O(n) time, and as a bonus it records the smallest prime factor of every number, which makes factoring any number up to n quick. In practice the plain sieve is often just as fast, because its inner loop is so simple.

## When to use it, and common mistakes

Use it when you need many primes, or a table of "is k prime?" for every k up to n. Competitive programmers write it from memory. For one big number (is this 300-digit number prime?) it is useless: the array alone would not fit in the universe. Use Miller-Rabin for that.

Common mistakes:

- Starting the outer loop at 1. Then 1 crosses out everything.
- Using `p * p <= n` with 32-bit integers and a huge n: p·p overflows. Compare p with √n instead, or use longs.
- Forgetting n itself: the loops go up to n, inclusive.
- Thinking 1 is prime. It isn't, by convention, which is why the grid shows it faded.

For a big n the array gets big too. A segmented sieve does one block at a time, using only the primes up to √n, so the memory drops to O(√n).

## Try this

- Sieve up to 49 and up to 48. Which prime crosses something out in one but not the other?
- Predict the number of primes up to 120, then run it. (Hint: there are 25 up to 100.)
- Run 60 with each setting and compare the cross-outs counter.
- Which numbers up to 100 get crossed out the most times? Step through and count.
