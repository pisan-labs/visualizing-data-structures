class Node:
    def __init__(self, start, end, leaf=None):
        self.start, self.end = start, end  # edge label is s[start:end]
        self.kids = {}  # first character -> child
        self.leaf = leaf  # where the suffix starts, for a leaf


class SuffixTree:
    """Suffix tree of t + "$", built by inserting each suffix into a compressed trie."""

    def __init__(self, t):
        self.s = s = t + "$"
        self.root = Node(0, 0)
        for i in range(len(s)):
            self._insert(i)

    def _insert(self, i):
        s, u, j = self.s, self.root, i
        while True:
            child = u.kids.get(s[j])
            if child is None:  # no edge starts with s[j]: new leaf
                u.kids[s[j]] = Node(j, len(s), i)
                return
            k = 0
            while k < child.end - child.start and s[child.start + k] == s[j + k]:
                k += 1
            if k == child.end - child.start:  # whole edge matched: go down
                u, j = child, j + k
                continue
            mid = Node(child.start, child.start + k)  # split the edge after k chars
            u.kids[s[j]] = mid
            child.start += k
            mid.kids[s[child.start]] = child
            mid.kids[s[j + k]] = Node(j + k, len(s), i)
            return

    def label(self, u):
        return self.s[u.start:u.end]

    def _walk(self, p):
        """The node where the path for p ends (or inside whose edge), or None."""
        u, j = self.root, 0
        while j < len(p):
            child = u.kids.get(p[j])
            if child is None:
                return None
            edge = self.label(child)
            k = 0
            while k < len(edge) and j + k < len(p):
                if edge[k] != p[j + k]:
                    return None
                k += 1
            u, j = child, j + k
        return u

    def leaves(self, u):
        if u.leaf is not None:
            return [u.leaf]
        return [x for c in u.kids.values() for x in self.leaves(c)]

    def search(self, p):
        u = self._walk(p)
        return sorted(self.leaves(u)) if u else []

    def count(self, p):
        u = self._walk(p)
        return len(self.leaves(u)) if u else 0

    def longest_repeat(self):
        """Path label of the deepest internal node (first in sorted order on ties)."""
        best = ""
        stack = [(self.root, "")]
        while stack:
            u, path = stack.pop()
            if u.leaf is None and len(path) > len(best):
                best = path
            for ch in sorted(u.kids, reverse=True):  # pop in sorted order
                c = u.kids[ch]
                stack.append((c, path + self.label(c)))
        return best
