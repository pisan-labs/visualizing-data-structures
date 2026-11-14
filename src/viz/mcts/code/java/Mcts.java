import java.util.ArrayList;
import java.util.List;
import java.util.function.DoubleSupplier;

/** Monte Carlo tree search with UCB1 (UCT) on a tree of words with rewards at the leaves. */
public class Mcts {
    static class Node {
        final String word;
        final Node parent;
        final double reward; // for a leaf
        final List<Node> children = new ArrayList<>(); // every next word, in order
        int tried = 0; // how many children are in the search tree (left to right)
        int n = 0; // visits
        double w = 0; // total reward

        Node(String word, Node parent, double reward) {
            this.word = word;
            this.parent = parent;
            this.reward = reward;
        }

        /** UCB1: the mean reward, plus a bonus for being tried less often. */
        double ucb(double c) {
            return w / n + c * StrictMath.sqrt(StrictMath.log(parent.n) / n);
        }
    }

    /** One iteration; returns the path from the root, with the rollout's leaf last. */
    static List<Node> iterate(Node root, double c, DoubleSupplier random) {
        List<Node> path = new ArrayList<>(List.of(root));
        Node node = root;
        // Selection: while every child is in the tree, follow the best UCB1.
        while (!node.children.isEmpty() && node.tried == node.children.size()) {
            Node best = null;
            double top = Double.NEGATIVE_INFINITY;
            for (Node ch : node.children) {
                double u = ch.ucb(c);
                if (u > top) { // the first on a tie
                    top = u;
                    best = ch;
                }
            }
            node = best;
            path.add(node);
        }
        // Expansion: add the first child not tried yet.
        if (!node.children.isEmpty()) {
            node = node.children.get(node.tried++);
            path.add(node);
        }
        // Rollout: random children until the end; the leaf has the reward.
        Node leaf = node;
        while (!leaf.children.isEmpty()) {
            int k = (int) Math.floor(random.getAsDouble() * leaf.children.size());
            leaf = leaf.children.get(k);
        }
        // Backpropagation: every node on the path gets the visit and the reward.
        for (Node v : path) {
            v.n++;
            v.w += leaf.reward;
        }
        path.add(leaf);
        return path;
    }

    /** The most visited child of the root (the first on a tie). */
    static Node bestMove(Node root) {
        Node best = root.children.get(0);
        for (Node ch : root.children) if (ch.n > best.n) best = ch;
        return best;
    }
}
