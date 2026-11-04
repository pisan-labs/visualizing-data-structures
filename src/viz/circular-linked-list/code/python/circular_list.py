class Node:
    def __init__(self, value):
        self.value = value
        self.next = None


class CircularLinkedList:
    """A singly linked circular list with only a tail pointer. tail.next is the front."""

    def __init__(self):
        self.tail = None
        self.n = 0

    def insert_front(self, x):
        new = Node(x)
        if self.tail is None:
            new.next = new  # one node: the node after the last one is itself
            self.tail = new
        else:
            new.next = self.tail.next
            self.tail.next = new
        self.n += 1

    def insert_back(self, x):
        self.insert_front(x)  # the new node goes right after tail...
        self.tail = self.tail.next  # ...and moving tail makes it the back

    def remove_front(self):
        if self.tail is None:
            raise IndexError("list is empty")
        first = self.tail.next
        if first is self.tail:
            self.tail = None
        else:
            self.tail.next = first.next
        self.n -= 1
        return first.value

    def rotate(self):
        if self.tail is not None:
            self.tail = self.tail.next

    def traverse(self):
        values = []
        if self.tail is None:
            return values
        cur = self.tail.next
        while True:
            values.append(cur.value)
            cur = cur.next
            if cur is self.tail.next:  # back at the front: stop, there is no null
                return values

    def search(self, x):
        if self.tail is None:
            return -1
        cur, i = self.tail.next, 0
        while True:
            if cur.value == x:
                return i
            cur, i = cur.next, i + 1
            if cur is self.tail.next:
                return -1
