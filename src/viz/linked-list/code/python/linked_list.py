class Node:
    def __init__(self, value):
        self.value = value
        self.next = None


class LinkedList:
    """A singly linked list with head and tail pointers. Indexes start at 0."""

    def __init__(self):
        self.head = None
        self.tail = None
        self.n = 0

    def insert_head(self, x):
        new = Node(x)
        new.next = self.head  # first link the new node in...
        self.head = new  # ...then move head, or the list is lost
        if self.tail is None:
            self.tail = new
        self.n += 1

    def insert_tail(self, x):
        new = Node(x)
        if self.head is None:
            self.head = new
        else:
            self.tail.next = new
        self.tail = new
        self.n += 1

    def insert_at(self, i, x):
        if i < 0 or i > self.n:
            raise IndexError("index out of range")
        new = Node(x)
        if i == 0:
            new.next = self.head
            self.head = new
        else:
            prev = self.head
            for _ in range(i - 1):
                prev = prev.next
            new.next = prev.next
            prev.next = new
        if new.next is None:
            self.tail = new
        self.n += 1

    def remove_head(self):
        if self.head is None:
            raise IndexError("list is empty")
        x = self.head.value
        self.head = self.head.next
        if self.head is None:
            self.tail = None
        self.n -= 1
        return x

    def remove_tail(self):
        if self.head is None:
            raise IndexError("list is empty")
        if self.head.next is None:
            x = self.head.value
            self.head = None
            self.tail = None
        else:
            prev = self.head
            while prev.next is not self.tail:  # walk: tail can't tell us its predecessor
                prev = prev.next
            x = prev.next.value
            prev.next = None
            self.tail = prev
        self.n -= 1
        return x

    def remove_at(self, i):
        if i < 0 or i >= self.n:
            raise IndexError("index out of range")
        prev, cur = None, self.head
        for _ in range(i):
            prev, cur = cur, cur.next
        self._unlink(prev, cur)
        return cur.value

    def remove_value(self, x):
        prev, cur = None, self.head
        while cur is not None and cur.value != x:
            prev, cur = cur, cur.next
        if cur is None:
            return False
        self._unlink(prev, cur)
        return True

    def _unlink(self, prev, cur):
        if prev is None:
            self.head = cur.next
        else:
            prev.next = cur.next
        if cur is self.tail:
            self.tail = prev
        self.n -= 1

    def search(self, x):
        cur, i = self.head, 0
        while cur is not None:
            if cur.value == x:
                return i
            cur = cur.next
            i += 1
        return -1

    def get(self, i):
        if i < 0 or i >= self.n:
            raise IndexError("index out of range")
        cur = self.head
        for _ in range(i):
            cur = cur.next
        return cur.value

    def reverse(self):
        prev, cur = None, self.head
        self.tail = self.head
        while cur is not None:
            nxt = cur.next  # save the rest of the list first
            cur.next = prev
            prev = cur
            cur = nxt
        self.head = prev

    def __iter__(self):
        cur = self.head
        while cur is not None:
            yield cur.value
            cur = cur.next
