# Strassen matrix multiplication

Multiplying two n × n matrices the way you learned takes n³ multiplications: every row of A meets every column of B, n numbers at a time. For a long time that looked like the end of the story. In 1969 Volker Strassen showed that two 2 × 2 matrices can be multiplied with 7 multiplications instead of 8. One multiplication saved does not sound like much. Applied recursively, it changes the exponent.

| Method | Multiplications for n × n | Additions |
|---|---|---|
| schoolbook | n³ | n²(n − 1) |
| block split, eight products | n³ | n²(n − 1) |
| Strassen, seven products | n^log₂7 ≈ n^2.81 | about 6 n^2.81 |

[Show me](#play:seven-products)

## Splitting into blocks

Cut each matrix into four (n/2) × (n/2) blocks. The block product works just like the 2 × 2 product, with blocks in place of numbers:

C11 = A11·B11 + A12·B21, C12 = A11·B12 + A12·B22, and so on.

That is eight half-size products and four block additions. Set **Products per split** to eight and run [Eight block products](#example:eight-products). The 4 × 4 product takes 64 multiplications, exactly the schoolbook count. T(n) = 8T(n/2) + Θ(n²) is still Θ(n³). Splitting alone buys nothing, the same lesson as [Karatsuba](/karatsuba/).

## The seven products

CLRS first makes ten sums of blocks, S1 to S10, and then seven products:

P1 = A11·S1, P2 = S2·B22, P3 = S3·B11, P4 = A22·S4, P5 = S5·S6, P6 = S7·S8, P7 = S9·S10.

Then C comes back out with additions and subtractions only:

C11 = P5 + P4 − P2 + P6, C12 = P1 + P2, C21 = P3 + P4, C22 = P5 + P1 − P3 − P7.

Nobody finds these by staring. Write out C12 = P1 + P2 = A11·(B12 − B22) + (A11 + A12)·B22 and the A11·B22 terms cancel, leaving A11·B12 + A12·B22. The other three blocks work the same way, with more cancelling.

For [1 2; 3 4] times [5 6; 7 8]: P5 = (1 + 4)(5 + 8) = 65, P4 = 4·(7 − 5) = 8, P2 = (1 + 2)·8 = 24 and P6 = (2 − 4)(7 + 8) = −30, so C11 = 65 + 8 − 24 − 30 = 19. Have a look at the formulas beside the matrices as it runs: each product turns green when its call comes back, and so does its box in the tree.

Many slides write the same idea as M1 to M7, each a product of two sums, such as M1 = (A11 + A22)(B11 + B22). Set **How the seven are written** to M1..M7 for [the same seven, written as M1..M7](#example:m-names). The products come in a different order, and the answer and the counts are the same.

```check
Q: Strassen's C12 = P1 + P2, with P1 = A11·(B12 − B22) and P2 = (A11 + A12)·B22. What is left after the cancelling?
- A11·B12 + A11·B22
* A11·B12 + A12·B22
- A11·B11 + A12·B21
- A12·B12 + A11·B22
= A11·B12 − A11·B22 + A11·B22 + A12·B22. The middle two cancel, and what is left is the block product's own C12.
```

## The recursion and the Master theorem

The seven products are products of (n/2) × (n/2) matrices, so Strassen calls itself on each one. The tree under the matrices shows it: the first call, its seven products, and theirs as small squares. [Recursion: 49 multiplications instead of 64](#example:four-by-four) goes two levels down. [Show me](#play:four-by-four)

Level d has 7^d calls of size n/2^d. At the bottom, after log₂ n levels, there are 7^(log₂ n) = n^(log₂ 7) calls of size 1, each one multiplication. The 18 additions per call cost Θ(n²) at the top and less below, so

T(n) = 7T(n/2) + Θ(n²) = Θ(n^log₂7) ≈ Θ(n^2.81).

That is case 1 of the [Master theorem](/master-theorem/): log₂ 7 ≈ 2.81 beats the 2 of the n² work, so the leaves win. The levels list under the tree adds it up for you.

```check
Q: Strassen multiplies two 16 × 16 matrices all the way down to 1 × 1. How many scalar multiplications is that?
- 4096
- 343
* 2401
- 1792
= 16 = 2⁴, so four levels of seven: 7⁴ = 2401. The schoolbook method takes 16³ = 4096.
```

## What it costs

The saved multiplications are paid for with additions. A 2 × 2 Strassen product makes 18 additions where the schoolbook method makes 4. [Three levels down](#example:eight-by-eight), 8 × 8 takes 343 multiplications instead of 512, and 1674 additions instead of 448. Strassen only wins once n is large enough for the exponent to matter.

A size that is not a power of 2 has to be padded with zeros. In [a 3 × 3 product](#example:padding) that means 4 × 4: 49 multiplications for a job the schoolbook method does in 27. Padding at most doubles n, so it changes the constant, not the n^2.81.

## When to use it

Real implementations use Strassen for the top few levels only, and switch to an ordinary blocked product once the blocks are a few hundred rows. Below that, the extra additions and memory traffic cost more than the multiplications they save. With floating point numbers it is also a little less accurate than the plain product, which is why many numerical libraries skip it.

It was the first proof that n³ is not the limit, and it started a race. Coppersmith and Winograd, and their successors, have the exponent down to about 2.37, with constants so large that nobody uses them.

## Common mistakes

- Thinking splitting helps by itself. Eight half-size products is still n³; the seventh product is the whole trick.
- Recursing to 1 × 1 in real code. Stop at a cutoff and multiply small blocks directly.
- Forgetting the padding. An odd size does not split.
- Mixing up the signs in C11 and C22. Write out one block and check it cancels to A11·B11 + A12·B21.
- Counting only multiplications. The additions are Θ(n^2.81) too, with a bigger constant.

## Try this

- Work out P1 to P7 for [1 2; 3 4] times [5 6; 7 8] by hand, then check them in [Seven products instead of eight](#example:seven-products).
- Run [Recursion: 49 multiplications instead of 64](#example:four-by-four) with each setting of **Products per split** and compare the **multiplications** and **additions** counters.
- Multiply the identity by a matrix (a preset). Strassen does not notice that it could have skipped everything.
- The [base case](#example:one-by-one) is one multiplication. How many base cases does a 32 × 32 product have?
