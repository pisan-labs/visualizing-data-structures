class MaxHeap:
    """A max-heap in a fixed-size array, indexed from 1 as in CLRS: slot 0 is not used.

    parent(i) = i // 2, left(i) = 2 * i, right(i) = 2 * i + 1.
    """

    def __init__(self, capacity):
        self.a = [None] * (capacity + 1)
        self.n = 0

    def __len__(self):
        return self.n

    def insert(self, key):
        if self.n == len(self.a) - 1:
            raise OverflowError("heap overflow")
        self.n += 1
        self.a[self.n] = key
        self._sift_up(self.n)

    def maximum(self):
        if self.n == 0:
            raise IndexError("heap is empty")
        return self.a[1]

    def extract_max(self):
        if self.n == 0:
            raise IndexError("heap underflow")
        top = self.a[1]
        self.a[1] = self.a[self.n]
        self.n -= 1
        self._max_heapify(1)
        return top

    def build(self, keys):
        """Bottom-up: copy the keys in, then sift down from the last parent to the root."""
        if len(keys) > len(self.a) - 1:
            raise OverflowError("heap overflow")
        self.n = len(keys)
        self.a[1 : self.n + 1] = keys
        for i in range(self.n // 2, 0, -1):
            self._max_heapify(i)

    def update_key(self, i, key):
        if i < 1 or i > self.n:
            raise IndexError("no such slot")
        old = self.a[i]
        self.a[i] = key
        if key > old:
            self._sift_up(i)
        elif key < old:
            self._max_heapify(i)

    def delete(self, i):
        if i < 1 or i > self.n:
            raise IndexError("no such slot")
        old = self.a[i]
        last = self.a[self.n]
        self.n -= 1
        if i <= self.n:
            self.a[i] = last
            if last > old:
                self._sift_up(i)
            elif last < old:
                self._max_heapify(i)
        return old

    def clear(self):
        self.n = 0

    def _sift_up(self, i):
        a = self.a
        while i > 1 and a[i // 2] < a[i]:
            a[i], a[i // 2] = a[i // 2], a[i]
            i //= 2

    def _max_heapify(self, i):
        a, n = self.a, self.n
        while True:
            left, right = 2 * i, 2 * i + 1
            largest = left if left <= n and a[left] > a[i] else i
            if right <= n and a[right] > a[largest]:
                largest = right
            if largest == i:
                return
            a[i], a[largest] = a[largest], a[i]
            i = largest
