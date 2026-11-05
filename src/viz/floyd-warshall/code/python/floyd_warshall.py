def floyd_warshall(n, edges):
    """Shortest paths between every pair, as in CLRS, updating one matrix in place.

    edges lists (u, v, w) for each edge u -> v. Returns d (None for no path) and pi, where
    pi[i][j] is the vertex just before j on a shortest path from i (None for none).
    A negative d[v][v] means that v lies on a negative cycle.
    """
    d = [[0 if i == j else None for j in range(n)] for i in range(n)]
    pi = [[None] * n for _ in range(n)]
    for u, v, w in edges:
        d[u][v] = w
        pi[u][v] = u
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if d[i][k] is None or d[k][j] is None:
                    continue
                if d[i][j] is None or d[i][k] + d[k][j] < d[i][j]:
                    d[i][j] = d[i][k] + d[k][j]
                    pi[i][j] = pi[k][j]
    return d, pi


def path(pi, i, j):
    """The vertices of a shortest path from i to j, read backwards from j."""
    p = [j]
    while p[0] != i:
        p.insert(0, pi[i][p[0]])
    return p
