# Readers and writers

A shared table that many threads read and a few threads change. Two readers at the same time are fine: neither changes anything. A writer needs the table to itself, or a reader sees it half updated. So the rule is many readers at once, or one writer alone. A read-write lock enforces it. This page builds one from a lock, a count and a semaphore, the way Downey does in *The Little Book of Semaphores*, and then shows how it can keep a writer waiting for ever.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| reader in | lock m, add 1 to n; the first reader in takes room; unlock m | a few steps, or a wait |
| reader out | lock m, take 1 from n; the last reader out gives room back; unlock m | a few steps |
| `P(room)`, `V(room)` | the writer takes the room for itself, and gives it back | one step each, and a wait |
| Every interleaving | every order of the steps: how many readers shared, and did the writer get overtaken | 5,430 for two readers |

n counts the readers inside. Lock m guards n, so two readers never update it at once (on this page `n += 1` is one step for that reason; the [race condition](/race-condition/) page shows what happens without m). room is a [semaphore](/semaphore/) that starts at 1. The writer W is lane 1, then the readers R1, R2, R3; a lane's note says reading or writing while that thread is in the room. [Show me](#play:readers-share)

## One lock is safe, and slow

The naive version first. Set Lock to One lock for everyone: every thread, reader or writer, takes the same [mutex](/mutex/). It is correct. [One lock: readers take turns](#example:one-lock): R2 waits for R1 to finish reading, though they could have read together. [Every interleaving with one lock](#example:every-mutex): 72 orders, and in all of them the threads go in one at a time. Fine for two readers. A thousand readers queueing for a table nobody is changing is not fine.

## The lightswitch

Downey calls it a lightswitch: the first one into a room turns the light on, the last one out turns it off. Here the light is room. The first reader in takes it with P(room), which locks the writer out. Readers who come while others are inside see n > 1 and walk straight in. The last reader out calls V(room). The writer just takes room and gives it back.

[Two readers inside at once](#example:readers-share): R1 is the first in, so room goes to 0. R2 finds n = 1, skips P(room), and both read at the same time. R2 is the last out, gives room back, and W writes alone.

The other way round is the interesting one. In [The writer is in, the readers wait](#example:writer-first), W takes room first. R1 is the first reader, calls P(room) and waits, still holding m. So R2 waits for m, not for room. Only one reader ever waits on room; the rest queue behind it on m. When W gives room back, R1 goes in, lets go of m, and R2 follows.

```check
Q: R1 and R2 are reading, so n = 2 and room = 0. R2 leaves. What happens to room?
- It goes back to 1, so the writer can go in
* It stays at 0, because R1 is still inside
- It goes to -1
= R2 takes n from 2 to 1. Only the last reader out (n = 0) gives room back.
```

## Starving the writer

Readers keep the room while any one of them is inside. That's the point, and it's also the bug. In [A reader overtakes the waiting writer](#example:starved), R1 goes in. W arrives and waits for room. Then R2 arrives, after W, finds n = 1 and goes straight in. W waits for both, though it came before R2.

With more readers it gets worse. [A stream of readers](#example:stream-of-three): each reader comes in before the one before it leaves, so n goes 1, 2, 1, 2, 1 and only gets back to 0 when the stream stops. With readers that keep coming, it never would. That's starvation: nothing is stuck, everyone else is busy, and W never gets a turn.

[Every interleaving, readers first](#example:every-readers): 5,430 orders. The writer is always alone in the room. In 5,258 of them the two readers are in together at some point, and in 106 a reader who came while W was waiting got in first. With three readers it is 861,864 of 18,332,580.

## A turnstile

Downey's fix is a turnstile: a semaphore turn that starts at 1. Every reader passes it on the way in, P(turn) then V(turn) at once, like a turnstile at a station. The writer takes turn and keeps it while it waits for room. Readers who come now stop at the turnstile, behind the writer.

Set Lock to Read-write lock with a turnstile. [The turnstile holds the next reader back](#example:turnstile-holds): R1 goes in, W takes the turnstile and waits for room, R2 stops at the turnstile. When R1 leaves, W goes in, writes, and opens the turnstile. Only then does R2 get through. [Every interleaving with the turnstile](#example:every-turnstile): 196,340 orders. The readers still share the room in 186,450 of them, and in not one does a reader who came while W waited get in first.

It doesn't give writers priority, though. When W opens the turnstile, whoever waits there goes next, readers included. Versions that put writers first exist too; they need more semaphores.

```check
Q: With the turnstile, R1 is reading and W holds turn, waiting for room. R2 arrives. What happens?
- R2 joins R1, because n = 1
* R2 waits at the turnstile until W is done
- R2 and W go in together
= R2's first step is P(turn), and W holds turn. Only W's V(turn), after it writes, lets R2 through.
```

## The code

The tabs build the lock from real primitives: `threading.Lock` and `threading.Semaphore` in Python, `ReentrantLock` and `Semaphore` in Java, and in C++ a `std::mutex` with a small semaphore class (C++17 has none). `no_starve` adds the turnstile. Python's `threading` has no read-write lock, so this is one you could use. Java has `ReentrantReadWriteLock`, and C++17 has `std::shared_mutex`; use those when you have them.

Real threads are not deterministic, so the tests step the page's program (readers first) one step at a time with the lock and the semaphore kept by hand, then run a writer and two or three readers on real threads, two hundred visits each, with and without the turnstile, checking that nobody is ever in the room with a writer. The page's own model is what explores the interleavings.

## Spot it

The cue is lopsided access: lots of reading, a little writing, and reads that can't see a half-done write.

- "A price table is read on every request and updated once a minute." Readers share; the update needs the table alone.
- "Many threads look things up in a cache; a background thread rebuilds it." The same shape. Ask whether the rebuild may wait for ever.
- "A configuration object is read by every worker and replaced when an admin saves changes." If the writes are rare and the object is small, building a new copy and swapping a reference may beat a lock.

If reads are rare or short, one plain lock is simpler and often just as fast.

## Common mistakes

- Using one lock for readers and writers. Correct, but readers wait for each other for nothing.
- Updating n without m. Two readers arriving at once can both see n = 0, both call P(room), and the second waits for a room its friend holds.
- Forgetting that readers first means writers last. If reads never stop, writes never start.
- Upgrading: a reader that decides to write while holding the read side waits for the room to empty, and it never will, since it is inside. Let go of the read side first.

## Try this

- Readers first, two readers: find a schedule where W writes between R1 and R2.
- Get R1 waiting on room and R2 waiting for m. Who is in the room?
- With three readers, readers first, keep W out until every reader has been in. Then try the same with the turnstile.
- With the turnstile, step R1 three times (it is in), then W twice (it holds turn and waits), then press Every interleaving. Does R2 ever get in before W?
