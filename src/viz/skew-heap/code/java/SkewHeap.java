import java.util.NoSuchElementException;

/** A skew min-heap: a leftist heap that keeps no npl and always swaps. */
public class SkewHeap {
    private static class Node {
        int key;
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
    public void mergeWith(SkewHeap other) {
        root = merge(root, other.root);
        size += other.size;
        other.root = null;
        other.size = 0;
    }

    public void clear() {
        root = null;
        size = 0;
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
        Node t = h1.left; // always swap the children
        h1.left = h1.right;
        h1.right = t;
        return h1;
    }
}
