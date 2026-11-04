import java.util.List;

/** A binary search tree with parent pointers. Duplicate keys are rejected. */
public class BST<K extends Comparable<K>> {
    class Node {
        K key;
        Node left, right, parent;
        int size = 1; // keys in this subtree, for select and rank

        Node(K key, Node parent) {
            this.key = key;
            this.parent = parent;
        }
    }

    Node root;

    static int size(BST<?>.Node x) {
        return x == null ? 0 : x.size;
    }

    public Node search(K k) {
        Node x = root;
        while (x != null && k.compareTo(x.key) != 0) {
            x = k.compareTo(x.key) < 0 ? x.left : x.right;
        }
        return x;
    }

    public boolean insert(K k) {
        Node y = null, x = root;
        while (x != null) {
            y = x;
            int c = k.compareTo(x.key);
            if (c == 0) {
                return false;
            }
            x = c < 0 ? x.left : x.right;
        }
        Node z = new Node(k, y);
        if (y == null) {
            root = z;
        } else if (k.compareTo(y.key) < 0) {
            y.left = z;
        } else {
            y.right = z;
        }
        fixSizes(y);
        return true;
    }

    public boolean delete(K k) {
        Node z = search(k);
        if (z == null) {
            return false;
        }
        Node fix;
        if (z.left == null) {
            fix = z.parent;
            transplant(z, z.right);
        } else if (z.right == null) {
            fix = z.parent;
            transplant(z, z.left);
        } else {
            Node y = minimum(z.right); // the successor
            fix = y.parent == z ? y : y.parent;
            if (y != z.right) {
                transplant(y, y.right);
                y.right = z.right;
                y.right.parent = y;
            }
            transplant(z, y);
            y.left = z.left;
            y.left.parent = y;
        }
        fixSizes(fix);
        return true;
    }

    /** Put the subtree rooted at v where the subtree rooted at u was. */
    private void transplant(Node u, Node v) {
        if (u.parent == null) {
            root = v;
        } else if (u == u.parent.left) {
            u.parent.left = v;
        } else {
            u.parent.right = v;
        }
        if (v != null) {
            v.parent = u.parent;
        }
    }

    private void fixSizes(Node x) {
        for (; x != null; x = x.parent) {
            x.size = 1 + size(x.left) + size(x.right);
        }
    }

    public Node minimum(Node x) {
        while (x.left != null) {
            x = x.left;
        }
        return x;
    }

    public Node maximum(Node x) {
        while (x.right != null) {
            x = x.right;
        }
        return x;
    }

    public Node successor(Node x) {
        if (x.right != null) {
            return minimum(x.right);
        }
        Node y = x.parent;
        while (y != null && x == y.right) {
            x = y;
            y = y.parent;
        }
        return y;
    }

    public Node predecessor(Node x) {
        if (x.left != null) {
            return maximum(x.left);
        }
        Node y = x.parent;
        while (y != null && x == y.left) {
            x = y;
            y = y.parent;
        }
        return y;
    }

    /** The i-th smallest key (1 is the smallest), or null. */
    public Node select(int i) {
        Node x = root;
        while (x != null) {
            int r = size(x.left) + 1;
            if (i == r) {
                return x;
            } else if (i < r) {
                x = x.left;
            } else {
                i -= r;
                x = x.right;
            }
        }
        return null;
    }

    /** The place of k in sorted order (1 is the smallest), or -1 if k is not there. */
    public int rank(K k) {
        int r = 0;
        Node x = root;
        while (x != null) {
            int c = k.compareTo(x.key);
            if (c < 0) {
                x = x.left;
            } else if (c > 0) {
                r += size(x.left) + 1;
                x = x.right;
            } else {
                return r + size(x.left) + 1;
            }
        }
        return -1;
    }

    /** The smallest key >= k, or null. */
    public Node lowerBound(K k) {
        Node best = null, x = root;
        while (x != null) {
            if (x.key.compareTo(k) >= 0) {
                best = x;
                x = x.left;
            } else {
                x = x.right;
            }
        }
        return best;
    }

    public void inorder(Node x, List<K> out) {
        if (x != null) {
            inorder(x.left, out);
            out.add(x.key);
            inorder(x.right, out);
        }
    }

    public int height(Node x) {
        return x == null ? -1 : 1 + Math.max(height(x.left), height(x.right));
    }
}
