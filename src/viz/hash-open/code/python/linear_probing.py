class _Deleted:
    def __repr__(self):
        return "DEL"


DELETED = _Deleted()  # a tombstone: a key was deleted here


class LinearProbingTable:
    """Open addressing with linear probing. A deleted slot keeps a tombstone."""

    def __init__(self, m):
        self.m = m
        self.T = [None] * m
        self.n = 0
        self.probes = 0  # probes used by the last operation

    def h(self, k, i):
        return (k % self.m + i) % self.m

    def insert(self, k):
        """Adds k and returns True, or returns False if k is already there."""
        d = None  # the first tombstone seen
        for i in range(self.m):
            self.probes = i + 1
            j = self.h(k, i)
            if self.T[j] is None:
                self.T[j if d is None else d] = k
                self.n += 1
                return True
            if self.T[j] is DELETED:
                if d is None:
                    d = j
            elif self.T[j] == k:
                return False
        if d is not None:
            self.T[d] = k
            self.n += 1
            return True
        raise OverflowError("no free slot")

    def search(self, k):
        """The slot that holds k, or None."""
        for i in range(self.m):
            self.probes = i + 1
            j = self.h(k, i)
            if self.T[j] is None:
                return None
            if self.T[j] == k:  # a tombstone never equals k
                return j
        return None

    def delete(self, k):
        j = self.search(k)
        if j is None:
            return False
        self.T[j] = DELETED
        self.n -= 1
        return True

    def clear(self):
        self.T = [None] * self.m
        self.n = 0

    def load_factor(self):
        return self.n / self.m
