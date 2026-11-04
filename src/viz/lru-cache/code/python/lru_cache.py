class Node:
    def __init__(self, key, value):
        self.key, self.value = key, value
        self.prev = self.next = None


class LRUCache:
    """A hash map from key to node, plus a doubly linked list in order of use:
    head is the most recently used node, tail the least."""

    def __init__(self, capacity):
        self.capacity = capacity
        self.map = {}
        self.head = self.tail = None
        self.hits = self.misses = 0

    def _unlink(self, x):
        if x.prev is not None:
            x.prev.next = x.next
        else:
            self.head = x.next
        if x.next is not None:
            x.next.prev = x.prev
        else:
            self.tail = x.prev

    def _push_front(self, x):
        x.next = self.head
        x.prev = None
        if self.head is not None:
            self.head.prev = x
        else:
            self.tail = x
        self.head = x

    def get(self, k):
        x = self.map.get(k)
        if x is None:
            self.misses += 1
            return -1
        self.hits += 1
        if x is not self.head:
            self._unlink(x)
            self._push_front(x)
        return x.value

    def put(self, k, v):
        """Stores v under k. Returns the key it evicted, or None."""
        x = self.map.get(k)
        if x is not None:
            x.value = v
            if x is not self.head:
                self._unlink(x)
                self._push_front(x)
            return None
        evicted = None
        if len(self.map) == self.capacity:
            y = self.tail
            self._unlink(y)
            del self.map[y.key]
            evicted = y.key
        x = Node(k, v)
        self.map[k] = x
        self._push_front(x)
        return evicted

    def items(self):
        """(key, value) pairs from most to least recently used."""
        out, x = [], self.head
        while x is not None:
            out.append((x.key, x.value))
            x = x.next
        return out
