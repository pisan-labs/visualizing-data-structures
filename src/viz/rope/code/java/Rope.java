/** A rope: a string kept as a binary tree of short pieces. Nodes never change, so ropes share them. */
public class Rope {
    static final class Node {
        final String text; // null for an internal node
        final Node left, right;
        final int weight; // length of the left subtree; a leaf's own length
        final int length;

        Node(String text) {
            this.text = text;
            left = right = null;
            weight = length = text.length();
        }

        Node(Node left, Node right) {
            text = null;
            this.left = left;
            this.right = right;
            weight = left.length;
            length = left.length + right.length;
        }
    }

    /** Two parts of a split; either may be null. */
    record Parts(Node left, Node right) {}

    static Node concat(Node a, Node b) {
        if (a == null) return b;
        if (b == null) return a;
        return new Node(a, b);
    }

    static Parts split(Node node, int i) {
        if (node == null) return new Parts(null, null);
        if (node.text != null) {
            if (i == 0) return new Parts(null, node);
            if (i == node.length) return new Parts(node, null);
            return new Parts(new Node(node.text.substring(0, i)), new Node(node.text.substring(i)));
        }
        if (i < node.weight) {
            Parts p = split(node.left, i);
            return new Parts(p.left(), concat(p.right(), node.right));
        }
        if (i == node.weight) return new Parts(node.left, node.right);
        Parts p = split(node.right, i - node.weight);
        return new Parts(concat(node.left, p.left()), p.right());
    }

    static Node build(String text, int leaf, int lo, int hi) {
        int pieces = (text.length() + leaf - 1) / leaf;
        if (hi < 0) hi = pieces;
        if (lo >= hi) return null;
        if (hi - lo == 1) return new Node(text.substring(lo * leaf, Math.min(text.length(), (lo + 1) * leaf)));
        int mid = (lo + hi + 1) / 2;
        return concat(build(text, leaf, lo, mid), build(text, leaf, mid, hi));
    }

    private Node root;

    public Rope() {}

    private Rope(Node root) { this.root = root; }

    /** A balanced rope over text, in pieces of at most `leaf` characters. */
    public static Rope of(String text, int leaf) { return new Rope(build(text, leaf, 0, -1)); }

    public int length() { return root == null ? 0 : root.length; }

    public char index(int i) {
        if (i < 0 || i >= length()) throw new IndexOutOfBoundsException("no such position");
        Node node = root;
        while (node.text == null) {
            if (i < node.weight) node = node.left;
            else {
                i -= node.weight;
                node = node.right;
            }
        }
        return node.text.charAt(i);
    }

    public void append(String text) { root = concat(root, new Node(text)); }

    public void insert(int i, String text) {
        if (i < 0 || i > length()) throw new IndexOutOfBoundsException("no such position");
        Parts p = split(root, i);
        root = concat(concat(p.left(), new Node(text)), p.right());
    }

    public void delete(int i, int n) {
        if (n < 1 || i < 0 || i + n > length()) throw new IndexOutOfBoundsException("no such range");
        Parts p = split(root, i);
        Parts q = split(p.right(), n);
        root = concat(p.left(), q.right());
    }

    /** Keep the first i characters; return the rest as a new rope. */
    public Rope split(int i) {
        if (i <= 0 || i >= length()) throw new IndexOutOfBoundsException("cut inside the rope");
        Parts p = split(root, i);
        root = p.left();
        return new Rope(p.right());
    }

    public void join(Rope other) { root = concat(root, other.root); }
}
