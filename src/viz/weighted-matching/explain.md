# Weighted matching (Hungarian)

You have four workers and four jobs. Each worker can do every job, but at a different cost. Give every worker exactly one job so the total cost is as small as possible. This is the assignment problem, and it is a matching in a complete bipartite graph where every edge has a weight.

Why not try every assignment? With n workers there are n! of them. Six workers make 720, which is fine. Twenty make about 2.4 × 10¹⁸, which is not. The Hungarian algorithm (Kuhn in 1955, tidied up by Munkres) does it in O(n³).

| Operation | What it does | Cost |
|---|---|---|
| Row and column reduction | Starting potentials u and v | Θ(n²) |
| One phase | Match one more row | O(n²) with slack, O(n³) as drawn here |
| Whole run | n phases | O(n³) with slack, O(n⁴) as drawn here |

## Potentials and tight cells

The trick is to give every row a number u[i] and every column a number v[j] with

u[i] + v[j] ≤ c[i][j] for every cell.

Think of u and v as a lower bound that each row and each column contribute. Any assignment uses every row once and every column once, so its cost is at least sum(u) + sum(v). If we ever find an assignment that costs exactly that, nothing can beat it. Done.

A cell where u[i] + v[j] = c[i][j] is **tight**: its reduced cost c[i][j] − u[i] − v[j] is 0. The algorithm only ever matches along tight cells, so the matching it finds costs exactly sum(u) + sum(v). The small number in the corner of each cell is its reduced cost. The graph on the left shows only the tight cells as edges.

```check
Q: The potentials are feasible and sum(u) + sum(v) = 12. A perfect matching uses only tight cells. What does it cost?
- At least 12, maybe more
* Exactly 12, and it is optimal
- Less than 12
= Each tight cell costs u[i] + v[j], so the matching costs sum(u) + sum(v) = 12, and feasibility says no assignment costs less.
```

## How it works

Start with the textbook reductions: u[i] is the smallest entry in row i, and v[j] is the smallest of c[i][j] − u[i] in column j. Every row and every column now has at least one tight cell.

Then handle the rows one at a time. Each phase starts a tree at an unmatched row r:

1. S holds rows, T holds columns. Start with S = {r} and T empty.
2. Look along the rows in S for a tight cell to a column j outside T. If j is free, we have an augmenting path. If j is matched to some row, add j to T and its row to S.
3. If no tight cell leaves the tree, we are stuck. Let δ be the smallest reduced cost from a row in S to a column outside T. Add δ to u for every row in S and subtract δ from v for every column in T. Cells inside the tree stay tight (one side went up, the other down), no cell goes negative, and the cell that gave δ becomes tight. Go back to step 2.
4. Flip the augmenting path: its unmatched cells join the matching and its matched cells leave. The matching grows by one.

[Show me](#play:cheapest-four)

The potential update is the clever part. The tree can't grow, so we change the prices until it can, without breaking any promise we have made so far.

```check
Q: S = {A, C} and T = {2}. We add δ = 3 to u[A] and u[C] and subtract 3 from v[2]. What happens to the reduced cost of cell A,2?
- It drops by 3
* It stays the same
- It rises by 3
= Its row went up by 3 and its column went down by 3, so u + v is unchanged. Cells inside the tree stay tight.
```

## Maximizing instead

Sometimes the numbers are profits. Flip them: let M be the largest entry and minimize M − c[i][j]. Every assignment adds exactly n copies of M, so the cheapest assignment of M − c is the most valuable assignment of c. The **Goal** option does this, and the matrix then shows M − c. [Show me](#play:maximize)

Negating the costs works too. I prefer M − c because the numbers stay positive, which is easier to read.

## When to use it

Use it when every worker needs exactly one job and every job one worker, and the costs matter. Matching ride requests to drivers, students to project slots, radar tracks to targets. If the sides have different sizes, pad the smaller one with dummy rows or columns that cost 0.

If all you care about is how many pairs you can make, not their cost, plain bipartite matching is simpler and faster. If the graph is not bipartite (roommates rather than workers and jobs), you need the blossom algorithm instead.

## Failure cases and common mistakes

- Forgetting that the matrix must be square. Pad it.
- Using a missing edge as cost 0. A forbidden pair needs a huge cost, not a free one.
- Updating the potentials of the wrong side. Rows in S go up, columns in T go down. Get it backwards and cells inside the tree stop being tight.
- Expecting a unique answer. Ties are common. [Every assignment ties](#example:all-equal) when all the costs are equal, and the algorithm just takes the first free column it finds.
- Greedy picking. Giving each worker their cheapest job fails as soon as two workers want the same one. [Everyone wants the same job](#example:products) is the extreme case: every row's cheapest cell is in column 1.

## Try this

- [Four workers, four jobs](#example:cheapest-four). Before pressing play, try to find the cheapest assignment by hand. Then watch the two potential updates.
- [Profits instead of costs](#example:maximize). Same numbers, opposite goal. Which workers swap jobs?
- [Every row has its own cheap job](#example:zeros-on-diagonal). The reductions do all the work, and δ never appears.
- [Everyone wants the same job](#example:products). Count the potential updates. Then try the 6 × 6 version from the presets.
- [Every assignment ties](#example:all-equal) and [one worker, one job](#example:one-worker), the boring cases. Boring is good for checking you understand the steps.
- Type your own matrix, rows separated by semicolons, such as `4 1 3; 2 0 5; 3 2 2`, and press **Load**.
