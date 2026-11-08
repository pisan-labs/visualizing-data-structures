class Node:
    def __init__(self, key):
        self.key = key
        self.child = None  # leftmost child
        self.next = None  # right sibling
        self.prev = None  # left sibling, or the parent for a leftmost child


def meld(a, b):
    """Link two roots: the larger becomes the leftmost child of the smaller."""
    if a is None:
        return b
    if b is None:
        return a
    if b.key < a.key:
        a, b = b, a
    b.next = a.child
    if a.child:
        a.child.prev = b
    b.prev = a
    a.child = b
    a.next = a.prev = None
    return a


class PairingHeap:
    def __init__(self):
        self.root = None
        self.n = 0

    def __len__(self):
        return self.n

    def insert(self, key):
        node = Node(key)
        self.root = meld(self.root, node)
        self.n += 1
        return node  # keep it to call decrease_key later

    def meld_with(self, other):
        self.root = meld(self.root, other.root)
        self.n += other.n

    def delete_min(self):
        if self.root is None:
            raise IndexError("heap is empty")
        top = self.root.key
        trees = []
        c = self.root.child
        while c:
            nxt = c.next
            c.next = c.prev = None
            trees.append(c)
            c = nxt
        # Pass 1: meld pairs, left to right.
        pairs = [meld(trees[i], trees[i + 1] if i + 1 < len(trees) else None)
                 for i in range(0, len(trees), 2)]
        # Pass 2: meld right to left.
        h = pairs[-1] if pairs else None
        for p in reversed(pairs[:-1]):
            h = meld(p, h)
        self.root = h
        self.n -= 1
        return top

    def decrease_key(self, x, k):
        if k > x.key:
            raise ValueError("new key is larger")
        x.key = k
        if x is self.root:
            return
        # Cut x (and its subtree) out of its sibling list.
        if x.prev.child is x:
            x.prev.child = x.next
        else:
            x.prev.next = x.next
        if x.next:
            x.next.prev = x.prev
        x.next = x.prev = None
        self.root = meld(self.root, x)

    def find(self, key):
        """The first node holding key, in preorder. Real code keeps the nodes insert returns;
        this is here so the test driver can name a node by its key."""
        stack = [self.root] if self.root else []
        while stack:
            node = stack.pop()
            if node.key == key:
                return node
            if node.next:
                stack.append(node.next)
            if node.child:
                stack.append(node.child)
        return None

    def clear(self):
        self.root = None
        self.n = 0
