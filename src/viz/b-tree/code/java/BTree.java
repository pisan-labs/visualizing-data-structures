import java.util.ArrayList;
import java.util.List;

/**
 * A B-tree of minimum degree t, as in CLRS. Every node except the root holds t - 1 to 2t - 1
 * keys. Keys are not repeated.
 */
public class BTree {
    static class Node {
        final List<Integer> keys = new ArrayList<>();
        final List<Node> children = new ArrayList<>(); // empty for a leaf

        boolean leaf() {
            return children.isEmpty();
        }
    }

    final int t;
    Node root = new Node();

    BTree(int t) {
        this.t = t;
    }

    public boolean search(int k) {
        Node x = root;
        while (true) {
            int i = 0;
            while (i < x.keys.size() && k > x.keys.get(i)) i++;
            if (i < x.keys.size() && k == x.keys.get(i)) return true;
            if (x.leaf()) return false;
            x = x.children.get(i); // a disk read in a real B-tree
        }
    }

    public boolean insert(int k) {
        if (search(k)) return false;
        Node r = root;
        if (r.keys.size() == 2 * t - 1) { // a full root splits first
            root = new Node();
            root.children.add(r);
            splitChild(root, 0);
        }
        insertNonfull(root, k);
        return true;
    }

    /** Split x's full child y = x.children[i] around its middle key. */
    private void splitChild(Node x, int i) {
        Node y = x.children.get(i);
        Node z = new Node();
        z.keys.addAll(y.keys.subList(t, y.keys.size()));
        x.keys.add(i, y.keys.get(t - 1)); // the middle key moves up
        x.children.add(i + 1, z);
        y.keys.subList(t - 1, y.keys.size()).clear();
        if (!y.leaf()) {
            z.children.addAll(y.children.subList(t, y.children.size()));
            y.children.subList(t, y.children.size()).clear();
        }
    }

    private void insertNonfull(Node x, int k) {
        int i = x.keys.size();
        while (i > 0 && k < x.keys.get(i - 1)) i--;
        if (x.leaf()) {
            x.keys.add(i, k);
            return;
        }
        if (x.children.get(i).keys.size() == 2 * t - 1) { // split on the way down
            splitChild(x, i);
            if (k > x.keys.get(i)) i++;
        }
        insertNonfull(x.children.get(i), k);
    }

    public boolean delete(int k) {
        boolean found = delete(root, k);
        if (root.keys.isEmpty() && !root.leaf()) root = root.children.get(0); // shorter
        return found;
    }

    /** Delete k under x, which has at least t keys (or is the root). */
    private boolean delete(Node x, int k) {
        int i = 0;
        while (i < x.keys.size() && k > x.keys.get(i)) i++;
        boolean here = i < x.keys.size() && x.keys.get(i) == k;
        if (x.leaf()) { // case 1
            if (here) x.keys.remove(i);
            return here;
        }
        if (here) { // case 2: k is in this internal node
            Node y = x.children.get(i);
            Node z = x.children.get(i + 1);
            if (y.keys.size() >= t) { // 2a: the predecessor moves up
                x.keys.set(i, max(y));
                return delete(y, x.keys.get(i));
            }
            if (z.keys.size() >= t) { // 2b: the successor moves up
                x.keys.set(i, min(z));
                return delete(z, x.keys.get(i));
            }
            merge(x, i); // 2c
            return delete(y, k);
        }
        Node c = x.children.get(i); // case 3: k can only be under c
        if (c.keys.size() == t - 1) {
            Node left = i > 0 ? x.children.get(i - 1) : null;
            Node right = i < x.keys.size() ? x.children.get(i + 1) : null;
            if (left != null && left.keys.size() >= t) { // 3a: borrow from the left
                c.keys.add(0, x.keys.get(i - 1));
                x.keys.set(i - 1, left.keys.remove(left.keys.size() - 1));
                if (!left.leaf()) c.children.add(0, left.children.remove(left.children.size() - 1));
            } else if (right != null && right.keys.size() >= t) { // 3a: borrow from the right
                c.keys.add(x.keys.get(i));
                x.keys.set(i, right.keys.remove(0));
                if (!right.leaf()) c.children.add(right.children.remove(0));
            } else if (right != null) { // 3b: merge with the right sibling
                merge(x, i);
            } else { // 3b: merge with the left sibling
                merge(x, i - 1);
                c = left;
            }
        }
        return delete(c, k);
    }

    /** Merge x.children[i], x.keys[i] and x.children[i + 1] into one node. */
    private void merge(Node x, int i) {
        Node y = x.children.get(i);
        Node z = x.children.remove(i + 1);
        y.keys.add(x.keys.remove(i));
        y.keys.addAll(z.keys);
        y.children.addAll(z.children);
    }

    private static int max(Node x) {
        while (!x.leaf()) x = x.children.get(x.children.size() - 1);
        return x.keys.get(x.keys.size() - 1);
    }

    private static int min(Node x) {
        while (!x.leaf()) x = x.children.get(0);
        return x.keys.get(0);
    }

    /** All keys in order. */
    public List<Integer> keys() {
        List<Integer> out = new ArrayList<>();
        walk(root, out);
        return out;
    }

    private static void walk(Node x, List<Integer> out) {
        for (int i = 0; i < x.keys.size(); i++) {
            if (!x.leaf()) walk(x.children.get(i), out);
            out.add(x.keys.get(i));
        }
        if (!x.leaf()) walk(x.children.get(x.children.size() - 1), out);
    }
}
