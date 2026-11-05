class SegmentTree:
    """Range sums, point updates and range adds with lazy propagation.

    Node v covers A[lo..hi]; its children are 2v for A[lo..mid] and 2v + 1 for A[mid+1..hi].
    lazy[v] is an add that node v still owes its children.
    """

    def __init__(self, values):
        self.n = len(values)
        self.tree = [0] * (4 * self.n)
        self.lazy = [0] * (4 * self.n)
        self._build(1, 0, self.n - 1, values)

    def _build(self, v, lo, hi, a):
        if lo == hi:
            self.tree[v] = a[lo]
            return
        mid = (lo + hi) // 2
        self._build(2 * v, lo, mid, a)
        self._build(2 * v + 1, mid + 1, hi, a)
        self.tree[v] = self.tree[2 * v] + self.tree[2 * v + 1]

    def _apply(self, v, lo, hi, x):
        self.tree[v] += x * (hi - lo + 1)
        if lo < hi:
            self.lazy[v] += x

    def _push(self, v, lo, hi):
        if self.lazy[v]:
            mid = (lo + hi) // 2
            self._apply(2 * v, lo, mid, self.lazy[v])
            self._apply(2 * v + 1, mid + 1, hi, self.lazy[v])
            self.lazy[v] = 0

    def query(self, l, r):
        """A[l] + ... + A[r]. O(log n)."""
        return self._query(1, 0, self.n - 1, l, r)

    def _query(self, v, lo, hi, l, r):
        if r < lo or hi < l:  # no overlap
            return 0
        if l <= lo and hi <= r:  # full overlap
            return self.tree[v]
        self._push(v, lo, hi)  # partial overlap
        mid = (lo + hi) // 2
        return self._query(2 * v, lo, mid, l, r) + self._query(2 * v + 1, mid + 1, hi, l, r)

    def update(self, i, x):
        """Set A[i] to x. O(log n)."""
        self._update(1, 0, self.n - 1, i, x)

    def _update(self, v, lo, hi, i, x):
        if lo == hi:
            self.tree[v] = x
            return
        self._push(v, lo, hi)
        mid = (lo + hi) // 2
        if i <= mid:
            self._update(2 * v, lo, mid, i, x)
        else:
            self._update(2 * v + 1, mid + 1, hi, i, x)
        self.tree[v] = self.tree[2 * v] + self.tree[2 * v + 1]

    def add(self, l, r, x):
        """Add x to every value in A[l..r]. O(log n), thanks to the lazy tags."""
        self._add(1, 0, self.n - 1, l, r, x)

    def _add(self, v, lo, hi, l, r, x):
        if r < lo or hi < l:
            return
        if l <= lo and hi <= r:
            self._apply(v, lo, hi, x)
            return
        self._push(v, lo, hi)
        mid = (lo + hi) // 2
        self._add(2 * v, lo, mid, l, r, x)
        self._add(2 * v + 1, mid + 1, hi, l, r, x)
        self.tree[v] = self.tree[2 * v] + self.tree[2 * v + 1]
