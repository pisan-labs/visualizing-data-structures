class CartesianTree:
    """Built left to right with a stack holding the right spine. Smallest value on top."""

    def __init__(self):
        self.values = []  # values[i] = A[i]; node i holds A[i]
        self.left = []  # left[i], right[i]: child indexes, or None
        self.right = []
        self.root = None
        self.stack = []  # the right spine, root first

    def append(self, x):
        """Add x at the end of the array. Returns how many nodes it popped."""
        z = len(self.values)
        self.values.append(x)
        self.left.append(None)
        self.right.append(None)
        last = None
        pops = 0
        while self.stack and self.values[self.stack[-1]] > x:
            last = self.stack.pop()
            pops += 1
        self.left[z] = last
        if self.stack:
            self.right[self.stack[-1]] = z
        else:
            self.root = z
        self.stack.append(z)
        return pops

    def rmq(self, i, j):
        """Index of the smallest value in A[i..j]: the common ancestor of i and j."""
        x = self.root
        visited = 1
        while x < i or x > j:
            x = self.right[x] if x < i else self.left[x]
            visited += 1
        return x, visited

    def preorder(self, x, out):
        if x is not None:
            out.append(self.values[x])
            self.preorder(self.left[x], out)
            self.preorder(self.right[x], out)
