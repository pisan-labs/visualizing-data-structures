import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/** A prefix cache: a radix tree of token runs, each with its keys and values. */
public class RadixCache {
    public static class Node {
        final int uid;
        List<String> tokens; // the run of tokens on the edge into this node
        Node parent;
        List<Node> children = new ArrayList<>(); // in the order they were added
        int ref; // running requests whose path passes through here
        int last; // when a request last used it

        Node(int uid, List<String> tokens, Node parent) {
            this.uid = uid;
            this.tokens = tokens;
            this.parent = parent;
        }
    }

    /** What a request got: its last node, tokens matched, tokens evicted. */
    public record Result(Node node, int matched, int evicted) {}

    final int capacity; // tokens it can hold
    final Node root = new Node(0, List.of(), null);
    int uids = 1;
    int size = 0; // tokens it holds
    int clock = 0;

    public RadixCache(int capacity) {
        this.capacity = capacity;
    }

    Node child(Node node, String token) {
        for (Node c : node.children) if (c.tokens.get(0).equals(token)) return c;
        return null;
    }

    /** Cut node's edge after k tokens: a new node takes the first k. */
    Node split(Node node, int k) {
        Node top = new Node(uids++, new ArrayList<>(node.tokens.subList(0, k)), node.parent);
        top.ref = node.ref;
        top.last = node.last;
        List<Node> siblings = node.parent.children;
        siblings.set(siblings.indexOf(node), top);
        top.children.add(node);
        node.tokens = new ArrayList<>(node.tokens.subList(k, node.tokens.size()));
        node.parent = top;
        return top;
    }

    List<Node> path(Node node) {
        List<Node> out = new ArrayList<>();
        for (Node n = node; n != root; n = n.parent) out.add(n);
        return out;
    }

    List<Node> nodes() {
        List<Node> out = new ArrayList<>();
        Deque<Node> stack = new ArrayDeque<>(List.of(root));
        while (!stack.isEmpty()) {
            Node n = stack.pop();
            out.add(n);
            n.children.forEach(stack::push);
        }
        return out;
    }

    int evictable() {
        int total = 0;
        for (Node n : nodes()) if (n.ref == 0) total += n.tokens.size();
        return total;
    }

    /** Drop the least recently used leaf that no running request uses. */
    int evict() {
        Node leaf = null;
        for (Node n : nodes()) {
            if (n == root || !n.children.isEmpty() || n.ref > 0) continue;
            if (leaf == null || n.last < leaf.last || (n.last == leaf.last && n.uid < leaf.uid))
                leaf = n;
        }
        leaf.parent.children.remove(leaf);
        size -= leaf.tokens.size();
        return leaf.tokens.size();
    }

    /** Reuse the longest cached prefix and cache the rest; null if it must wait. */
    public Result request(List<String> tokens) {
        Node node = root;
        int i = 0;
        while (i < tokens.size()) {
            Node c = child(node, tokens.get(i));
            if (c == null) break;
            int k = 0;
            while (k < c.tokens.size() && i + k < tokens.size()
                    && c.tokens.get(k).equals(tokens.get(i + k))) k++;
            if (k < c.tokens.size()) c = split(c, k); // the prompt leaves this edge partway
            node = c;
            i += k;
        }
        int matched = i;
        for (Node n : path(node)) n.ref++;
        List<String> rest = new ArrayList<>(tokens.subList(matched, tokens.size()));
        if (rest.size() > capacity - size + evictable()) {
            for (Node n : path(node)) n.ref--;
            return null; // the rest is in use: wait for a request to finish
        }
        clock++;
        for (Node n : path(node)) n.last = clock;
        int evicted = 0;
        while (capacity - size < rest.size()) evicted += evict();
        if (!rest.isEmpty()) { // prefill the rest, and keep its keys and values
            Node leaf = new Node(uids++, rest, node);
            leaf.ref = 1;
            leaf.last = clock;
            node.children.add(leaf);
            size += rest.size();
            node = leaf;
        }
        return new Result(node, matched, evicted);
    }

    /** The request is done; its tokens stay cached. */
    public void finish(Node node) {
        clock++;
        for (Node n : path(node)) {
            n.ref--;
            n.last = clock;
        }
    }
}
