import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;

/** A binary tree built from a level-order list, with the four classic traversals. */
public class BinaryTree<T> {
    static class Node<T> {
        T value;
        Node<T> left, right;

        Node(T value) {
            this.value = value;
        }
    }

    Node<T> root;

    /** Build from a level-order list. null marks a missing child; only real nodes get children. */
    public static <T> BinaryTree<T> fromLevelOrder(List<T> values) {
        BinaryTree<T> tree = new BinaryTree<>();
        if (values.isEmpty() || values.get(0) == null) {
            return tree;
        }
        tree.root = new Node<>(values.get(0));
        Queue<Node<T>> queue = new ArrayDeque<>();
        queue.add(tree.root);
        int i = 1;
        while (i < values.size()) {
            Node<T> x = queue.remove();
            if (values.get(i) != null) {
                x.left = new Node<>(values.get(i));
                queue.add(x.left);
            }
            if (i + 1 < values.size() && values.get(i + 1) != null) {
                x.right = new Node<>(values.get(i + 1));
                queue.add(x.right);
            }
            i += 2;
        }
        return tree;
    }

    void preorder(Node<T> x, List<T> out) {
        if (x != null) {
            out.add(x.value);
            preorder(x.left, out);
            preorder(x.right, out);
        }
    }

    void inorder(Node<T> x, List<T> out) {
        if (x != null) {
            inorder(x.left, out);
            out.add(x.value);
            inorder(x.right, out);
        }
    }

    void postorder(Node<T> x, List<T> out) {
        if (x != null) {
            postorder(x.left, out);
            postorder(x.right, out);
            out.add(x.value);
        }
    }

    List<T> levelOrder() {
        List<T> out = new ArrayList<>();
        if (root == null) {
            return out;
        }
        Queue<Node<T>> queue = new ArrayDeque<>();
        queue.add(root);
        while (!queue.isEmpty()) {
            Node<T> x = queue.remove();
            out.add(x.value);
            if (x.left != null) {
                queue.add(x.left);
            }
            if (x.right != null) {
                queue.add(x.right);
            }
        }
        return out;
    }

    int size(Node<T> x) {
        return x == null ? 0 : 1 + size(x.left) + size(x.right);
    }

    /** Edges on the longest path down from x; -1 for an empty tree. */
    int height(Node<T> x) {
        return x == null ? -1 : 1 + Math.max(height(x.left), height(x.right));
    }
}
