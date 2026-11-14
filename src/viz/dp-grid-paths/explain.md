# Paths on a grid

A robot sits in the top left cell of a grid. It moves only right or down, some cells are walls, and it wants the bottom right cell. How many ways are there? Listing them works on a small grid and stops working fast: an open 10 × 10 grid has 48,620 paths. There is a better way. A path into a cell comes from the cell above it or from the cell to its left. That is the whole trick.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| solve, bottom-up | fill the table row by row | Θ(RC) |
| solve, top-down with a memo | the recursion, remembering each answer | O(RC) |
| solve, plain recursion | the same rule, nothing stored | C(R + C, R) − 1 calls on an open grid |
| trace the path | walk back from the target | Θ(R + C) |

Call P[r][c] the number of paths from the start (0, 0) into cell (r, c). Then

P[r][c] = P[r − 1][c] + P[r][c − 1]

with P[0][0] = 1, and 0 for a wall or for a cell off the grid. The answer is the target's cell. [Show me](#play:count-with-walls)

The **Problem** option asks the other classic question: every cell has a cost (its digit), and you want the cheapest path. Same shape, with min instead of plus:

M[r][c] = cost[r][c] + min(M[r − 1][c], M[r][c − 1])

with M[0][0] = the start's cost, and ∞ for a wall or off the grid.

The **Approach** option switches to plain recursion on the same rule. `calls` counts calls of the recursive function, `cells` counts table cells filled, and `naive total` and `pattern total` say what each approach costs on this grid.

## How it works

Fill the table row by row, left to right. When a cell comes up, the cell above it and the cell to its left are already done, so each cell is one addition (or one min and one addition).

In [Walls cut the paths](#example:count-with-walls) the grid is 4 × 5 with walls at (1, 1) and (2, 4). The top row is all 1s: the only way in is from the left. (1, 1) is a wall, so it holds 0, and (1, 2) gets 1 + 0 = 1. The bottom row ends 1 2 4 8 8: the target gets 8 from the left and 0 from the wall above it. Without the walls it would be 35.

Take the walls away and you get [An open grid: binomial counts](#example:open-grid): Pascal's triangle on its side. Every path to the target is 7 moves, 3 of them down, so there are C(7, 3) = 35 of them.

```check
Q: The cell above (r, c) is a wall and the cell to its left has P = 5. (r, c) is open. What is P[r][c]?
- 0
* 5
- 6
- 10
= A wall lets no path through, so it adds 0. Every path into (r, c) comes from the left: 5.
```

## Plain recursion

The rule is already a recursive function: paths(r, c) asks for paths(r − 1, c) and paths(r, c − 1) and adds them. It is short, it is correct, and it is slow. Nothing is stored, so a cell is worked out from scratch every time a later cell asks for it.

How often? Once for every path from that cell to the target. In [Plain recursion asks again and again](#example:recursion-repeats) the start is called 35 times, once per path, and the whole run makes 125 calls for 20 cells. Watch the ×k counts in the corners grow toward the top left. On an open R × C grid the total is C(R + C, R) − 1: 125 = C(9, 4) − 1 here, 461 on 5 × 6.

Is the table always cheaper? Nope. [One row: one path, no repeats](#example:one-row) has one path, so plain recursion calls each cell once: 6 calls for 6 cells. Repeats need two ways into a cell. And in [No way through](#example:no-way-through) the target has walls above it and to its left, so plain recursion makes 1 call and stops, while the table fills all 16 cells anyway.

## Top-down with a memo

Keep the recursion and add a memo: before working a cell out, look it up; after, store it. Set **Table** to top-down. [A memo works each cell out once](#example:memo-once) makes 32 calls and fills 20 cells, where plain recursion made 125 calls. Each cell is computed once. Every later call on it is a memo hit and returns at once.

The cells fill in the order the calls finish, not row by row, and only the cells the target needs get filled. The price is the call stack: R + C − 1 calls deep from the target to the start. On a big grid that can overflow, and bottom-up has no stack at all.

## The cheapest path

With costs, the table gives the cost, and a walk back gives the path. Start at the target and step to whichever of the cell above and the cell to the left has the smaller M; on a tie this page goes up. Read the steps backwards and you have the path.

[The cheapest path, traced back](#example:cheapest-path) costs 10 and goes D D R D R R R (D is down, R is right). [The cheaper next step is a trap](#example:cheap-step-trap) is why you need the table. Stepping to the cheaper neighbour each time runs right along the 1s of the top row and then has to cross a 9: 14 in all. The table pays the 3 first, goes down to the bottom row and gets 8.

```check
Q: M[r − 1][c] = 7, M[r][c − 1] = 9, and cell (r, c) costs 2. What is M[r][c]?
* 9
- 11
- 7
- 18
= The cheaper way in is from above, 7, and entering (r, c) pays its cost: 7 + 2 = 9.
```

## Spot it

Reach for this pattern when the problem says:

- **moves only right or down** (or any moves that can never come back to a cell): the cells can be filled in one order;
- **how many ways**, **the cheapest**, **the most**: a count, a min or a max over paths, not a list of them;
- **a grid with blocked cells**: walls are just 0 (or ∞).

Three problems of our own:

- A delivery robot crosses a warehouse floor moving only east or south, and shelves block some squares. How many routes reach the loading dock? (Count, walls as 0.)
- Each square of a field charges a toll. Walking right or down, what is the cheapest crossing? (Min-cost.)
- Coins lie on a board. A collector steps right or down and picks up what it lands on. What is the most it can collect? (The same table with max.)

Look-alikes that call for something else: moves in all four directions can come back to a cell, so there is no order to fill the table in: that is breadth-first search ([BFS on a grid](/grid-bfs/)) for the fewest moves, or [Dijkstra](/dijkstra/) for the cheapest. "Print every route" is backtracking: there are exponentially many, and printing them takes that long however clever you are. The table of [the longest common subsequence](/dp-lcs/) has the same shape as this one: each cell from the one above, the one to the left and the diagonal.

## When to use it

Use it whenever each cell depends only on cells you can fill before it. Right-and-down moves are the simplest case; any order with no way back works.

Avoid plain recursion beyond a toy grid. Mind the numbers, too: an open 20 × 20 grid has 35,345,263,800 paths, far past a 32-bit int (2,147,483,647). The count alone needs only one row of the table, but the walk back needs all of it.

## Common mistakes

- Starting with P[0][0] = 0. Then every cell is 0. The start has one path, the one that has not moved yet.
- Treating a wall as a cell with no value instead of 0 (count) or ∞ (cheapest).
- Forgetting the edges: the top row has nothing above it, the left column nothing to its left.
- Filling a cell before the cell above it or the one to its left. Row by row works, and so does column by column; starting from the target does not.
- Stepping to the cheaper neighbour as you go. [The cheaper next step is a trap](#example:cheap-step-trap) costs 14 that way, 8 with the table.
- Counting with a 32-bit int on a big grid.

## Try this

- [Walls cut the paths](#example:count-with-walls): before you play it, fill in the bottom row yourself.
- Load `...../...../...../.....` with Approach set to plain recursion. Which cell ends with the biggest ×k, and why is it 35?
- [No way through](#example:no-way-through): set Approach to plain recursion. Why does it make only 1 call?
- Press Compare, pick this page with other options, and set one side to plain recursion. Fill both with the open grid preset at size 5 and watch `calls`.
- [The cheaper next step is a trap](#example:cheap-step-trap): change the 3 to a 9. Where does the path go now?
