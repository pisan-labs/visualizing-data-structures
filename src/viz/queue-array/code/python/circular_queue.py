class CircularQueue:
    """A FIFO queue in a fixed-size circular array.

    rear is the next free slot. One slot always stays empty,
    so front == rear means empty and the queue holds capacity - 1 items.
    """

    def __init__(self, capacity):
        self.data = [None] * capacity
        self.front = 0
        self.rear = 0

    def enqueue(self, x):
        if (self.rear + 1) % len(self.data) == self.front:
            raise OverflowError("queue overflow")
        self.data[self.rear] = x
        self.rear = (self.rear + 1) % len(self.data)

    def dequeue(self):
        if self.front == self.rear:
            raise IndexError("queue underflow")
        x = self.data[self.front]
        self.front = (self.front + 1) % len(self.data)
        return x

    def peek(self):
        if self.front == self.rear:
            raise IndexError("queue is empty")
        return self.data[self.front]

    def clear(self):
        self.front = 0
        self.rear = 0

    def __len__(self):
        return (self.rear - self.front) % len(self.data)
