import java.util.NoSuchElementException;

/** A binomial queue (CLRS: binomial heap), a min-heap. */
public class BinomialQueue {
    public static class Node {
        int key;
        int degree = 0;
        Node parent;
        Node child; // the leftmost child, of the highest degree
        Node sibling; // the next child to the right, or the next root

        Node(int key) {
            this.key = key;
        }
    }

    private Node head;
    private int size;

    public int size() {
        return size;
    }

    public Node insert(int key) {
        Node node = new Node(key);
        head = union(head, node);
        size++;
        return node;
    }

    public int findMin() {
        if (head == null) throw new NoSuchElementException("queue is empty");
        return minRoot()[1].key;
    }

    public int extractMin() {
        if (head == null) throw new NoSuchElementException("queue is empty");
        Node[] found = minRoot();
        Node prev = found[0];
        Node x = found[1];
        if (prev == null) head = x.sibling;
        else prev.sibling = x.sibling;
        Node kids = null; // reverse the children: a root list of their own
        for (Node c = x.child; c != null; ) {
            Node next = c.sibling;
            c.sibling = kids;
            c.parent = null;
            kids = c;
            c = next;
        }
        head = union(head, kids);
        size--;
        return x.key;
    }

    /** Moves every key of other into this queue; other ends up empty. */
    public void mergeWith(BinomialQueue other) {
        head = union(head, other.head);
        size += other.size;
        other.head = null;
        other.size = 0;
    }

    public void decreaseKey(Node x, int key) {
        if (key > x.key) throw new IllegalArgumentException("new key is greater than current key");
        x.key = key;
        Node y = x;
        Node z = y.parent;
        while (z != null && y.key < z.key) {
            int t = y.key;
            y.key = z.key;
            z.key = t;
            y = z;
            z = y.parent;
        }
    }

    /** The first node holding key: roots left to right, each tree in preorder. */
    public Node find(int key) {
        return search(head, key);
    }

    public void clear() {
        head = null;
        size = 0;
    }

    private static Node search(Node x, int key) {
        for (; x != null; x = x.sibling) {
            if (x.key == key) return x;
            Node found = search(x.child, key);
            if (found != null) return found;
        }
        return null;
    }

    /** The root with the smallest key, and the root before it. */
    private Node[] minRoot() {
        Node bestPrev = null;
        Node best = head;
        for (Node prev = head, x = head.sibling; x != null; prev = x, x = x.sibling) {
            if (x.key < best.key) {
                bestPrev = prev;
                best = x;
            }
        }
        return new Node[] {bestPrev, best};
    }

    /** Two roots of the same degree: y becomes the leftmost child of z. */
    private static void link(Node y, Node z) {
        y.parent = z;
        y.sibling = z.child;
        z.child = y;
        z.degree++;
    }

    /** Merge two root lists into one, in increasing degree. */
    private static Node mergeLists(Node a, Node b) {
        Node dummy = new Node(0);
        Node tail = dummy;
        while (a != null && b != null) {
            if (a.degree <= b.degree) {
                tail.sibling = a;
                a = a.sibling;
            } else {
                tail.sibling = b;
                b = b.sibling;
            }
            tail = tail.sibling;
        }
        tail.sibling = a != null ? a : b;
        return dummy.sibling;
    }

    /** Unite two root lists, linking trees of the same degree (CLRS cases 1 to 4). */
    private static Node union(Node h1, Node h2) {
        Node h = mergeLists(h1, h2);
        if (h == null) return null;
        Node prev = null;
        Node x = h;
        Node next = x.sibling;
        while (next != null) {
            Node sib = next.sibling;
            if (x.degree != next.degree || (sib != null && sib.degree == x.degree)) {
                prev = x;
                x = next;
            } else if (x.key <= next.key) {
                x.sibling = sib;
                link(next, x);
            } else {
                if (prev == null) h = next;
                else prev.sibling = next;
                link(x, next);
                x = next;
            }
            next = x.sibling;
        }
        return h;
    }
}
