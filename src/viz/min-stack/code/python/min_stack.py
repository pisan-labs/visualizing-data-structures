class MinStack:
    """A stack that also returns its minimum in O(1), with a second stack of minimums."""

    def __init__(self):
        self.items = []
        self.mins = []  # mins[-1] is always the smallest value in items

    def push(self, x):
        self.items.append(x)
        if not self.mins or x <= self.mins[-1]:
            self.mins.append(x)

    def pop(self):
        x = self.items.pop()  # IndexError if the stack is empty
        if x == self.mins[-1]:
            self.mins.pop()
        return x

    def top(self):
        return self.items[-1]

    def get_min(self):
        return self.mins[-1]

    def __len__(self):
        return len(self.items)
