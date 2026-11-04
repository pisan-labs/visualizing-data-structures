import java.util.ArrayList;
import java.util.List;

/**
 * A 2-4 tree, as in Goodrich and Tamassia: every node has 2, 3 or 4 children and every leaf is
 * at the same depth. Keys are not repeated.
 */
public class TwoFourTree {
    static class Node {
        final List<Integer> keys = new ArrayList<>(); // 1 to 3 keys
        final List<Node> children = new ArrayList<>(); // empty for a leaf

        boolean leaf() {
            return children.isEmpty();
        }
    }

    /** What an overflowing node hands to its parent: the middle key and the new right half. */
    record Split(int key, Node right) {}

    Node root;

    public boolean search(int k) {
        Node x = root;
        while (x != null) {
            int i = 0;
            while (i < x.keys.size() && k > x.keys.get(i)) i++;
            if (i < x.keys.size() && x.keys.get(i) == k) return true;
            x = x.leaf() ? null : x.children.get(i);
        }
        return false;
    }

    public boolean insert(int k) {
        if (search(k)) return false;
        if (root == null) {
            root = new Node();
            root.keys.add(k);
            return true;
        }
        Split split = insert(root, k);
        if (split != null) { // the root overflowed: a new root holds its middle key
            Node r = new Node();
            r.keys.add(split.key());
            r.children.add(root);
            r.children.add(split.right());
            root = r;
        }
        return true;
    }

    /** Insert k under x. If x overflows, split it and return the middle key and right half. */
    private Split insert(Node x, int k) {
        int i = 0;
        while (i < x.keys.size() && k > x.keys.get(i)) i++;
        if (x.leaf()) {
            x.keys.add(i, k);
        } else {
            Split split = insert(x.children.get(i), k);
            if (split != null) {
                x.keys.add(i, split.key());
                x.children.add(i + 1, split.right());
            }
        }
        if (x.keys.size() < 4) return null;
        // Overflow: x is a 5-node. Keep keys 1-2, the 3rd moves up, the 4th is a new node.
        Node right = new Node();
        right.keys.add(x.keys.get(3));
        int middle = x.keys.get(2);
        x.keys.subList(2, 4).clear();
        if (!x.leaf()) {
            right.children.addAll(x.children.subList(3, 5));
            x.children.subList(3, 5).clear();
        }
        return new Split(middle, right);
    }

    public boolean delete(int k) {
        if (!search(k)) return false;
        delete(root, k);
        if (root.keys.isEmpty()) root = root.leaf() ? null : root.children.get(0); // empty root
        return true;
    }

    /** Delete k under x, then fix any child of x that underflowed. */
    private void delete(Node x, int k) {
        int i = 0;
        while (i < x.keys.size() && k > x.keys.get(i)) i++;
        if (i < x.keys.size() && x.keys.get(i) == k) {
            if (x.leaf()) {
                x.keys.remove(i);
                return;
            }
            // Swap k with its predecessor, the last key of the rightmost leaf on its left.
            Node leaf = x.children.get(i);
            while (!leaf.leaf()) leaf = leaf.children.get(leaf.children.size() - 1);
            int last = leaf.keys.size() - 1;
            x.keys.set(i, leaf.keys.get(last));
            leaf.keys.set(last, k);
        }
        delete(x.children.get(i), k);
        if (x.children.get(i).keys.isEmpty()) fix(x, i);
    }

    /** x.children[i] has no keys: transfer a key from a sibling, or fuse with one. */
    private void fix(Node x, int i) {
        Node c = x.children.get(i);
        Node left = i > 0 ? x.children.get(i - 1) : null;
        Node right = i + 1 < x.children.size() ? x.children.get(i + 1) : null;
        if (left != null && left.keys.size() > 1) { // transfer from the left sibling
            c.keys.add(0, x.keys.get(i - 1));
            x.keys.set(i - 1, left.keys.remove(left.keys.size() - 1));
            if (!left.leaf()) c.children.add(0, left.children.remove(left.children.size() - 1));
        } else if (right != null && right.keys.size() > 1) { // transfer from the right sibling
            c.keys.add(x.keys.get(i));
            x.keys.set(i, right.keys.remove(0));
            if (!right.leaf()) c.children.add(right.children.remove(0));
        } else if (right != null) { // fusion with the right sibling
            c.keys.add(x.keys.remove(i));
            c.keys.addAll(right.keys);
            c.children.addAll(right.children);
            x.children.remove(i + 1);
        } else { // fusion with the left sibling
            left.keys.add(x.keys.remove(i - 1));
            left.children.addAll(c.children);
            x.children.remove(i);
        }
    }

    /** All keys in order. */
    public List<Integer> keys() {
        List<Integer> out = new ArrayList<>();
        if (root != null) walk(root, out);
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
