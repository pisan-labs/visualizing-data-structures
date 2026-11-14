# DP over intervals

A row of numbered tiles sits between two posts worth 1. Taking a tile scores its number times the numbers of the two things beside it right now, and the row closes up. In what order should you take them? Try the obvious rule, take whatever scores most right now, on 5 6 1 4: it gets 84 at best, depending on how it breaks ties. The best order gets 169. The trick that finds it is a strange one: decide which tile goes **last**.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| solve, the table by length | every stretch [a..b] of the row, shortest first, trying every k in it | Θ(n³) |
| solve, plain recursion | the same rule, nothing stored | 3ⁿ⁻¹ calls |
| trace the order | follow the best k of each stretch from the whole row | Θ(n) |

Why last? If you pick the first tile to take, its two neighbours become neighbours, and the two sides of the row are tangled up with each other. Pick the last tile k of a stretch [a..b] instead. Until the very end k is still there, a wall between [a..k − 1] and [k + 1..b], so each side is cleared on its own. And when k finally goes, its neighbours are a − 1 and b + 1, the things just outside the stretch. So

B[a][b] = max over k of B[a][k − 1] + B[k + 1][b] + v[a − 1] · v[k] · v[b + 1]

with B of an empty stretch 0 and the posts v[0] = v[n + 1] = 1. The answer is B[1][n]. [Show me](#play:take-small-first)

The **Problem** option switches to the other classic: piles in a row, where merging two neighbouring piles costs their total size. Solve [a..b] by where its last merge splits it, [a..k] with [k + 1..b]. That last merge costs the whole stretch's size, whatever happened before:

M[a][b] = min over a ≤ k < b of M[a][k] + M[k + 1][b] + (v[a] + … + v[b])

with M[a][a] = 0. It is the same shape as the brackets of [matrix-chain multiplication](/dp-matrix-chain/).

The **Approach** option switches to plain recursion. `calls` counts calls of the recursive function, `cells` counts stretches solved in the table, `choices` counts the ks tried, and `naive total` and `pattern total` say what each approach costs on this row.

## How it works

A stretch only reads shorter stretches, so fill the table by length: every stretch of 1, then every stretch of 2, and so on to the whole row. That is the diagonals of the table, one after another, the same order as [the longest palindromic subsequence](/dp-palindrome/).

In [Take the small tile first](#example:take-small-first), tiles 5 6 1 4:

- one tile scores with its neighbours: B[3][3] = 6 × 1 × 4 = 24;
- B[2][3] = 144: tile 2 last, scored 5 × 6 × 4 = 120, after tile 3 alone (24);
- B[2][4] = 164: tile 4 last, 5 × 4 × 1 = 20, after B[2][3];
- B[1][4] = 169: tile 1 last, 1 × 5 × 1 = 5, after B[2][4].

The trace reads the ks back: the order is 3, 2, 4, 1. Taking the 1 first leaves the 6 between the 5 and the 4, worth 120. The greedy rule takes the 5 or the 6 first instead (both score 30), and the big 6 never gets two big neighbours.

```check
Q: Two tiles, 2 and then 3, between the posts. What is the best total?
- 8
* 9
- 12
- 6
= Take the 2 first: 1 × 2 × 3 = 6, then the 3 alone: 1 × 3 × 1 = 3, so 9. The other order makes 6 + 2 = 8. In the table, the 3 goes last, scored with the two posts.
```

## Plain recursion

The rule is already a recursive function. best(a, b) tries every k and asks for both sides of it, and the sides ask for their sides. Nothing is stored, so a short stretch is solved again every time a longer one asks for it.

A stretch of length L makes one call and asks for two shorter stretches for each of its L choices, which works out to 3ᴸ⁻¹ calls. [Plain recursion solves stretches again](#example:recursion-repeats) has 5 tiles: 81 calls and 121 choices, against 15 cells and 35 choices for the table. One tile in the middle, best(3, 3), is called 14 times. At 6 tiles it is 243 calls against 21 cells.

## Merging piles

[Merging the two smallest first is not cheapest](#example:cheapest-merge) has piles 8 6 7 5 3. Always merging the neighbouring pair with the smallest total costs 71. The table splits the row as (8 6) and (7 (5 3)): 14 + 8 + 15 + 29 = 66.

[Equal piles: merge in halves](#example:equal-piles) is the cleanest case. Four piles of 4: piling them one at a time onto a growing pile costs 8 + 12 + 16 = 36, and merging in pairs costs 8 + 8 + 16 = 32. The last merge always costs 16, so what matters is keeping the earlier ones small.

```check
Q: Piles 1, 2 and 3. Merging two neighbours costs their total. What is the least cost to merge all three?
* 9
- 11
- 6
- 12
= Merge 1 and 2 (cost 3), then 3 with 3 (cost 6): 9. Merging 2 and 3 first costs 5 + 6 = 11. The last merge always costs 6, the whole row.
```

## When to use it

Use it when the answer for a stretch depends only on the stretch and what is just outside it, and the stretch splits into two independent parts at one point: a last item, a last merge, a last cut, a last multiplication. n(n + 1)/2 stretches, each trying up to n ks, is Θ(n³) time and Θ(n²) space. Fine for a few hundred items, slow for a hundred thousand.

Avoid it when the order of the row does not matter. If any two piles may merge, not just neighbours, there are no stretches to solve: merge the two smallest each time, as Huffman coding does.

## Spot it

Reach for this pattern when the problem says:

- **in what order** should you remove, merge, cut or bracket;
- **neighbouring**, **adjacent**, **between**: a step's cost depends on what is next to it right now;
- **a row** whose pieces stay in order, so what is left is always a stretch (or a few stretches).

Three problems of our own:

- A sawmill charges for each cut by the length of the board it saws through, and a plank is marked at several points. In which order should the cuts go to pay the least? (Solve every stretch between two marks by its first cut, which splits it like a last merge.)
- Villages along a river join into towns two neighbours at a time, and joining costs their total population. Least cost to one town? (This page's merge.)
- Cards lie in a row and two players take turns taking a card from either end. How many more points can the first player get if both play well? (What is left is always a stretch.)

Look-alikes that call for something else: "combine the meetings that overlap" has intervals of time, not stretches of a row: sort by start and sweep. "The stretch of days with the largest total" is one stretch, nothing removed or merged: [Kadane's algorithm](/kadane/). "Split a row of books among k shelves so the longest shelf is shortest" is a search on the answer: guess the longest shelf and check it in one pass.

## Common mistakes

- Choosing the first item instead of the last. The two sides are not independent until something stands between them to the end.
- Filling row by row from the top. B[1][4] needs B[2][4], which that fill has not reached. Fill by length (or row by row from the bottom).
- Forgetting the posts. A tile at the end of the row scores with a 1.
- In the merge, adding the halves' sizes twice, or forgetting the last merge's cost. The last merge costs the whole stretch, v[a] + … + v[b]; prefix sums give it in O(1).
- Letting k reach b in the merge. A split at b leaves an empty right half.
- Trusting greedy: the biggest score now, or the cheapest merge now, both lose on this page's examples.

## Try this

- [Take the small tile first](#example:take-small-first): before you play it, guess which tile goes last.
- [One tile: nothing to choose](#example:one-tile): then load `7 7`. Why is it 7 × 7 + 7, whichever goes first?
- [Plain recursion solves stretches again](#example:recursion-repeats): which cells end with the biggest ×k, and why the short ones?
- Press Compare, pick this page with other options, and set one side to plain recursion. Load six tiles and watch `calls`.
- [Merging the two smallest first is not cheapest](#example:cheapest-merge): move the 3 to the front. Does the best split move?
