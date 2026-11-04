class Node:
    def __init__(self, value=None):
        self.value = value
        self.next = None
        self.prev = None


class DoublyLinkedList:
    """A doubly linked list with one sentinel node, nil. Indexes start at 0.

    nil.next is the first node and nil.prev the last. An empty list is nil pointing
    at itself both ways, so linking and unlinking never meet a null pointer.
    """

    def __init__(self):
        self.nil = Node()
        self.nil.next = self.nil
        self.nil.prev = self.nil
        self.n = 0

    def _link_before(self, succ, x):
        new = Node(x)
        new.next = succ
        new.prev = succ.prev
        succ.prev.next = new  # while succ.prev is still the node before succ
        succ.prev = new
        self.n += 1

    def _unlink(self, cur):
        cur.prev.next = cur.next
        cur.next.prev = cur.prev
        cur.next = None
        cur.prev = None
        self.n -= 1
        return cur.value

    def _node_at(self, i):
        if 2 * i < self.n:  # front half: walk forward from the first node
            cur = self.nil.next
            for _ in range(i):
                cur = cur.next
        else:  # back half: walk back from the last node
            cur = self.nil.prev
            for _ in range(self.n - 1 - i):
                cur = cur.prev
        return cur

    def insert_head(self, x):
        self._link_before(self.nil.next, x)

    def insert_tail(self, x):
        self._link_before(self.nil, x)

    def insert_at(self, i, x):
        if i < 0 or i > self.n:
            raise IndexError("index out of range")
        self._link_before(self.nil if i == self.n else self._node_at(i), x)

    def remove_head(self):
        if self.nil.next is self.nil:
            raise IndexError("list is empty")
        return self._unlink(self.nil.next)

    def remove_tail(self):
        if self.nil.prev is self.nil:
            raise IndexError("list is empty")
        return self._unlink(self.nil.prev)

    def remove_at(self, i):
        if i < 0 or i >= self.n:
            raise IndexError("index out of range")
        return self._unlink(self._node_at(i))

    def remove_value(self, x):
        cur = self.nil.next
        while cur is not self.nil and cur.value != x:
            cur = cur.next
        if cur is self.nil:
            return False
        self._unlink(cur)
        return True

    def search(self, x):
        cur, i = self.nil.next, 0
        while cur is not self.nil:
            if cur.value == x:
                return i
            cur, i = cur.next, i + 1
        return -1

    def get(self, i):
        if i < 0 or i >= self.n:
            raise IndexError("index out of range")
        return self._node_at(i).value

    def reverse(self):
        cur = self.nil.next
        while cur is not self.nil:
            tmp = cur.next
            cur.next = cur.prev
            cur.prev = tmp
            cur = tmp
        self.nil.next, self.nil.prev = self.nil.prev, self.nil.next

    def __iter__(self):
        cur = self.nil.next
        while cur is not self.nil:
            yield cur.value
            cur = cur.next
