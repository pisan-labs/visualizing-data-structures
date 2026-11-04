class Node:
    def __init__(self, value):
        self.value = value
        self.next = None


def find_cycle(head):
    """Floyd's tortoise and hare, in O(1) extra space.

    Returns (mu, lam): the index where the cycle starts (the length of the tail before
    it) and the number of nodes in the cycle. Returns None if the list ends in None.
    """
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next  # the tortoise moves one node
        fast = fast.next.next  # the hare moves two
        if slow is fast:
            break
    if fast is None or fast.next is None:
        return None

    # Phase 2: the start of the cycle is as far from head as from the meeting point.
    slow = head
    mu = 0
    while slow is not fast:
        slow = slow.next
        fast = fast.next
        mu += 1

    # Phase 3: walk once around the cycle to measure it.
    lam = 1
    fast = slow.next
    while fast is not slow:
        fast = fast.next
        lam += 1
    return mu, lam
