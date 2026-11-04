class BucketHashTable:
    """B buckets of b slots each. Keys that do not fit go to a shared overflow area."""

    def __init__(self, B, b):
        self.B, self.b = B, b
        self.buckets = [[None] * b for _ in range(B)]
        self.overflow = []
        self.probes = 0  # slots looked at by the last operation

    def h(self, k):
        return k % self.B

    def insert(self, k):
        """Adds k and returns True, or returns False if k is already there."""
        self.probes = 0
        bucket = self.buckets[self.h(k)]
        free = None
        for t in range(self.b):
            self.probes += 1
            if bucket[t] == k:
                return False
            if bucket[t] is None and free is None:
                free = t
        if free is not None:
            bucket[free] = k
            return True
        for x in self.overflow:
            self.probes += 1
            if x == k:
                return False
        self.overflow.append(k)
        return True

    def search(self, k):
        self.probes = 0
        bucket = self.buckets[self.h(k)]
        for t in range(self.b):
            self.probes += 1
            if bucket[t] == k:
                return True
        if None in bucket:
            return False  # the bucket has room, so k never overflowed
        for x in self.overflow:
            self.probes += 1
            if x == k:
                return True
        return False

    def delete(self, k):
        self.probes = 0
        i = self.h(k)
        bucket = self.buckets[i]
        for t in range(self.b):
            self.probes += 1
            if bucket[t] == k:
                bucket[t] = None
                # Pull a key of this bucket back from the overflow area.
                for p, x in enumerate(self.overflow):
                    if self.h(x) == i:
                        bucket[t] = self.overflow.pop(p)
                        break
                return True
        if None in bucket:
            return False
        for p, x in enumerate(self.overflow):
            self.probes += 1
            if x == k:
                self.overflow.pop(p)
                return True
        return False

    def clear(self):
        self.buckets = [[None] * self.b for _ in range(self.B)]
        self.overflow = []
