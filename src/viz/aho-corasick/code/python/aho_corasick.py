# Aho-Corasick: a trie of the patterns plus a failure link per node (the
# longest proper suffix of its string that is also in the trie) and an
# output link (the nearest node down the failure chain ending a pattern).
from collections import deque


class AhoCorasick:
    def __init__(self, patterns):
        self.kids = [{}]  # node -> {char: child}
        self.word = [None]  # the pattern ending at a node
        for p in patterns:
            u = 0
            for c in p:
                if c not in self.kids[u]:
                    self.kids.append({})
                    self.word.append(None)
                    self.kids[u][c] = len(self.kids) - 1
                u = self.kids[u][c]
            self.word[u] = p
        self._build_links()

    def _build_links(self):
        n = len(self.kids)
        self.fail = [0] * n
        self.dict = [None] * n
        queue = deque(self.kids[0].values())  # depth 1 fails to the root
        while queue:
            u = queue.popleft()
            for c, v in sorted(self.kids[u].items()):
                f = self.fail[u]
                while f and c not in self.kids[f]:
                    f = self.fail[f]
                g = self.kids[f].get(c, 0)
                self.fail[v] = g if g != v else 0
                t = self.fail[v]
                self.dict[v] = t if self.word[t] else self.dict[t]
                queue.append(v)

    def search(self, text):
        """(start, word) for every match, in the order the scan finds them."""
        found = []
        u = 0
        for i, c in enumerate(text):
            while u and c not in self.kids[u]:
                u = self.fail[u]
            u = self.kids[u].get(c, 0)
            d = u if self.word[u] else self.dict[u]
            while d is not None:  # this node's word, then the output links
                w = self.word[d]
                found.append((i - len(w) + 1, w))
                d = self.dict[d]
        return found
