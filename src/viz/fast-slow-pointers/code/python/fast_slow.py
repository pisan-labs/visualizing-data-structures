class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


def middle(head):
    """The middle node. With two middles (an even count), the second."""
    slow = fast = head
    while fast and fast.next:
        slow = slow.next  # one node
        fast = fast.next.next  # two nodes
    return slow


def first_middle(head):
    """The middle node. With two middles, the first: fast stops one node earlier."""
    slow = fast = head
    while fast.next and fast.next.next:
        slow = slow.next
        fast = fast.next.next
    return slow


def kth_from_end(head, k):
    """The k-th node from the end (k = 1 is the last), or None if the list is shorter."""
    fast = head
    for _ in range(k):  # a gap of k
        if fast is None:
            return None
        fast = fast.next
    slow = head
    while fast:
        slow, fast = slow.next, fast.next
    return slow


def reverse(head):
    """Turn the next pointers around; return the new first node."""
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev, head = head, nxt
    return prev


def is_palindrome(head):
    """Same values forwards and backwards? O(1) extra space; the list is put back."""
    back = reverse(middle(head))  # the second half, turned around
    left, right = head, back
    same = True
    while right:
        if left.value != right.value:
            same = False
            break
        left, right = left.next, right.next
    reverse(back)  # put the second half back as it was
    return same
