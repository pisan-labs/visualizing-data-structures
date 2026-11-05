class FenwickTree:
    """Prefix sums that allow updates. 1-based: t[i] holds A[i - (i & -i) + 1] + ... + A[i]."""

    def __init__(self, values):
        """Build in O(n): copy A, then pass each t[i] up to the next range that contains it."""
        self.t = [0] + list(values)
        for i in range(1, len(self.t)):
            j = i + (i & -i)
            if j < len(self.t):
                self.t[j] += self.t[i]

    def add(self, i, delta):
        """A[i] += delta. Every range that contains i changes: O(log n)."""
        while i < len(self.t):
            self.t[i] += delta
            i += i & -i

    def prefix(self, i):
        """A[1] + ... + A[i]: one range per 1 bit of i, O(log n)."""
        total = 0
        while i > 0:
            total += self.t[i]
            i -= i & -i
        return total

    def sum(self, l, r):
        """A[l] + ... + A[r], both ends included."""
        return self.prefix(r) - self.prefix(l - 1)
