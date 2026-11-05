import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * A compressed trie: each edge holds a string, and a node is kept only where the paths branch
 * or a word ends.
 */
public class RadixTree {
    static class Node {
        String edge; // the letters on the edge into this node
        boolean end; // a word ends here
        Map<Character, Node> children = new TreeMap<>(); // by the first letter of their edges

        Node(String edge, boolean end) {
            this.edge = edge;
            this.end = end;
        }
    }

    Node root = new Node("", false);

    /** Length of the longest common prefix of a and b. */
    static int common(String a, String b) {
        int k = 0;
        while (k < Math.min(a.length(), b.length()) && a.charAt(k) == b.charAt(k)) {
            k++;
        }
        return k;
    }

    /** Adds word. Returns false if it was already there. */
    public boolean insert(String word) {
        Node x = root;
        String s = word;
        while (!s.isEmpty()) {
            Node y = x.children.get(s.charAt(0));
            if (y == null) {
                x.children.put(s.charAt(0), new Node(s, true));
                return true;
            }
            int k = common(y.edge, s);
            if (k < y.edge.length()) {
                y = split(x, y, k);
            }
            x = y;
            s = s.substring(k);
        }
        if (x.end) {
            return false;
        }
        x.end = true;
        return true;
    }

    /** Splits the edge from x to y after k letters. Returns the new middle node. */
    private Node split(Node x, Node y, int k) {
        Node m = new Node(y.edge.substring(0, k), false);
        y.edge = y.edge.substring(k);
        m.children.put(y.edge.charAt(0), y);
        x.children.put(m.edge.charAt(0), m);
        return m;
    }

    public boolean search(String word) {
        Node x = root;
        String s = word;
        while (!s.isEmpty()) {
            Node y = x.children.get(s.charAt(0));
            if (y == null || !s.startsWith(y.edge)) {
                return false;
            }
            x = y;
            s = s.substring(y.edge.length());
        }
        return x.end;
    }

    /** Removes word. Returns false if it was not there. */
    public boolean delete(String word) {
        Node parent = null;
        Node x = root;
        String s = word;
        while (!s.isEmpty()) {
            Node y = x.children.get(s.charAt(0));
            if (y == null || !s.startsWith(y.edge)) {
                return false;
            }
            parent = x;
            x = y;
            s = s.substring(y.edge.length());
        }
        if (!x.end) {
            return false;
        }
        x.end = false;
        if (x.children.isEmpty()) {
            parent.children.remove(x.edge.charAt(0));
            if (parent != root && !parent.end && parent.children.size() == 1) {
                merge(parent);
            }
        } else if (x.children.size() == 1) {
            merge(x);
        }
        return true;
    }

    /** x has one child and ends no word: x takes in the child's edge. */
    private void merge(Node x) {
        Node c = x.children.values().iterator().next();
        x.edge += c.edge;
        x.end = c.end;
        x.children = c.children;
    }

    /** Every word that starts with prefix, in alphabetical order. */
    public List<String> startsWith(String prefix) {
        List<String> out = new ArrayList<>();
        Node x = root;
        String s = prefix;
        StringBuilder path = new StringBuilder();
        while (!s.isEmpty()) {
            Node y = x.children.get(s.charAt(0));
            if (y == null || !(s.startsWith(y.edge) || y.edge.startsWith(s))) {
                return out;
            }
            // Go down the edge, even when the prefix ends partway along it.
            x = y;
            s = s.substring(Math.min(s.length(), y.edge.length()));
            path.append(y.edge);
        }
        collect(x, path.toString(), out);
        return out;
    }

    private void collect(Node x, String w, List<String> out) {
        if (x.end) {
            out.add(w);
        }
        for (Node y : x.children.values()) {
            collect(y, w + y.edge, out);
        }
    }
}
