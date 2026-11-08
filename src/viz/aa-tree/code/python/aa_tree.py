class Node:
    def __init__(self, key):
        self.key = key
        self.level = 1
        self.left = None
        self.right = None


def level(t):
    return 0 if t is None else t.level


class AATree:
    """Levels instead of colors; horizontal (red) links only on the right."""

    def __init__(self):
        self.root = None
        self.size = 0
        self.skews = 0
        self.splits = 0

    def skew(self, t):
        # A left child on t's level: rotate right.
        if t is not None and t.left is not None and t.left.level == t.level:
            l = t.left
            t.left = l.right
            l.right = t
            self.skews += 1
            return l
        return t

    def split(self, t):
        # Two right horizontal links in a row: rotate left and lift the middle node.
        if t is not None and t.right is not None and t.right.right is not None \
                and t.right.right.level == t.level:
            r = t.right
            t.right = r.left
            r.left = t
            r.level += 1
            self.splits += 1
            return r
        return t

    def search(self, k):
        t = self.root
        while t is not None and k != t.key:
            t = t.left if k < t.key else t.right
        return t

    def insert(self, k):
        if self.search(k) is not None:
            return False
        self.root = self._insert(self.root, k)
        self.size += 1
        return True

    def _insert(self, t, k):
        if t is None:
            return Node(k)
        if k < t.key:
            t.left = self._insert(t.left, k)
        else:
            t.right = self._insert(t.right, k)
        return self.split(self.skew(t))

    def delete(self, k):
        if self.search(k) is None:
            return False
        self.root = self._delete(self.root, k)
        self.size -= 1
        return True

    def _delete(self, t, k):
        if k < t.key:
            t.left = self._delete(t.left, k)
        elif k > t.key:
            t.right = self._delete(t.right, k)
        elif t.left is None and t.right is None:
            return None
        elif t.left is None:  # the successor, a leaf, stands in
            t.key = t.right.key
            t.right = self._delete(t.right, t.key)
        else:  # the predecessor, a leaf, stands in
            p = t.left
            while p.right is not None:
                p = p.right
            t.key = p.key
            t.left = self._delete(t.left, t.key)
        # Lower t's level if a child fell too far below, then repair the links.
        should = min(level(t.left), level(t.right)) + 1
        if should < t.level:
            t.level = should
            if t.right is not None and should < t.right.level:
                t.right.level = should
        t = self.skew(t)
        t.right = self.skew(t.right)
        if t.right is not None:
            t.right.right = self.skew(t.right.right)
        t = self.split(t)
        t.right = self.split(t.right)
        return t
