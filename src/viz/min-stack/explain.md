# Min stack

A [stack](/stack-array/) does push, pop and top in O(1). Now add one more question: what is the smallest value in the stack right now? The obvious answer looks at every value, n − 1 comparisons. The trick keeps a second stack beside the first, `mins`, whose top is always the minimum. Then min is one look, and every operation stays O(1).

The catch is pop. One variable holding the minimum is easy to keep up to date on push. Pop the minimum, though, and you need the one before it. The second stack remembers exactly that.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `push(x)` | put x on the stack; also on mins if x ≤ the top of mins | O(1) |
| `pop()` | take the top off; also off mins if it equals the top of mins | O(1) |
| `top()` | read the top of the stack | O(1) |
| `min()` | read the top of mins | O(1) |
| `min()`, scanning the stack | look at every value | Θ(n) |
| extra space for mins | one entry per push that ties or beats the minimum | O(n) |

mins is a stack of minimums so far. Its top is the minimum of the whole stack, the entry under it is the minimum before that value was pushed, and so on down. [Show me](#play:mins-on-the-side)

The **Approach** option switches to the plain stack, which scans for the minimum. Both give the same answers. `comparisons` counts every value compared with another, over all the operations so far, and `naive total` and `pattern total` say what each design has cost.

## How it works

Two rules:

1. **push(x):** push x onto the stack. If mins is empty or x ≤ the top of mins, push x onto mins too.
2. **pop():** pop x off the stack. If x equals the top of mins, pop mins too.

min() is the top of mins. No loop anywhere.

In [Minimums on the side](#example:mins-on-the-side), the pushes are 5 3 7 3 8 1. mins gets 5, then 3, skips 7, gets the second 3, skips 8, and gets 1: mins is 5 3 3 1. min() is 1. Pop the 1 and it equals the top of mins, so mins drops to 5 3 3 and the minimum is 3 again. Pop the 8 and nothing happens to mins: 8 was never a minimum. The dashed lines join each entry of mins to the push that put it there. An entry leaves when that value leaves.

```check
Q: Starting empty, push(6), push(2), push(9), push(2), pop(). What does mins hold, bottom to top?
- 6
- 6 2 9
* 6 2
- 6 2 2
= 6 goes on (mins was empty), 2 goes on (2 ≤ 6), 9 does not (9 > 2), the second 2 goes on (2 ≤ 2). The pop removes a 2, which equals the top of mins, so one 2 comes off: 6 2.
```

## At most, not less than

The test on push is x ≤ the top of mins, not x < it. Ties matter. In [Ties go onto mins too](#example:ties-stay-on), the pushes are 4 2 2, so mins is 4 2 2. Pop one 2 and mins is 4 2: the other 2 is still in the stack, and min() still says 2.

With x < instead, the second 2 never goes onto mins. Then the pop of the first 2 matches the top of mins and takes it off, and min() says 4. The stack still holds a 2. Nope.

## Push every time

The other common version pushes onto mins on every push: the smaller of x and the old minimum. The two stacks always have the same height, so pop never compares. It pops both. Set **Push onto mins** to every time and compare [Push the minimum every time](#example:every-push-a-pair) with [Minimums on the side](#example:mins-on-the-side). Same pushes, same answers. After the six pushes mins holds 6 entries instead of 4, and the whole session costs 5 comparisons instead of 8, because the pops are free.

So the trade is space for comparisons. Which is better depends on the values. [Rising values: one minimum](#example:rising-values) pushes 1 to 8: the first version keeps one entry in mins, the second keeps eight. [Falling values: every push is a minimum](#example:falling-values) is the worst case for the first version too: every push is a new minimum, so mins is as tall as the stack either way.

## Scanning the stack

The plain stack does nothing on push and pop, and scans on min: best = the bottom value, then compare with each value above it. [Scan for the minimum](#example:scan-for-the-minimum) runs the same operations as [Minimums on the side](#example:mins-on-the-side). Its four mins scan 6, 5, 4 and 3 values: 5 + 4 + 3 + 2 = 14 comparisons. mins pays one comparison per push (the first one is free) and one per pop instead, 8 in all. [Show me](#play:scan-for-the-minimum)

Is the second stack always cheaper? Nope. It pays on every push and every pop, whether anyone asks for the minimum or not. [Few mins favor the scan](#example:few-mins-favor-the-scan) pushes 6 values, pops 3 and asks for the minimum once: 8 comparisons with mins, 2 for the scan. The scan loses when min is called often on a tall stack. On a million values that is about a million comparisons per call against none, which is why the trick exists.

```check
Q: The stack holds 10 values and min() is called once. How many comparisons does the scan make?
- 1
- 10
* 9
- 0
= Start with the bottom value as the best, then compare it with each of the other 9.
```

## Spot it

Reach for a min stack when the problem says:

- **last in, first out**: undo, back, the most recent, nested, take from the top;
- **the smallest (or largest) at any moment**, after every change;
- **in O(1)** or "instantly", which rules out a scan.

Three problems of our own:

- A drawing app keeps an undo history, last action first. At any moment it shows the cheapest action still in the history. (A min stack of costs.)
- Plates go on and come off the top of a pile. After every change, report the heaviest plate left. (A max stack: the same trick with ≥.)
- A game saves checkpoints and loading the latest one discards it. Show the lowest score among the saves left. (A min stack of scores.)

Look-alikes: "how long until a warmer day" wants the next bigger value for each element, a [monotonic stack](/monotonic-stack/). "The smallest of the last k readings" takes values off the other end, so it is a queue, not a stack: a [monotonic queue](/monotonic-queue/), or a [queue from two stacks](/two-stack-queue/) built from two min stacks.

## When to use it

Use it when you need the minimum often and the values come and go in stack order. It is small, simple and hard to get wrong once the tie rule is right.

Avoid it when values leave from anywhere but the top: a min stack cannot delete from the middle. A balanced search tree can, in O(log n). And if the minimum is rarely asked for, the plain stack is cheaper.

## Common mistakes

- One variable for the minimum. It is right until the minimum is popped, and then nothing says what came before it.
- Pushing onto mins only when x < the minimum. Ties break it ([Ties go onto mins too](#example:ties-stay-on)).
- Popping mins on every pop in the first version. Only when the popped value equals the top of mins.
- Comparing with the top of the stack instead of the top of mins. The top of the stack is the newest value, not the smallest.
- Calling pop, top or min on an empty stack. [Nothing to pop](#example:empty-stack) shows what the page reports; real code should check or throw.

## Try this

- [Minimums on the side](#example:mins-on-the-side): before each pop, say whether mins changes.
- Push 3 1 4 1 5 and pop twice. What is the minimum, and how many entries does mins hold?
- [Few mins favor the scan](#example:few-mins-favor-the-scan): add three more mins at the end. When does the scan start losing?
- Press Compare, pick this page with other options, and set one side to scanning the stack. Fill both with **A min after every push** and watch `comparisons`.
- [Falling values: every push is a minimum](#example:falling-values) with **Push onto mins** set to every time. Does mins get any taller?
