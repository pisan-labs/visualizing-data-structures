# Deadlock

Two threads, two locks. T1 takes a, then b. T2 takes b, then a. Most of the time they take turns and nothing happens. Then one day T1 gets a, T2 gets b, and each waits for the other's lock. For ever. Nothing crashes and nothing prints; the program just stops. That is a deadlock, and it is a bug in the order the locks are taken, not in any one line of code.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `lock(m)` | take m if it is free; otherwise wait until its holder lets go | one step, then the wait |
| wait-for graph | an arrow T → U when T waits for a lock that U holds | O(V + E) to build |
| Find the cycle | depth-first search for a cycle in that graph | O(V + E) |
| Every interleaving | every order of the steps, and which ones deadlock | 14 schedules for two threads |

A deadlock on locks is exactly a cycle in the wait-for graph: T1 waits for T2, which waits for T1. Nobody on the cycle can move, because each needs someone else on the cycle to move first. [Show me](#play:opposite-orders)

## How it works

In [Opposite orders](#example:opposite-orders), T1 takes a and T2 takes b. That second step is where it is decided, although nothing looks wrong yet: each thread holds one lock and wants the other's. The narration says so: from here, every schedule ends in deadlock. T1 calls lock(b) and waits for T2. T2 calls lock(a) and waits for T1. No thread can run.

It only goes wrong when the two overlap. In [One at a time](#example:one-at-a-time), T1 takes both locks and lets go of both before T2 starts, and T2 finds them free. That's why deadlocks hide: the bad schedules need each thread to grab its first lock in a small window.

```check
Q: T1 takes a, then b. T2 takes b, then a. T1 has taken a. Which next step makes the deadlock certain?
- T1 takes b
* T2 takes b
- T2 calls lock(a) and waits
= Once T1 holds a and T2 holds b, each thread's next step waits for the other. If T1 takes b first instead, it finishes and lets go of both.
```

## Finding the cycle

Press Find the cycle. The page builds the wait-for graph (it has a box of its own) and runs the depth-first search from the [DFS](/dfs/) page on it, with CLRS's colors. A thread turns gray when the search enters it and black when every arrow out of it is done. An arrow to a gray thread is a back edge: it leads back to the search path, and that closes a cycle.

In [Find the cycle](#example:find-the-cycle) the search enters T1, follows T1 → T2, enters T2, and finds T2 → T1, back to gray T1. Cycle: T1 → T2 → T1.

With three threads, [T1 is stuck behind a cycle it is not on](#example:behind-the-cycle): T3 takes a, T2 takes b, and they wait for each other. Then T1 waits for a, which T3 holds. Every thread is stuck, but only T2 and T3 are on the cycle. The search starts at T1, walks to T3 and T2, and the back edge T2 → T3 closes the cycle. T1 is just in the queue behind it. Break the cycle and T1 gets going too.

Each thread waits for at most one lock, so each has at most one arrow out, and the search is linear in the threads. In a general graph you would look for a [strongly connected component](/scc/) with more than one vertex; here such a component is always a single cycle.

## Every interleaving

[Every interleaving, opposite orders](#example:every-opposite): 14 orders of the steps, and 4 of them deadlock (the ones where both threads hold their first lock at the same time). With three threads ([Every interleaving of three threads](#example:every-three)), 254 orders: 150 finish, 52 deadlock between T1 and T2 and 52 between T2 and T3. None between T1 and T3, since they take the locks in the same order.

## The fix: one global order

OSTEP lists four conditions a deadlock needs: mutual exclusion (a lock has one holder), hold and wait (a thread holds one lock while waiting for another), no preemption (nobody takes a lock away), and circular wait. Remove any one and it can't happen. OSTEP calls the circular wait the most practical one to remove: put the locks in one order, a before b, and make every thread take them in that order.

Set Lock order to Everyone takes a first. [One global order](#example:every-global): 8 orders of the steps, and all of them finish. Whoever holds b already holds a, so nobody can hold b while waiting for a, and no arrow can ever point back.

Other fixes, in short:

- Take both at once. C++17's `std::scoped_lock` locks several mutexes with a deadlock-avoidance algorithm.
- Try, and back off. `acquire(blocking=False)` in Python, `tryLock()` in Java, `try_lock()` in C++: if the second lock is taken, let go of the first and try again later. It works, but two polite threads can keep backing off in step for a while (livelock).
- One big lock. No ordering problem, and no parallelism either.

```check
Q: Three threads: T1 takes a then b, T2 takes b then c, T3 takes a then c. Can they deadlock?
- Yes, around a, b and c
* No
- Only if all three start at once
= They all follow the order a, b, c. A cycle needs some thread to hold a later lock while waiting for an earlier one, and none does.
```

## The code

The tabs take two locks in one global order with real primitives: Python's `threading.Lock`, Java's `ReentrantLock`, and C++'s `std::mutex` with `std::lock_guard`. `with_both` sorts the two locks by name before taking them, so it doesn't matter which order a thread asks in. Real threads are not deterministic, so the tests step the page's program one step at a time, with the locks kept by hand and the same depth-first search for the cycle, and then run real threads that ask for the locks in opposite orders through `with_both`, two hundred rounds each, all at once. They always finish. The page's own model is what explores the interleavings.

## Spot it

Deadlock needs a thread holding one thing while it waits for another. Look for two locks taken in one operation:

- "Move money from account x to account y: lock both accounts, then update both balances." Two transfers in opposite directions take the same two locks in opposite orders. Lock the lower account number first.
- "A thread holding the cache lock calls the logger, which takes the log lock. The logger sometimes reads the cache." Two locks, nested both ways round in different code paths.
- "Five threads stand in a ring with one lock between each pair of neighbours, and each needs the locks on both sides before it can work." Each thread holding one and waiting for the next: the classic cycle.

The question to ask: is there a pair of locks that some code path takes in one order and another code path in the other?

## Common mistakes

- Thinking it can't happen because the tests pass. Here 4 of 14 schedules deadlock; on a real machine the window is a few instructions wide and it shows up rarely.
- Ordering by something that changes, like "the account I am paying from first". The order must be the same in every thread: by id, by address, by name.
- Fixing the order in one function and calling another that takes the locks the other way round.
- Calling unknown code (a callback, a logger) while holding a lock. You don't know which locks it takes.
- Taking a lock you already hold. With a non-reentrant lock that is a cycle of one: the thread waits for itself.

## Try this

- With opposite orders, find all 4 schedules that deadlock. What do they have in common?
- With three threads, deadlock T1 and T2 while T3 finishes. Then deadlock T2 and T3 with T1 stuck behind them, and press Find the cycle. Where does the search start, and where does the cycle start?
- Switch to Everyone takes a first and try to get two threads waiting at once. How many can wait, and for which lock?
- Step T1 once and T2 once with opposite orders, then press Every interleaving. How many of the ways to finish deadlock?
