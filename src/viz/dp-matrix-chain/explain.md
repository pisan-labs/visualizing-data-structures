# Matrix-chain order

Multiplying a p×q matrix by a q×r matrix takes p·q·r scalar multiplications. Matrix multiplication is associative, so A₁A₂A₃ gives the same answer as (A₁A₂)A₃ or A₁(A₂A₃). The work is another matter. With A₁ 10×40, A₂ 40×2 and A₃ 2×30, the first order takes 1,400 multiplications and the second 14,400. Same answer, ten times the work. [Have a look](#example:ten-times).

So which order is cheapest? The number of ways to bracket n matrices grows like 4ⁿ (the Catalan numbers): 42 for six matrices, 4,862 for ten. Trying them all is out.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the tables | m[i][j] and s[i][j] for every chain Aᵢ…Aⱼ | Θ(n³) time, Θ(n²) space |
| Parenthesize | Reads the brackets off s | Θ(n) |

Matrix Aᵢ is pᵢ₋₁ × pᵢ, so the whole chain is described by p₀, p₁, …, pₙ. Look at the last multiplication in the best order for Aᵢ…Aⱼ. It multiplies the product of Aᵢ…Aₖ by the product of Aₖ₊₁…Aⱼ, for some split k. Each half should itself be multiplied as cheaply as possible, and joining the two results costs pᵢ₋₁·pₖ·pⱼ. So

m[i][j] = min over k from i to j − 1 of (m[i][k] + m[k + 1][j] + pᵢ₋₁·pₖ·pⱼ), with m[i][i] = 0.

s[i][j] remembers the k that won.

## Filling by chain length

m[i][j] reads m[i][k], to its left in the same row, and m[k + 1][j], below it in the same column. Both are shorter chains. So fill by chain length: first the diagonal (one matrix, cost 0), then all chains of two, then three, out to m[1][n] in the top-right corner. The two arrows show the halves of the split being tried; they turn blue when that split is the best so far. Each matrix's size sits beside its row. [Show me](#play:six-matrices)

Press **Fill one chain length** to fill one diagonal at a time, as in [one chain length at a time](#example:by-length).

```check
Q: A₁ is 2×3, A₂ is 3×4 and A₃ is 4×5. m[1][2] = 24 and m[2][3] = 60. What is m[1][3]?
- 84
* 64
- 100
- 90
= Split after A₁: 0 + 60 + 2·3·5 = 90. Split after A₂: 24 + 0 + 2·4·5 = 64. The smaller is 64.
```

## Reading off the order

s[1][n] says where the last multiplication splits the whole chain. Then s says how to split each half, and so on down to single matrices. Under the tables, a range in square brackets is a part not split yet; each step replaces one with its two halves in round brackets. For the six matrices 30×35, 35×15, 15×5, 5×10, 10×20 and 20×25 the answer is ((A₁(A₂A₃))((A₄A₅)A₆)): 15,125 multiplications, where the worst order needs 58,000. The split falls where the chain is thinnest, at the 5.

```check
Q: Why does the table fill by diagonals instead of row by row?
- Diagonals are shorter
* m[i][j] reads m[k + 1][j], which is in a lower row
- Row by row would give a different answer
- It does not matter
= Row by row from the top, m[k + 1][j] would still be empty. Every cell reads shorter chains, so filling shortest first is safe.
```

## When to use it

The real use is in numerical libraries and query optimizers: deciding the order of a chain of products, or of joins in a database, before doing any of the work. Three nested loops over at most a few hundred matrices is nothing next to multiplying them. It is also the model for a whole family of interval problems: optimal binary search trees, polygon triangulation, parsing (CYK has the same shape).

Avoid it when every order costs the same ([equal sizes](#example:all-square)), or when n is in the thousands; then Θ(n³) starts to hurt, and there is a cleverer O(n log n) algorithm (Hu and Shing) that nobody implements for fun.

## Common mistakes

- Filling row by row. The cell below is still empty.
- Using pₖ₋₁ or pₖ₊₁ in the join cost. Joining Aᵢ…Aₖ (pᵢ₋₁ × pₖ) with Aₖ₊₁…Aⱼ (pₖ × pⱼ) costs pᵢ₋₁·pₖ·pⱼ.
- Thinking the table multiplies matrices. It only decides the order; the matrices are never touched.
- Greedily doing the cheapest single product first. It can paint you into a corner.

## Try this

- [Three matrices, ten times the work](#example:ten-times) and [one matrix](#example:one-matrix).
- Type `5 40 5 40 5`, press **Set dimensions**, and guess the order before you fill the tables.
- In the six-matrix example, find the cell where the split changes as the chain grows.
