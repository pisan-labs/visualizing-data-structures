# Queue from two stacks

A [stack](/stack-array/) is last in, first out. A [queue](/queue-array/) is first in, first out. Can you build a queue out of stacks, with nothing else? Yes, with two of them, and every operation is O(1) amortized. Pour one stack into another and the order flips, so the oldest value ends up on top. That flip is the whole trick.

Call the stacks in and out. New values go onto in. The front of the queue is the top of out.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `enqueue(x)` | push x onto in | O(1) |
| `dequeue()` | if out is empty, move everything from in to out; then pop out | O(1) amortized, O(n) worst |
| `peek()` | the same moves, then read the top of out | O(1) amortized, O(n) worst |
| any m operations | each value moves across once | at most 3m stack operations |
| dequeue, moving everything every time | move all n across, pop, move n − 1 back | Θ(n) |

Here a push and a pop each cost 1. The bars under the stacks show what each operation cost, with a dashed line at 3. Most bars are 1; once in a while there is a spike. [Show me](#play:move-only-when-empty)

The **Approach** option switches to the obvious design: keep everything on in, and move it all to out and back for every dequeue. Both give the same answers. `pushes` and `pops` count over all the operations so far, and `naive total` and `pattern total` say what each design has cost.

## How it works

Two rules:

1. **enqueue(x):** push x onto in.
2. **dequeue():** if out is empty, pop every value off in and push it onto out. Then pop out.

peek is dequeue without the last pop.

In [Move across only when out is empty](#example:move-only-when-empty), enqueue 1 2 3 4 leaves in holding 1 2 3 4, bottom to top, with 4 on top. The first dequeue finds out empty and moves them: 4 first, then 3, 2, 1. Now out holds 4 3 2 1 with 1 on top, the oldest value. Pop it. That dequeue cost 9: eight for the move, one for the pop.

Then enqueue 5 goes onto in, and the next three dequeues pop 2, 3 and 4 straight off out, 1 each. 5 waits on in until out runs dry. The last dequeue moves it across and pops it: 3. Ten operations, 20 stack operations.

```check
Q: in holds 1 2 3 (3 on top) and out is empty. What does dequeue() cost, counting each push and pop as 1?
- 1
- 3
- 6
* 7
= out is empty, so all three values move: three pops off in and three pushes onto out, 6. Then one pop off out takes 1: 7.
```

The queue's order is never at risk. Everything on out is older than everything on in, because a value only reaches out when out is empty. [First in, first out survives the split](#example:order-survives) enqueues 4 and 5 while 2 and 3 are still on out: 2 and 3 come off first. [The queue split across both stacks](#example:split-across-both) stops halfway: 2 3 4 5 on out, 6 7 8 on in, and the front is the top of out.

## Why it is O(1) amortized

One dequeue can move every value: [One costly dequeue pays for the rest](#example:one-costly-dequeue) enqueues 8 values and its first dequeue costs 17. So the worst case for one operation is O(n). But look at a value's whole life. It is pushed onto in once, popped off in once, pushed onto out once and popped off out once. Four stack operations, never more, because nothing ever goes back from out to in. That example's 16 operations cost 32 in all: 2 each.

The same count, per operation: an enqueue costs 1 now and leaves 2 to pay for its value's move later. So charge each enqueue 3 and each dequeue 1, and every move is already paid for. Any m operations cost at most 3m. This is the accounting method of [amortized analysis](/amortized-analysis/), and the dashed line is that 3. The potential method gets the same answer with Φ = 2 × (values on in): an enqueue costs 1 and raises Φ by 2, and a move of k values costs 2k and drops Φ by 2k.

Amortized is not average. The 3m bound holds for every sequence of operations, whatever the values and whatever the order. No luck needed.

## Moving everything every time

The obvious design keeps the queue on in, oldest at the bottom. To dequeue, it moves all n values to out, pops the oldest, and moves the other n − 1 back: 4n − 1 stack operations. peek moves all n there and back: 4n.

[Move everything every time](#example:move-everything-every-time) runs the same operations as [Move across only when out is empty](#example:move-only-when-empty): its dequeues cost 15, 15, 11, 7 and 3, and with the five enqueues the whole run costs 56 against 20. Draining a full queue of 8 costs 136 this way, Θ(n²) for n dequeues. [Peeks after the move are free](#example:peeks-are-free) is worse still: each peek costs 20 there and back, and 0 once out holds the front.

When is the obvious design just as good? [Enqueue, dequeue, enqueue, dequeue](#example:alternating): with one value in the queue, both cost 3 per dequeue. The gap opens as the queue grows.

## Spot it

Reach for two stacks when the problem says:

- **only stacks**, or only push and pop, or lists you can only use at one end;
- **first in, first out**, in the order they arrived, first-come first-served;
- **O(1) on average over many operations**, or amortized: one slow operation is allowed.

Three problems of our own:

- A ticket counter must serve people first come, first served, but all it has for storage are piles you add to and take from at the top. Make each person cost O(1) over the day.
- A language gives you immutable lists that are cheap to use only at the front. Make a first-in, first-out queue with O(1) amortized operations. (Keep the back of the queue in one list, reversed, and the front in the other.)
- A log only offers push and pop at its end. Deliver its messages in the order they were written, with a constant number of log operations per message overall.

Look-alikes: "a stack that also reports its largest value" is still one stack, so a [min stack](/min-stack/) (with max). "The largest value in every window of k readings" is a [monotonic queue](/monotonic-queue/). That one can also be two stacks: build this queue from two min stacks, and the minimum of the queue is the smaller of their two minimums.

## When to use it

Use it when stacks are what you have: a purely functional language, a puzzle, an interview. It also gives a queue that can report its minimum or maximum, as above, which a circular array cannot do cheaply.

Avoid it when every single operation must be fast, as in real-time code: a dequeue that moves a million values is still slow, however cheap the average is. A [circular array](/queue-array/) gives O(1) every time, and keeps the values next to each other in memory.

## Common mistakes

- Moving values from in to out when out is not empty. Newer values land on top of older ones and come out first.
- Moving back from out to in after each dequeue. That is the obvious design, Θ(n) per dequeue.
- Forgetting that peek can move values too. It needs the same refill as dequeue.
- Checking only in for emptiness. The queue is empty when both stacks are.
- Quoting O(1) as the worst case. It is O(1) amortized; one dequeue can be O(n).

```check
Q: enqueue(1), enqueue(2), enqueue(3), dequeue(), enqueue(4). What does the next dequeue() return, and which stack is it popped from?
* 2, from out
- 4, from in
- 2, from in
- 3, from out
= The first dequeue moved 1 2 3 to out and popped 1, so out holds 3 2 with 2 on top. 4 went onto in. out is not empty, so the next dequeue pops 2 off out.
```

## Try this

- [Move across only when out is empty](#example:move-only-when-empty): before each dequeue, say whether anything moves.
- [One costly dequeue pays for the rest](#example:one-costly-dequeue): watch the running total in the narration. Does it ever pass 3 per operation?
- Fill with **Bursts: enqueue 3, dequeue 2** and read the bars. Which operations spike, and why there?
- Press Compare, pick this page with other options, and set one side to moving everything every time. Fill both with **Enqueue, then peek again and again**.
- [Nothing to dequeue](#example:nothing-to-dequeue): what does a dequeue on an empty queue cost?
