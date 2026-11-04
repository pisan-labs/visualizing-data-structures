# N-Queens

Put N queens on an N × N chessboard so that no two attack each other: no two share a row, a column or a diagonal. For 8 queens there are 4,426,165,368 ways to put them on 64 squares, and 92 of them work. Checking every arrangement is hopeless. Backtracking finds the 92 with 2056 placements.

## One row at a time

Two queens in the same row attack each other, so every row gets exactly one queen. That turns the puzzle into a sequence of choices: a column for row 1, then a column for row 2, and so on. Backtracking makes the choices in order, top to bottom, and tries the columns of each row left to right. It puts a queen on the first square no queen above can reach, and moves on to the next row. [Show me](#play:four-first)

The × marks are the squares the queens above attack. A queen reaches along its column and both diagonals, and queens at (r₁, c₁) and (r₂, c₂) share a diagonal when |c₁ − c₂| = |r₁ − r₂|. At the **Every detail** level, each square the search tries and rejects gets its own step, with a red line from the queen that attacks it.

## Dead ends and backtracking

Sometimes every square left in a row is attacked. Nothing placed below can fix that, so the path is a dead end. The search backtracks: it takes back the queen in the row above and tries that row's next column. If that row runs out of columns too, it backs up again. [A dead end, one move at a time](#example:dead-end)

This is the whole trick. The search never builds a full board that fails. It gives up on a partial board the moment one row has nowhere to go, and everything below that row is never looked at. That cut is what keeps 8 queens at 2056 placements instead of 8! = 40,320 permutations.

```check
Q: On a 4 × 4 board, the queens in rows 1 and 2 sit in columns 1 and 3. How many squares of row 3 are safe?
- 2
- 1
* 0
= Column 1 and column 3 are taken, and columns 2 and 4 are on a diagonal of the queen in column 3. Row 3 is a dead end, so the search backtracks.
```

## The recursion behind it

The code is a recursive function, `place(row)`. Each queen on the board is a call waiting on the stack for the rows below it, so the stack is never more than N deep. A dead end is a call that runs out of columns and returns false; its caller takes back its own queen and tries the next column. When the search backtracks, a call returns.

## The first solution, or all of them

The **Goal** option either stops at the first solution or keeps going: after each solution the search takes back the last queen and carries on, until row 1 runs out of columns. The counts are not what you might guess.

| N | Solutions | Placements to the first | Placements for all |
|---|---|---|---|
| 4 | 2 | 8 | 16 |
| 5 | 10 | 5 | 53 |
| 6 | 4 | 31 | 152 |
| 7 | 40 | 9 | 551 |
| 8 | 92 | 113 | 2056 |

Six queens have fewer solutions than five, and 5 queens find their first solution without a single backtrack. The 92 for eight queens count rotations and reflections as different; there are only 12 essentially different ones. [Every solution for four queens](#example:four-all)

From 7 queens on, Solve with "count all" stops at each solution instead of every move: there are thousands of moves. Next move still steps through them one at a time.

```check
Q: How many solutions does the 6-queens puzzle have?
* 4
- 6
- 10
- 40
= Only 4, fewer than the 10 for five queens. Run it with the goal set to count all the solutions.
```

## When to use it, when to avoid it

Backtracking fits problems where you build an answer one choice at a time and can tell early that a partial answer is hopeless: puzzles such as Sudoku, scheduling with constraints, generating subsets and permutations. The earlier the check, the more it prunes. It is still exponential in the worst case, so it does not rescue a problem with no good early check.

For N-Queens itself, if you only need one solution for a large N, there are explicit patterns that place the queens with no search at all. The search is for counting them, or for the many problems with no such pattern.

## Common mistakes

- Checking columns but forgetting a diagonal. Both diagonals count.
- Forgetting to take the queen back after the recursive call returns. The board fills up with queens from paths that were abandoned.
- Restarting a row at column 1 after a backtrack. The row goes on from the column after its old queen; only a fresh row starts at column 1.
- Stopping at the first solution when the question asked how many there are.

## Try this

- [Four queens](#example:four-first). Watch the queen in row 1 give up on column 1.
- [A dead end, one move at a time](#example:dead-end), then press **Next move** a few more times.
- [Five queens without a single backtrack](#example:five-straight) and [eight queens](#example:eight-first), 113 placements later.
- [All solutions for four](#example:four-all), [six](#example:six-all) and [eight](#example:eight-all) queens.
- Set the detail to **Every detail** and press **Next move**. Every square the search tries is its own step.
