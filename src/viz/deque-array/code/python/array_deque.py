class ArrayDeque:
    """A double-ended queue in a fixed-size circular array.

    front is the first item and rear is the slot after the last item.
    One slot always stays empty, so front == rear means empty.
    """

    def __init__(self, capacity):
        self.data = [None] * capacity
        self.front = 0
        self.rear = 0

    def is_full(self):
        return (self.rear + 1) % len(self.data) == self.front

    def is_empty(self):
        return self.front == self.rear

    def add_first(self, x):
        if self.is_full():
            raise OverflowError("deque overflow")
        # Python's % never returns a negative number here; Java and C++ can.
        self.front = (self.front - 1) % len(self.data)
        self.data[self.front] = x

    def add_last(self, x):
        if self.is_full():
            raise OverflowError("deque overflow")
        self.data[self.rear] = x
        self.rear = (self.rear + 1) % len(self.data)

    def remove_first(self):
        if self.is_empty():
            raise IndexError("deque underflow")
        x = self.data[self.front]
        self.front = (self.front + 1) % len(self.data)
        return x

    def remove_last(self):
        if self.is_empty():
            raise IndexError("deque underflow")
        self.rear = (self.rear - 1) % len(self.data)
        return self.data[self.rear]

    def peek_first(self):
        if self.is_empty():
            raise IndexError("deque is empty")
        return self.data[self.front]

    def peek_last(self):
        if self.is_empty():
            raise IndexError("deque is empty")
        return self.data[(self.rear - 1) % len(self.data)]
