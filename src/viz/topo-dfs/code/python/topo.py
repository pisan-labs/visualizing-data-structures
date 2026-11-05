from collections import deque

WHITE, GRAY, BLACK = 0, 1, 2


class CycleError(Exception):
    """Raised at the first back edge u -> v: the graph has a cycle."""

    def __init__(self, u, v):
        super().__init__(f"cycle through {u} -> {v}")
        self.u, self.v = u, v


def topological_sort(adj):
    """Topological sort by DFS, as in CLRS.

    adj[u] lists the vertices u points to, in increasing order. Each vertex goes
    on the front of the list as it finishes, so the list ends up in decreasing
    finish time. Raises CycleError at the first back edge.
    """
    n = len(adj)
    color = [WHITE] * n
    order = deque()

    def visit(u):
        color[u] = GRAY
        for v in adj[u]:
            if color[v] == WHITE:
                visit(v)
            elif color[v] == GRAY:  # v is an ancestor of u: a back edge
                raise CycleError(u, v)
        color[u] = BLACK
        order.appendleft(u)

    for u in range(n):
        if color[u] == WHITE:
            visit(u)
    return list(order)
