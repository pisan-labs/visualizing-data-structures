class SortedArray:
    """A fixed-capacity array of numbers kept in sorted order."""

    def __init__(self, capacity):
        self.data = [None] * capacity
        self.size = 0

    def insert(self, x):
        if self.size == len(self.data):
            raise OverflowError("array is full")
        j = self.size - 1
        while j >= 0 and self.data[j] > x:
            self.data[j + 1] = self.data[j]
            j -= 1
        self.data[j + 1] = x
        self.size += 1

    def search(self, x):
        """Binary search: the index of x, or -1."""
        lo, hi = 0, self.size - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            if self.data[mid] == x:
                return mid
            if self.data[mid] < x:
                lo = mid + 1
            else:
                hi = mid - 1
        return -1

    def delete(self, x):
        i = self.search(x)
        if i == -1:
            return False
        for j in range(i, self.size - 1):
            self.data[j] = self.data[j + 1]
        self.size -= 1
        return True

    def min(self):
        if self.size == 0:
            raise IndexError("array is empty")
        return self.data[0]

    def max(self):
        if self.size == 0:
            raise IndexError("array is empty")
        return self.data[self.size - 1]

    def lower_bound(self, x):
        """The first index whose item is >= x (size if there is none)."""
        lo, hi = 0, self.size
        while lo < hi:
            mid = (lo + hi) // 2
            if self.data[mid] < x:
                lo = mid + 1
            else:
                hi = mid
        return lo

    def upper_bound(self, x):
        """The first index whose item is > x (size if there is none)."""
        lo, hi = 0, self.size
        while lo < hi:
            mid = (lo + hi) // 2
            if self.data[mid] <= x:
                lo = mid + 1
            else:
                hi = mid
        return lo
