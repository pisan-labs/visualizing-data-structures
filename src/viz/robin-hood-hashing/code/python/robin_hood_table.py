class RobinHoodTable:
    """Linear probing with h(k) = k mod m, where a key further from home takes the slot of a
    key closer to home. Deletion shifts the keys behind back, so there are no tombstones."""

    def __init__(self, m):
        self.m = m
        self.T = [None] * m
        self.n = 0
        self.probes = 0  # slots looked at by the last operation

    def dist(self, k, j):
        """How far slot j is from k's home slot: its probe distance."""
        return (j - k % self.m) % self.m

    def insert(self, k):
        """Returns the number of swaps, None if k is already there; raises if full."""
        if self.n == self.m and self.search(k) is None:
            raise OverflowError("table full")
        x, j, d, swaps = k, k % self.m, 0, 0
        for i in range(self.m):
            self.probes = i + 1
            if self.T[j] is None:
                self.T[j] = x
                self.n += 1
                return swaps
            if swaps == 0 and self.T[j] == k:
                return None
            if self.dist(self.T[j], j) < d:  # take from the rich
                x, self.T[j] = self.T[j], x
                d = self.dist(x, j)
                swaps += 1
            j = (j + 1) % self.m
            d += 1
        raise OverflowError("table full")

    def search(self, k):
        """The slot of k, or None. Stops early at a key closer to home than k would be."""
        j = k % self.m
        for d in range(self.m):
            self.probes = d + 1
            if self.T[j] is None:
                return None
            if self.T[j] == k:
                return j
            if self.dist(self.T[j], j) < d:
                return None
            j = (j + 1) % self.m
        return None

    def delete(self, k):
        """Returns the number of keys shifted back, or None if k is not there."""
        j = self.search(k)
        if j is None:
            return None
        self.T[j] = None
        self.n -= 1
        shifts = 0
        nxt = (j + 1) % self.m
        while self.T[nxt] is not None and self.dist(self.T[nxt], nxt) > 0:
            self.T[j], self.T[nxt] = self.T[nxt], None
            j, nxt = nxt, (nxt + 1) % self.m
            shifts += 1
        return shifts
