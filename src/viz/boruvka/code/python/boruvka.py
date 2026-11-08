def boruvka(n, edges):
    """Boruvka's minimum spanning tree (a forest if the graph is not connected).

    edges lists (u, v, w) for vertices 0..n-1. Ties go to the edge earlier in
    the list. Returns the total weight and the indexes of the tree edges, in
    the order they joined.
    """
    tree = []
    while True:
        comp = components(n, [edges[i] for i in tree])
        cheapest = {}  # component -> index of its cheapest edge out
        for i, (u, v, w) in enumerate(edges):
            if comp[u] == comp[v]:
                continue
            for c in (comp[u], comp[v]):
                if c not in cheapest or w < edges[cheapest[c]][2]:
                    cheapest[c] = i
        if not cheapest:
            break
        for c in sorted(cheapest):
            if cheapest[c] not in tree:  # both ends may pick the same edge
                tree.append(cheapest[c])
    return sum(edges[i][2] for i in tree), tree


def components(n, edges):
    """Label each vertex with the smallest vertex of its piece."""
    adj = [[] for _ in range(n)]
    for u, v, _ in edges:
        adj[u].append(v)
        adj[v].append(u)
    comp = [-1] * n
    for s in range(n):
        if comp[s] < 0:
            comp[s], stack = s, [s]
            while stack:
                for w in adj[stack.pop()]:
                    if comp[w] < 0:
                        comp[w] = s
                        stack.append(w)
    return comp
