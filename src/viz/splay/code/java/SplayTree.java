import java.util.List;

/** A bottom-up splay tree of distinct keys: every access moves its key to the root. */
public class SplayTree<K extends Comparable<K>> {
    class Node {
        K key;
        Node left, right, parent;

        Node(K key, Node parent) {
            this.key = key;
            this.parent = parent;
        }
    }

    Node root;
    int size = 0;
    int rotations = 0;

    /** Rotate at x's parent so that x moves up one level. */
    private void rotateUp(Node x) {
        Node p = x.parent, g = p.parent;
        if (x == p.left) {
            p.left = x.right;
            if (x.right != null) {
                x.right.parent = p;
            }
            x.right = p;
        } else {
            p.right = x.left;
            if (x.left != null) {
                x.left.parent = p;
            }
            x.left = p;
        }
        p.parent = x;
        x.parent = g;
        if (g == null) {
            root = x;
        } else if (g.left == p) {
            g.left = x;
        } else {
            g.right = x;
        }
        rotations++;
    }

    /** Move x up until its parent is stop (null: until x is the root). */
    private void splay(Node x, Node stop) {
        while (x.parent != stop) {
            Node p = x.parent, g = p.parent;
            if (g == stop) { // zig
                rotateUp(x);
            } else if ((x == p.left) == (p == g.left)) { // zig-zig: grandparent first
                rotateUp(p);
                rotateUp(x);
            } else { // zig-zag: parent first
                rotateUp(x);
                rotateUp(x);
            }
        }
    }

    /** The node with key k, or the last node on the way down (null if empty). */
    private Node find(K k) {
        Node x = root, last = null;
        while (x != null) {
            last = x;
            int c = k.compareTo(x.key);
            if (c == 0) {
                break;
            }
            x = c < 0 ? x.left : x.right;
        }
        return last;
    }

    public boolean search(K k) {
        Node x = find(k);
        if (x != null) {
            splay(x, null); // even on a miss: the last node visited
        }
        return x != null && x.key.compareTo(k) == 0;
    }

    public boolean insert(K k) {
        Node y = find(k);
        if (y != null && y.key.compareTo(k) == 0) {
            splay(y, null);
            return false;
        }
        Node z = new Node(k, y);
        if (y == null) {
            root = z;
        } else if (k.compareTo(y.key) < 0) {
            y.left = z;
        } else {
            y.right = z;
        }
        size++;
        splay(z, null);
        return true;
    }

    public boolean delete(K k) {
        if (!search(k)) { // splays k to the root if it is there
            return false;
        }
        Node z = root;
        if (z.left == null) {
            root = z.right;
        } else {
            Node m = z.left;
            while (m.right != null) {
                m = m.right;
            }
            splay(m, z); // now m is z's left child, with no right child
            m.right = z.right;
            if (z.right != null) {
                z.right.parent = m;
            }
            root = m;
        }
        if (root != null) {
            root.parent = null;
        }
        size--;
        return true;
    }

    public Node minimum() {
        Node x = root;
        while (x.left != null) {
            x = x.left;
        }
        splay(x, null);
        return x;
    }

    public Node maximum() {
        Node x = root;
        while (x.right != null) {
            x = x.right;
        }
        splay(x, null);
        return x;
    }

    public int height(Node x) {
        return x == null ? -1 : 1 + Math.max(height(x.left), height(x.right));
    }

    public void inorder(Node x, List<K> out) {
        if (x != null) {
            inorder(x.left, out);
            out.add(x.key);
            inorder(x.right, out);
        }
    }
}
