class Node:
    def __init__(self, key):
        self.key = key
        self.degree = 0
        self.parent = None
        self.child = None  # the leftmost child, of the highest degree
        self.sibling = None  # the next child to the right, or the next root


def link(y, z):
    """Two roots of the same degree: y becomes the leftmost child of z."""
    y.parent = z
    y.sibling = z.child
    z.child = y
    z.degree += 1


def merge_lists(a, b):
    """Merge two root lists into one, in increasing degree."""
    dummy = tail = Node(None)
    while a and b:
        if a.degree <= b.degree:
            tail.sibling, a = a, a.sibling
        else:
            tail.sibling, b = b, b.sibling
        tail = tail.sibling
    tail.sibling = a or b
    return dummy.sibling


def union(h1, h2):
    """Unite two root lists, linking trees of the same degree (CLRS cases 1 to 4)."""
    head = merge_lists(h1, h2)
    if head is None:
        return None
    prev, x, nxt = None, head, head.sibling
    while nxt:
        sib = nxt.sibling
        if x.degree != nxt.degree or (sib and sib.degree == x.degree):
            prev, x = x, nxt
        elif x.key <= nxt.key:
            x.sibling = sib
            link(nxt, x)
        else:
            if prev is None:
                head = nxt
            else:
                prev.sibling = nxt
            link(x, nxt)
            x = nxt
        nxt = x.sibling
    return head


class BinomialQueue:
    """A binomial queue (CLRS: binomial heap), a min-heap."""

    def __init__(self):
        self.head = None
        self.n = 0

    def __len__(self):
        return self.n

    def insert(self, key):
        node = Node(key)
        self.head = union(self.head, node)
        self.n += 1
        return node

    def _min_root(self):
        """The root with the smallest key, and the root before it."""
        best_prev, best = None, self.head
        prev, x = self.head, self.head.sibling
        while x:
            if x.key < best.key:
                best_prev, best = prev, x
            prev, x = x, x.sibling
        return best_prev, best

    def find_min(self):
        if self.head is None:
            raise IndexError("queue is empty")
        return self._min_root()[1].key

    def extract_min(self):
        if self.head is None:
            raise IndexError("queue is empty")
        prev, x = self._min_root()
        if prev is None:
            self.head = x.sibling
        else:
            prev.sibling = x.sibling
        kids, c = None, x.child  # reverse the children: a root list of their own
        while c:
            nxt = c.sibling
            c.sibling, c.parent = kids, None
            kids, c = c, nxt
        self.head = union(self.head, kids)
        self.n -= 1
        return x.key

    def merge_with(self, other):
        """Move every key of other into this queue; other ends up empty."""
        self.head = union(self.head, other.head)
        self.n += other.n
        other.head, other.n = None, 0

    def decrease_key(self, x, key):
        if key > x.key:
            raise ValueError("new key is greater than current key")
        x.key = key
        y, z = x, x.parent
        while z and y.key < z.key:
            y.key, z.key = z.key, y.key
            y, z = z, z.parent

    def find(self, key):
        """The first node holding key: roots left to right, each tree in preorder."""

        def search(x):
            while x:
                if x.key == key:
                    return x
                found = search(x.child)
                if found:
                    return found
                x = x.sibling
            return None

        return search(self.head)

    def clear(self):
        self.head = None
        self.n = 0
