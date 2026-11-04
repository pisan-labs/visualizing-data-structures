import java.util.List;

/** CLRS red-black tree of distinct keys. Every missing child is the black sentinel NIL. */
public class RedBlackTree<K extends Comparable<K>> {
    static final boolean RED = true, BLACK = false;

    class Node {
        K key;
        boolean color;
        Node left, right, parent;

        Node(K key, boolean color) {
            this.key = key;
            this.color = color;
            left = right = parent = nil;
        }
    }

    final Node nil = new Node(null, BLACK);
    Node root = nil;
    int size = 0;
    int rotations = 0;

    public Node search(K k) {
        Node x = root;
        while (x != nil && k.compareTo(x.key) != 0) {
            x = k.compareTo(x.key) < 0 ? x.left : x.right;
        }
        return x;
    }

    private void rotateLeft(Node x) {
        Node y = x.right;
        x.right = y.left;
        if (y.left != nil) {
            y.left.parent = x;
        }
        transplant(x, y);
        y.left = x;
        x.parent = y;
        rotations++;
    }

    private void rotateRight(Node x) {
        Node y = x.left;
        x.left = y.right;
        if (y.right != nil) {
            y.right.parent = x;
        }
        transplant(x, y);
        y.right = x;
        x.parent = y;
        rotations++;
    }

    /** Put the subtree rooted at v where the subtree rooted at u was. */
    private void transplant(Node u, Node v) {
        if (u.parent == nil) {
            root = v;
        } else if (u == u.parent.left) {
            u.parent.left = v;
        } else {
            u.parent.right = v;
        }
        v.parent = u.parent; // v may be NIL: deleteFixup needs its parent
    }

    public boolean insert(K k) {
        Node y = nil, x = root;
        while (x != nil) {
            int c = k.compareTo(x.key);
            if (c == 0) {
                return false;
            }
            y = x;
            x = c < 0 ? x.left : x.right;
        }
        Node z = new Node(k, RED);
        z.parent = y;
        if (y == nil) {
            root = z;
        } else if (k.compareTo(y.key) < 0) {
            y.left = z;
        } else {
            y.right = z;
        }
        size++;
        insertFixup(z);
        return true;
    }

    private void insertFixup(Node z) {
        while (z.parent.color == RED) {
            if (z.parent == z.parent.parent.left) {
                Node y = z.parent.parent.right; // the uncle
                if (y.color == RED) { // case 1: recolor
                    z.parent.color = BLACK;
                    y.color = BLACK;
                    z.parent.parent.color = RED;
                    z = z.parent.parent;
                } else {
                    if (z == z.parent.right) { // case 2: a zigzag
                        z = z.parent;
                        rotateLeft(z);
                    }
                    z.parent.color = BLACK; // case 3: a straight line
                    z.parent.parent.color = RED;
                    rotateRight(z.parent.parent);
                }
            } else {
                Node y = z.parent.parent.left;
                if (y.color == RED) {
                    z.parent.color = BLACK;
                    y.color = BLACK;
                    z.parent.parent.color = RED;
                    z = z.parent.parent;
                } else {
                    if (z == z.parent.left) {
                        z = z.parent;
                        rotateRight(z);
                    }
                    z.parent.color = BLACK;
                    z.parent.parent.color = RED;
                    rotateLeft(z.parent.parent);
                }
            }
        }
        root.color = BLACK;
    }

    public boolean delete(K k) {
        Node z = search(k);
        if (z == nil) {
            return false;
        }
        Node y = z, x;
        boolean lost = z.color;
        if (z.left == nil) {
            x = z.right;
            transplant(z, z.right);
        } else if (z.right == nil) {
            x = z.left;
            transplant(z, z.left);
        } else {
            y = minimum(z.right); // the successor
            lost = y.color;
            x = y.right;
            if (y != z.right) {
                transplant(y, y.right);
                y.right = z.right;
                y.right.parent = y;
            } else {
                x.parent = y;
            }
            transplant(z, y);
            y.left = z.left;
            y.left.parent = y;
            y.color = z.color;
        }
        size--;
        if (lost == BLACK) {
            deleteFixup(x);
        }
        return true;
    }

    /** x carries an extra black: move it up the tree or use it up. */
    private void deleteFixup(Node x) {
        while (x != root && x.color == BLACK) {
            if (x == x.parent.left) {
                Node w = x.parent.right; // the sibling
                if (w.color == RED) { // case 1
                    w.color = BLACK;
                    x.parent.color = RED;
                    rotateLeft(x.parent);
                    w = x.parent.right;
                }
                if (w.left.color == BLACK && w.right.color == BLACK) { // case 2
                    w.color = RED;
                    x = x.parent;
                } else {
                    if (w.right.color == BLACK) { // case 3
                        w.left.color = BLACK;
                        w.color = RED;
                        rotateRight(w);
                        w = x.parent.right;
                    }
                    w.color = x.parent.color; // case 4
                    x.parent.color = BLACK;
                    w.right.color = BLACK;
                    rotateLeft(x.parent);
                    x = root;
                }
            } else {
                Node w = x.parent.left;
                if (w.color == RED) {
                    w.color = BLACK;
                    x.parent.color = RED;
                    rotateRight(x.parent);
                    w = x.parent.left;
                }
                if (w.right.color == BLACK && w.left.color == BLACK) {
                    w.color = RED;
                    x = x.parent;
                } else {
                    if (w.left.color == BLACK) {
                        w.right.color = BLACK;
                        w.color = RED;
                        rotateLeft(w);
                        w = x.parent.left;
                    }
                    w.color = x.parent.color;
                    x.parent.color = BLACK;
                    w.left.color = BLACK;
                    rotateRight(x.parent);
                    x = root;
                }
            }
        }
        x.color = BLACK;
    }

    public Node minimum(Node x) {
        while (x.left != nil) {
            x = x.left;
        }
        return x;
    }

    public Node maximum(Node x) {
        while (x.right != nil) {
            x = x.right;
        }
        return x;
    }

    /** Black nodes on any path from the root down to NIL, not counting the root. */
    public int blackHeight() {
        if (root == nil) {
            return 0;
        }
        int count = 1; // the NIL at the end
        for (Node x = root.left; x != nil; x = x.left) {
            if (x.color == BLACK) {
                count++;
            }
        }
        return count;
    }

    public int height(Node x) {
        return x == nil ? -1 : 1 + Math.max(height(x.left), height(x.right));
    }

    public void inorder(Node x, List<K> out) {
        if (x != nil) {
            inorder(x.left, out);
            out.add(x.key);
            inorder(x.right, out);
        }
    }
}
