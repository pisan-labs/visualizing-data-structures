import bisect


class AdjacencyList:
    """A graph on vertices 0..n-1. adj[u] holds u's neighbours in increasing order."""

    def __init__(self, n, directed=False):
        self.adj = [[] for _ in range(n)]
        self.directed = directed

    def has_edge(self, u, v):
        for x in self.adj[u]:  # O(degree of u)
            if x == v:
                return True
        return False

    def add_edge(self, u, v):
        if self.has_edge(u, v):
            return False
        bisect.insort(self.adj[u], v)  # keep the list in order
        if not self.directed:
            bisect.insort(self.adj[v], u)
        return True

    def remove_edge(self, u, v):
        if not self.has_edge(u, v):
            return False
        self.adj[u].remove(v)
        if not self.directed:
            self.adj[v].remove(u)
        return True

    def neighbours(self, u):
        return list(self.adj[u])  # O(degree of u)


class AdjacencyMatrix:
    """A graph on vertices 0..n-1. m[u][v] is 1 when there is an edge u -> v, else 0."""

    def __init__(self, n, directed=False):
        self.m = [[0] * n for _ in range(n)]  # O(n^2) space, edges or not
        self.directed = directed

    def has_edge(self, u, v):
        return self.m[u][v] == 1  # O(1)

    def add_edge(self, u, v):
        if self.has_edge(u, v):
            return False
        self.m[u][v] = 1
        if not self.directed:
            self.m[v][u] = 1
        return True

    def remove_edge(self, u, v):
        if not self.has_edge(u, v):
            return False
        self.m[u][v] = 0
        if not self.directed:
            self.m[v][u] = 0
        return True

    def neighbours(self, u):
        return [v for v in range(len(self.m)) if self.m[u][v] == 1]  # O(n)
