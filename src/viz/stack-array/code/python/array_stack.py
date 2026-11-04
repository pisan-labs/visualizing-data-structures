class ArrayStack:
    """A stack stored in a fixed-size array. top counts the items."""

    def __init__(self, capacity):
        self.data = [None] * capacity
        self.top = 0

    def push(self, x):
        if self.top == len(self.data):
            raise OverflowError("stack overflow")
        self.data[self.top] = x
        self.top = self.top + 1

    def pop(self):
        if self.top == 0:
            raise IndexError("stack underflow")
        self.top = self.top - 1
        return self.data[self.top]

    def peek(self):
        if self.top == 0:
            raise IndexError("stack is empty")
        return self.data[self.top - 1]

    def clear(self):
        self.top = 0

    def is_empty(self):
        return self.top == 0
