class _Node:
    def __init__(self, value):
        self.value = value
        self.next = None


class LinkedQueue:
    """A FIFO queue on a singly linked list: dequeue at head, enqueue after tail."""

    def __init__(self):
        self.head = None
        self.tail = None

    def enqueue(self, x):
        node = _Node(x)
        if self.tail is None:
            self.head = node
        else:
            self.tail.next = node
        self.tail = node

    def dequeue(self):
        if self.head is None:
            raise IndexError("queue underflow")
        x = self.head.value
        self.head = self.head.next
        if self.head is None:
            self.tail = None
        return x

    def peek(self):
        if self.head is None:
            raise IndexError("queue is empty")
        return self.head.value

    def is_empty(self):
        return self.head is None
