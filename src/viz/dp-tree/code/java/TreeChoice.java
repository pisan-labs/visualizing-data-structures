import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

public class TreeChoice {
    public static class Node {
        final int value;
        Node left, right;

        public Node(int value) {
            this.value = value;
        }
    }

    /** {take, skip}: the best total in node's subtree with node chosen, and without it. */
    static int[] takeSkip(Node node, Map<Node, int[]> memo) {
        if (node == null) return new int[] {0, 0};
        int[] l = takeSkip(node.left, memo);
        int[] r = takeSkip(node.right, memo);
        int take = node.value + l[1] + r[1]; // node in: both children stay out
        int skip = Math.max(l[0], l[1]) + Math.max(r[0], r[1]); // node out: each child's better
        int[] pair = {take, skip};
        memo.put(node, pair);
        return pair;
    }

    /** The best total (first) and the chosen values in preorder. */
    public static List<Integer> bestChoice(Node root) {
        Map<Node, int[]> memo = new IdentityHashMap<>();
        int[] top = takeSkip(root, memo);
        List<Integer> out = new ArrayList<>();
        out.add(Math.max(top[0], top[1]));
        walk(root, false, memo, out);
        return out;
    }

    private static void walk(Node node, boolean parentIn, Map<Node, int[]> memo, List<Integer> out) {
        if (node == null) return;
        int[] p = memo.get(node);
        boolean use = !parentIn && p[0] > p[1]; // a tie leaves the node out
        if (use) out.add(node.value);
        walk(node.left, use, memo, out);
        walk(node.right, use, memo, out);
    }
}
