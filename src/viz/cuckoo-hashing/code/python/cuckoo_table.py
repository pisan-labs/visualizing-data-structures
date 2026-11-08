def next_prime(n):
    while n < 2 or any(n % d == 0 for d in range(2, int(n**0.5) + 1)):
        n += 1
    return n


class CuckooTable:
    """Two tables of m slots: key k lives in T[0][k mod m] or in T[1][(k div m) mod m]."""

    def __init__(self, m):
        self.m = m
        self.T = [[None] * m, [None] * m]
        self.kicks = 0  # kicks in the last insert, before any rehash
        self.rehashes = 0

    def h(self, i, k):
        return k % self.m if i == 0 else (k // self.m) % self.m

    def search(self, k):
        """1 or 2, the table that holds k, or 0. Two probes at most."""
        for i in (0, 1):
            if self.T[i][self.h(i, k)] == k:
                return i + 1
        return 0

    def insert(self, k):
        if self.search(k):
            return False
        self.kicks = 0
        left = self._walk(k, count=True)
        if left is not None:
            self._rehash(left)
        return True

    def delete(self, k):
        for i in (0, 1):
            j = self.h(i, k)
            if self.T[i][j] == k:
                self.T[i][j] = None
                return True
        return False

    def _walk(self, k, count=False):
        """Put k in its T1 nest, kicking each old key to its other nest. Returns the key
        left homeless when the kicks would go round forever, or None."""
        x, i, homeless = k, 0, 1
        while True:
            j = self.h(i, x)
            x, self.T[i][j] = self.T[i][j], x
            if x is None:
                return None
            if count:
                self.kicks += 1
            if x == k:
                homeless += 1
                if homeless == 3:  # k kicked out twice: a cycle
                    return x
            i = 1 - i

    def _rehash(self, left):
        keys = [x for x in self.T[0] + self.T[1] if x is not None] + [left]
        while True:
            self.m = next_prime(self.m + 1)  # new m: new hash functions
            self.rehashes += 1
            self.T = [[None] * self.m, [None] * self.m]
            if all(self._walk(x) is None for x in keys):
                return
