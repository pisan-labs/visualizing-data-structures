import java.util.List;
import java.util.Random;

/** A BST by keys and a heap by priorities: smaller priorities sit higher. */
public class Treap<K extends Comparable<K>> {
    class Node {
        K key;
        int priority;
        Node left, right;

        Node(K key, int priority) {
            this.key = key;
            this.priority = priority;
        }
    }

    private final Random random = new Random();
    Node root;
    int size = 0;
    int rotations = 0;

    public Node search(K k) {
        Node x = root;
        while (x != null && k.compareTo(x.key) != 0) {
            x = k.compareTo(x.key) < 0 ? x.left : x.right;
        }
        return x;
    }

    public boolean insert(K k) {
        return insert(k, 1 + random.nextInt(99));
    }

    public boolean insert(K k, int priority) {
        if (search(k) != null) {
            return false;
        }
        root = insert(root, k, priority);
        size++;
        return true;
    }

    private Node insert(Node x, K k, int priority) {
        if (x == null) {
            return new Node(k, priority);
        }
        if (k.compareTo(x.key) < 0) {
            x.left = insert(x.left, k, priority);
            if (x.left.priority < x.priority) { // heap order broken: lift the child
                x = rotateRight(x);
            }
        } else {
            x.right = insert(x.right, k, priority);
            if (x.right.priority < x.priority) {
                x = rotateLeft(x);
            }
        }
        return x;
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
        } else if (x.left.priority < x.right.priority) { // rotate x down, below that child
            x = rotateRight(x);
            x.right = delete(x.right, k);
        } else {
            x = rotateLeft(x);
            x.left = delete(x.left, k);
        }
        return x;
    }

    private Node rotateRight(Node x) {
        Node y = x.left;
        x.left = y.right;
        y.right = x;
        rotations++;
        return y;
    }

    private Node rotateLeft(Node x) {
        Node y = x.right;
        x.right = y.left;
        y.left = x;
        rotations++;
        return y;
    }

    public Node minimum() {
        Node x = root;
        while (x.left != null) {
            x = x.left;
        }
        return x;
    }

    public Node maximum() {
        Node x = root;
        while (x.right != null) {
            x = x.right;
        }
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
