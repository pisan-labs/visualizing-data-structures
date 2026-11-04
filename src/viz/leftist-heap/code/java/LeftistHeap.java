import java.util.NoSuchElementException;

/** A leftist min-heap. npl(null) = -1, so a leaf has npl 0. */
public class LeftistHeap {
    private static class Node {
        int key;
        int npl = 0;
        Node left;
        Node right;

        Node(int key) {
            this.key = key;
        }
    }

    private Node root;
    private int size;

    public int size() {
        return size;
    }

    public void insert(int key) {
        root = merge(root, new Node(key));
        size++;
    }

    public int deleteMin() {
        if (root == null) {
            throw new NoSuchElementException("heap is empty");
        }
        int min = root.key;
        root = merge(root.left, root.right);
        size--;
        return min;
    }

    /** Moves every key of other into this heap; other ends up empty. */
    public void mergeWith(LeftistHeap other) {
        root = merge(root, other.root);
        size += other.size;
        other.root = null;
        other.size = 0;
    }

    public void clear() {
        root = null;
        size = 0;
    }

    private static int npl(Node x) {
        return x == null ? -1 : x.npl;
    }

    private static Node merge(Node h1, Node h2) {
        if (h1 == null) return h2;
        if (h2 == null) return h1;
        if (h2.key < h1.key) {
            Node t = h1;
            h1 = h2;
            h2 = t;
        }
        h1.right = merge(h1.right, h2);
        if (npl(h1.left) < npl(h1.right)) {
            Node t = h1.left;
            h1.left = h1.right;
            h1.right = t;
        }
        h1.npl = npl(h1.right) + 1;
        return h1;
    }
}
