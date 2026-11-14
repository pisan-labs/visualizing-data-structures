class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next


def reverse_k_group(head, k, reverse_rest=False):
    """Reverse the list in groups of k nodes, in place. A last group shorter than k stays as
    it is, or is reversed too with reverse_rest. O(n) time, O(1) extra space."""
    dummy = Node(None, head)  # gives the first group a node before it
    before = dummy  # the node before the next group
    while before.next:
        kth, count = before, 0
        while count < k and kth.next:  # find the group's last node
            kth = kth.next
            count += 1
        if count < k and not reverse_rest:
            break  # a short last group stays as it is
        after = kth.next
        prev, cur = after, before.next  # the group's new last node will point at the rest
        first = cur
        while cur is not after:
            nxt = cur.next
            cur.next = prev
            prev, cur = cur, nxt
        before.next = kth  # link the turned-around group in
        before = first  # its old first node is now its last
    return dummy.next
