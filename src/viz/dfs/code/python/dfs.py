WHITE, GRAY, BLACK = 0, 1, 2


class DFS:
    """Depth-first search as in CLRS, with discovery and finish times.

    adj[u] lists u's neighbours in increasing order. The search starts at s, then
    goes on from every vertex that is still white, in order. kind[(u, v)] is
    "tree", "back", "forward" or "cross"; an undirected graph has only the first two.
    """

    def __init__(self, adj, s, directed):
        n = len(adj)
        self.adj, self.directed = adj, directed
        self.color = [WHITE] * n
        self.d = [0] * n
        self.f = [0] * n
        self.pi = [None] * n
        self.kind = {}
        self.time = 0
        for u in [s] + [u for u in range(n) if u != s]:
            if self.color[u] == WHITE:
                self.visit(u)

    def visit(self, u):
        self.time += 1
        self.d[u] = self.time
        self.color[u] = GRAY
        for v in self.adj[u]:
            if self.color[v] == WHITE:
                self.kind[(u, v)] = "tree"
                self.pi[v] = u
                self.visit(v)
            elif self.color[v] == GRAY:
                if self.directed or v != self.pi[u]:  # not the edge back to u's parent
                    self.kind[(u, v)] = "back"
            elif self.directed:  # undirected: already seen from v's end
                self.kind[(u, v)] = "forward" if self.d[u] < self.d[v] else "cross"
        self.time += 1
        self.f[u] = self.time
        self.color[u] = BLACK
