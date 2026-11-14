# Semaphores

A semaphore is a counter that threads can wait on. Dijkstra came up with it, and named its two operations P and V. P takes one from the counter and waits if there was nothing to take. V puts one back and wakes a thread that is waiting. That's the whole thing. With the right start value it limits how many threads do something at once, makes one thread wait for another, or makes two threads take turns.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `P(s)` | s goes down by 1; if it is now below 0, the thread waits | one step, then the wait |
| `V(s)` | s goes up by 1; if a thread is waiting, the first one goes on | one step |
| Step T1, T2, T3 | that thread runs its next step | O(1) |
| Every interleaving | every order of the steps, and how each run ends | 7,890 for the room of 2 |

Other books use other names for the same two: `sem_wait` and `sem_post` in OSTEP (the POSIX names), `wait` and `signal` in Downey's *The Little Book of Semaphores*, `acquire` and `release` in Python and Java. This page uses P and V because they are short and don't clash with the wait and signal of [condition variables](/producer-consumer/).

On this page the value goes below 0 when threads are waiting, as OSTEP and Downey draw it: s = -2 means two threads are waiting on s. [Show me](#play:full-room)

## A room with k places

Three threads each enter a room, print `in`, print `out` and leave. Downey calls this a multiplex. s starts at 2, so it counts the free places. In [Two inside, the third waits](#example:full-room), T1's P(s) takes s from 2 to 1 and T2's takes it to 0. Both are inside. T3's P(s) takes it to -1, and T3 waits. When T1 leaves, its V(s) puts s back to 0 and wakes T3, the first in line. At no point are three inside.

The `inside` readout counts the threads that have printed in and not yet out, and `most` is the largest it has been. Set How many may be inside to 1 and s is a lock: one thread in the room at a time, which is the [mutex](/mutex/) again.

```check
Q: s starts at 2. T1, T2 and T3 each call P(s), in that order, and nobody calls V(s). What is s?
- 0
* -1
- 2
- It stays at 0, because T3 waits instead
= Each P takes one: 2, 1, 0, -1. The third P drives s below 0, so T3 waits, and -1 says one thread is waiting.
```

## Every interleaving

Press Every interleaving. [Every interleaving of the room](#example:every-limit) goes through 7,890 orders of the steps. In 5,364 of them two threads are inside at once at some point, and in 2,526 never more than one. Not one has three. That is more than the 2,000 the page goes through one by one, so it draws the first 20 and counts the rest by state.

Turn off Use the semaphores and the same threads just print in and out. [No semaphore](#example:no-limit): all three print in before anyone prints out. Nothing kept the third one out.

## Making one thread wait for another

Now the start value is 0. T1 prints `one` and then calls V(a); T2 calls P(a) and then prints `two`. Downey calls this signaling. In [T2 waits for T1's signal](#example:signal-first), T2 gets there first: P(a) takes a to -1 and T2 waits. T1 prints one, V(a) wakes T2, and T2 prints two. All 3 interleavings print one two.

What if T1 signals before T2 gets there? In [The signal comes first](#example:signal-remembered), V(a) takes a to 1. Nobody is waiting, but the semaphore remembers: T2's P(a) takes it back to 0 and goes straight on. This is the big difference from a condition variable, where a signal with nobody waiting is lost.

## Taking turns

Two semaphores, one per thread: a is T1's turn and starts at 1, b is T2's and starts at 0. Each thread waits for its own turn, prints, and hands the turn to the other:

- T1: `P(a)`, `print("ping")`, `V(b)`, twice;
- T2: `P(b)`, `print("pong")`, `V(a)`, twice.

[Every interleaving of ping and pong](#example:every-turns): 43 orders of the steps, and every one prints ping pong ping pong. Without the semaphores ([No semaphores: no turns](#example:no-turns)) the four prints come out in 6 orders, and only 1 of them alternates.

```check
Q: In the turns program, both semaphores start at 0 instead. What happens?
- It still prints ping pong ping pong
- It prints pong first
* Both threads wait for ever
= T1 waits for a and T2 waits for b, and each V is after the other thread's P. Somebody has to hold the first turn.
```

## The code

The tabs run the three patterns on real threads: Python's `threading.Semaphore`, Java's `java.util.concurrent.Semaphore`, and in C++ a small `Semaphore` class built from a `std::mutex` and a `std::condition_variable` (C++17 has no semaphore; C++20 adds `std::counting_semaphore`). Those never go below 0: a thread that would take it below 0 waits instead. Same behavior, different bookkeeping.

Real threads are not deterministic, so the tests drive the room one step at a time, with the semaphore kept by hand, and then run each pattern on real threads, where the semaphores fix the result: ping pong ping pong every time, and never more than k inside. The page's model is what explores the interleavings.

## Spot it

A semaphore fits when you can say "how many" or "after":

- "A server may run at most four image conversions at once; more requests wait for a free slot." Count the slots: a semaphore that starts at 4.
- "The logging thread must not write until the setup thread has opened the file." One thread waits for another: a semaphore that starts at 0, V after opening, P before writing.
- "Two threads print the odd and the even numbers from 1 to 10, in order." Turns: one semaphore per thread, and one of them starts at 1.

If the thing you wait for is a condition on shared data ("the buffer is not empty"), a condition variable and a lock often say it more directly. The [producer-consumer](/producer-consumer/) page does it both ways.

## Common mistakes

- The wrong start value. 0 means "wait for a signal", 1 means "one at a time", k means "k at a time". The turns program with both at 0 never prints anything.
- Calling V where you meant P, or one V too many. A semaphore has no owner, so nothing stops a thread from releasing a place it never took, and the room quietly gets bigger. Python's `BoundedSemaphore` refuses a V past the start value.
- Expecting a fair order. This page wakes the first in line; most real semaphores don't promise that unless you ask (Java's `Semaphore` takes a fairness flag).
- Taking two semaphores in different orders in different threads. That can wait for ever, the same way two locks can: see [Deadlock](/deadlock/).

## Try this

- With the room of 2, find a schedule that makes s reach -1. Can you make it reach -2? Set How many may be inside to 1 and try again.
- In the turns program, step T2 first. What is b, and why can't T2 go on?
- Turn off Use the semaphores in T1 prints first, and find the schedule that prints two one.
- With the room of 2, step T1 twice (P and in), then press Every interleaving. Does any schedule from there keep T1 inside while two others are in?
