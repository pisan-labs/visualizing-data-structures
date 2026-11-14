import random


class RandomizedSet:
    """A set with insert, remove and a random value, all O(1) expected."""

    def __init__(self, pick=random.randrange):
        self.items = []  # the values, in no particular order
        self.index = {}  # value -> its index in items
        self.pick = pick  # pick(n) returns a random index from 0 to n - 1

    def insert(self, x):
        if x in self.index:
            return False
        self.index[x] = len(self.items)
        self.items.append(x)
        return True

    def remove(self, x):
        i = self.index.get(x)
        if i is None:
            return False
        last = self.items[-1]
        self.items[i] = last  # fill the hole with the last value
        self.items.pop()
        self.index[last] = i
        del self.index[x]
        return True

    def get_random(self):
        return self.items[self.pick(len(self.items))]

    def __len__(self):
        return len(self.items)
