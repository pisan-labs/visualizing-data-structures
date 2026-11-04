import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

/** A Fibonacci heap (CLRS chapter 19), a min-heap. */
public class FibonacciHeap {
    public static class Node {
        int key;
        int degree = 0;
        boolean mark = false;
        Node parent;
        Node child; // any one child
        Node left = this; // a circular list of one
        Node right = this;

        Node(int key) {
            this.key = key;
        }
    }

    private static final double PHI = (1 + Math.sqrt(5)) / 2;
    private Node min;
    private int size;

    public int size() {
        return size;
    }

    public Node insert(int key) {
        Node x = new Node(key);
        addRoot(x);
        size++;
        return x;
    }

    public int minimum() {
        if (min == null) throw new NoSuchElementException("heap is empty");
        return min.key;
    }

    /** Moves every key of other into this heap; other ends up empty. */
    public void mergeWith(FibonacciHeap other) {
        if (other.min != null) {
            if (min == null) {
                min = other.min;
            } else {
                splice(min, other.min);
                if (other.min.key < min.key) min = other.min;
            }
        }
        size += other.size;
        other.min = null;
        other.size = 0;
    }

    public int extractMin() {
        Node z = min;
        if (z == null) throw new NoSuchElementException("heap is empty");
        if (z.child != null) {
            for (Node x : nodesOf(z.child)) {
                x.parent = null;
                x.mark = false;
            }
            splice(z, z.child);
            z.child = null;
        }
        if (z.right == z) {
            min = null;
        } else {
            min = z.right;
            unlink(z);
            consolidate();
        }
        size--;
        return z.key;
    }

    public void decreaseKey(Node x, int key) {
        if (key > x.key) throw new IllegalArgumentException("new key is greater than current key");
        x.key = key;
        Node y = x.parent;
        if (y != null && x.key < y.key) {
            cut(x, y);
            cascadingCut(y);
        }
        if (x.key < min.key) min = x;
    }

    public void delete(Node x) {
        decreaseKey(x, Integer.MIN_VALUE);
        extractMin();
    }

    /** A node holding key, or null. */
    public Node find(int key) {
        return search(min, key);
    }

    public void clear() {
        min = null;
        size = 0;
    }

    private static Node search(Node start, int key) {
        if (start == null) return null;
        for (Node x : nodesOf(start)) {
            if (x.key == key) return x;
            Node found = search(x.child, key);
            if (found != null) return found;
        }
        return null;
    }

    private void addRoot(Node x) {
        x.parent = null;
        x.mark = false;
        if (min == null) {
            x.left = x;
            x.right = x;
            min = x;
        } else {
            splice(min.left, x); // just left of min
            if (x.key < min.key) min = x;
        }
    }

    private void consolidate() {
        Node[] table = new Node[(int) (Math.log(size) / Math.log(PHI)) + 2];
        for (Node w : nodesOf(min)) {
            Node x = w;
            int d = x.degree;
            while (table[d] != null) {
                Node y = table[d];
                if (x.key > y.key) {
                    Node t = x;
                    x = y;
                    y = t;
                }
                link(y, x);
                table[d] = null;
                d++;
            }
            table[d] = x;
        }
        min = null;
        for (Node x : table) {
            if (x != null) {
                x.left = x;
                x.right = x;
                addRoot(x);
            }
        }
    }

    /** Root y becomes a child of root x. */
    private static void link(Node y, Node x) {
        unlink(y);
        y.parent = x;
        y.mark = false;
        if (x.child == null) x.child = y;
        else splice(x.child, y);
        x.degree++;
    }

    private void cut(Node x, Node y) {
        if (x.right == x) {
            y.child = null;
        } else {
            if (y.child == x) y.child = x.right;
            unlink(x);
        }
        y.degree--;
        addRoot(x);
    }

    private void cascadingCut(Node y) {
        for (Node z = y.parent; z != null; y = z, z = z.parent) {
            if (!y.mark) {
                y.mark = true;
                return;
            }
            cut(y, z);
        }
    }

    /** The nodes of the circular list that x is in, starting at x. */
    private static List<Node> nodesOf(Node x) {
        List<Node> out = new ArrayList<>();
        Node y = x;
        do {
            out.add(y);
            y = y.right;
        } while (y != x);
        return out;
    }

    /** Join the circular lists that a and b are in. */
    private static void splice(Node a, Node b) {
        Node aRight = a.right;
        Node bLeft = b.left;
        a.right = b;
        b.left = a;
        bLeft.right = aRight;
        aRight.left = bLeft;
    }

    /** Take x out of its list; it becomes a list of one. */
    private static void unlink(Node x) {
        x.left.right = x.right;
        x.right.left = x.left;
        x.left = x;
        x.right = x;
    }
}
