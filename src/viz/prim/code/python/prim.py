import heapq


def prim(adj, r):
    """Prim's minimum spanning tree (a forest if the graph is not connected), from r.

    adj[u] lists (v, w) pairs for an undirected graph. Returns the total weight and pi,
    the parent of each vertex in the tree (None for a root).
    """
    n = len(adj)
    key = [None] * n
    pi = [None] * n
    in_tree = [False] * n
    total = 0
    for root in [r] + list(range(n)):  # a new tree for each piece
        if in_tree[root]:
            continue
        q = [(0, root)]  # a binary heap of (key, vertex)
        while q:
            k, u = heapq.heappop(q)
            if in_tree[u]:
                continue  # a stale entry
            in_tree[u] = True
            if pi[u] is not None:
                total += k
            for v, w in adj[u]:
                if not in_tree[v] and (key[v] is None or w < key[v]):
                    key[v] = w
                    pi[v] = u
                    heapq.heappush(q, (w, v))
    return total, pi
