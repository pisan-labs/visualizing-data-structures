# Producer-consumer (bounded buffer)

Some threads make things and others use them: a web server's listener hands requests to workers, a decoder hands frames to a player. Between them sits a buffer of fixed size. A producer that finds it full has to wait, and so does a consumer that finds it empty. Getting the waiting right takes a lock, two condition variables and one while loop. Leave out the while and it works almost every time.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| put | lock m; while the buffer is full, wait on room; add the item; signal item; unlock | O(1) steps, plus any wait |
| get | lock m; while it is empty, wait on item; take an item; signal room; unlock | O(1) steps, plus any wait |
| `wait(c, m)` | let go of m and sleep on c; once woken, take m back before going on | one step |
| `signal(c)` | wake one thread sleeping on c, if there is one | one step |

On this page the buffer is just its count, `n`. P1 puts one item, and C1 and C2 take one each. Size 1 or 2, and it can start with an item in it. The real buffer is a circular array, as on the [array queue](/queue-array/) page; the count is the part the threads fight over. [Show me](#play:waits-for-room)

## How it works

In [The producer waits for room](#example:waits-for-room), the buffer starts full. P1 locks m, finds n = 1 and calls `wait(room, m)`: it lets go of m and sleeps. C1 locks m, takes the item (n = 0) and signals room, which wakes P1. P1 doesn't run yet, though. It needs m back, and C1 still holds it, so P1 joins the line for m. When C1 unlocks, P1 gets m, goes round its loop, checks n again (now 0), and puts its item. C2 takes it. 25 steps, and every item came out once.

That middle part is the thing to watch. A signal only says "something changed, have a look". The woken thread waits for the lock like everyone else, and by the time it gets it the buffer may have changed again. OSTEP calls this Mesa semantics, after the Mesa language, and it is how Python, Java, C++ and pthreads condition variables behave.

```check
Q: C1 sleeps on item. P1, holding m, puts an item and calls signal(item). What does C1 do next?
- It runs at once and takes the item
* It waits for m, and only then returns from its wait
- Nothing: a signal while P1 holds m is lost
= Waking up only makes C1 ready to take m back. P1 still holds m, so C1 joins the line and returns from wait when it gets m.
```

## Why the wait sits in a while loop

Set the buffer to start empty, so there is one item for two consumers, and switch to `if`. In [With if, C1 takes an item that is not there](#example:if-takes-nothing):

1. C1 locks m, finds n = 0, and sleeps on item.
2. P1 locks m and starts to put. C2 calls lock(m) and joins the line.
3. P1 puts (n = 1), signals item and unlocks. C1 is awake, but C2 was in line first, so C2 gets m.
4. C2 finds n = 1 and takes the item: n = 0.
5. C1 finally gets m. With `if`, it doesn't look again. It takes an item: n = -1.

C1 checked before it slept, and that check was out of date by the time it woke. [With while](#example:while-checks-again), the same schedule sends C1 round the loop: it finds n = 0 and sleeps again. That is the right answer, since there was only one item.

How often does `if` go wrong? [Every interleaving, with if](#example:every-if): 52 of 284 schedules end with n = -1. About one in five on the page, and much rarer on a real machine, where the steal needs another thread to grab the lock in a tiny window. With `while`, none do. There is a second reason for the loop: pthreads and Java both allow a wait to return with no signal at all (a spurious wakeup), so a check after waking is the only safe thing.

```check
Q: Why does the woken consumer have to check n again?
- Because signal may wake the wrong thread
* Because another thread may get the lock first and change n
- Because wait does not take the lock back
= Between the signal and the moment the woken thread holds m again, any thread in line ahead of it can run. Its old check no longer says anything.
```

## Two condition variables, not one

The producer sleeps on room and the consumers sleep on item, so a signal always reaches the right side. With a single condition variable for both, a consumer that takes an item could wake the other consumer instead of the producer, and with the buffer empty everybody ends up asleep. OSTEP walks through that one too. Two condition variables, each meaning one thing, avoid it.

## With semaphores

The same buffer with two counting semaphores and the lock (Synchronize with: Two semaphores):

- spaces counts the free places and starts at size minus the items already in;
- items counts the full places;
- the producer runs `P(spaces)`, then the put inside lock and unlock, then `V(items)`; a consumer runs `P(items)`, the get, then `V(spaces)`.

No checks and no loops: the semaphores do the counting. [Every interleaving, with semaphores](#example:every-sem): 166 schedules, all ending with n = 0. Order matters, though. Take m first and then call P, and a thread can sleep while holding m, so nobody can ever V it. The P goes outside the lock.

## The code

The tabs show the bounded buffer with real primitives: Python's `threading.Condition` (two of them on one `Lock`), Java's `ReentrantLock` with two `Condition`s, and C++'s `std::mutex` with two `std::condition_variable`s. Each wait is in a while loop. C++ can also say `cv.wait(lock, predicate)`, which is the same loop written for you.

Real threads are not deterministic, so the tests step the page's program one step at a time, with the lock and the condition variables kept by hand, and then run the real buffer with a producer putting 1 to 6 and two consumers taking three each. They always take 21 between them and leave the buffer empty. The page's model is what explores the interleavings.

## Spot it

Look for a hand-off between threads with a limit in between:

- "Worker threads take jobs from a queue that holds at most 10. If it is full, whoever adds jobs must wait." A bounded buffer.
- "A thread reads lines from a file and two threads parse them. Readers must not run more than 4 lines ahead." Producer, consumers, and a buffer of 4.
- "A logging thread writes messages that other threads hand it. When there is nothing to write, it should sleep, not spin." The consumer's wait on item.

Many languages already have one: Python's `queue.Queue(maxsize)`, Java's `ArrayBlockingQueue`. Use those in real code. Build your own when an interview asks you to, and then put the wait in a while.

## Common mistakes

- `if` instead of `while` around the wait. It usually passes your tests, and fails in 52 of the 284 schedules here.
- Checking the condition without holding the lock. The buffer can change between the check and the wait, and the signal can come in between and be lost.
- One condition variable for both sides, with signal. The wrong thread wakes up.
- Forgetting the signal, or signaling the side you are on. A producer that signals room after a put wakes nobody useful.
- With semaphores, calling P while holding the lock. That is a deadlock waiting for its schedule: see [Deadlock](/deadlock/).

## Try this

- Start empty (Items at the start: 0). Find a schedule where both consumers sleep on item at the same time. P1 puts its item and signals: who wakes up, and who doesn't?
- Set the buffer size to 2. Can P1 still end up sleeping on room? Why not?
- With `if` and an empty start, step C1 until it sleeps, then press Every interleaving. How many ways to finish take an item that is not there?
- Find a schedule where a signal is lost (nobody asleep). Does it matter?
