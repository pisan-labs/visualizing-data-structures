class Node:
    def __init__(self):
        self.children = {}  # letter -> Node
        self.end = False  # a word ends here


class Trie:
    """A trie of lowercase words. Delete removes the nodes that no longer lead to a word."""

    def __init__(self):
        self.root = Node()

    def insert(self, word):
        """Add word. Returns False if it was already there."""
        x = self.root
        for c in word:
            if c not in x.children:
                x.children[c] = Node()
            x = x.children[c]
        if x.end:
            return False
        x.end = True
        return True

    def search(self, word):
        x = self._find(word)
        return x is not None and x.end

    def delete(self, word):
        """Remove word. Returns False if it was not there."""
        path = [self.root]  # the nodes from the root down to the word's last letter
        for c in word:
            x = path[-1].children.get(c)
            if x is None:
                return False
            path.append(x)
        if not path[-1].end:
            return False
        path[-1].end = False
        # Walk back up, cutting off the nodes that lead nowhere.
        for i in range(len(word), 0, -1):
            x = path[i]
            if x.end or x.children:
                break
            del path[i - 1].children[word[i - 1]]
        return True

    def starts_with(self, prefix):
        """Every word that starts with prefix, in alphabetical order."""
        out = []
        x = self._find(prefix)
        if x is not None:
            self._collect(x, prefix, out)
        return out

    def _find(self, s):
        x = self.root
        for c in s:
            x = x.children.get(c)
            if x is None:
                return None
        return x

    def _collect(self, x, s, out):
        if x.end:
            out.append(s)
        for c in sorted(x.children):
            self._collect(x.children[c], s + c, out)
