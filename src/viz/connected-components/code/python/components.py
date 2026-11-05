from collections import deque


def connected_components(adj):
    """Number the connected components of an undirected graph, from 1.

    adj[u] lists u's neighbours in increasing order. Vertices are taken in order, and each
    one without a number starts a breadth-first search that labels its whole component.
    Returns the number of components and cc, the component of each vertex.
    """
    n = len(adj)
    cc = [None] * n
    count = 0
    for s in range(n):
        if cc[s] is not None:
            continue
        count += 1
        cc[s] = count
        q = deque([s])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if cc[v] is None:
                    cc[v] = count
                    q.append(v)
    return count, cc
