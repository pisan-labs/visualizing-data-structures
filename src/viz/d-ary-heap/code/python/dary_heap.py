class DaryHeap:
    """A max-heap with d children per node, in an array indexed from 1 (slot 0 is not used).

    parent(i) = (i - 2) // d + 1, child(i, j) = d * (i - 1) + j + 1 for j = 1..d.
    """

    def __init__(self, d, capacity):
        self.d = d
        self.a = [None] * (capacity + 1)
        self.n = 0

    def __len__(self):
        return self.n

    def parent(self, i):
        return (i - 2) // self.d + 1

    def child(self, i, j):
        return self.d * (i - 1) + j + 1

    def insert(self, key):
        if self.n == len(self.a) - 1:
            raise OverflowError("heap overflow")
        self.n += 1
        self.a[self.n] = key
        self._sift_up(self.n)

    def extract_max(self):
        if self.n == 0:
            raise IndexError("heap underflow")
        top = self.a[1]
        self.a[1] = self.a[self.n]
        self.n -= 1
        self._sift_down(1)
        return top

    def build(self, keys):
        if len(keys) > len(self.a) - 1:
            raise OverflowError("heap overflow")
        self.n = len(keys)
        self.a[1 : self.n + 1] = keys
        if self.n > 1:
            for i in range(self.parent(self.n), 0, -1):
                self._sift_down(i)

    def update_key(self, i, key):
        if i < 1 or i > self.n:
            raise IndexError("no such slot")
        old = self.a[i]
        self.a[i] = key
        if key > old:
            self._sift_up(i)
        elif key < old:
            self._sift_down(i)

    def clear(self):
        self.n = 0

    def _sift_up(self, i):
        a = self.a
        while i > 1 and a[i] > a[self.parent(i)]:
            p = self.parent(i)
            a[i], a[p] = a[p], a[i]
            i = p

    def _sift_down(self, i):
        a, n = self.a, self.n
        while True:
            largest = i
            for j in range(1, self.d + 1):
                c = self.child(i, j)
                if c <= n and a[c] > a[largest]:
                    largest = c
            if largest == i:
                return
            a[i], a[largest] = a[largest], a[i]
            i = largest
