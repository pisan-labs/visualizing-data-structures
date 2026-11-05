class Node:
    def __init__(self, edge="", end=False):
        self.edge = edge  # the letters on the edge into this node
        self.end = end  # a word ends here
        self.children = {}  # first letter of the child's edge -> child


def common(a, b):
    """Length of the longest common prefix of a and b."""
    k = 0
    while k < min(len(a), len(b)) and a[k] == b[k]:
        k += 1
    return k


class RadixTree:
    """A compressed trie: each edge holds a string, and a node is kept only where the paths
    branch or a word ends."""

    def __init__(self):
        self.root = Node()

    def insert(self, word):
        """Add word. Returns False if it was already there."""
        x, s = self.root, word
        while s:
            y = x.children.get(s[0])
            if y is None:
                x.children[s[0]] = Node(s, end=True)
                return True
            k = common(y.edge, s)
            if k < len(y.edge):
                y = self._split(x, y, k)
            x, s = y, s[k:]
        if x.end:
            return False
        x.end = True
        return True

    def _split(self, x, y, k):
        """Split the edge from x to y after k letters. Returns the new middle node."""
        m = Node(y.edge[:k])
        y.edge = y.edge[k:]
        m.children[y.edge[0]] = y
        x.children[m.edge[0]] = m
        return m

    def search(self, word):
        x, s = self.root, word
        while s:
            y = x.children.get(s[0])
            if y is None or not s.startswith(y.edge):
                return False
            x, s = y, s[len(y.edge) :]
        return x.end

    def delete(self, word):
        """Remove word. Returns False if it was not there."""
        parent, x, s = None, self.root, word
        while s:
            y = x.children.get(s[0])
            if y is None or not s.startswith(y.edge):
                return False
            parent, x, s = x, y, s[len(y.edge) :]
        if not x.end:
            return False
        x.end = False
        if not x.children:
            del parent.children[x.edge[0]]
            if parent is not self.root and not parent.end and len(parent.children) == 1:
                self._merge(parent)
        elif len(x.children) == 1:
            self._merge(x)
        return True

    def _merge(self, x):
        """x has one child and ends no word: x takes in the child's edge."""
        (c,) = x.children.values()
        x.edge += c.edge
        x.end = c.end
        x.children = c.children

    def starts_with(self, prefix):
        """Every word that starts with prefix, in alphabetical order."""
        x, s, path = self.root, prefix, ""
        while s:
            y = x.children.get(s[0])
            if y is None or not (s.startswith(y.edge) or y.edge.startswith(s)):
                return []
            # Go down the edge, even when the prefix ends partway along it.
            x, s, path = y, s[len(y.edge) :], path + y.edge
        out = []
        self._collect(x, path, out)
        return out

    def _collect(self, x, w, out):
        if x.end:
            out.append(w)
        for c in sorted(x.children):
            y = x.children[c]
            self._collect(y, w + y.edge, out)
