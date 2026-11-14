WALL = "#"
INF = float("inf")


def count_paths(grid):
    """Paths from the top left to the bottom right, moving right or down. '#' is a wall."""
    rows, cols = len(grid), len(grid[0])
    P = [[0] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == WALL:
                continue  # no path goes through a wall
            if r == 0 and c == 0:
                P[r][c] = 1
            else:  # from above, plus from the left
                P[r][c] = (P[r - 1][c] if r > 0 else 0) + (P[r][c - 1] if c > 0 else 0)
    return P[-1][-1]


def cheapest_path(grid):
    """(cost, moves) of the cheapest path, paying each cell's digit; None if walls block it."""
    rows, cols = len(grid), len(grid[0])
    M = [[INF] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == WALL:
                continue  # no way in
            cost = int(grid[r][c])
            if r == 0 and c == 0:
                M[r][c] = cost
            else:  # this cell's cost, plus the cheaper way in
                up = M[r - 1][c] if r > 0 else INF
                left = M[r][c - 1] if c > 0 else INF
                M[r][c] = cost + min(up, left)
    if M[-1][-1] == INF:
        return None
    r, c, back = rows - 1, cols - 1, []
    while r > 0 or c > 0:  # walk back to the cheaper neighbour; a tie goes up
        if r > 0 and (c == 0 or M[r - 1][c] <= M[r][c - 1]):
            r -= 1
            back.append("D")
        else:
            c -= 1
            back.append("R")
    return M[-1][-1], back[::-1]
