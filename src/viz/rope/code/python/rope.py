class Node:
    """A leaf holds text; an internal node joins two ropes. Nodes never change, so ropes can
    share them. weight = length of the left subtree (for a leaf, its own length)."""

    def __init__(self, text=None, left=None, right=None):
        self.text, self.left, self.right = text, left, right
        if text is not None:
            self.weight = self.length = len(text)
        else:
            self.weight = left.length
            self.length = left.length + right.length


def concat(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return Node(left=a, right=b)


def split(node, i):
    """Cut a rope before position i: returns (left part, right part), either may be None."""
    if node is None:
        return None, None
    if node.text is not None:
        if i == 0:
            return None, node
        if i == node.length:
            return node, None
        return Node(node.text[:i]), Node(node.text[i:])
    if i < node.weight:
        a, b = split(node.left, i)
        return a, concat(b, node.right)
    if i == node.weight:
        return node.left, node.right
    a, b = split(node.right, i - node.weight)
    return concat(node.left, a), b


def index(node, i):
    while node.text is None:
        if i < node.weight:
            node = node.left
        else:
            i -= node.weight
            node = node.right
    return node.text[i]


def build(text, leaf):
    """A balanced rope over text, in pieces of at most `leaf` characters."""
    pieces = [text[k : k + leaf] for k in range(0, len(text), leaf)]

    def make(lo, hi):
        if lo >= hi:
            return None
        if hi - lo == 1:
            return Node(pieces[lo])
        mid = (lo + hi + 1) // 2
        return concat(make(lo, mid), make(mid, hi))

    return make(0, len(pieces))


class Rope:
    def __init__(self, root=None):
        self.root = root

    def __len__(self):
        return self.root.length if self.root else 0

    def index(self, i):
        if i < 0 or i >= len(self):
            raise IndexError("no such position")
        return index(self.root, i)

    def append(self, text):
        self.root = concat(self.root, Node(text))

    def insert(self, i, text):
        if i < 0 or i > len(self):
            raise IndexError("no such position")
        a, b = split(self.root, i)
        self.root = concat(concat(a, Node(text)), b)

    def delete(self, i, n):
        if n < 1 or i < 0 or i + n > len(self):
            raise IndexError("no such range")
        a, rest = split(self.root, i)
        _, b = split(rest, n)
        self.root = concat(a, b)

    def split(self, i):
        """Keep the first i characters; return the rest as a new rope."""
        if i <= 0 or i >= len(self):
            raise IndexError("cut inside the rope")
        self.root, rest = split(self.root, i)
        return Rope(rest)

    def join(self, other):
        self.root = concat(self.root, other.root)
