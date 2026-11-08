# Counting steps in loops

Most of the time you can find the Big-O of a piece of code without running it. Find the line that runs most often, usually the one in the innermost loop, and count how many times it runs for an input of size n. That count is T(n). Simplify T(n) and you have the Big-O.

This page does the counting with you. Pick the loops under **Options**, type n and press **Run**. Each time the highlighted line runs, a cell lights up. At the end the page writes T(n) as a formula, checks it against the count from the run, and throws away everything Big-O does not care about.

## Count the body, not the header

`for i = 1 to n` runs its body n times. Its test, i ≤ n, runs n + 1 times: the extra one is the test that fails and ends the loop. An off-by-one like this never changes the Big-O, but it does change the exact count, and exam questions like to ask for the exact count. Count the line inside the loop. [The test runs once more than the body](#example:header-vs-body)

The counted line stands for a constant amount of work: a comparison, an assignment, adding to a sum. If the body calls something that is not constant, say a binary search that takes log n, then every run of the body costs log n and you multiply.

## Nested loops multiply, loops in a row add

Two loops, one inside the other. The inner loop runs n times for each of the n values of i, so the body runs n · n = n² times. The cells fill a square. [Show me](#play:square)

Two loops, one after the other. The first runs n times, then the second runs n times. That is n + n = 2n, which is O(n). The cells fill two rows. [Loops in a row add up](#example:sequence-adds)

Students mix these two up all the time. The code looks almost the same: two `for` lines, two bodies. The indentation is the whole difference.

```check
Q: One loop runs i from 1 to n. After it finishes, a second loop runs j from 1 to n. How many times do the two bodies run in total?
- n
* 2n
- n²
- n + 1
= The loops run one after the other, so their counts add: n + n = 2n.
```

## When the inner loop depends on i, add the rows

`for j = i to n` runs n − i + 1 times, a different number on every row. Multiplying no longer works, so add the rows up: n + (n − 1) + … + 2 + 1 = n(n+1)/2. The cells fill a triangle, about half of the square. [Show me](#play:triangle)

Half a square is still a square. n(n+1)/2 = n²/2 + n/2. Keep the term that grows fastest, n²/2, drop n/2 because it grows more slowly, and then drop the constant ½. O(n²).

`for j = 1 to i − 1` leaves out the diagonal and gives n(n−1)/2, one run for each pair of different items. Comparing every item with every other item looks like this. Also O(n²). [Every pair once](#example:pairs)

Three sums cover most of the loops you will meet:

- 1 + 1 + … + 1 (n ones) = n
- 1 + 2 + 3 + … + n = n(n+1)/2
- 1 + 2 + 4 + … + 2ᵏ = 2ᵏ⁺¹ − 1

## Halving gives a log

`i = n; while i > 1: i = i / 2` runs once for every halving it takes to get from n down to 1, which is ⌊log₂ n⌋ times. For n = 16 it lights 4 of the 16 cells: 16, 8, 4 and 2. For n = 1,000,000 it runs 19 times. [Halving takes log n steps](#example:halving)

Doubling from 1 up to n is the same thing in the other direction: `j = 1; while j ≤ n: j = 2 · j` runs ⌊log₂ n⌋ + 1 times. Put that loop inside `for i = 1 to n` and you get n(⌊log₂ n⌋ + 1), which is O(n log n). Two loops, and the inner one is short. [A doubling inner loop](#example:doubling-inner)

The square-root loop is a cousin. `while i · i ≤ n` stops once i passes √n, so it runs ⌊√n⌋ times. [Stopping at the square root](#example:square-root)

## Check before you write n log n

This is the one that catches people. Move the doubling to the outer loop and let the inner loop run up to i:

```
i = 1
while i ≤ n
    for j = 1 to i
        count = count + 1
    i = 2 · i
```

The outer loop runs about log n times. The inner loop runs up to n times. So log n times n is n log n? Nope. The inner loop runs 1, 2, 4, 8, … times, and 1 + 2 + 4 + … + 2ᵏ = 2ᵏ⁺¹ − 1, which stays below 2n. The last row does about half of all the work. O(n). [Show me](#play:doubling-outer)

"About log n rows of at most n each" does give an upper bound, and O(n log n) is true. It is just not tight. Whenever the inner bound changes from row to row, add the rows.

```check
Q: i takes the values 1, 2, 4, … up to n, and for each i, j runs from 1 to i. What is the Big-O of the count?
- O(log n)
- O(n log n)
* O(n)
- O(n²)
= The rows hold 1, 2, 4, … cells, and that sum stays below 2n.
```

## Early exits have a best case

A loop with a `return` inside can stop early. Linear search looks for x and stops as soon as it finds it. If x is the first item, that is one comparison however long the array is: the best case, O(1). [Early exit, best case](#example:early-exit-best)

If x is not there at all, every item gets compared: n comparisons, the worst case, O(n). [Early exit, worst case](#example:early-exit-worst) With x equally likely to be anywhere, the average is about n/2, still O(n). Switch **Early exit: where x is** under **Options** to see all three.

When someone says linear search is O(1), they are quoting the best case and leaving out the interesting part. Unless someone says otherwise, a Big-O for an algorithm means its worst case.

## Three loops

`for i = 1 to n`, `for j = i to n`, `for k = j to n` lights a triangle for every i, each smaller than the one before. Stack them and you get a pyramid. The count is n(n+1)(n+2)/6, which expands to n³/6 + n²/2 + n/3. Keep n³/6, drop the rest and the 1/6: O(n³). [Three nested loops make a pyramid](#example:triple)

The drawing stops at n = 6. Fifty-six cells over six little grids is plenty.

## Double n and watch the count

**Grow** runs the same loops for n, 2n, 4n and 8n without drawing them, and divides each count by the one before. The ratio gives away the order: about 2 is linear, about 4 is n², about 8 is n³. A log does not multiply at all; it adds 1 every time n doubles. [Show me](#play:grow-quadratic)

The ratios start messy and settle down. For the triangle from n = 4 they go 3.6, 3.78, 3.88 on their way to 4, because the n/2 term matters for small n and fades for large n. [The halving loop adds 1](#example:grow-log) The Big-O growth lab page plays the same game with the usual functions side by side.

## When counting works, and when it needs help

Counting is quick and exact when the loop bounds depend only on n and on the other loop variables. It needs more care when:

- a loop runs until it finds something in the data: find the best and the worst inputs and count each one;
- the body calls a function: multiply by that function's cost;
- the code is recursive: write a recurrence instead (see the recurrences and Master theorem page);
- one run is expensive but most are cheap, like growing a dynamic array: the average over a long run of operations (the amortized cost) tells a truer story than the worst single one.

## Common mistakes

- Calling every double loop n². Look at the inner bound first. j = i to n is still O(n²), j doubling is log n per row, and an outer loop that doubles can bring the whole thing down to O(n).
- Seeing `i = 2 · i` inside a loop and writing n log n without checking what the inner loop does. Add the rows.
- Multiplying loops that run one after the other. They add.
- Forgetting the best case of a loop with an early exit, or quoting the best case as if it were the whole story.
- Counting the loop header instead of the body. The header runs one extra time.
- Keeping constants and small terms in a Big-O. O(n²/2 + n/2) is O(n²). The exact count is worth knowing; Big-O just does not care about it.

## Try this

- [Half a square is still n²](#example:triangle). Before you press play, guess how many cells light up for n = 8. Then try n = 16.
- Switch **Loops** to the pairs loop and run n = 8. Why is the count exactly 8 less than the triangle's?
- [n = 1: the loop never runs](#example:halving-n1). What does the halving loop give for n = 3? For n = 4?
- Run the doubling inner loop and the doubling outer loop for n = 16. Both have two loops and a doubling. Which one lights more cells, and by how much?
- Press **Grow** for the square-root loop from n = 4. Why do the ratios jump around?
