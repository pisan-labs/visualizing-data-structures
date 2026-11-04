import java.util.ArrayList;
import java.util.List;

/**
 * A B+ tree of order m: a node holds at most m - 1 keys. Every key lives in a leaf and the
 * leaves are linked in order; internal keys are signposts.
 */
public class BPlusTree {
    static class Node {
        final boolean leaf;
        final List<Integer> keys = new ArrayList<>();
        final List<Node> children = new ArrayList<>(); // internal nodes only
        Node next; // leaves only: the next leaf to the right

        Node(boolean leaf) {
            this.leaf = leaf;
        }
    }

    /** What an overflowing node hands to its parent: a separator and the new right half. */
    record Split(int key, Node right) {}

    final int m;
    Node root = new Node(true);

    BPlusTree(int m) {
        this.m = m;
    }

    /** A leaf needs ceil((m - 1) / 2) keys; an internal node ceil(m / 2) children. */
    private int minKeys(Node x) {
        return x.leaf ? m / 2 : (m + 1) / 2 - 1;
    }

    /** How many keys are at most k: the child to take, so keys equal to a separator go right. */
    private static int after(List<Integer> keys, int k) {
        int i = 0;
        while (i < keys.size() && keys.get(i) <= k) i++;
        return i;
    }

    private Node leafFor(int k) {
        Node x = root;
        while (!x.leaf) x = x.children.get(after(x.keys, k));
        return x;
    }

    public boolean search(int k) {
        return leafFor(k).keys.contains(k);
    }

    public List<Integer> range(int a, int b) {
        List<Integer> out = new ArrayList<>();
        for (Node x = leafFor(a); x != null; x = x.next) { // walk along the leaves
            for (int k : x.keys) {
                if (k > b) return out;
                if (k >= a) out.add(k);
            }
        }
        return out;
    }

    /** All keys in order, read along the leaf links. */
    public List<Integer> keys() {
        Node x = root;
        while (!x.leaf) x = x.children.get(0);
        List<Integer> out = new ArrayList<>();
        for (; x != null; x = x.next) out.addAll(x.keys);
        return out;
    }

    public boolean insert(int k) {
        if (search(k)) return false;
        Split split = insert(root, k);
        if (split != null) { // the root split: a new root holds the separator
            Node r = new Node(false);
            r.keys.add(split.key());
            r.children.add(root);
            r.children.add(split.right());
            root = r;
        }
        return true;
    }

    /** Insert k under x. If x overflows, split it and return the separator and right half. */
    private Split insert(Node x, int k) {
        if (x.leaf) {
            x.keys.add(after(x.keys, k), k);
            if (x.keys.size() < m) return null;
            int half = (m + 1) / 2;
            Node right = new Node(true);
            right.keys.addAll(x.keys.subList(half, x.keys.size()));
            x.keys.subList(half, x.keys.size()).clear();
            right.next = x.next;
            x.next = right;
            return new Split(right.keys.get(0), right); // copy up: the key stays in the leaf
        }
        int i = after(x.keys, k);
        Split split = insert(x.children.get(i), k);
        if (split == null) return null;
        x.keys.add(i, split.key());
        x.children.add(i + 1, split.right());
        if (x.keys.size() < m) return null;
        int mid = m / 2;
        int up = x.keys.get(mid); // push up: the key leaves this node
        Node right = new Node(false);
        right.keys.addAll(x.keys.subList(mid + 1, x.keys.size()));
        right.children.addAll(x.children.subList(mid + 1, x.children.size()));
        x.keys.subList(mid, x.keys.size()).clear();
        x.children.subList(mid + 1, x.children.size()).clear();
        return new Split(up, right);
    }

    public boolean delete(int k) {
        if (!search(k)) return false;
        delete(root, k);
        if (!root.leaf && root.keys.isEmpty()) root = root.children.get(0); // shorter
        return true;
    }

    private void delete(Node x, int k) {
        if (x.leaf) {
            x.keys.remove(Integer.valueOf(k));
            return;
        }
        int i = after(x.keys, k);
        delete(x.children.get(i), k);
        if (x.children.get(i).keys.size() < minKeys(x.children.get(i))) fix(x, i);
    }

    /** x.children[i] has too few keys: borrow from a sibling or merge with one. */
    private void fix(Node x, int i) {
        Node c = x.children.get(i);
        Node left = i > 0 ? x.children.get(i - 1) : null;
        Node right = i + 1 < x.children.size() ? x.children.get(i + 1) : null;
        int least = minKeys(c);
        if (left != null && left.keys.size() > least) { // borrow from the left
            if (c.leaf) {
                c.keys.add(0, left.keys.remove(left.keys.size() - 1));
                x.keys.set(i - 1, c.keys.get(0));
            } else {
                c.keys.add(0, x.keys.get(i - 1));
                x.keys.set(i - 1, left.keys.remove(left.keys.size() - 1));
                c.children.add(0, left.children.remove(left.children.size() - 1));
            }
        } else if (right != null && right.keys.size() > least) { // borrow from the right
            if (c.leaf) {
                c.keys.add(right.keys.remove(0));
                x.keys.set(i, right.keys.get(0));
            } else {
                c.keys.add(x.keys.get(i));
                x.keys.set(i, right.keys.remove(0));
                c.children.add(right.children.remove(0));
            }
        } else { // merge with the right sibling, or the left one if there is none
            if (right == null) i--;
            Node a = x.children.get(i);
            Node b = x.children.remove(i + 1);
            int separator = x.keys.remove(i);
            if (a.leaf) {
                a.keys.addAll(b.keys); // the separator was only a copy
                a.next = b.next;
            } else {
                a.keys.add(separator);
                a.keys.addAll(b.keys);
                a.children.addAll(b.children);
            }
        }
    }
}
