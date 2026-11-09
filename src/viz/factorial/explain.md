# Factorial

n factorial, written n!, multiplies the numbers from 1 to n: 4! = 4 × 3 × 2 × 1 = 24. It also has a recursive definition: 0! = 1, and n! = n × (n - 1)! for n > 0. That second form is why every course uses factorial to introduce recursion. The code says exactly what the definition says.

```
factorial(n)
  if n == 0
    return 1
  return n * factorial(n - 1)
```

## One frame per call

Every call gets a frame on the call stack: its own copy of `n`, and a note of where it was when it called something else. `factorial(4)` cannot multiply 4 by `factorial(3)` until `factorial(3)` answers, so its frame sits there and waits. `factorial(3)` waits for `factorial(2)`, and so on down to `factorial(0)`, which answers 1 without calling anything.

| | Cost |
|---|---|
| Time | O(n): one call for each value from n down to 0 |
| Stack depth | O(n): all n + 1 frames wait at the same time |

The time is fine. The stack depth is the part that bites. [Show me](#play:down-and-back)

## Down and back up

The drawing has two parts. The call tree has one box per call, in the order the calls happen. Beside it (under it, on a phone) is the call stack, with main at the bottom and the newest frame on top. For factorial the tree is a straight line, because each call makes exactly one more call.

On the way down, each frame stops on line 4 with a multiplication it cannot do yet: `4 * factorial(3)`, `3 * factorial(2)`, and so on. On the way back, each answer drops into the frame that asked for it, and that frame finishes its multiplication: 1, 1, 2, 6, 24. The first frame to answer is the last one pushed. Last in, first out. That's a stack.

```check
Q: `factorial(3)` runs with the base case `n == 0`. How many factorial frames are on the stack when `factorial(0)` starts?
- 1
- 3
* 4
= `factorial(3)`, `factorial(2)`, `factorial(1)` and `factorial(0)` are all there. None of them can finish until the base case returns.
```

## Trust the smaller call

When you write a recursive function, don't trace the whole thing in your head. Assume `factorial(n - 1)` works, and check that `factorial(n)` does the right thing with its answer. Then check the base case. If both are right, the function is right. (This is induction in disguise.) Tracing every frame is what this page is for, so you can see that the trust is earned.

## Two base cases

Textbooks disagree about where to stop. With `n == 0`, `factorial(0)` is the last call, which matches the math: CLRS, like most books, defines 0! = 1. With `n <= 1`, `factorial(1)` answers 1 itself, which saves one call and one frame. Both give the same answer for every n ≥ 0. Switch the **Base case** option and run the same n to compare. [Stopping at n <= 1](#example:base-one)

They differ on bad input. `n <= 1` quietly returns 1 for `factorial(-3)`, which is not the factorial of anything. `n == 0` never gets there and runs until the stack overflows. Neither is great. Real code checks for a negative n first.

## Tail recursion

The plain version does its work on the way back: each frame multiplies after its call returns. The tail version does the work on the way down, carrying the product so far in an extra parameter, `acc`.

```
factorial(n, acc = 1)
  if n == 0
    return acc
  return factorial(n - 1, n * acc)
```

The recursive call is now the very last thing the function does, which makes it a tail call. By the time `factorial(0, 24)` runs, the answer is already in `acc`, and every waiting frame just passes 24 back. [Show me](#play:tail)

Nothing is left to do after a tail call, so a compiler could reuse the frame instead of pushing a new one. Scheme has to. C and C++ compilers may do it when optimizing, but the standard does not promise it. Python and Java don't do it at all, so in those languages the tail version uses exactly as many frames as the plain one. Set **Recursion** to "frame reused" to see what a language that does it gets: [six calls, one frame](#example:frame-reused). At that point the recursion is a loop.

```check
Q: Python runs `factorial_tail(1000)`, the tail version. How many frames does it need?
- One: the tail call reuses its frame
* 1001, one per call, which is more than Python allows by default
- It depends on the value of acc
= Python does not optimize tail calls, so every call gets its own frame. The default recursion limit is 1000, so this raises RecursionError.
```

## When to use it, when to avoid it

Factorial is the "hello, world" of recursion: small enough to trace by hand, and the definition maps straight onto the code. In a real program, use a loop (or `math.factorial` in Python). A loop needs one frame however big n gets.

Recursion earns its keep when a problem splits into smaller copies of itself in more than one way: walking a tree, merge sort, backtracking. There, writing the loop yourself means managing your own stack, and the recursive version is shorter and easier to check.

## Stack overflow

The stack is finite. Here it holds 10 factorial frames, and the **Frames that fit on the stack** option changes that. Python stops at about 1000 frames; Java and C++ go as deep as the thread's stack size allows. There are three ways to run out.

- **No base case.** Nothing stops the calls: n goes 3, 2, 1, 0, -1, -2 and on. [Show me](#play:missing-base)
- **A base case the input skips.** With `n == 0`, `factorial(-1)` counts down past 0 forever. [A negative n](#example:negative)
- **Too deep.** The base case is fine, and the stack is too small anyway. [Correct, but too deep](#example:too-deep)

When the stack is full, Python raises RecursionError, Java throws StackOverflowError, and a C++ program usually just crashes. The error unwinds the stack: every waiting frame is thrown away without returning anything.

## Common mistakes

- Forgetting the base case, or writing one the input can skip.
- Returning 0 from the base case. Every product is then 0.
- Calling `factorial(n)` instead of `factorial(n - 1)`. The argument never shrinks, so the stack overflows.
- Expecting the tail version to save stack space in Python or Java. It doesn't.
- Forgetting how fast n! grows. 13! no longer fits in a 32-bit `int`, and 21! is too big for a 64-bit `long`. Python's integers grow as needed. Java's wrap around without a word, and in C++ the overflow is undefined behavior.

## Try this

- [Down to the base case and back up](#example:down-and-back). Before each return, predict the value that comes back.
- [The base case](#example:base-case). One call, no recursion.
- [A deep stack](#example:deep-stack). `factorial(9)` fills this stack exactly.
- [Tail recursion](#example:tail) and [the frame reused](#example:frame-reused). Count the frames in each.
- [Forgetting the base case](#example:missing-base), [a negative n](#example:negative) and [too deep](#example:too-deep): three overflows for three different reasons.
- Type `1 2 3 4 5` and press **Call factorial**. Each run makes one more call than the run before.
