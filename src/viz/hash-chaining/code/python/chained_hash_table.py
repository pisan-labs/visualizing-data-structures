class Node:
    def __init__(self, key, next=None):
        self.key = key
        self.next = next


class ChainedHashTable:
    """Separate chaining: T[i] points at a linked list of the keys that hash to i."""

    def __init__(self, m):
        self.m = m
        self.T = [None] * m
        self.n = 0

    def h(self, k):
        return k % self.m  # the division method

    def insert(self, k):
        i = self.h(k)
        x = self.T[i]
        while x is not None:
            if x.key == k:
                return False  # already there
            x = x.next
        self.T[i] = Node(k, self.T[i])  # the new node goes first
        self.n += 1
        return True

    def search(self, k):
        x = self.T[self.h(k)]
        while x is not None:
            if x.key == k:
                return x
            x = x.next
        return None

    def delete(self, k):
        i = self.h(k)
        prev, x = None, self.T[i]
        while x is not None and x.key != k:
            prev, x = x, x.next
        if x is None:
            return False
        if prev is None:
            self.T[i] = x.next
        else:
            prev.next = x.next
        self.n -= 1
        return True

    def clear(self):
        self.T = [None] * self.m
        self.n = 0

    def load_factor(self):
        return self.n / self.m

    def chain(self, i):
        keys, x = [], self.T[i]
        while x is not None:
            keys.append(x.key)
            x = x.next
        return keys
