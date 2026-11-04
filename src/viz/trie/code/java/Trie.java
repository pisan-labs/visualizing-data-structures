import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** A trie of lowercase words. Delete removes the nodes that no longer lead to a word. */
public class Trie {
    static class Node {
        final Map<Character, Node> children = new TreeMap<>(); // kept in letter order
        boolean end; // a word ends here
    }

    Node root = new Node();

    /** Adds word. Returns false if it was already there. */
    public boolean insert(String word) {
        Node x = root;
        for (char c : word.toCharArray()) {
            Node next = x.children.get(c);
            if (next == null) {
                next = new Node();
                x.children.put(c, next);
            }
            x = next;
        }
        if (x.end) {
            return false;
        }
        x.end = true;
        return true;
    }

    public boolean search(String word) {
        Node x = find(word);
        return x != null && x.end;
    }

    /** Removes word. Returns false if it was not there. */
    public boolean delete(String word) {
        List<Node> path = new ArrayList<>(); // the nodes from the root down to the last letter
        path.add(root);
        for (char c : word.toCharArray()) {
            Node x = path.get(path.size() - 1).children.get(c);
            if (x == null) {
                return false;
            }
            path.add(x);
        }
        Node last = path.get(word.length());
        if (!last.end) {
            return false;
        }
        last.end = false;
        // Walk back up, cutting off the nodes that lead nowhere.
        for (int i = word.length(); i > 0; i--) {
            Node x = path.get(i);
            if (x.end || !x.children.isEmpty()) {
                break;
            }
            path.get(i - 1).children.remove(word.charAt(i - 1));
        }
        return true;
    }

    /** Every word that starts with prefix, in alphabetical order. */
    public List<String> startsWith(String prefix) {
        List<String> out = new ArrayList<>();
        Node x = find(prefix);
        if (x != null) {
            collect(x, new StringBuilder(prefix), out);
        }
        return out;
    }

    private Node find(String s) {
        Node x = root;
        for (char c : s.toCharArray()) {
            x = x.children.get(c);
            if (x == null) {
                return null;
            }
        }
        return x;
    }

    private void collect(Node x, StringBuilder s, List<String> out) {
        if (x.end) {
            out.add(s.toString());
        }
        for (Map.Entry<Character, Node> e : x.children.entrySet()) {
            s.append(e.getKey());
            collect(e.getValue(), s, out);
            s.deleteCharAt(s.length() - 1);
        }
    }
}
