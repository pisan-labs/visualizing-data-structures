INF = float("inf")


def held_karp(d):
    """The shortest tour of cities 0..n-1 that starts at 0. d[i][j] is the distance.

    C[S][j] is the shortest path from 0 through every city of the set S, ending at j.
    Bit j of S stands for city j + 1. Returns (length, tour). O(2^n n^2) time.
    """
    n = len(d)
    if n == 1:
        return 0, [0]
    m = n - 1
    C = [[INF] * m for _ in range(1 << m)]
    P = [[-1] * m for _ in range(1 << m)]  # the city before j on the best path
    for j in range(m):
        C[1 << j][j] = d[0][j + 1]
    for S in range(1, 1 << m):
        for j in range(m):
            if not S >> j & 1 or S == 1 << j:
                continue
            prev = S ^ (1 << j)
            for k in range(m):
                if prev >> k & 1 and C[prev][k] + d[k + 1][j + 1] < C[S][j]:
                    C[S][j] = C[prev][k] + d[k + 1][j + 1]
                    P[S][j] = k
    full = (1 << m) - 1
    best = min(range(m), key=lambda j: C[full][j] + d[j + 1][0])
    length = C[full][best] + d[best + 1][0]
    tour, S, j = [], full, best
    while j >= 0:
        tour.append(j + 1)
        S, j = S ^ (1 << j), P[S][j]
    return length, [0] + tour[::-1]


def approx_tsp_tour(d):
    """CLRS's APPROX-TSP-TOUR: a minimum spanning tree from city 0 (Prim with an array),
    then the cities in preorder. With the triangle inequality, at most twice the optimum."""
    n = len(d)
    key, parent, in_tree = [INF] * n, [-1] * n, [False] * n
    key[0] = 0
    for _ in range(n):
        u = min((v for v in range(n) if not in_tree[v]), key=lambda v: key[v])
        in_tree[u] = True
        for v in range(n):
            if not in_tree[v] and d[u][v] < key[v]:
                key[v], parent[v] = d[u][v], u
    children = [[] for _ in range(n)]
    for v in range(1, n):
        children[parent[v]].append(v)
    tour = []

    def visit(u):
        tour.append(u)
        for c in children[u]:
            visit(c)

    visit(0)
    return tour


def tour_length(d, tour):
    n = len(tour)
    return sum(d[tour[i]][tour[(i + 1) % n]] for i in range(n)) if n > 1 else 0
