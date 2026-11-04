from collections import deque

WHITE, GRAY, BLACK = 0, 1, 2


def bfs(adj, s):
    """Breadth-first search from s, as in CLRS.

    adj[u] lists u's neighbours in increasing order. Returns the order vertices are
    dequeued, d (edges from s, None if unreachable) and pi (parent, None for none).
    """
    n = len(adj)
    color = [WHITE] * n
    d = [None] * n
    pi = [None] * n
    color[s] = GRAY
    d[s] = 0
    q = deque([s])
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            if color[v] == WHITE:
                color[v] = GRAY
                d[v] = d[u] + 1
                pi[v] = u
                q.append(v)
        color[u] = BLACK
    return order, d, pi
