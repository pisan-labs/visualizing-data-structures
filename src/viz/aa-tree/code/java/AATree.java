/** Levels instead of colors; horizontal (red) links only on the right. */
public class AATree {
    static class Node {
        int key;
        int level = 1;
        Node left, right;

        Node(int key) {
            this.key = key;
        }
    }

    Node root;
    int size, skews, splits;

    static int level(Node t) {
        return t == null ? 0 : t.level;
    }

    Node skew(Node t) {
        // A left child on t's level: rotate right.
        if (t != null && t.left != null && t.left.level == t.level) {
            Node l = t.left;
            t.left = l.right;
            l.right = t;
            skews++;
            return l;
        }
        return t;
    }

    Node split(Node t) {
        // Two right horizontal links in a row: rotate left and lift the middle node.
        if (t != null && t.right != null && t.right.right != null && t.right.right.level == t.level) {
            Node r = t.right;
            t.right = r.left;
            r.left = t;
            r.level++;
            splits++;
            return r;
        }
        return t;
    }

    Node search(int k) {
        Node t = root;
        while (t != null && k != t.key) t = k < t.key ? t.left : t.right;
        return t;
    }

    boolean insert(int k) {
        if (search(k) != null) return false;
        root = insert(root, k);
        size++;
        return true;
    }

    private Node insert(Node t, int k) {
        if (t == null) return new Node(k);
        if (k < t.key) t.left = insert(t.left, k);
        else t.right = insert(t.right, k);
        return split(skew(t));
    }

    boolean delete(int k) {
        if (search(k) == null) return false;
        root = delete(root, k);
        size--;
        return true;
    }

    private Node delete(Node t, int k) {
        if (k < t.key) {
            t.left = delete(t.left, k);
        } else if (k > t.key) {
            t.right = delete(t.right, k);
        } else if (t.left == null && t.right == null) {
            return null;
        } else if (t.left == null) { // the successor, a leaf, stands in
            t.key = t.right.key;
            t.right = delete(t.right, t.key);
        } else { // the predecessor, a leaf, stands in
            Node p = t.left;
            while (p.right != null) p = p.right;
            t.key = p.key;
            t.left = delete(t.left, t.key);
        }
        // Lower t's level if a child fell too far below, then repair the links.
        int should = Math.min(level(t.left), level(t.right)) + 1;
        if (should < t.level) {
            t.level = should;
            if (t.right != null && should < t.right.level) t.right.level = should;
        }
        t = skew(t);
        t.right = skew(t.right);
        if (t.right != null) t.right.right = skew(t.right.right);
        t = split(t);
        t.right = split(t.right);
        return t;
    }
}
