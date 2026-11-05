class DisjointSets:
    """Union-find: union by rank with path compression."""

    def __init__(self):
        self.parent = {}
        self.rank = {}

    def make_set(self, x):
        self.parent[x] = x
        self.rank[x] = 0

    def find(self, x):
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])  # path compression
        return self.parent[x]

    def union(self, x, y):
        """Join the sets of x and y. Returns the new root, or None if already joined."""
        a, b = self.find(x), self.find(y)
        if a == b:
            return None
        if self.rank[a] > self.rank[b]:
            self.parent[b] = a
            return a
        self.parent[a] = b
        if self.rank[a] == self.rank[b]:
            self.rank[b] += 1
        return b
