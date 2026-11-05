def kruskal(n, edges):
    """Kruskal's minimum spanning tree (a forest if the graph is not connected).

    edges lists (u, v, w) for vertices 0..n-1. Returns the total weight and the tree edges,
    in the order they were added.
    """
    parent = list(range(n))
    rank = [0] * n

    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])  # path compression
        return parent[x]

    tree, total = [], 0
    for u, v, w in sorted(edges, key=lambda e: (e[2], e[0], e[1])):
        a, b = find(u), find(v)
        if a == b:
            continue  # u-v would close a cycle
        tree.append((u, v))
        total += w
        if rank[a] > rank[b]:  # union by rank
            parent[b] = a
        else:
            parent[a] = b
            if rank[a] == rank[b]:
                rank[b] += 1
    return total, tree
