import java.util.List;

/** A binary search tree of distinct keys that rotates to stay balanced. */
public class AVLTree<K extends Comparable<K>> {
    class Node {
        K key;
        Node left, right;
        int height = 0; // a leaf has height 0

        Node(K key) {
            this.key = key;
        }
    }

    Node root;
    int size = 0;
    int rotations = 0; // single rotations so far; a double rotation counts 2

    static int height(AVLTree<?>.Node x) {
        return x == null ? -1 : x.height;
    }

    /** Left height minus right height: -1, 0 or +1 in an AVL tree. */
    static int balance(AVLTree<?>.Node x) {
        return height(x.left) - height(x.right);
    }

    private static void update(AVLTree<?>.Node x) {
        x.height = 1 + Math.max(height(x.left), height(x.right));
    }

    public Node search(K k) {
        Node x = root;
        while (x != null && k.compareTo(x.key) != 0) {
            x = k.compareTo(x.key) < 0 ? x.left : x.right;
        }
        return x;
    }

    public boolean insert(K k) {
        if (search(k) != null) {
            return false;
        }
        root = insert(root, k);
        size++;
        return true;
    }

    private Node insert(Node x, K k) {
        if (x == null) {
            return new Node(k);
        }
        if (k.compareTo(x.key) < 0) {
            x.left = insert(x.left, k);
        } else {
            x.right = insert(x.right, k);
        }
        return rebalance(x);
    }

    public boolean delete(K k) {
        if (search(k) == null) {
            return false;
        }
        root = delete(root, k);
        size--;
        return true;
    }

    private Node delete(Node x, K k) {
        int c = k.compareTo(x.key);
        if (c < 0) {
            x.left = delete(x.left, k);
        } else if (c > 0) {
            x.right = delete(x.right, k);
        } else if (x.left == null) {
            return x.right;
        } else if (x.right == null) {
            return x.left;
        } else {
            Node y = minimum(x.right); // the successor takes x's place
            x.key = y.key;
            x.right = delete(x.right, y.key);
        }
        return rebalance(x);
    }

    /** Fix x's height; if x is out of balance, rotate. Returns the subtree's new root. */
    private Node rebalance(Node x) {
        update(x);
        if (balance(x) == 2) { // too tall on the left
            if (balance(x.left) < 0) { // LR: turn it into LL first
                x.left = rotateLeft(x.left);
            }
            return rotateRight(x); // LL
        }
        if (balance(x) == -2) { // too tall on the right
            if (balance(x.right) > 0) { // RL: turn it into RR first
                x.right = rotateRight(x.right);
            }
            return rotateLeft(x); // RR
        }
        return x;
    }

    private Node rotateRight(Node x) {
        Node y = x.left;
        x.left = y.right; // y's right subtree moves across
        y.right = x;
        update(x); // x is now below y, so fix it first
        update(y);
        rotations++;
        return y;
    }

    private Node rotateLeft(Node x) {
        Node y = x.right;
        x.right = y.left;
        y.left = x;
        update(x);
        update(y);
        rotations++;
        return y;
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

    public void inorder(Node x, List<K> out) {
        if (x != null) {
            inorder(x.left, out);
            out.add(x.key);
            inorder(x.right, out);
        }
    }
}
