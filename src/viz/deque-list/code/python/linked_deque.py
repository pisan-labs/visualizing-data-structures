class _Node:
    def __init__(self, value):
        self.value = value
        self.prev = None
        self.next = None


class LinkedDeque:
    """A double-ended queue on a doubly linked list with head and tail."""

    def __init__(self):
        self.head = None
        self.tail = None

    def add_first(self, x):
        node = _Node(x)
        node.next = self.head
        if self.head is None:
            self.tail = node
        else:
            self.head.prev = node
        self.head = node

    def add_last(self, x):
        node = _Node(x)
        node.prev = self.tail
        if self.tail is None:
            self.head = node
        else:
            self.tail.next = node
        self.tail = node

    def remove_first(self):
        if self.head is None:
            raise IndexError("deque underflow")
        x = self.head.value
        self.head = self.head.next
        if self.head is None:
            self.tail = None
        else:
            self.head.prev = None
        return x

    def remove_last(self):
        if self.tail is None:
            raise IndexError("deque underflow")
        x = self.tail.value
        self.tail = self.tail.prev
        if self.tail is None:
            self.head = None
        else:
            self.tail.next = None
        return x

    def peek_first(self):
        if self.head is None:
            raise IndexError("deque is empty")
        return self.head.value

    def peek_last(self):
        if self.tail is None:
            raise IndexError("deque is empty")
        return self.tail.value
