# Dining philosophers

A round table, a philosopher at each seat, and one fork between each pair of neighbours. To eat you need both forks, the one on your left and the one on your right. So every philosopher picks up the left fork, then the right one, eats, and puts both down. What could go wrong? Everybody picks up the left fork at the same moment. Then everybody waits for the right one, which the neighbour is holding. For ever.

Dijkstra set this as an exam problem in the 1960s, about computers sharing tape drives; Hoare turned the computers into philosophers. The classic table has five. This page seats three or four, because five lanes don't fit on a phone, and nothing changes but the size of the circle.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `lock(f)` | pick up fork f, or wait until its holder puts it down | one step, then the wait |
| `unlock(f)` | put fork f down; a neighbour waiting for it picks it up | one step |
| Step P1 … P4 | that philosopher does its next step | O(1) |
| Every interleaving | every order of the steps, and which ones deadlock | 3,051 for three philosophers |

Each fork is a lock. P1's left fork is f1 and its right fork is f2; P2's are f2 and f3, and so on round the table, so the last philosopher's right fork is f1 again. The table beside the lanes shows who holds what: a fork slides toward the philosopher holding it, a dashed arrow points from a waiting philosopher to the fork it wants, and a philosopher with both forks lights up. [Show me](#play:everyone-left)

## How it deadlocks

In [Everyone holds a left fork](#example:everyone-left), P1 picks up f1, P2 picks up f2 and P3 picks up f3. Nothing has gone wrong yet. Nobody is even waiting. But the narration says it at the third step: from here, every schedule ends in deadlock. P1 reaches for f2 and waits for P2. P2 reaches for f3 and waits for P3. P3 reaches for f1 and waits for P1.

That is the wait-for graph of the [deadlock](/deadlock/) page, and it is a cycle: P1 → P2 → P3 → P1. Every philosopher holds one fork and waits for the next one's, so nobody eats and nobody ever puts a fork down. With four ([Four philosophers, four forks, deadlock](#example:four-deadlock)) the cycle is just longer.

```check
Q: Three philosophers, no fix. P1 holds f1 and P2 holds f2. Which next step makes the deadlock certain?
- P1 reaches for f2
- P2 picks up f3
* P3 picks up f3
= Once all three hold a left fork, each one's next step waits for a neighbour. If P2 gets f3 first, it eats and puts both forks down.
```

## Every interleaving

[Every interleaving, no fix](#example:every-none): 3,051 orders of the steps, and 48 deadlock. That's about 1.6%. The 48 are the runs where all three pick up a left fork before anyone gets a right one. With four philosophers ([Every interleaving of four](#example:every-four)) it is 1,088 out of 16,672,432, which the page counts by state rather than one by one. Rare. Rare is the problem: a program that deadlocks once in a thousand runs passes its tests and freezes in production.

## Fix 1: one philosopher reaches the other way

Set Fix to The last philosopher takes the right fork first. Now P3 picks up f1 first, then f3. Look at the fork numbers: every philosopher now picks up the lower-numbered of its two forks first. That's one global order, the same fix as on the deadlock page, and a cycle needs somebody to break it. OSTEP fixes the table the same way.

[The last one reaches right first](#example:right-first) runs the deadlock schedule again. P1 picks up f1 and P2 picks up f2. P3 reaches for f1, finds P1 holding it, and waits with empty hands. So f3 stays on the table, P2 takes it and eats, and everybody else follows. [Every interleaving with one philosopher reversed](#example:every-order): 3,664 orders of the steps, and every one ends with everyone fed.

## Fix 2: a waiter

Set Fix to A waiter seats at most n − 1. The waiter is a [semaphore](/semaphore/) that starts at n − 1: a philosopher calls P(waiter) before reaching for any fork and V(waiter) after putting both down. Everyone still picks up the left fork first. Downey calls the waiter a footman.

Why does it work? With n − 1 philosophers at the table and n forks, at least one of them can get both forks, eat, and leave. In [The waiter seats two](#example:waiter-seats), P1 and P2 sit down and P3 waits for a seat, holding nothing. P2 gets both its forks and eats; when it leaves, P3 sits down. [Every interleaving with the waiter](#example:every-waiter): 679,446 orders, and all of them end with everyone fed. More orders than before, since the waiter adds two steps to everyone, but not one deadlock.

```check
Q: Five philosophers and a waiter semaphore. What is the largest start value that still rules out deadlock?
- 5
* 4
- 2
- 1
= With all five seated, all five can pick up a left fork, and that's the cycle again. With four seated there are five forks for four philosophers, so somebody gets two.
```

## The code

The tabs run the table on real threads: a `threading.Lock` per fork and a `threading.Semaphore` for the waiter in Python, `ReentrantLock` and `java.util.concurrent.Semaphore` in Java, and `std::mutex` with `std::lock_guard` in C++, where the waiter is a small semaphore class (C++17 has none). `dine` takes the fix: with "order" every philosopher locks the lower-numbered fork first, with "waiter" it asks for a seat first.

Real threads are not deterministic, so the tests step the page's program one step at a time with the forks kept by hand (`Table`), and then run real philosophers with each fix, two hundred meals each, all at once. They always finish. The page's own model is what explores the interleavings.

## Spot it

The cue is a ring: each worker needs two shared things, and neighbours share one of them.

- "Each of four servers in a ring copies files to the next one, and needs a lock on its own disk and on the neighbour's." Every server takes its own lock first: a cycle.
- "A transfer between two accounts locks both. Transfers run in every direction at once." Not a ring, but the same shape: lock the lower account number first.
- "At most k of n workers can run at once because of memory." That's the waiter: a counting semaphore.

The question to ask: can every worker end up holding one thing while waiting for the next worker's?

## Common mistakes

- Fixing it by making philosophers "try again later": put down the left fork if the right one is taken, then try again. It avoids deadlock but can livelock, everybody picking up and putting down in step.
- Reversing the wrong thing. Reversing the order in which a philosopher puts the forks down changes nothing; the order of picking them up is what makes the cycle. One philosopher picking up the other way round is enough.
- A waiter with n seats. Then everyone can sit, everyone can take a left fork, and you are back where you started.
- Thinking deadlock-free means fair. Both fixes stop the table from freezing; neither promises that a slow philosopher gets to eat soon.

## Try this

- With no fix, find a schedule where P2 eats first. Then one where nobody eats.
- With four philosophers, deadlock three of them while the fourth eats. Can you? Why not?
- With the order fix, step everyone once (`1 2 3`). Who is waiting, and for which fork?
- With the waiter, step everyone once, then press Every interleaving. How many ways are there to finish, and how many deadlock?
