import java.util.ArrayList;
import java.util.List;

/** A BST keyed on (low, high), each node knowing the largest high end below it. */
public class IntervalTree {
    static class Node {
        int lo, hi, max; // max: largest high end in this subtree
        Node left, right, parent;

        Node(int lo, int hi, Node parent) {
            this.lo = lo;
            this.hi = hi;
            this.max = hi;
            this.parent = parent;
        }
    }

    Node root;
    int size;

    static boolean overlaps(int aLo, int aHi, int bLo, int bHi) {
        return aLo <= bHi && bLo <= aHi;
    }

    /** (lo, hi) comes before node x: by low end, then by high end. */
    static boolean before(int lo, int hi, Node x) {
        return lo < x.lo || (lo == x.lo && hi < x.hi);
    }

    Node find(int lo, int hi) {
        Node x = root;
        while (x != null && !(x.lo == lo && x.hi == hi)) x = before(lo, hi, x) ? x.left : x.right;
        return x;
    }

    boolean insert(int lo, int hi) {
        if (find(lo, hi) != null) return false;
        Node parent = null;
        Node x = root;
        while (x != null) {
            x.max = Math.max(x.max, hi); // the new interval will be below x
            parent = x;
            x = before(lo, hi, x) ? x.left : x.right;
        }
        Node z = new Node(lo, hi, parent);
        if (parent == null) root = z;
        else if (before(lo, hi, parent)) parent.left = z;
        else parent.right = z;
        size++;
        return true;
    }

    boolean delete(int lo, int hi) {
        Node z = find(lo, hi);
        if (z == null) return false;
        Node start;
        if (z.left == null || z.right == null) {
            start = z.parent;
            transplant(z, z.left != null ? z.left : z.right);
        } else {
            Node y = z.right;
            while (y.left != null) y = y.left;
            if (y != z.right) {
                start = y.parent;
                transplant(y, y.right);
                y.right = z.right;
                y.right.parent = y;
            } else {
                start = y;
            }
            transplant(z, y);
            y.left = z.left;
            y.left.parent = y;
        }
        for (; start != null; start = start.parent) { // fix max from the lowest change up
            start.max = Math.max(start.hi, Math.max(maxOf(start.left), maxOf(start.right)));
        }
        size--;
        return true;
    }

    static int maxOf(Node x) {
        return x == null ? -1 : x.max;
    }

    private void transplant(Node u, Node v) {
        if (u.parent == null) root = v;
        else if (u == u.parent.left) u.parent.left = v;
        else u.parent.right = v;
        if (v != null) v.parent = u.parent;
    }

    /** CLRS INTERVAL-SEARCH. Returns the node found (or null) and fills visited[0]. */
    Node overlap(int lo, int hi, int[] visited) {
        Node x = root;
        while (x != null) {
            visited[0]++;
            if (overlaps(lo, hi, x.lo, x.hi)) break;
            x = x.left != null && x.left.max >= lo ? x.left : x.right;
        }
        return x;
    }

    /** Every interval overlapping [lo, hi], skipping subtrees that cannot hold one. */
    List<Node> all(int lo, int hi, int[] visited) {
        List<Node> found = new ArrayList<>();
        if (root != null) visit(root, lo, hi, found, visited);
        return found;
    }

    private void visit(Node x, int lo, int hi, List<Node> found, int[] visited) {
        visited[0]++;
        if (overlaps(lo, hi, x.lo, x.hi)) found.add(x);
        if (x.left != null && x.left.max >= lo) visit(x.left, lo, hi, found, visited);
        if (x.right != null && x.lo <= hi) visit(x.right, lo, hi, found, visited);
    }

    int height(Node x) {
        return x == null ? -1 : 1 + Math.max(height(x.left), height(x.right));
    }
}
