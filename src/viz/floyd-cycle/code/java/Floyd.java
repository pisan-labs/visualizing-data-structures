/** Floyd's tortoise and hare: find a cycle in a linked list in O(1) extra space. */
public class Floyd {
    public static class Node<T> {
        T value;
        Node<T> next;

        Node(T value) {
            this.value = value;
        }
    }

    /**
     * Returns {mu, lambda}: the index where the cycle starts (the length of the tail before it)
     * and the number of nodes in the cycle. Returns null if the list ends in null.
     */
    public static <T> int[] findCycle(Node<T> head) {
        Node<T> slow = head;
        Node<T> fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next; // the tortoise moves one node
            fast = fast.next.next; // the hare moves two
            if (slow == fast) {
                break;
            }
        }
        if (fast == null || fast.next == null) {
            return null;
        }

        // Phase 2: the start of the cycle is as far from head as from the meeting point.
        slow = head;
        int mu = 0;
        while (slow != fast) {
            slow = slow.next;
            fast = fast.next;
            mu++;
        }

        // Phase 3: walk once around the cycle to measure it.
        int lambda = 1;
        fast = slow.next;
        while (fast != slow) {
            fast = fast.next;
            lambda++;
        }
        return new int[] {mu, lambda};
    }
}
