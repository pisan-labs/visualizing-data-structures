from collections import OrderedDict, defaultdict


class LFUCache:
    """Evicts the key used the fewest times; on a tie, the least recently used of them.

    entries maps a key to [value, freq]. lists maps each frequency f to the keys used f
    times, least recently used first: an OrderedDict is a hash map threaded on a doubly
    linked list, so removing any key and taking the oldest are both O(1). min_freq is the
    smallest frequency in use."""

    def __init__(self, capacity):
        self.capacity = capacity
        self.entries = {}
        self.lists = defaultdict(OrderedDict)
        self.min_freq = 0
        self.hits = self.misses = 0

    def _bump(self, k):
        """Moves k from the list for its frequency to the tail of the next one."""
        entry = self.entries[k]
        f = entry[1]
        del self.lists[f][k]
        if not self.lists[f]:
            del self.lists[f]
            if self.min_freq == f:
                self.min_freq = f + 1
        entry[1] = f + 1
        self.lists[f + 1][k] = None

    def get(self, k):
        if k not in self.entries:
            self.misses += 1
            return -1
        self.hits += 1
        self._bump(k)
        return self.entries[k][0]

    def put(self, k, v):
        """Stores v under k. Returns the key it evicted, or None."""
        if k in self.entries:
            self.entries[k][0] = v
            self._bump(k)
            return None
        evicted = None
        if len(self.entries) == self.capacity:
            oldest = self.lists[self.min_freq]
            evicted, _ = oldest.popitem(last=False)
            if not oldest:
                del self.lists[self.min_freq]
            del self.entries[evicted]
        self.entries[k] = [v, 1]
        self.lists[1][k] = None
        self.min_freq = 1
        return evicted
