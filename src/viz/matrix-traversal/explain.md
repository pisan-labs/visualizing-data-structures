# Matrix traversal (spiral, rotate)

Two grid tricks come up again and again: walk a matrix in spiral order, and turn a square matrix a quarter turn. Both are easy with a second grid to scribble on. Both are just as fast without one, if you keep track of the right indices. The trick is which indices.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| spiral order, four bounds | walk a side, move its bound in, repeat | Θ(mn) time, O(1) extra space |
| spiral order, seen marks | walk with a direction, turn right when blocked | Θ(mn) time, mn extra cells |
| rotate in place, rings | four-way swaps, one ring at a time | Θ(n²), each cell moved once, one spare cell |
| rotate in place, transpose and reverse | swap across the diagonal, then reverse each row | Θ(n²), most cells moved twice |
| rotate into a copy | B[j][n − 1 − i] = M[i][j] | Θ(n²) time, n² extra cells |

None of the in-place versions is faster than its naive twin in Big-O terms. They save space. [Show me](#play:spiral-bounds)

The **Approach** option switches to the versions with an extra grid, and **Rotate in place by** picks rings or transpose and reverse. The variables count the work: `reads` takes a value out of a cell, `writes` puts one in (a seen mark is a write), `checks` tests a bound or whether a cell is free. `extra cells` is the scribbling space.

## Spiral order with four bounds

Keep four bounds around the part not visited yet: top, bottom, left and right. Then go round:

1. walk the top row from left to right, and move top down;
2. walk the right column down, and move right in;
3. if a row is left (top ≤ bottom), walk the bottom row back, and move bottom up;
4. if a column is left (left ≤ right), walk the left column up, and move left in.

Repeat while top ≤ bottom and left ≤ right. [Spiral order of a 4 × 4](#example:spiral-bounds) reads 1 2 3 4 8 12 16 15 14 13 9 5 on the outside ring, then 6 7 11 10. 16 reads and 7 bound checks. The dashed box in the drawing is the four bounds.

The two checks in steps 3 and 4 are the part everybody forgets. In [A 3 × 5: one row left in the middle](#example:one-row-left), the outer ring leaves only 7 8 9 in row 1. The top row walk takes them, top moves to 2, and now top is past bottom. Without the check, step 3 would walk row 1 again, backwards, and list 8 and 7 twice.

```check
Q: In spiral order, which value of 1 2 3 / 4 5 6 / 7 8 9 comes 6th?
* 8
- 9
- 7
- 5
= The outer ring goes 1 2 3, then down 6 9, then back along the bottom: 8 is 6th. The full order is 1 2 3 6 9 8 7 4 5.
```

## Spiral order by walking

The obvious way: start at the top left facing right, and keep a second grid of seen marks. Step forward; when the next cell is off the matrix or seen, turn right. [Walking with seen marks](#example:spiral-walk) gives the same order with 16 reads, 16 writes for the marks and 15 checks: 47, against 23 for the bounds. Both are Θ(mn). The real difference is the 16 extra cells. I think the walk is still a fine answer when space does not matter: there are no bounds to get off by one.

## A quarter turn

Turning clockwise sends the value in row i, column j to row j, column n − 1 − i. So the first row becomes the last column, and the first column, read upward, becomes the first row.

**Into a copy.** Write each value straight to where it goes in a new matrix B. [A quarter turn into a copy](#example:rotate-copy): 16 reads and 16 writes, and 16 extra cells. Do the same writes in place and you overwrite values before you read them.

**Rings.** The four cells M[first][first + k], M[first + k][last], M[last][last − k] and M[last − k][first] chase each other around a ring. Hold one in a spare cell and move the other three a quarter turn, then put the spare in. [A quarter turn, ring by ring](#example:rotate-rings) does 3 four-way swaps on the outer ring and 1 on the inner: 16 reads and 16 writes, exactly as many as the copy, with one spare cell instead of 16. [3 × 3: the middle stays put](#example:middle-stays): an odd size has a middle cell that never moves.

**Transpose, then reverse each row.** Transposing swaps M[i][j] and M[j][i], which turns rows into columns. That is a mirror image, not a rotation. Reversing each row finishes the job. [Transpose, then reverse each row](#example:rotate-transpose) takes 6 + 8 = 14 swaps: 28 reads and 28 writes, against 16 and 16 for the rings. Most values move twice. People still like it, since two simple loops are hard to get wrong. [Show me](#play:rotate-transpose)

```check
Q: Rotating a 4 × 4 matrix a quarter turn clockwise, where does the value in row 0, column 1 end up?
* Row 1, column 3
- Row 3, column 2
- Row 1, column 0
- Row 2, column 3
= Row i, column j goes to row j, column n − 1 − i: row 1, column 4 − 1 − 0 = 3. In the 1 to 16 example, 2 ends up in M[1][3].
```

## Variants

- **Counterclockwise:** transpose, then reverse each column. Or reverse each row first, then transpose.
- **Half a turn:** reverse each row, then reverse the order of the rows.
- **Not square:** an m × n matrix turns into an n × m one, which no longer fits the same grid of rows; write it into a new matrix. (Turning it inside one flat block of memory can be done, by following cycles of positions, but that is a much harder algorithm.)
- **Spiral the other way, or from the middle out:** the same bounds, walked in a different order of sides.

## Spot it

Reach for these when the problem says:

- **around the edge**, clockwise, "ring by ring", "spiraling in";
- **rotate**, a quarter turn, 90 degrees, "turn the board";
- **rows become columns**, transpose, mirror across the diagonal;
- **in place**, "without a second grid".

Three problems of our own:

- The seats of a cinema are a grid. Hand out tickets starting at the front left corner, going clockwise around the edge, then the next ring in.
- A square game board is stored as a grid. When the players change seats, turn it a quarter turn clockwise, in the same grid.
- A square game board is shown to the player on the other side of the table. Show it turned half a turn. (Reverse each row, then the order of the rows.)

Look-alikes: "the fewest steps through a maze on a grid" is a search, [breadth-first search on a grid](/grid-bfs/), not a traversal. "How many paths from one corner to the other, moving right or down" is dynamic programming. "Reverse each row" on its own is [two pointers](/two-pointers/).

## Common mistakes

- Leaving out the checks before the bottom row and the left column. A single middle row or column gets walked twice.
- Starting the right column at the old top. Once top moves down, the corner cell is already visited.
- Writing B[j][n − 1 − i] = M[i][j] into M itself. Half the values are overwritten before they are read.
- Running k all the way to last − first inclusive in the ring loop. The corner moves twice and ends in the wrong place.
- Transposing and stopping there, or reversing the columns instead of the rows: a mirror image, or a turn the wrong way.

## Try this

- [Spiral order of a 4 × 4](#example:spiral-bounds): before each bound moves, say which one and to what.
- Load `3x5`, then `5x3`, and run Spiral order. Which one leaves a single column in the middle?
- Press Compare, pick this page with other options, and set one side to the extra grid. Watch `extra cells`.
- [A quarter turn, ring by ring](#example:rotate-rings), then switch **Rotate in place by** to transpose and compare `reads`.
- Load `5x5` and rotate it four times. Is it back where it started?
