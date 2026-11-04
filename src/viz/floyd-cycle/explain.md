# Cycle detection (tortoise and hare)

Follow `next` from `head`. Do you ever reach null? In a healthy list, yes. If some node points back at an earlier one, no: you go round and round. Floyd's algorithm tells the two apart with two pointers and no extra memory. The tortoise, `slow`, moves one node at a time. The hare, `fast`, moves two. If there is a cycle, the hare laps the tortoise and they land on the same node. If there is none, the hare reaches null first.

A list with a cycle looks like the Greek letter ρ (rho): a tail of μ nodes, then a cycle of λ nodes. The page draws it that way, with the tail across the top and the cycle hanging underneath. To build one, type the values and then `@` and the index the last node links back to: `1 2 3 4 5 6 @2`. Leave off the `@` for a list that ends in null.

## The cost

| Operation | What it does | Cost |
|---|---|---|
| `detect()`, phase 1 | Do slow and fast meet? | O(μ + λ) |
| `detect()`, phase 2 | Where does the cycle start? (μ) | O(μ) |
| `detect()`, phase 3 | How long is the cycle? (λ) | O(λ) |
| Extra memory | Two pointers and two counters | O(1) |

Everything is O(n), since μ + λ is the number of nodes. The memory is the selling point: the obvious method, remembering every node you have seen in a hash set, also takes O(n) time but needs O(n) memory.

## Phase 1: the hare laps the tortoise

Both start at `head`. Each step, `slow = slow.next` and `fast = fast.next.next`. Without a cycle the hare runs out of list after about n / 2 steps. With one, the hare gets into the cycle first and waits there. Once the tortoise arrives too, the hare gains one node per step, so the gap between them shrinks by one every step. It cannot jump over the tortoise. Within λ steps they land on the same node. [Show me](#play:rho).

```check
Q: Why does the loop test both fast != null and fast.next != null?
- To check that slow has not run off the end
* fast moves two nodes, and either of them could be null
- One of the tests is enough
= fast.next.next needs fast.next to be a node. Test only fast and the hare can step onto null and crash on the second step.
```

## Phase 2: where the cycle starts

When they meet, put `slow` back at `head`, leave `fast` at the meeting point, and move both one node at a time. They meet again exactly at the start of the cycle.

Why? Say they met after k steps. The tortoise walked k nodes and the hare 2k, so the hare's extra k steps were whole laps of the cycle: k is a multiple of λ. Now walk μ more steps from the meeting point. In total that is μ + k steps from `head`, which is μ steps plus whole laps, and μ steps from `head` is the start of the cycle. The pointer that restarts at `head` gets there after the same μ steps. So the number of steps in phase 2 is μ, the length of the tail. [The whole list is a cycle](#example:full-cycle) shows μ = 0: they meet at `head` straight away.

## Phase 3: how long is the cycle

Keep `slow` at the start of the cycle and walk `fast` around until it comes back, counting: that count is λ. [A node that points at itself](#example:self-loop) is the smallest cycle, λ = 1.

```check
Q: Both pointers start at head. What goes wrong if the loop checks slow == fast before moving them?
- Nothing, the check just happens earlier
* It reports a cycle in every list, because they start out equal
- It misses cycles of length 1
= Move first, then compare. At the start slow and fast are the same node, so a check before moving always says they met.
```

## When to use it

Use it when following pointers might go round forever and memory is tight: checking a linked structure that may have been corrupted, or any sequence where each value comes from the one before it, x, f(x), f(f(x)), and so on. Pollard's rho method for factoring integers is named after the same ρ shape and uses the same idea. When memory is not a problem, a set of visited nodes is simpler to write and easier to get right.

## Common mistakes

- Comparing `slow == fast` before moving them.
- Testing only `fast != null`, then crashing on `fast.next.next`.
- In phase 2, moving the pointer from `head` two steps at a time. Both move one step now.
- Starting λ at 0 with `fast = slow.next`, which is off by one.
- Assuming the meeting point is the start of the cycle. It usually is not; that is what phase 2 is for.

## Try this

- [A tail and a cycle](#example:rho). Before phase 1 starts, guess where they will meet.
- [No cycle: the hare reaches null](#example:no-cycle). Count the steps: about n / 2.
- [Long tail, short cycle](#example:long-tail) and [the whole list is a cycle](#example:full-cycle). Which one takes phase 2 longer?
- [The empty list and one node](#example:tiny).
- Type `1 2 3 @9` and press **Build**. Then try `1 2 3 @1`.
