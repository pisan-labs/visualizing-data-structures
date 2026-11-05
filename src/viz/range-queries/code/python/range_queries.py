class PrefixSums:
    """Range sums on an array: P[k] is the sum of the first k values, A[0..k)."""

    def __init__(self, a):
        self.a = list(a)
        self.p = [0] * (len(a) + 1)
        for k, x in enumerate(a):
            self.p[k + 1] = self.p[k] + x

    def sum(self, i, j):
        """A[i] + ... + A[j], both ends included. O(1)."""
        return self.p[j + 1] - self.p[i]

    def update(self, i, x):
        """Set A[i] to x. Every prefix that includes A[i] changes: O(n)."""
        d = x - self.a[i]
        self.a[i] = x
        for k in range(i + 1, len(self.p)):
            self.p[k] += d


class SparseTable:
    """Range minimums: m[k][i] is the smallest of A[i .. i + 2**k - 1]."""

    def __init__(self, a):
        self.m = [list(a)]
        k = 1
        while 2**k <= len(a):
            prev, half = self.m[k - 1], 2 ** (k - 1)
            self.m.append([min(prev[i], prev[i + half]) for i in range(len(a) - 2**k + 1)])
            k += 1

    def min(self, i, j):
        """The smallest of A[i..j], from two windows that may overlap. O(1)."""
        k = (j - i + 1).bit_length() - 1
        return min(self.m[k][i], self.m[k][j - 2**k + 1])

    def update(self, i, x):
        """Set A[i] to x and recompute every window that contains i: O(n)."""
        self.m[0][i] = x
        n = len(self.m[0])
        for k in range(1, len(self.m)):
            half = 2 ** (k - 1)
            for t in range(max(0, i - 2**k + 1), min(i, n - 2**k) + 1):
                self.m[k][t] = min(self.m[k - 1][t], self.m[k - 1][t + half])
