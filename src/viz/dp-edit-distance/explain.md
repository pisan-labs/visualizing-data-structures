# Edit distance

How many one-letter edits does it take to turn kitten into sitting? Three: change the k to an s, change the e to an i, and add a g at the end. Nothing shorter works. That count is the edit distance, also called the Levenshtein distance after Vladimir Levenshtein, who described it in 1965. Spell checkers use it to find the words closest to a typo, and comparing DNA uses the same table with different costs.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the table | D[i][j] for every pair of prefixes | O(mn) time and space |
| Trace back | Walks back to D[0][0] and reads off the edits | O(m + n) |

Let D[i][j] be the cheapest way to turn A[1..i], the first i letters of the source, into B[1..j], the first j letters of the target. Think about the last edit. There are three possibilities.

- A[i] became B[j]. That is free if they are the same letter and a substitution if not: D[i − 1][j − 1] plus 0 or the substitution cost.
- A[i] was deleted: D[i − 1][j] plus the cost of a delete.
- B[j] was inserted: D[i][j − 1] plus the cost of an insert.

D[i][j] is the cheapest of the three. The edges are different from the LCS table: turning A[1..i] into nothing takes i deletes, so D[i][0] = i, and building B[1..j] from nothing takes j inserts, so D[0][j] = j.

## Filling the table

Fill row by row, left to right. Each cell reads three neighbors (the diagonal, the cell above and the cell to the left), and the blue arrow shows the one that wins. [Show me](#play:kitten)

```check
Q: Every edit costs 1. D[1][1] = 1, D[1][2] = 1 and D[2][1] = 2, and A[2] = B[2]. What is D[2][2]?
* 1
- 2
- 3
- 0
= A match is free, so the diagonal gives D[1][1] + 0 = 1. The cell above gives 1 + 1 = 2 and the cell to the left 2 + 1 = 3.
```

## The alignment

The bottom-right cell gives the cost, not the edits. To find them, walk back from D[m][n] the way each value was made: a diagonal step is a match or a substitution, a step up deletes A[i], and a step left inserts B[j]. When two neighbors explain the value equally well, this page tries the diagonal first, then up, then left. The walk goes all the way to D[0][0], because letters left over at an edge still cost something. Each step is one column of the alignment under the table, so the alignment fills from the right.

Comparing two words letter by letter can be misleading. flaw and lawn differ in every position, which looks like four substitutions. Delete the f and insert an n instead, and law lines up with law: a cost of 2. [Show me](#play:shift)

## Changing the costs

The options set what each edit costs. With every edit costing 1, intention becomes execution in 5. Make a substitution cost 2 and the answer is 8. [Show me](#play:sub-costs-two) A substitution that costs as much as a delete plus an insert never saves anything. Swap each one for a delete and an insert and the cost stays the same, so some cheapest alignment uses only matches, inserts and deletes. (The walk here still takes the diagonal when it ties, so it shows three substitutions.) Then every letter that is not matched costs 1, and the most letters you can match is a longest common subsequence: the distance is m + n minus twice the LCS length, 9 + 9 − 2·5 = 8.

Uneven costs change the alignment too. With deletes at 3, abc becomes cab with three substitutions instead of an insert and a delete. [Deletes cost 3](#example:costly-delete)

```check
Q: Every edit costs 1. What is the edit distance from flaw to lawn?
- 1
* 2
- 3
- 4
= Delete the f and insert an n at the end. Four substitutions would cost 4.
```

## What it costs

The table has (m + 1)(n + 1) cells, each the minimum of three sums, so filling it is O(mn) whatever the words are. The walk back covers at least one letter per step, so it takes at most m + n steps. If you only need the distance, keep two rows instead of the whole table. If you only need to know whether the distance is at most k, the cells far from the diagonal cannot matter, and a band of about 2k + 1 diagonals is enough.

## When to use it

Use it to compare short strings: a typo against a dictionary, a search term against names, two versions of a line. The costs let you say what counts as a big change. For long strings the O(mn) table gets expensive fast: two strings of 100,000 characters need 10¹⁰ cells.

## Common mistakes

- Starting row 0 and column 0 at 0, as in the LCS table. They count inserts and deletes: D[0][j] = j and D[i][0] = i.
- Charging for a match.
- Mixing up the directions. Up deletes a letter of the source; left inserts a letter of the target.
- Stopping the walk at the first edge instead of at D[0][0].
- Assuming the answer is unique. Several alignments can cost the same, and the walk shows one of them.

## Try this

- [kitten to sitting](#example:kitten). Predict D[6][7] before the table gets there.
- [flaw to lawn](#example:shift). Count the substitutions a letter-by-letter comparison would make.
- [intention to execution](#example:intention), then [the same with substitutions at 2](#example:sub-costs-two).
- [A word and itself](#example:same-word) and [one letter to banana](#example:inserts-only): the two extremes.
- Set a delete to cost 5 and run kitten to sitting again. Does the alignment change?
