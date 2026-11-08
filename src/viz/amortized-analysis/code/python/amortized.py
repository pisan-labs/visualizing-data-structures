"""Two structures that count their own work, and a bank for the accounting method."""


def double(capacity):
    return max(1, 2 * capacity)


class DynamicArray:
    """An array that grows when it is full.

    append returns its actual cost: 1 for the write, plus 1 for every
    item a grow copies into the new array.
    """

    def __init__(self, grow=double):
        self.grow = grow  # the new capacity for a full array
        self.data = []
        self.size = 0

    def append(self, x):
        cost = 0
        if self.size == len(self.data):
            bigger = [None] * self.grow(len(self.data))
            for i in range(self.size):
                bigger[i] = self.data[i]
                cost += 1
            self.data = bigger
        self.data[self.size] = x
        self.size += 1
        return cost + 1


class BinaryCounter:
    """A k-bit counter. increment returns how many bits it flipped."""

    def __init__(self, k=8):
        self.bits = [0] * k  # bits[0] is the lowest bit

    def increment(self):
        cost = 0
        i = 0
        while i < len(self.bits) and self.bits[i] == 1:
            self.bits[i] = 0
            cost += 1
            i += 1
        if i < len(self.bits):
            self.bits[i] = 1
            cost += 1
        return cost


class Bank:
    """The accounting method: every operation pays `charge` coins in,
    and its actual cost comes out. The charge is big enough only if
    the balance never goes below zero."""

    def __init__(self, charge):
        self.charge = charge
        self.balance = 0

    def pay(self, cost):
        self.balance += self.charge - cost
        return self.balance
