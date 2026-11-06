from collections import deque

# Clockwise from north. The even entries are the four straight moves.
MOVES = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]


def grid_bfs(grid, eight=False):
    """Shortest path from S to T in a grid of strings ('.' open, '#' wall).

    Returns (path, expanded): the cells (r, c) from S to T, or None if T
    cannot be reached, and how many cells left the queue.
    """
    rows, cols = len(grid), len(grid[0])
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    s = next(p for p in cells if grid[p[0]][p[1]] == "S")
    t = next(p for p in cells if grid[p[0]][p[1]] == "T")
    moves = MOVES if eight else MOVES[0::2]
    d = {s: 0}
    parent = {s: None}
    q = deque([s])
    expanded = 0
    while q:
        u = q.popleft()
        expanded += 1
        if u == t:
            path = []
            while u is not None:
                path.append(u)
                u = parent[u]
            return path[::-1], expanded
        r, c = u
        for dr, dc in moves:
            v = (r + dr, c + dc)
            if 0 <= v[0] < rows and 0 <= v[1] < cols and grid[v[0]][v[1]] != "#":
                if v not in d:
                    d[v] = d[u] + 1
                    parent[v] = u
                    q.append(v)
    return None, expanded
