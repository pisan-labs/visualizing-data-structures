import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;

/** Prim's minimum spanning tree (a forest if the graph is not connected), from r. */
class Prim {
  static final int NIL = -1;

  long total; // the weight of the tree
  final int[] pi; // the parent of each vertex in the tree, NIL for a root

  /** adj.get(u) lists edges {v, w} of an undirected graph. */
  Prim(List<List<int[]>> adj, int r) {
    int n = adj.size();
    long[] key = new long[n];
    Arrays.fill(key, Long.MAX_VALUE);
    pi = new int[n];
    Arrays.fill(pi, NIL);
    boolean[] inTree = new boolean[n];
    // Entries {key, vertex}, smallest key first.
    PriorityQueue<long[]> q =
        new PriorityQueue<>((a, b) -> a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1]));
    for (int i = -1; i < n; i++) {
      int root = i < 0 ? r : i; // a new tree for each piece
      if (inTree[root]) continue;
      q.add(new long[] {0, root});
      while (!q.isEmpty()) {
        long[] top = q.remove();
        int u = (int) top[1];
        if (inTree[u]) continue; // a stale entry
        inTree[u] = true;
        if (pi[u] != NIL) total += top[0];
        for (int[] e : adj.get(u)) {
          int v = e[0];
          if (!inTree[v] && e[1] < key[v]) {
            key[v] = e[1];
            pi[v] = u;
            q.add(new long[] {e[1], v});
          }
        }
      }
    }
  }
}
