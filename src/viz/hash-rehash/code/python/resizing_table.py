def is_prime(n):
    if n < 2:
        return False
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d += 1
    return True


def next_prime(n):
    while not is_prime(n):
        n += 1
    return n


class ResizingTable:
    """Linear probing. When one more key would push α above 0.75, the table
    grows to the first prime at least twice its size and every key moves."""

    MAX_LOAD = 0.75

    def __init__(self, m):
        self.T = [None] * m
        self.n = 0
        self.total = 0  # cost of all inserts so far: stores plus moves

    @staticmethod
    def _slot(T, k):
        """The first slot of k's probe sequence that is empty or holds k."""
        j = k % len(T)
        while T[j] is not None and T[j] != k:
            j = (j + 1) % len(T)
        return j

    def insert(self, k):
        """Adds k and returns what it cost, or 0 if k was already there."""
        if self.T[self._slot(self.T, k)] == k:
            return 0
        cost = 1
        if (self.n + 1) / len(self.T) > self.MAX_LOAD:
            cost += self._rehash(next_prime(2 * len(self.T)))
        self.T[self._slot(self.T, k)] = k
        self.n += 1
        self.total += cost
        return cost

    def _rehash(self, size):
        old, self.T = self.T, [None] * size
        for x in old:
            if x is not None:
                self.T[self._slot(self.T, x)] = x
        return self.n  # every key moved

    def search(self, k):
        j = self._slot(self.T, k)
        return j if self.T[j] == k else None

    def capacity(self):
        return len(self.T)
