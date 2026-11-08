import java.util.ArrayList;
import java.util.List;

/** A BST that never rotates. alpha = 2/3: no node deeper than log base 3/2 of n. */
public class ScapegoatTree {
    class Node {
        int key;
        Node left, right, parent;

        Node(int key, Node parent) {
            this.key = key;
            this.parent = parent;
        }
    }

    Node root;
    int n;
    int maxN; // largest n since the last full rebuild
    int rebuilds;

    static int size(ScapegoatTree.Node x) {
        return x == null ? 0 : 1 + size(x.left) + size(x.right);
    }

    Node search(int k) {
        Node x = root;
        while (x != null && k != x.key) x = k < x.key ? x.left : x.right;
        return x;
    }

    boolean insert(int k) {
        Node parent = null;
        Node x = root;
        int depth = 0;
        while (x != null) {
            if (k == x.key) return false;
            parent = x;
            x = k < x.key ? x.left : x.right;
            depth++;
        }
        Node z = new Node(k, parent);
        if (parent == null) root = z;
        else if (k < parent.key) parent.left = z;
        else parent.right = z;
        n++;
        maxN = Math.max(maxN, n);
        if (Math.pow(1.5, depth) > n) { // too deep: find the scapegoat on the way up
            Node child = z;
            Node w = parent;
            int childSize = 1;
            while (true) {
                int wSize = childSize + 1 + size(w.left == child ? w.right : w.left);
                if (3 * childSize > 2 * wSize) break; // child holds more than 2/3
                child = w;
                w = w.parent;
                childSize = wSize;
            }
            rebuild(w);
        }
        return true;
    }

    boolean delete(int k) {
        Node z = search(k);
        if (z == null) return false;
        if (z.left == null) {
            transplant(z, z.right);
        } else if (z.right == null) {
            transplant(z, z.left);
        } else {
            Node y = z.right;
            while (y.left != null) y = y.left;
            if (y != z.right) {
                transplant(y, y.right);
                y.right = z.right;
                y.right.parent = y;
            }
            transplant(z, y);
            y.left = z.left;
            y.left.parent = y;
        }
        n--;
        if (3 * n < 2 * maxN) { // too many deletes: rebuild everything
            if (root != null) rebuild(root);
            maxN = n;
        }
        return true;
    }

    private void transplant(Node u, Node v) {
        if (u.parent == null) root = v;
        else if (u == u.parent.left) u.parent.left = v;
        else u.parent.right = v;
        if (v != null) v.parent = u.parent;
    }

    private void rebuild(Node w) {
        Node parent = w.parent;
        List<Node> nodes = new ArrayList<>();
        flatten(w, nodes);
        Node top = build(nodes, 0, nodes.size() - 1, parent);
        if (parent == null) root = top;
        else if (parent.left == w) parent.left = top;
        else parent.right = top;
        rebuilds++;
    }

    private void flatten(Node x, List<Node> out) {
        if (x == null) return;
        flatten(x.left, out);
        out.add(x);
        flatten(x.right, out);
    }

    private Node build(List<Node> nodes, int lo, int hi, Node parent) {
        if (lo > hi) return null;
        int mid = (lo + hi) / 2;
        Node x = nodes.get(mid);
        x.parent = parent;
        x.left = build(nodes, lo, mid - 1, x);
        x.right = build(nodes, mid + 1, hi, x);
        return x;
    }

    int height(Node x) {
        return x == null ? -1 : 1 + Math.max(height(x.left), height(x.right));
    }
}
