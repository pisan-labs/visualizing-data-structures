from collections import deque


def topological_sort(adj):
    """Kahn's algorithm: repeatedly take a vertex with no arcs left coming in.

    adj[u] lists the heads of u's arcs in increasing order. Returns the vertices in a
    topological order. If the graph has a cycle, the vertices on it (and after it) never
    become ready, and the list is shorter than the number of vertices.
    """
    n = len(adj)
    indegree = [0] * n
    for u in range(n):
        for v in adj[u]:
            indegree[v] += 1
    q = deque(v for v in range(n) if indegree[v] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            indegree[v] -= 1
            if indegree[v] == 0:
                q.append(v)
    return order
