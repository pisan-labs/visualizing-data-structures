from collections import Counter

INF = float("inf")


def prim(nodes, weight):
    """Prim with an array over the list nodes. weight(u, v) is a number, or None for no edge.
    Ties go to the earlier node. Returns the tree's edges as (parent, child) pairs."""
    key = {v: INF for v in nodes}
    parent = {v: None for v in nodes}
    key[nodes[0]] = 0
    done, edges = set(), []
    for _ in nodes:
        left = [v for v in nodes if v not in done and key[v] < INF]
        if not left:
            break  # the rest cannot be reached
        u = min(left, key=lambda v: key[v])
        done.add(u)
        if parent[u] is not None:
            edges.append((parent[u], u))
        for v in nodes:
            x = weight(u, v)
            if v not in done and x is not None and x < key[v]:
                key[v], parent[v] = x, u
    return edges


def approx_steiner(w, terminals):
    """The metric-closure 2-approximation. w[u][v] > 0 is the weight of edge u-v, 0 for none;
    terminals is sorted. Returns the tree's edges (u, v), u < v, sorted."""
    n = len(w)
    if len(terminals) <= 1:
        return []
    # Shortest distances between all pairs (Floyd-Warshall).
    d = [[0 if i == j else (w[i][j] or INF) for j in range(n)] for i in range(n)]
    for k in range(n):
        for i in range(n):
            for j in range(n):
                d[i][j] = min(d[i][j], d[i][k] + d[k][j])

    def path(s, t):  # traced back from t, through the earliest neighbour on a shortest path
        p = [t]
        while p[-1] != s:
            v = p[-1]
            p.append(next(u for u in range(n) if w[u][v] and d[s][u] + w[u][v] == d[s][v]))
        return p[::-1]

    closure = prim(terminals, lambda a, b: d[a][b])
    h = set()
    for a, b in closure:
        p = path(a, b)
        h |= {(min(x, y), max(x, y)) for x, y in zip(p, p[1:])}
    nodes = sorted(set(terminals) | {v for e in h for v in e})
    tree = prim(nodes, lambda u, v: w[u][v] if (min(u, v), max(u, v)) in h else None)
    tree = {(min(u, v), max(u, v)) for u, v in tree}
    while True:  # cut off leaves that are not terminals
        degree = Counter(v for e in tree for v in e)
        leaf = next((v for v in sorted(degree) if degree[v] == 1 and v not in terminals), None)
        if leaf is None:
            return sorted(tree)
        tree = {e for e in tree if leaf not in e}


def exact_steiner_weight(w, terminals):
    """Brute force: the lightest minimum spanning tree of the terminals plus any set S of the
    other vertices, over all 2^(n - t) sets."""
    if len(terminals) <= 1:
        return 0
    others = [v for v in range(len(w)) if v not in terminals]
    best = INF
    for mask in range(1 << len(others)):
        nodes = sorted(terminals + [v for i, v in enumerate(others) if mask >> i & 1])
        edges = prim(nodes, lambda u, v: w[u][v] or None)
        if len(edges) == len(nodes) - 1:
            best = min(best, sum(w[u][v] for u, v in edges))
    return best
