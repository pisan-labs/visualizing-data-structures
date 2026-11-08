import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

/** A min pairing heap: a heap-ordered multiway tree stored as first child and next sibling. */
public class PairingHeap {
    public static class Node {
        int key;
        Node child, next, prev; // leftmost child, right sibling, left sibling or parent

        Node(int key) { this.key = key; }
    }

    private Node root;
    private int n;

    public int size() { return n; }

    /** Link two roots: the larger becomes the leftmost child of the smaller. */
    private static Node meld(Node a, Node b) {
        if (a == null) return b;
        if (b == null) return a;
        if (b.key < a.key) {
            Node t = a;
            a = b;
            b = t;
        }
        b.next = a.child;
        if (a.child != null) a.child.prev = b;
        b.prev = a;
        a.child = b;
        a.next = a.prev = null;
        return a;
    }

    public Node insert(int key) {
        Node x = new Node(key);
        root = meld(root, x);
        n++;
        return x; // keep it to call decreaseKey later
    }

    public void meldWith(PairingHeap other) {
        root = meld(root, other.root);
        n += other.n;
    }

    public int deleteMin() {
        if (root == null) throw new NoSuchElementException("heap is empty");
        int top = root.key;
        List<Node> trees = new ArrayList<>();
        for (Node c = root.child; c != null; ) {
            Node next = c.next;
            c.next = c.prev = null;
            trees.add(c);
            c = next;
        }
        // Pass 1: meld pairs, left to right.
        List<Node> pairs = new ArrayList<>();
        for (int i = 0; i < trees.size(); i += 2)
            pairs.add(meld(trees.get(i), i + 1 < trees.size() ? trees.get(i + 1) : null));
        // Pass 2: meld right to left.
        Node h = pairs.isEmpty() ? null : pairs.get(pairs.size() - 1);
        for (int i = pairs.size() - 2; i >= 0; i--) h = meld(pairs.get(i), h);
        root = h;
        n--;
        return top;
    }

    public void decreaseKey(Node x, int k) {
        if (k > x.key) throw new IllegalArgumentException("new key is larger");
        x.key = k;
        if (x == root) return;
        if (x.prev.child == x) x.prev.child = x.next;
        else x.prev.next = x.next;
        if (x.next != null) x.next.prev = x.prev;
        x.next = x.prev = null;
        root = meld(root, x);
    }

    /** The first node holding key, in preorder. Real code keeps the nodes insert returns. */
    public Node find(int key) {
        ArrayDeque<Node> stack = new ArrayDeque<>();
        if (root != null) stack.push(root);
        while (!stack.isEmpty()) {
            Node x = stack.pop();
            if (x.key == key) return x;
            if (x.next != null) stack.push(x.next);
            if (x.child != null) stack.push(x.child);
        }
        return null;
    }

    public void clear() {
        root = null;
        n = 0;
    }
}
