class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


def merge(a, b):
    """Merge two sorted lists into one by relinking their nodes. O(len(a) + len(b))."""
    dummy = tail = Node(None)  # a fake head: the first node is linked like every other
    while a and b:
        if a.value <= b.value:  # on a tie take a, so equal values keep their order
            tail.next, a = a, a.next
        else:
            tail.next, b = b, b.next
        tail = tail.next
    tail.next = a or b  # one list is used up: the rest of the other is already in order
    return dummy.next


def merge_all(lists):
    """Merge k sorted lists in pairs, round after round: O(N log k)."""
    while len(lists) > 1:
        lists = [
            merge(lists[i], lists[i + 1]) if i + 1 < len(lists) else lists[i]
            for i in range(0, len(lists), 2)
        ]
    return lists[0] if lists else None
