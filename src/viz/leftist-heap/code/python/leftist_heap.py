class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None
        self.npl = 0  # null path length; npl(None) is -1


def npl(node):
    return node.npl if node else -1


def merge(h1, h2):
    """Merge two leftist heaps along their right paths and return the new root."""
    if h1 is None:
        return h2
    if h2 is None:
        return h1
    if h2.key < h1.key:
        h1, h2 = h2, h1
    h1.right = merge(h1.right, h2)
    if npl(h1.left) < npl(h1.right):
        h1.left, h1.right = h1.right, h1.left
    h1.npl = npl(h1.right) + 1
    return h1


class LeftistHeap:
    """A leftist min-heap."""

    def __init__(self):
        self.root = None
        self.n = 0

    def __len__(self):
        return self.n

    def insert(self, key):
        self.root = merge(self.root, Node(key))
        self.n += 1

    def delete_min(self):
        if self.root is None:
            raise IndexError("heap is empty")
        smallest = self.root.key
        self.root = merge(self.root.left, self.root.right)
        self.n -= 1
        return smallest

    def merge_with(self, other):
        """Move every key of other into this heap; other ends up empty."""
        self.root = merge(self.root, other.root)
        self.n += other.n
        other.root, other.n = None, 0

    def clear(self):
        self.root = None
        self.n = 0
