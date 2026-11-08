import java.util.ArrayList;
import java.util.List;

/** Every update makes a new version by copying one path; old versions stay. */
public class PersistentBST {
    /** Never changed after it is made, so versions can share it. */
    record Node(int key, Node left, Node right) {}

    final List<Node> versions = new ArrayList<>(); // versions.get(v) is the root of version v
    int made; // nodes made by the last update

    PersistentBST() {
        versions.add(null);
    }

    boolean search(int v, int k) {
        Node x = versions.get(v);
        while (x != null && k != x.key()) x = k < x.key() ? x.left() : x.right();
        return x != null;
    }

    private Node node(int key, Node left, Node right) {
        made++;
        return new Node(key, left, right);
    }

    /** Insert k into version v. Returns the new version's number, or -1. */
    int insert(int v, int k) {
        if (search(v, k)) return -1;
        made = 0;
        versions.add(insert(versions.get(v), k));
        return versions.size() - 1;
    }

    private Node insert(Node x, int k) {
        if (x == null) return node(k, null, null);
        if (k < x.key()) return node(x.key(), insert(x.left(), k), x.right()); // copy x
        return node(x.key(), x.left(), insert(x.right(), k));
    }

    /** Delete k from version v. Returns the new version's number, or -1. */
    int delete(int v, int k) {
        if (!search(v, k)) return -1;
        made = 0;
        versions.add(delete(versions.get(v), k));
        return versions.size() - 1;
    }

    private Node delete(Node x, int k) {
        if (k < x.key()) return node(x.key(), delete(x.left(), k), x.right());
        if (k > x.key()) return node(x.key(), x.left(), delete(x.right(), k));
        if (x.left() == null) return x.right(); // shared as it is
        if (x.right() == null) return x.left();
        Node y = x.right();
        while (y.left() != null) y = y.left();
        // A copy of the successor takes x's place; copy the path down to it.
        return node(y.key(), x.left(), withoutMin(x.right()));
    }

    private Node withoutMin(Node x) {
        if (x.left() == null) return x.right();
        return node(x.key(), withoutMin(x.left()), x.right());
    }
}
