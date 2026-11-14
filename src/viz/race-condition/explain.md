# Race conditions

Two threads each add 1 to a shared `count` that starts at 0. When both are done, count is 2. Usually. Sometimes it is 1, and nothing in the code tells you why. The reason is that `count = count + 1` is not one step for the processor. It is three, and the scheduler may switch threads between any two of them.

On this page you are the scheduler. Each button runs one step of one thread. Try to make count come out wrong; it is easier than it should be.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Step T1, T2, T3 | that thread runs its next step: load, add or store | O(1) |
| Run schedule | start over, then step the threads in the order typed: `1 2 1 1 2 2` | O(s) for s steps |
| Every interleaving | every order of the steps left, with where count ends in each | C(2n, n) schedules for two threads of n steps |

`count = count + 1` becomes:

- `r = count`: load count into the thread's own register r;
- `r = r + 1`: add 1, in the register only;
- `count = r`: store r back into count.

Each thread has its own r. Only count is shared. A step is atomic (nothing happens halfway through a load), but the three steps together are not. [Show me](#play:lost-update)

## How it works

In [Both load 0: an update is lost](#example:lost-update), T1 loads count = 0. Before T1 stores, the scheduler switches to T2, which loads count too. It is still 0. Now both threads hold 0 in their registers. T1 adds 1 and stores 1. T2 adds 1 to its own 0 and stores 1 over it. Two increments, count = 1. T1's update is lost: T2 overwrote it with a value based on a stale read.

The moment it goes wrong is the second load, not the store. Once two threads have loaded count and neither has stored, one of the increments is gone, whatever happens after. The narration says so when you get there.

OSTEP calls the three steps a critical section: code that touches shared data and must not run in two threads at once. A race condition is what you get when it does, and the result depends on the timing.

```check
Q: Both threads start with count = 0. The steps run in this order: T1 r = count, T2 r = count, T2 r = r + 1, T2 count = r, T1 r = r + 1, T1 count = r. What is count at the end?
- 0
* 1
- 2
- It depends on the scheduler
= Both threads load 0 before either stores, so both store 1. The order is fixed here, so there is nothing left for the scheduler to decide.
```

## Every interleaving

How likely is a lost update? Press Every interleaving and the page tries every order. Two threads of 3 steps can be interleaved in 6! / (3! × 3!) = 20 ways. [All 20 interleavings of two threads](#example:every-two) shows them: only 2 end with count = 2, the two that run one thread completely before the other starts ([One thread at a time](#example:one-at-a-time)). The other 18 lose an update.

It starts from where you are, not from the beginning. Step T1 once (it loads 0), then press Every interleaving: there are 10 ways to finish and 9 of them lose an update. The only way out is for T1 to add and store before T2 loads.

The numbers get worse fast. Three threads of one increment each ([Three threads: 1,680 interleavings](#example:every-three)): 1,680 schedules, 6 end at 3, 270 at 2 and 1,404 at 1. Two increments each: 924 schedules, of which 6 end at 4, 216 at 3 and 702 at 2.

Can 4 increments really end at 2? Yes. [Four increments, and count ends at 2](#example:lowest-count): T1 loads 0 and waits while T2 finishes an increment, then stores its stale 1 over it. T2 loads that 1 and waits while T1 finishes its second increment, then stores 2 over it. With two or more increments per thread, the same trick works however many there are: two threads can always end with count = 2.

```check
Q: Two threads each run 3 steps, with nothing else in the way. How many interleavings are there?
- 6
- 9
* 20
- 720
= Choose which 3 of the 6 positions belong to T1: C(6, 3) = 6! / (3! × 3!) = 20.
```

Three threads of two increments have 18! / (6! × 6! × 6!) = 17,153,136 schedules. The page lists at most 2,000 one by one. Past that it counts them by state instead: many schedules reach the same state (the same steps done, the same registers, the same count), and those are counted together. Only 90 of the 17 million end with count = 6. That explosion is also why real tests miss races, and why toy programs like these are the place to look at every schedule.

## Why tests miss it

18 bad schedules out of 20 make races sound common. On a real machine they are rare. A lost update needs another thread to get in between one thread's load and its store, a window a few instructions wide. When threads touch count once in a while, that almost never happens: run the program a thousand times and it prints 2 a thousand times. Put it on a busy server for a month and it doesn't. Tests pass. The bug ships.

The fix is to make the three steps one. Either a lock around the critical section, so a second thread waits until the first has stored, or an atomic instruction that reads, adds and writes as a single step (fetch-and-add, or a compare-and-swap loop). Both remove the bad schedules from the list instead of making them rarer.

The code tabs show the same counter with real threads (Python `threading`, Java `Thread`, C++ `std::thread`). Real threads are not deterministic, so the tests drive the steps one at a time, and start the real threads one at a time (each finishes before the next starts). This page's model is what explores the interleavings. In C++ a plain `int` shared like this is a data race, which is undefined behavior, so the C++ tab makes count a `std::atomic<int>` and still loads and stores it as two separate steps: a lost update, but a defined one.

## Spot it

A race needs three things: state shared between threads, at least one thread that writes it, and a step that reads, decides or computes and then writes back without anything stopping another thread in between. Look for these in a problem statement:

- "Each request is handled on its own thread, and every request adds 1 to a global hit counter." Read, add, write: the same race as on this page.
- "Two tellers take money from the same account at once. Each reads the balance, checks it covers the amount, then writes balance minus amount." Check, then act: both checks can pass before either write.
- "Threads share a map. If a key is missing, a thread computes its value and puts it in." Two threads can both see the key missing and both compute it, and one result overwrites the other.

The question to ask: if the scheduler stops this thread right here, after the read and before the write, and runs another thread through the same code, what breaks?

## Common mistakes

- Thinking `count++` is one step because it is one line. The processor reads, adds and writes. Even when the compiler emits a single add-to-memory instruction, another core can get in between unless the instruction is atomic.
- Testing a few times, seeing the right answer, and calling it safe. Most real runs pick a good schedule; the page shows how few of the possible ones are good.
- Locking only the store. The lost update starts at the load: both threads must not be between the load and the store at the same time.
- Making the variable `volatile` in Java. Each load and store is then seen by other threads, but load, add, store is still three steps.
- Blaming the add. It happens in a private register and never causes the race; the shared load and store do.

## Try this

- Make count end at 1 with three threads ([Three threads, two updates lost](#example:three-lose-two) is one answer). How many updates did you lose?
- Set two increments per thread and find a schedule that ends at 3. Then one that ends at 2.
- Step T1 twice (load and add), then press Every interleaving. How many ways to finish lose an update now? Step T1 once more (the store) and ask again.
- Type `1 2 1 2 1 2` and run it. Predict count first.
