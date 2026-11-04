import random


class Node:
    def __init__(self, key, level):
        self.key = key
        self.next = [None] * level  # next[i] is the next node on level i + 1


class SkipList:
    """A skip list, after Pugh. A new node starts 1 level tall and grows one
    level per heads, up to max_level. Keys are not repeated."""

    def __init__(self, p=0.5, max_level=5, seed=1):
        self.p = p
        self.max_level = max_level
        self.head = Node(None, max_level)
        self.level = 0  # levels in use
        self.random = random.Random(seed)

    def _random_level(self):
        lvl = 1
        while self.random.random() < self.p and lvl < self.max_level:
            lvl += 1
        return lvl

    def _find(self, k):
        """The last node before k on every level (the head on unused levels)."""
        update = [self.head] * self.max_level
        x = self.head
        for i in reversed(range(self.level)):
            while x.next[i] is not None and x.next[i].key < k:
                x = x.next[i]  # right while the next key is smaller
            update[i] = x  # then down
        return update

    def search(self, k):
        x = self._find(k)[0].next[0]
        return x is not None and x.key == k

    def insert(self, k):
        update = self._find(k)
        x = update[0].next[0]
        if x is not None and x.key == k:
            return False
        lvl = self._random_level()
        self.level = max(self.level, lvl)
        z = Node(k, lvl)
        for i in range(lvl):
            z.next[i] = update[i].next[i]
            update[i].next[i] = z
        return True

    def delete(self, k):
        update = self._find(k)
        x = update[0].next[0]
        if x is None or x.key != k:
            return False
        for i in range(len(x.next)):
            update[i].next[i] = x.next[i]
        while self.level > 0 and self.head.next[self.level - 1] is None:
            self.level -= 1  # the top level is empty
        return True

    def keys(self):
        """All keys in order, along level 1."""
        out = []
        x = self.head.next[0]
        while x is not None:
            out.append(x.key)
            x = x.next[0]
        return out
