# Mutex (lock)

On the [race condition](/race-condition/) page, two threads each add 1 to `count`, and 18 of the 20 ways to interleave them lose an update. The fix is a lock, also called a mutex (for mutual exclusion): take it before the load, let go of it after the store, and a second thread that wants it has to wait. Here every interleaving ends with the right count. All of them.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `lock(m)` | take m if it is free; otherwise wait in line | one step, then the wait |
| `unlock(m)` | let go of m; the first thread in line gets it | one step |
| Step T1, T2, T3 | that thread runs its next step | O(1) |
| Every interleaving | every order of the steps left, and how each ends | 10 schedules for two threads |

Each thread runs five steps: `lock(m)`, the three steps of `count = count + 1` (load, add, store), and `unlock(m)`. The code between lock and unlock is the critical section. Only the thread that holds m can be in it. [Show me](#play:waits-its-turn)

## How it works

In [T2 waits its turn](#example:waits-its-turn), T1 locks m and holds it. T2 calls `lock(m)` too, finds m held, and joins the line. That call is a step; after it, T2 takes no more steps. Pressing Step T2 just tells you it is waiting. T1 loads 0, adds 1, stores 1 and unlocks. Unlock hands m straight to T2, whose `lock(m)` returns without a step of its own. T2 loads 1, not 0, and count ends at 2.

The lane shows a blocked thread with a dashed arrow and frame, and the lock's box says who holds it and who is waiting. First come, first served: with three threads, [Three threads in line for m](#example:three-in-line) has T2 and T3 waiting while T1 works, and m goes to T2, then T3.

Real locks don't all promise that order. Python's `threading.Lock` and Java's `synchronized` let any waiting thread win; a ticket lock, which OSTEP builds from fetch-and-add, serves threads in order. The order changes who waits longest. It never changes the count.

```check
Q: T1 holds m. T2 calls lock(m) and waits. Then T1 calls unlock(m). Who holds m now?
- Nobody: m is free until T2 tries again
* T2
- T1, until it finishes
= Unlock hands m to the first thread in line, and T2's lock(m) returns. T2 does not have to ask again.
```

## Every interleaving

Press Every interleaving. Two threads of five steps would have 252 orders if nothing blocked, but a thread that asks for m while the other holds it just waits, so most of those orders can't happen. [Every interleaving with the lock](#example:every-locked) finds 10, and all 10 end with count = 2. One outcome. With three threads there are 210, and all of them end at 3.

Compare that with no lock at all (set The lock to No lock): 20 schedules and 18 of them lose an update. The lock does not make the bad schedules rare. It removes them.

## Contention

Waiting costs time. Two readouts count it: `waits` is how many `lock(m)` calls found m held, and `waited` adds up the steps the threads spent in line (one for each waiting thread, every time some other thread takes a step). In T2 waits its turn, waits = 1 and waited = 4: T2 sat through T1's load, add, store and unlock.

When everybody wants the lock at once it adds up fast. In Three threads in line, T2 waits through T1's critical section and T3 waits through both, so waited = 13 for 15 steps of work. With k threads it grows like k²: the i-th in line waits for everyone ahead of it. That is why critical sections should be short. Lock around the three steps that touch count, not around the whole function.

## Locking the wrong part

Locking only the store looks like it should work. It doesn't. In [Locking only the store](#example:store-only), both threads load count = 0 before either takes the lock, and the lock then neatly serializes two stores of 1. [Every interleaving](#example:every-store) with only the store locked: 92 schedules, 84 end with count = 1. The lost update starts at the load, so the load must be inside.

```check
Q: Each thread runs r = count; r = r + 1; then lock(m); count = r; unlock(m). Can an update still be lost?
* Yes
- No, the store is protected
- Only with three threads
= Both threads can load the same count before either locks. Each then stores its own copy plus 1, one after the other.
```

## Forgetting to unlock

In [T1 forgets to unlock](#example:forgot-unlock), T1 increments and finishes, still holding m. T2 calls `lock(m)` and waits for a thread that will never run again. No thread can run, and nothing is wrong with count: it is 1, and the program is stuck.

The nasty part is that it doesn't always happen. [Every interleaving](#example:every-forget) gives 9 schedules: in 5 of them T2 goes first, unlocks, and both finish with count = 2. The other 4 get stuck. Which thread gets to m first decides it, so the same program can finish one run and hang the next. Real forgotten unlocks hide better still: they sit on a path that rarely runs, an early return or an exception, so the program can pass its tests and still hang once in a while. That is why the code tabs use `with self.lock:`, `synchronized` and `std::lock_guard`: the unlock happens when the block ends, even if the code in it throws.

## The code

The tabs show the counter with real primitives: Python's `threading.Lock`, a Java `synchronized` method, and a C++ `std::mutex` held by a `std::lock_guard`. Real threads are not deterministic, so the tests step the five steps one at a time with the lock kept by hand (who holds it, who is in line), and then run the real counter on real threads all at once. With the lock, that last run always gives the right count, which is the whole point. The page's own model is what explores the interleavings.

One more difference: this page's lock is not reentrant. A thread that locks m twice waits for itself, for ever. Python's `Lock` behaves like that and `RLock` doesn't; Java's `synchronized` is reentrant; locking a `std::mutex` you already hold is undefined behavior.

## Spot it

You need a lock when threads share data and at least one of them reads it, decides or computes, and writes it back. Look for:

- "Every worker thread that finishes a job adds its running time to a shared total." Read, add, write: lock around the three.
- "Several threads sell seats for the same show. Each checks how many are left and, if any, sells one." Check, then act: the check and the sale must be in the same critical section, or two threads sell the last seat.
- "Threads append messages to a shared list and keep a separate counter of messages." Two writes that must agree: one lock around both, so nobody sees the list and the counter out of step.

If the shared data is a single counter, an atomic increment (fetch-and-add) does the job with no lock. Once two things must change together, you want the lock.

## Common mistakes

- Locking only the write. The load is where the race starts, so it belongs inside.
- Forgetting to unlock on some path, an early return or an exception. Use the language's scoped form so the unlock can't be skipped.
- Holding the lock for too long. Everything inside is serial; slow work there (a file read, a network call) makes everyone wait.
- Using different locks for the same data. Two threads that take different locks don't exclude each other at all.
- Taking two locks in different orders in different threads. That one gets its own page, [Deadlock](/deadlock/).

## Try this

- Set three threads, pick "Everyone wants the lock at once" under Start over with, and press Fill. Predict `waited` before you look.
- Set The lock to Around the store only and find a schedule that ends at 1. Then find one that ends at 2.
- With T1 forgets to unlock, find a schedule where both threads finish. Which thread has to go first?
- Run `1 2 1 2 1 2 1 2 1 2` with the lock. Some steps can't run: where does the schedule stop, and why?
