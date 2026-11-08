def greedy_color(n, adj):
    """Greedy coloring: vertices 0..n-1 in order, each gets the smallest
    color (from 1) that none of its neighbours has. adj[v] lists v's
    neighbours. Returns the color of each vertex."""
    color = [0] * n
    for v in range(n):
        used = {color[u] for u in adj[v]}
        c = 1
        while c in used:
            c += 1
        color[v] = c
    return color
