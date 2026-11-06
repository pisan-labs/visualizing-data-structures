import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeMap;

/** Suffix tree of t + "$", built by inserting each suffix into a compressed trie. */
public class SuffixTree {
  static class Node {
    int start, end; // edge label is s[start..end)
    final TreeMap<Character, Node> kids = new TreeMap<>(); // by first character
    final int leaf; // where the suffix starts, -1 if not a leaf

    Node(int start, int end, int leaf) {
      this.start = start;
      this.end = end;
      this.leaf = leaf;
    }
  }

  final String s;
  final Node root = new Node(0, 0, -1);

  public SuffixTree(String t) {
    s = t + "$";
    for (int i = 0; i < s.length(); i++) insert(i);
  }

  private void insert(int i) {
    Node u = root;
    int j = i;
    while (true) {
      Node child = u.kids.get(s.charAt(j));
      if (child == null) { // no edge starts with s[j]: new leaf
        u.kids.put(s.charAt(j), new Node(j, s.length(), i));
        return;
      }
      int len = child.end - child.start, k = 0;
      while (k < len && s.charAt(child.start + k) == s.charAt(j + k)) k++;
      if (k == len) { // whole edge matched: go down
        u = child;
        j += k;
        continue;
      }
      Node mid = new Node(child.start, child.start + k, -1); // split after k chars
      u.kids.put(s.charAt(j), mid);
      child.start += k;
      mid.kids.put(s.charAt(child.start), child);
      mid.kids.put(s.charAt(j + k), new Node(j + k, s.length(), i));
      return;
    }
  }

  String label(Node u) {
    return s.substring(u.start, u.end);
  }

  /** The node where the path for p ends (or inside whose edge), or null. */
  private Node walk(String p) {
    Node u = root;
    int j = 0;
    while (j < p.length()) {
      Node child = u.kids.get(p.charAt(j));
      if (child == null) return null;
      String edge = label(child);
      int k = 0;
      for (; k < edge.length() && j + k < p.length(); k++)
        if (edge.charAt(k) != p.charAt(j + k)) return null;
      u = child;
      j += k;
    }
    return u;
  }

  void leaves(Node u, List<Integer> out) {
    if (u.leaf >= 0) out.add(u.leaf);
    for (Node c : u.kids.values()) leaves(c, out);
  }

  public List<Integer> search(String p) {
    List<Integer> out = new ArrayList<>();
    Node u = walk(p);
    if (u != null) leaves(u, out);
    Collections.sort(out);
    return out;
  }

  public int count(String p) {
    return search(p).size();
  }

  /** Path label of the deepest internal node (first in sorted order on ties). */
  public String longestRepeat() {
    return deepest(root, "", "");
  }

  private String deepest(Node u, String path, String best) {
    if (u.leaf < 0 && path.length() > best.length()) best = path;
    for (Node c : u.kids.values()) best = deepest(c, path + label(c), best);
    return best;
  }
}
