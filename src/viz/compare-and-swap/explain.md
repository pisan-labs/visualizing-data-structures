# Compare-and-swap

The [race condition](/race-condition/) page loses updates because `count = count + 1` is three steps: read, add, write. The [mutex](/mutex/) page fixes it with a lock. Here is the other fix. Read the value, compute the new one, and then write it only if nobody changed it in the meantime. If somebody did, start again. The check and the write happen together, as one atomic step: compare-and-swap.

`cas(x, a, b)`: if x still equals a, set x to b and say yes; otherwise change nothing and say no. Processors have an instruction for it (`cmpxchg` on x86), and locks themselves are built from instructions like it: OSTEP builds a spin lock from one.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `r = n` | read the shared value into a register | one step |
| `s = r + 1` | compute the new value, privately | one step |
| `ok = cas(n, r, s)` | if n is still r, set it to s (ok = 1); else leave it (ok = 0) | one atomic step |
| `if !ok: retry` | the swap failed: count a retry, read again | one step |
| Every interleaving | every order of the steps, and the retries each one costs | 142 for two threads |

Nobody waits. A thread whose swap fails doesn't block; it reads again. That is what lock-free means: if a thread is paused halfway (the scheduler, a page fault, a slow core), the others still finish. With a lock, a thread paused while it holds the lock stops everybody. [Show me](#play:retry-once)

## A counter without a lock

In [A failed swap and one retry](#example:retry-once), T1 and T2 both read n = 0. T1 computes 1 and swaps it in. T2 computes 1 too, but its `cas(n, 0, 1)` finds n = 1, not 0, so it changes nothing and ok = 0. That failure is the race being caught: T2's read went stale. T2 reads again, gets 1, computes 2, and this swap works. n = 2, after one retry.

Switch Program to A counter with a plain store and run the same kind of schedule: [A plain store loses an update](#example:lost-update) ends with n = 1. Same threads, same reads, but the store writes over whatever is there.

```check
Q: T1 reads n = 5 and computes s = 6. Before T1 swaps, T2 adds 1, so n = 6. What happens next?
- T1's cas sets n to 6 again, and an update is lost
* T1's cas fails; T1 reads 6, computes 7 and swaps that in
- T1 waits until T2 is done
= cas(n, 5, 6) finds n = 6, not 5, so it changes nothing. T1 never waits; it goes round again with a fresh read.
```

## Every interleaving, and the retries

[Every interleaving of two threads](#example:every-two): 142 orders of the steps, and every one ends with n = 2. 10 need no retry, and 132 need one. With a plain store ([Every interleaving with a plain store](#example:every-plain)) there are only 20 orders, and 18 of them lose an update. The cas trades lost updates for retries.

Why can a thread retry at most once here? A cas fails only when another thread's cas succeeded since this thread read n. Each thread adds 1 once, so T2 can fail only because of T1's one success. With three threads, a thread can fail at most twice. [Three threads, three retries](#example:most-retries) is the worst case: T1 wins, T2 and T3 fail; T2 wins the second round, T3 fails again. 3 retries for 3 increments. [Every interleaving of three threads](#example:every-three): 22,636,170 orders, all ending with n = 3; 270 need no retry and 19,841,976 need all three.

So the failures are never wasted on nothing. Every failed swap means some other thread got its update in. Under heavy contention that is still a lot of wasted work, and a lock can be faster. Under light contention ([One thread at a time](#example:one-at-a-time)) the cas works first time and nobody pays for a lock.

## The ABA problem

The cas checks that the value is the same. It doesn't check that nothing happened. Usually that's the same thing. Here it isn't.

Switch Program to A lock-free stack. The stack is A → B → C, A on top. T1 pops the usual lock-free way: read `old = top`, read `nxt = old.next`, then `cas(top, old, nxt)`. T2 pops twice and pushes its first node back. On this page T2's pops and its push are one step each; only T1 is slowed down.

In [ABA: top goes A, B, C, A](#example:aba), T1 reads top = A and A.next = B. Then T2 pops A, pops B, and pushes A back. Top is A again. T1's `cas(top, A, B)` compares, sees A, and succeeds. It sets top to B, the next T1 read long ago. But T2 popped B and still has it. The stack is B → C, and B is in two places at once. In a real program T2 might have freed B, or reused it for something else.

[A cas that fails, as it should](#example:aba-missed): T2 pops A before T1's cas, top is B, and the cas fails. T1 reads again and pops B. [Every interleaving of the stack](#example:every-aba): 107 orders, 3 broken. In all three, T1 reads top before T2 starts, reads A.next before T2's push, and swaps after T2 is done.

```check
Q: The stack is A → B → C. T1 reads top = A and A.next = B. T2 pops A and pushes it straight back. Then T1 runs cas(top, A, B). What happens?
- The cas fails, because top changed
* The cas succeeds, and the stack is B → C, which is right
- The cas succeeds, and the stack is broken
= Top is A again and A.next is still B, so popping A leaves B → C. ABA hurts when something under A changed too: on the page, T2 also popped B.
```

## Fixing ABA

The usual fix is a version number next to the pointer. Every successful swap adds 1 to it, and the cas compares both. Top is A again, but the version isn't, so T1's cas fails. Java's `AtomicStampedReference` pairs a reference with an int stamp for this. In C++ you pack a pointer and a counter into one word, or swap both with a double-width compare-and-swap where the hardware has one.

Garbage collection helps with half of it: memory is not reused while T1 still holds a pointer to A. It doesn't help here, though, because T2 pushes the same node back on purpose.

## The code

The tabs show the counter with real atomics: `AtomicInteger.compareAndSet` in Java and `std::atomic<int>::compare_exchange_strong` in C++ (on failure it also loads the current value into its first argument, so a loop can skip the extra read). Python has no compare-and-swap to call, so its `AtomicInt` makes `compare_and_set` atomic with a lock inside. The point is the loop around it, and the loop is the same in all three.

Real threads are not deterministic, so the tests step the page's counter one step at a time (`Steps`), then run real threads, each adding 1 a thousand times. n always comes out right. The page's own model is what explores the interleavings, including the stack.

## Spot it

Compare-and-swap fits when the update is small, computed from the old value, and cheap to redo:

- "Many threads count requests; the counter must be exact, and a thread must never block." Read, add, cas, retry.
- "Threads keep the largest value seen so far in a shared variable." Read the max; if yours is bigger, cas it in; if the cas fails, read again and compare again.
- "Set the configuration once: the first thread to get there wins, the others use its value." One cas from empty to a value; whoever fails reads the winner's.

If the update touches two things at once (move money between two accounts), one cas can't do it. Take a lock, or see the [deadlock](/deadlock/) page for taking two.

## Common mistakes

- Reading the value once, outside the loop. After a failed cas you must read again, or the loop swaps in a stale value for ever (or never succeeds).
- Doing slow work inside the loop. Every retry redoes it.
- Thinking the same value means nothing changed. That's ABA: compare a version too, or make sure nodes are never put back while someone may hold them.
- Using `compare_exchange_weak` and treating a failure as proof that another thread won. The weak form can fail even when the value matched; it belongs in a loop.

## Try this

- With two threads, find a schedule where T1 retries instead of T2.
- With three threads, find a schedule with exactly 2 retries. Who retried?
- On the stack, make T1's cas fail twice. Can you make it fail three times? Four?
- Step T1 twice on the stack (`old = top` and `nxt = old.next`), then press Every interleaving. How many of the ways to finish break the stack now?
