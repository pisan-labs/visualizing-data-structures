class BinaryLifting:
    """Lowest common ancestors on a rooted tree in O(log n) per query.

    adj[v] lists v's neighbours (vertices 0..n-1); root is the root.
    up[k][v] is the ancestor 2**k steps above v, or -1 past the root.
    """

    def __init__(self, adj, root):
        n = len(adj)
        self.log = max(1, (n - 1).bit_length())  # ceil(log2 n)
        self.depth = [-1] * n
        parent = [-1] * n
        self.depth[root], order = 0, [root]
        for u in order:  # BFS: depths and parents
            for w in adj[u]:
                if self.depth[w] < 0:
                    self.depth[w] = self.depth[u] + 1
                    parent[w] = u
                    order.append(w)
        self.up = [parent]
        for k in range(1, self.log):
            prev = self.up[k - 1]
            self.up.append([-1 if prev[v] < 0 else prev[prev[v]] for v in range(n)])

    def lca(self, u, v):
        if self.depth[u] < self.depth[v]:
            u, v = v, u
        diff, k = self.depth[u] - self.depth[v], 0
        while diff:  # lift u, one jump per 1-bit
            if diff & 1:
                u = self.up[k][u]
            diff, k = diff >> 1, k + 1
        if u == v:
            return u
        for k in range(self.log - 1, -1, -1):
            if self.up[k][u] != self.up[k][v]:
                u, v = self.up[k][u], self.up[k][v]
        return self.up[0][u]
