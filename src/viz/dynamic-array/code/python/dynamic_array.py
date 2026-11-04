class DynamicArray:
    """An array that doubles when full and halves when a quarter full.

    Each resize copies every item, but resizes are rare enough that
    append costs O(1) amortized: fewer than 2 copies per append.
    """

    def __init__(self, capacity=1):
        self.data = [None] * capacity
        self.size = 0

    def capacity(self):
        return len(self.data)

    def _resize(self, capacity):
        fresh = [None] * capacity
        for k in range(self.size):
            fresh[k] = self.data[k]
        self.data = fresh

    def _check(self, i, limit):
        if not 0 <= i < limit:
            raise IndexError("index out of range")

    def _shrink_if_sparse(self):
        if self.size > 0 and self.size == len(self.data) // 4:
            self._resize(len(self.data) // 2)

    def append(self, x):
        if self.size == len(self.data):
            self._resize(2 * len(self.data))
        self.data[self.size] = x
        self.size += 1

    def insert(self, i, x):
        self._check(i, self.size + 1)
        if self.size == len(self.data):
            self._resize(2 * len(self.data))
        for j in range(self.size, i, -1):
            self.data[j] = self.data[j - 1]
        self.data[i] = x
        self.size += 1

    def remove_at(self, i):
        self._check(i, self.size)
        x = self.data[i]
        for j in range(i, self.size - 1):
            self.data[j] = self.data[j + 1]
        self.size -= 1
        self._shrink_if_sparse()
        return x

    def remove_last(self):
        if self.size == 0:
            raise IndexError("array is empty")
        self.size -= 1
        x = self.data[self.size]
        self._shrink_if_sparse()
        return x

    def get(self, i):
        self._check(i, self.size)
        return self.data[i]

    def set(self, i, x):
        self._check(i, self.size)
        self.data[i] = x
