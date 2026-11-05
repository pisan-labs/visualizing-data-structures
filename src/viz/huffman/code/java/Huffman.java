import java.util.Map;
import java.util.PriorityQueue;
import java.util.TreeMap;

/**
 * Huffman coding. Ties: the tree that joined the queue first comes out first. The leaves join
 * in symbol order, before any merged tree, so equal weights take leaves first, then the oldest
 * tree.
 */
public class Huffman {
    static class Node {
        final int weight;
        final char symbol; // a leaf's symbol
        final Node left; // null for a leaf
        final Node right;
        final int order; // when it joined the queue

        Node(int weight, char symbol, Node left, Node right, int order) {
            this.weight = weight;
            this.symbol = symbol;
            this.left = left;
            this.right = right;
            this.order = order;
        }

        boolean isLeaf() {
            return left == null;
        }
    }

    /** The Huffman tree for the count of each symbol (a TreeMap keeps symbol order). */
    static Node build(TreeMap<Character, Integer> counts) {
        PriorityQueue<Node> queue = new PriorityQueue<>((a, b) -> a.weight != b.weight
                ? Integer.compare(a.weight, b.weight)
                : Integer.compare(a.order, b.order));
        int order = 0;
        for (Map.Entry<Character, Integer> e : counts.entrySet()) {
            queue.add(new Node(e.getValue(), e.getKey(), null, null, order++));
        }
        while (queue.size() > 1) {
            Node x = queue.poll();
            Node y = queue.poll();
            queue.add(new Node(x.weight + y.weight, '\0', x, y, order++));
        }
        return queue.poll();
    }

    /** The code of each symbol: a 0 for each left edge, a 1 for each right edge. */
    static Map<Character, String> codes(Node root) {
        Map<Character, String> table = new TreeMap<>();
        if (root.isLeaf()) {
            table.put(root.symbol, "0"); // a lone symbol still needs one bit
        } else {
            walk(root, "", table);
        }
        return table;
    }

    private static void walk(Node x, String code, Map<Character, String> table) {
        if (x.isLeaf()) {
            table.put(x.symbol, code);
            return;
        }
        walk(x.left, code + "0", table);
        walk(x.right, code + "1", table);
    }

    static String encode(String text, Map<Character, String> table) {
        StringBuilder out = new StringBuilder();
        for (char c : text.toCharArray()) {
            out.append(table.get(c));
        }
        return out.toString();
    }

    /** The text, or null if the bits are not a message in this code. */
    static String decode(String bits, Node root) {
        StringBuilder out = new StringBuilder();
        if (root.isLeaf()) {
            for (char b : bits.toCharArray()) {
                if (b != '0') {
                    return null;
                }
                out.append(root.symbol);
            }
            return out.toString();
        }
        Node x = root;
        for (char b : bits.toCharArray()) {
            x = b == '0' ? x.left : x.right;
            if (x.isLeaf()) {
                out.append(x.symbol);
                x = root;
            }
        }
        return x == root ? out.toString() : null;
    }
}
