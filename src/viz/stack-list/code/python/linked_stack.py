class _Node:
    def __init__(self, value, next):
        self.value = value
        self.next = next


class LinkedStack:
    """A stack on a singly linked list. top is the head of the list."""

    def __init__(self):
        self.top = None

    def push(self, x):
        node = _Node(x, None)
        node.next = self.top
        self.top = node

    def pop(self):
        if self.top is None:
            raise IndexError("stack underflow")
        x = self.top.value
        self.top = self.top.next
        return x

    def peek(self):
        if self.top is None:
            raise IndexError("stack is empty")
        return self.top.value

    def is_empty(self):
        return self.top is None
