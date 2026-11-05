import java.util.HashMap;
import java.util.Map;

/** Union-find: union by rank with path compression. */
class DisjointSets {
  final Map<Integer, Integer> parent = new HashMap<>();
  private final Map<Integer, Integer> rank = new HashMap<>();

  void makeSet(int x) {
    parent.put(x, x);
    rank.put(x, 0);
  }

  int find(int x) {
    int p = parent.get(x);
    if (p != x) {
      p = find(p);
      parent.put(x, p); // path compression
    }
    return p;
  }

  /** Joins the sets of x and y. Returns the new root, or -1 if they were joined already. */
  int union(int x, int y) {
    int a = find(x), b = find(y);
    if (a == b) return -1;
    if (rank.get(a) > rank.get(b)) {
      parent.put(b, a);
      return a;
    }
    parent.put(a, b);
    if (rank.get(a).equals(rank.get(b))) rank.put(b, rank.get(b) + 1);
    return b;
  }
}
