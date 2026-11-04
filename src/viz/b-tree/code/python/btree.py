class Node:
    def __init__(self):
        self.keys = []
        self.children = []  # empty for a leaf

    @property
    def leaf(self):
        return not self.children


class BTree:
    """A B-tree of minimum degree t, as in CLRS. Every node except the root
    holds t - 1 to 2t - 1 keys. Keys are not repeated."""

    def __init__(self, t=3):
        self.t = t
        self.root = Node()

    def search(self, k):
        x = self.root
        while True:
            i = 0
            while i < len(x.keys) and k > x.keys[i]:
                i += 1
            if i < len(x.keys) and k == x.keys[i]:
                return x, i
            if x.leaf:
                return None
            x = x.children[i]  # a disk read in a real B-tree

    def insert(self, k):
        if self.search(k):
            return False
        r = self.root
        if len(r.keys) == 2 * self.t - 1:  # a full root splits first
            self.root = Node()
            self.root.children.append(r)
            self._split_child(self.root, 0)
        self._insert_nonfull(self.root, k)
        return True

    def _split_child(self, x, i):
        """Split x's full child y = x.children[i] around its middle key."""
        t = self.t
        y = x.children[i]
        z = Node()
        z.keys = y.keys[t:]
        z.children = y.children[t:]
        x.keys.insert(i, y.keys[t - 1])  # the middle key moves up
        x.children.insert(i + 1, z)
        y.keys = y.keys[: t - 1]
        y.children = y.children[:t]

    def _insert_nonfull(self, x, k):
        i = len(x.keys)
        while i > 0 and k < x.keys[i - 1]:
            i -= 1
        if x.leaf:
            x.keys.insert(i, k)
            return
        if len(x.children[i].keys) == 2 * self.t - 1:  # split on the way down
            self._split_child(x, i)
            if k > x.keys[i]:
                i += 1
        self._insert_nonfull(x.children[i], k)

    def delete(self, k):
        found = self._delete(self.root, k)
        if not self.root.keys and not self.root.leaf:
            self.root = self.root.children[0]  # the tree gets shorter
        return found

    def _delete(self, x, k):
        """Delete k under x, which has at least t keys (or is the root)."""
        t = self.t
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1
        here = i < len(x.keys) and x.keys[i] == k
        if x.leaf:  # case 1
            if here:
                x.keys.pop(i)
            return here
        if here:  # case 2: k is in this internal node
            y, z = x.children[i], x.children[i + 1]
            if len(y.keys) >= t:  # 2a: the predecessor moves up
                x.keys[i] = self._max(y)
                return self._delete(y, x.keys[i])
            if len(z.keys) >= t:  # 2b: the successor moves up
                x.keys[i] = self._min(z)
                return self._delete(z, x.keys[i])
            self._merge(x, i)  # 2c
            return self._delete(y, k)
        c = x.children[i]  # case 3: k can only be under c
        if len(c.keys) == t - 1:
            left = x.children[i - 1] if i > 0 else None
            right = x.children[i + 1] if i < len(x.keys) else None
            if left and len(left.keys) >= t:  # 3a: borrow from the left
                c.keys.insert(0, x.keys[i - 1])
                x.keys[i - 1] = left.keys.pop()
                if not left.leaf:
                    c.children.insert(0, left.children.pop())
            elif right and len(right.keys) >= t:  # 3a: borrow from the right
                c.keys.append(x.keys[i])
                x.keys[i] = right.keys.pop(0)
                if not right.leaf:
                    c.children.append(right.children.pop(0))
            elif right:  # 3b: merge with the right sibling
                self._merge(x, i)
            else:  # 3b: merge with the left sibling
                self._merge(x, i - 1)
                c = left
        return self._delete(c, k)

    def _merge(self, x, i):
        """Merge x.children[i], x.keys[i] and x.children[i + 1] into one node."""
        y = x.children[i]
        z = x.children.pop(i + 1)
        y.keys += [x.keys.pop(i)] + z.keys
        y.children += z.children

    @staticmethod
    def _max(x):
        while not x.leaf:
            x = x.children[-1]
        return x.keys[-1]

    @staticmethod
    def _min(x):
        while not x.leaf:
            x = x.children[0]
        return x.keys[0]

    def keys(self):
        """All keys in order."""
        out = []

        def walk(x):
            for i, k in enumerate(x.keys):
                if not x.leaf:
                    walk(x.children[i])
                out.append(k)
            if not x.leaf:
                walk(x.children[-1])

        walk(self.root)
        return out
