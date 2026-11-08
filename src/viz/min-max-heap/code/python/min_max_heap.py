class MinMaxHeap:
    """A min-max heap in an array indexed from 1 (slot 0 is not used).

    Even depths (the root's) are min levels, odd depths are max levels. A key on a min level
    is no bigger than anything below it; a key on a max level is no smaller.
    """

    def __init__(self, capacity):
        self.a = [None] * (capacity + 1)
        self.n = 0

    def __len__(self):
        return self.n

    @staticmethod
    def _on_min_level(i):
        return (i.bit_length() - 1) % 2 == 0

    def insert(self, key):
        if self.n == len(self.a) - 1:
            raise OverflowError("heap overflow")
        self.n += 1
        self.a[self.n] = key
        self._push_up(self.n)

    def extract_min(self):
        if self.n == 0:
            raise IndexError("heap is empty")
        return self._remove(1)

    def extract_max(self):
        if self.n == 0:
            raise IndexError("heap is empty")
        m = 1
        if self.n >= 2:
            m = 2
            if self.n >= 3 and self.a[3] > self.a[2]:
                m = 3
        return self._remove(m)

    def build(self, keys):
        if len(keys) > len(self.a) - 1:
            raise OverflowError("heap overflow")
        self.n = len(keys)
        self.a[1 : self.n + 1] = keys
        for i in range(self.n // 2, 0, -1):
            self._trickle_down(i)

    def clear(self):
        self.n = 0

    def _remove(self, m):
        x = self.a[m]
        self.a[m] = self.a[self.n]
        self.n -= 1
        if m <= self.n:
            self._trickle_down(m)
        return x

    def _swap(self, i, j):
        self.a[i], self.a[j] = self.a[j], self.a[i]

    def _push_up(self, i):
        a = self.a
        if i == 1:
            return
        p = i // 2
        if self._on_min_level(i):
            if a[i] > a[p]:
                self._swap(i, p)
                self._push_up_side(p, lambda x, y: x > y)
            else:
                self._push_up_side(i, lambda x, y: x < y)
        else:
            if a[i] < a[p]:
                self._swap(i, p)
                self._push_up_side(p, lambda x, y: x < y)
            else:
                self._push_up_side(i, lambda x, y: x > y)

    def _push_up_side(self, i, better):
        while i >= 4 and better(self.a[i], self.a[i // 4]):
            self._swap(i, i // 4)
            i //= 4

    def _trickle_down(self, i):
        if self._on_min_level(i):
            better = lambda x, y: x < y  # noqa: E731
        else:
            better = lambda x, y: x > y  # noqa: E731
        a, n = self.a, self.n
        while 2 * i <= n:
            kids = [c for c in (2 * i, 2 * i + 1) if c <= n]
            below = kids + [g for c in kids for g in (2 * c, 2 * c + 1) if g <= n]
            m = below[0]
            for c in below[1:]:
                if better(a[c], a[m]):
                    m = c
            if not better(a[m], a[i]):
                return
            self._swap(i, m)
            if m in kids:
                return
            if better(a[m // 2], a[m]):
                self._swap(m, m // 2)
            i = m
