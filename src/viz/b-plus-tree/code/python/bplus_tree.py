from bisect import bisect_right, insort


class Node:
    def __init__(self, leaf):
        self.leaf = leaf
        self.keys = []
        self.children = []  # internal nodes only
        self.next = None  # leaves only: the next leaf to the right


class BPlusTree:
    """A B+ tree of order m: a node holds at most m - 1 keys. Every key lives in
    a leaf and the leaves are linked in order; internal keys are signposts."""

    def __init__(self, m=4):
        self.m = m
        self.root = Node(leaf=True)

    def _min_keys(self, x):
        # A leaf needs ceil((m - 1) / 2) keys; an internal node ceil(m / 2) children.
        return self.m // 2 if x.leaf else (self.m + 1) // 2 - 1

    def _leaf(self, k):
        x = self.root
        while not x.leaf:
            x = x.children[bisect_right(x.keys, k)]  # keys equal to a separator go right
        return x

    def search(self, k):
        return k in self._leaf(k).keys

    def range(self, a, b):
        out = []
        x = self._leaf(a)
        while x is not None:  # walk along the leaves
            for k in x.keys:
                if k > b:
                    return out
                if k >= a:
                    out.append(k)
            x = x.next
        return out

    def keys(self):
        """All keys in order, read along the leaf links."""
        x = self.root
        while not x.leaf:
            x = x.children[0]
        out = []
        while x is not None:
            out += x.keys
            x = x.next
        return out

    def insert(self, k):
        if self.search(k):
            return False
        split = self._insert(self.root, k)
        if split:  # the root split: a new root holds the separator
            key, right = split
            root = Node(leaf=False)
            root.keys, root.children = [key], [self.root, right]
            self.root = root
        return True

    def _insert(self, x, k):
        """Insert k under x. If x overflows, split it and return (separator, right half)."""
        if x.leaf:
            insort(x.keys, k)
            if len(x.keys) < self.m:
                return None
            half = (self.m + 1) // 2
            right = Node(leaf=True)
            right.keys, x.keys = x.keys[half:], x.keys[:half]
            right.next, x.next = x.next, right
            return right.keys[0], right  # copy up: the key stays in the leaf
        i = bisect_right(x.keys, k)
        split = self._insert(x.children[i], k)
        if split is None:
            return None
        key, child = split
        x.keys.insert(i, key)
        x.children.insert(i + 1, child)
        if len(x.keys) < self.m:
            return None
        mid = self.m // 2
        right = Node(leaf=False)
        up = x.keys[mid]  # push up: the key leaves this node
        right.keys, right.children = x.keys[mid + 1 :], x.children[mid + 1 :]
        x.keys, x.children = x.keys[:mid], x.children[: mid + 1]
        return up, right

    def delete(self, k):
        if not self.search(k):
            return False
        self._delete(self.root, k)
        if not self.root.leaf and not self.root.keys:
            self.root = self.root.children[0]  # the tree gets shorter
        return True

    def _delete(self, x, k):
        if x.leaf:
            x.keys.remove(k)
            return
        i = bisect_right(x.keys, k)
        self._delete(x.children[i], k)
        if len(x.children[i].keys) < self._min_keys(x.children[i]):
            self._fix(x, i)

    def _fix(self, x, i):
        """x.children[i] has too few keys: borrow from a sibling or merge with one."""
        c = x.children[i]
        left = x.children[i - 1] if i > 0 else None
        right = x.children[i + 1] if i + 1 < len(x.children) else None
        least = self._min_keys(c)
        if left and len(left.keys) > least:  # borrow from the left
            if c.leaf:
                c.keys.insert(0, left.keys.pop())
                x.keys[i - 1] = c.keys[0]
            else:
                c.keys.insert(0, x.keys[i - 1])
                x.keys[i - 1] = left.keys.pop()
                c.children.insert(0, left.children.pop())
        elif right and len(right.keys) > least:  # borrow from the right
            if c.leaf:
                c.keys.append(right.keys.pop(0))
                x.keys[i] = right.keys[0]
            else:
                c.keys.append(x.keys[i])
                x.keys[i] = right.keys.pop(0)
                c.children.append(right.children.pop(0))
        else:  # merge with the right sibling, or the left one if there is none
            if right is None:
                i -= 1
            a, b = x.children[i], x.children.pop(i + 1)
            separator = x.keys.pop(i)
            if a.leaf:
                a.keys += b.keys  # the separator was only a copy
                a.next = b.next
            else:
                a.keys += [separator] + b.keys
                a.children += b.children
