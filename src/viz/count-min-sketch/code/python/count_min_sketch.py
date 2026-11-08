P = 1009  # a prime larger than every item
A = [71, 113, 157, 211, 263]
B = [5, 17, 29, 43, 61]


class CountMinSketch:
    """d rows of w counters. Row i uses h_i(x) = ((A[i]*x + B[i]) mod P) mod w."""

    def __init__(self, d, w):
        self.d = d
        self.w = w
        self.C = [[0] * w for _ in range(d)]

    def column(self, i, x):
        return (A[i] * x + B[i]) % P % self.w

    def add(self, x):
        for i in range(self.d):
            self.C[i][self.column(i, x)] += 1

    def estimate(self, x):
        """Never below the true count; above it when other items share every counter."""
        return min(self.C[i][self.column(i, x)] for i in range(self.d))

    def heavy_hitters(self, candidates, n, percent):
        """The candidates whose estimate is at least percent% of the n items added."""
        hits = [x for x in candidates if self.estimate(x) * 100 >= percent * n]
        return sorted(hits, key=lambda x: (-self.estimate(x), x))
