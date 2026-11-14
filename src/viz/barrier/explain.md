# Barriers

Three threads each do some work, and none of them may start the next phase until all three have finished this one. A simulation step, a round of a game, the rows of a matrix. A barrier is the place where they wait for each other: nobody goes on until everybody has arrived. This page builds one from a count, a lock and a semaphore, as Downey does in *The Little Book of Semaphores*, then makes it work twice, then packs a car.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `count += 1` | holding lock m, add 1 to count; r is my place in line | one step |
| `if last: V(b)` | the third to arrive opens the turnstile b | one step |
| `P(b)`, `V(b)` | wait at the turnstile, then let the next one through | one step each, and a wait |
| Every interleaving | every order of the steps, and whether anyone went on early | 204,108 for three threads |

b is a [semaphore](/semaphore/) that starts at 0: shut. The first two threads to arrive call P(b) and wait. The third finds r = 3 and calls V(b), which lets one waiting thread through. Each thread that gets through calls V(b) at once to let the next one through. Downey calls that pair, P then V, a turnstile: threads pass one at a time.

The lines under m can't wait on anything, so on this page each such section is one step; nobody could ever see m held. m is still what keeps count right: without it, two threads adding 1 at once can lose an update, as on the [race condition](/race-condition/) page. [Show me](#play:three-arrive)

## A barrier from a count and a turnstile

In [Three arrive, then all go](#example:three-arrive), T1 arrives (count = 1) and waits at P(b): b goes to -1. T2 arrives and waits: b = -2, two threads waiting. T3 arrives with r = 3 and calls V(b). b goes to -1 and T1 goes through. T3 calls P(b) itself and waits behind T2. Then T1 calls V(b) for T2, T2 for T3, and T3 for nobody: b ends at 1.

[Every interleaving of the barrier](#example:every-barrier): 204,108 orders of the steps, and in every one all three arrive before anyone goes on.

```check
Q: b starts at 0. T1 and T2 have arrived and wait at P(b); T3 hasn't arrived yet. What is b?
- 0
* -2
- 2
- -1
= Each P takes one: 0, -1, -2. A negative value counts the waiting threads, as on the semaphore page.
```

## Without the barrier

Turn on Naive version. Each thread adds 1 to count and goes on. [No barrier: two go on early](#example:no-barrier): T1 goes on with count = 1 and T2 with count = 2. [Every interleaving with no barrier](#example:every-naive): 90 orders, and only 36 happen to have everyone arrive before anyone leaves. The other 54 let somebody go on early. Nothing crashes. The early thread just reads a half-finished phase.

## Using it twice

Threads usually go round: compute, meet, compute, meet. Can the barrier above be used again? Nope. Set Problem to A reusable barrier, with Naive version on. [The one-shot barrier, used twice](#example:lapped): round one works, but b is left open (it ends at 1) and count never goes back to 0, so it never reaches 3 again. T1 comes round, walks straight through, and goes on in round two before T3 has even passed the turnstile of round one.

Downey's fix is a second turnstile and two phases. On the way in, the third to arrive opens b1 three times, once for each thread (he calls it preloading the turnstile). On the way out, each thread takes 1 from count, and the last to leave opens b2 three times. b2 keeps a fast thread from starting round two until everyone has left round one, and b1 is shut again by then, since its three passes are used up.

Turn Naive version off. [Two rounds, in step](#example:two-rounds) runs round robin through both rounds. [Every interleaving of two rounds](#example:every-reusable): 199,314,945,648,000 orders, counted by state, and nobody goes on early in any of them.

```check
Q: Why doesn't the one-shot barrier work for a second round?
- The lock m is still held
* b is left open and count keeps growing, so round two has no barrier
- The third thread is still waiting at P(b)
= After round one, b = 1 and count = 3. In round two count goes to 4, 5, 6 and never equals 3, so nobody shuts the turnstile and everybody walks through.
```

## A car for three

Barriers meet n of the same kind. Some problems want a group of mixed kinds. Downey's book makes water molecules from hydrogen and oxygen threads; ours is a car that leaves with one driver and two riders. Three riders want a ride, so one of them waits for the next car.

Three semaphores, all starting at 0:

- seat: the driver calls V(seat) twice, opening two seats. A rider calls P(seat) and waits until there is one.
- in: each rider calls V(in) once it is in; the driver calls P(in) twice, waiting for both.
- go: the driver calls V(go) twice; each rider waits on P(go) before leaving.

In [A car with one driver and two riders](#example:car), R1 and R2 wait for a seat. D opens two, they get in, D sees both in and says go, and all three leave. R3 waits. [Every interleaving of the car](#example:every-car): 376,200 orders, 125,400 for each pair of riders, and nobody ever leaves before the car is full.

Why go? Turn on Naive version and the riders leave as soon as they are in. [A rider who does not wait for go](#example:car-early): R1 is in and gone before R2 has got in. 8,502 of the 27,330 orders do that.

## The code

The tabs build both barriers from real primitives: `threading.Lock` and `threading.Semaphore` in Python, `ReentrantLock` and `Semaphore` in Java, and `std::mutex` with a small semaphore class in C++ (C++17 has none). You rarely need to: Python has `threading.Barrier`, Java has `CyclicBarrier`, and C++20 adds `std::barrier`.

Real threads are not deterministic, so the tests step the page's one-shot barrier one step at a time with the semaphore kept by hand, then run three real threads through the one-shot barrier and a hundred rounds of the reusable one, checking that nobody ever goes on before all have arrived. The page's own model is what explores the interleavings, the car included.

## Spot it

The cue is a phase: everyone must finish one thing before anyone starts the next.

- "Four workers each update a quarter of the grid; no worker may start the next step until the whole grid is updated." A reusable barrier, once per step.
- "A test starts three servers and must not send requests until all three are listening." A one-shot barrier.
- "A match starts when two players and one referee are ready; extra players wait for the next match." Mixed kinds: the car, with seats for players.

If only one thread waits for the others (a main thread waiting for workers to finish), joining them or a countdown is simpler than a barrier.

## Common mistakes

- Reusing a one-shot barrier in a loop. It works once and fails quietly after that.
- Forgetting the V after the P. The first thread through never lets the next one in, and the others wait for ever.
- Waiting at the turnstile while holding the lock. The third thread can't add itself to count, so it never opens the turnstile: deadlock.
- Counting arrivals without the lock. Two threads can both write count = 2, and nobody ever sees 3.

## Try this

- Make T2 the one that opens the turnstile. Then make the first thread through someone other than the first to arrive.
- With the reusable barrier, how far ahead of the others can one thread get? Try to start it on round two while another is still in round one.
- In the car, can R3 ever get the ride? Find a schedule where R1 is the one left behind.
- With the naive car, find a schedule where both riders leave before the driver has seen either of them in.
