# DP over subsets (bitmask)

Four workers, four tasks, and a table of what each worker charges for each task. Give every worker one task for the least total. The obvious way tries every order: 4! = 24 of them, fine. Ten workers make 3,628,800 orders, and twenty make about 2.4 × 10¹⁸. Not fine.

The trick: the order the tasks were handed out in does not matter, only which ones are gone. So solve one subproblem per set of tasks, 2ⁿ of them, and write each set as a bitmask. Twenty workers is about a million sets. That is the whole pattern.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| cheapest total, DP over masks | f[mask] for every mask, counting up | Θ(n · 2ⁿ) |
| cheapest total, every order | each worker in turn tries every task left | Θ(n · n!) |
| walk the answer back | from the full mask, one task off at a time | Θ(n) |
| extra space | one value per mask | Θ(2ⁿ) |

A mask is a set of tasks: bit t is 1 when task t is given out, task 0 on the right, as on [bitmasks](/bitmask/). Workers go in a fixed order, A, B, C, D, so a mask with k bits is given to the first k workers. The bit count says whose turn it is. Define

f[mask] = the cheapest way to give the tasks in mask to the first k workers.

f[0000] = 0. For any other mask, the k-th worker took one of its tasks last. Try each: f[mask] = min over t in mask of f[mask − {t}] + cost[k − 1][t]. The answer is f[1111]. [Show me](#play:four-workers)

The **Approach** option switches to the naive way, every order. Both find the same total. The variable `tries` counts one cost added to a partial total, and `naive total` and `pattern total` say what each approach costs on this table.

## How it works

[Four workers, sixteen masks](#example:four-workers) draws the masks as a lattice: row k holds the masks with k bits, the sets of tasks the first k workers can have. Each mask joins the masks one task bigger. Every path from 0000 down to 1111 is one order, and there are 24 paths. The DP visits each mask once.

Masks are filled counting up, 0001, 0010, 0011, ... Removing a bit always makes a smaller number, so every mask a cell reads is already there. No need to sort by size.

Take f[0011]: tasks 0 and 1 go to A and B. B took task 0 last: f[0010] + 4 = 7 + 4 = 11. Or B took task 1: f[0001] + 9 = 3 + 9 = 12. So f[0011] = 11. At the end, f[1111] = 14, with D taking task 0 for 2 after f[1110] = 12. Walking back: A does task 1, B task 2, C task 3, D task 0. 16 masks, 32 tries.

Greedy, each worker in turn taking its cheapest task left, pays 16 here. A grabs task 0 for 3, and D is stuck with task 1 for 8. The best gives A task 1 so that D gets task 0. [Cheapest first is not cheapest](#example:cheapest-first) has the same trap with three workers: 14 against 13.

```check
Q: Worker A charges 3 for task 0 and 7 for task 1. Worker B charges 4 for task 0 and 9 for task 1. What is f[0011]?
- 7
* 11
- 12
- 13
= Tasks 0 and 1 go to A and B. B takes task 0 last: f[0010] + 4 = 7 + 4 = 11. B takes task 1 last: f[0001] + 9 = 3 + 9 = 12. The smaller is 11.
```

## Every order

The naive way is plain recursion: A takes each task in turn, then B each task left, and so on. When every worker has a task, compare the total with the best. [Try every order](#example:every-order) makes 24 orders and 64 tries to find the same 14.

Watch the numbers under the masks. They count the calls that reached each mask. A mask of two tasks is reached twice (0011 by 0001 then task 1, or 0010 then task 0). A mask of three, 6 times. 1111, 24 times. Each time, the recursion solves the rest from scratch. The DP solves the rest once and reads it from the mask. That is the overlap that makes it dynamic programming.

Is the DP always cheaper? Nope. At [two workers it is a tie](#example:two-workers): 4 tries each. At three it is 12 against 15, at four 32 against 64. Then the factorial runs away: at ten workers about 9.9 million tries against 5,120.

```check
Q: Which masks does f[1011] read?
- 1010 and 1001
* 0011, 1001 and 1010
- 1111 and 0011
- Every mask smaller than 1011
= One for each task in the mask: drop task 3 (0011), task 1 (1001) or task 0 (1010). Each is the set the other workers had before the third worker took the dropped task.
```

## Ties

[Every cost the same](#example:all-ties) costs 15 whichever way. The DP keeps the lower task on a tie, so walking back from 111 gives C task 0, B task 1 and A task 2. Trying every order keeps the first one it meets, A 0, B 1, C 2. Same total, different assignment. Both are right; if your code must match someone else's output, agree on the tie rule.

## Spot it

Reach for this pattern when the problem says:

- **a small number of things, at most about 20**: tasks, cities, skills, keys. 2²⁰ is about a million, fine; 2⁴⁰ is not;
- **each used once, or all of them covered**: an assignment, a tour, a team with every skill;
- **the order does not matter once they are used**, only which ones are gone;
- **the best or the count**, not a list of every way.

Three problems of our own:

- Four friends split four chores, one each, with a table of how long each friend takes. The least total time. (This page.)
- A van visits each of 9 addresses once and comes back to the depot. The shortest round trip. (The state is the set visited plus where the van is: Held-Karp, the exact method on [the traveling salesperson page](/tsp/).)
- A project needs 6 skills, and each of 15 candidates has some. The smallest team with every skill. (f[mask] is the smallest team covering mask; each candidate ORs in their skills.)

Look-alikes that call for something else: "print every way" means listing all n! of them, which is backtracking. "Fewest moves through a maze collecting 4 keys" keeps a mask of keys in the state, but fewest moves calls for breadth-first search. "Pick items under a weight limit" is a [knapsack](/dp-knapsack/): its subproblem is a capacity, not a set.

## When to use it

Use it when n is small and the subproblem is "which of these are done". It turns n! into 2ⁿ, which is a huge win at n = 15 and still hopeless at n = 50. Memory is 2ⁿ values too, so 25 or so is the practical limit.

For the assignment problem itself there is a much better tool. The Hungarian algorithm ([weighted matching](/weighted-matching/)) solves it in O(n³) for any n. The bitmask DP earns its place when the problem has no such special algorithm: tours, covers, schedules with odd rules.

## Common mistakes

- Iterating masks in the wrong order. Counting up works because a mask minus a bit is smaller. Counting down reads masks that are not filled yet.
- Forgetting whose turn it is. The worker is popcount(mask) − 1, not a separate loop over workers; a loop over workers and masks both does n times the work and is easy to get wrong.
- Mixing up bit order. Here task 0 is the rightmost bit. 0110 is tasks 1 and 2.
- Using a bitmask DP for n = 40. 2⁴⁰ is about a trillion.
- Keeping only f and then wanting the assignment. Keep the task each mask took last, or recompute it from f on the way back.

## Try this

- [Four workers, sixteen masks](#example:four-workers): before you run it, find f[0101] by hand.
- [Try every order](#example:every-order): how many times will 0111 be reached? Check under the mask.
- Load `1 2 3 / 4 5 6 / 7 8 9`. Guess the cheapest total first. Does it surprise you?
- [Cheapest first is not cheapest](#example:cheapest-first): change B's cost for task 0 from 3 to 9. Does greedy win now?
- Press Compare, pick this page with other options, and set one side to every order. Load four workers and watch `tries` on both sides.
