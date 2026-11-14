/** Fast and slow pointers on a singly linked list. */
public class FastSlow {
    public static class Node {
        int value;
        Node next;

        Node(int value, Node next) {
            this.value = value;
            this.next = next;
        }
    }

    /** The middle node. With two middles (an even count), the second. */
    public static Node middle(Node head) {
        Node slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next; // one node
            fast = fast.next.next; // two nodes
        }
        return slow;
    }

    /** The middle node. With two middles, the first: fast stops one node earlier. */
    public static Node firstMiddle(Node head) {
        Node slow = head, fast = head;
        while (fast.next != null && fast.next.next != null) {
            slow = slow.next;
            fast = fast.next.next;
        }
        return slow;
    }

    /** The k-th node from the end (k = 1 is the last), or null if the list is shorter. */
    public static Node kthFromEnd(Node head, int k) {
        Node fast = head;
        for (int i = 0; i < k; i++) { // a gap of k
            if (fast == null) return null;
            fast = fast.next;
        }
        Node slow = head;
        while (fast != null) {
            slow = slow.next;
            fast = fast.next;
        }
        return slow;
    }

    /** Turn the next pointers around; return the new first node. */
    static Node reverse(Node head) {
        Node prev = null;
        while (head != null) {
            Node next = head.next;
            head.next = prev;
            prev = head;
            head = next;
        }
        return prev;
    }

    /** Same values forwards and backwards? O(1) extra space; the list is put back. */
    public static boolean isPalindrome(Node head) {
        Node back = reverse(middle(head)); // the second half, turned around
        boolean same = true;
        for (Node left = head, right = back; right != null; left = left.next, right = right.next) {
            if (left.value != right.value) {
                same = false;
                break;
            }
        }
        reverse(back); // put the second half back as it was
        return same;
    }
}
