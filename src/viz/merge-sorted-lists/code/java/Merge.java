import java.util.ArrayList;
import java.util.List;

/** Merging sorted singly linked lists by relinking their nodes. */
public class Merge {
    public static class Node {
        int value;
        Node next;

        Node(int value, Node next) {
            this.value = value;
            this.next = next;
        }
    }

    /** Merge two sorted lists into one. O(length of a + length of b), no new nodes. */
    public static Node merge(Node a, Node b) {
        Node dummy = new Node(0, null); // a fake head: the first node is linked like every other
        Node tail = dummy;
        while (a != null && b != null) {
            if (a.value <= b.value) { // on a tie take a, so equal values keep their order
                tail.next = a;
                a = a.next;
            } else {
                tail.next = b;
                b = b.next;
            }
            tail = tail.next;
        }
        tail.next = (a != null) ? a : b; // the rest of the other list is already in order
        return dummy.next;
    }

    /** Merge k sorted lists in pairs, round after round: O(N log k). */
    public static Node mergeAll(List<Node> lists) {
        if (lists.isEmpty()) return null;
        while (lists.size() > 1) {
            List<Node> next = new ArrayList<>();
            for (int i = 0; i < lists.size(); i += 2) {
                next.add(i + 1 < lists.size() ? merge(lists.get(i), lists.get(i + 1)) : lists.get(i));
            }
            lists = next;
        }
        return lists.get(0);
    }
}
