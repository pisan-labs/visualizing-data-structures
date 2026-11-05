from collections import deque


def odd_cycle(parent, u, v):
    """The cycle closed by the edge u-v: up from u to where the tree paths meet, then down
    to v."""
    up = [u]
    while parent[up[-1]] is not None:
        up.append(parent[up[-1]])
    vp = [v]
    while parent[vp[-1]] is not None:
        vp.append(parent[vp[-1]])
    meet = next(x for x in vp if x in up)
    return up[: up.index(meet) + 1] + vp[: vp.index(meet)][::-1]


def bipartite(adj):
    """Two-color an undirected graph with breadth-first search.

    adj[u] lists u's neighbours in increasing order. Returns (True, side), with side 0 or 1
    for every vertex, or (False, cycle), an odd cycle that proves no split exists.
    """
    n = len(adj)
    side = [None] * n
    parent = [None] * n
    for s in range(n):
        if side[s] is not None:
            continue
        side[s] = 0
        q = deque([s])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if side[v] is None:
                    side[v] = 1 - side[u]
                    parent[v] = u
                    q.append(v)
                elif side[v] == side[u]:
                    return False, odd_cycle(parent, u, v)
    return True, side
