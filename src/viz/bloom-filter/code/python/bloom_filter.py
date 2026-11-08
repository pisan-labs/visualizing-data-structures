P = 1009  # a prime larger than every key
A = [71, 113, 157, 211, 263, 307]
B = [5, 17, 29, 43, 61, 83]


class BloomFilter:
    """m bits and k hash functions h_i(x) = ((A[i]*x + B[i]) mod P) mod m.
    There is no delete: a bit may belong to several keys."""

    def __init__(self, m, k):
        self.m = m
        self.k = k
        self.bits = [0] * m

    def positions(self, x):
        return [(A[i] * x + B[i]) % P % self.m for i in range(self.k)]

    def insert(self, x):
        for j in self.positions(x):
            self.bits[j] = 1

    def query(self, x):
        """False: x was never inserted. True: x was probably inserted."""
        return all(self.bits[j] == 1 for j in self.positions(x))

    def clear(self):
        self.bits = [0] * self.m
