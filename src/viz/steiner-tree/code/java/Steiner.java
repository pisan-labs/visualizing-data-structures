import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.TreeSet;
import java.util.function.IntBinaryOperator;

/**
 * Steiner trees on vertices 0..n-1. w[u][v] > 0 is the weight of edge u-v, 0 for none; the
 * terminals are sorted. Edges are {u, v} pairs.
 */
class Steiner {
  static final int NONE = -1;
  static final long INF = Long.MAX_VALUE / 4;

  /** Prim with an array over nodes; weight gives NONE for no edge. Ties to the earlier node. */
  static List<int[]> prim(List<Integer> nodes, IntBinaryOperator weight) {
    int k = nodes.size();
    long[] key = new long[k];
    int[] parent = new int[k];
    boolean[] done = new boolean[k];
    Arrays.fill(key, INF);
    Arrays.fill(parent, NONE);
    key[0] = 0;
    List<int[]> edges = new ArrayList<>();
    for (int round = 0; round < k; round++) {
      int u = NONE;
      for (int i = 0; i < k; i++) if (!done[i] && key[i] < INF && (u == NONE || key[i] < key[u])) u = i;
      if (u == NONE) break; // the rest cannot be reached
      done[u] = true;
      if (parent[u] != NONE) edges.add(new int[] {nodes.get(parent[u]), nodes.get(u)});
      for (int i = 0; i < k; i++) {
        int x = weight.applyAsInt(nodes.get(u), nodes.get(i));
        if (!done[i] && x != NONE && x < key[i]) {
          key[i] = x;
          parent[i] = u;
        }
      }
    }
    return edges;
  }

  /** The metric-closure 2-approximation. Returns the tree's edges {u, v}, u < v, sorted. */
  static List<int[]> approx(int[][] w, List<Integer> terminals) {
    int n = w.length;
    List<int[]> none = new ArrayList<>();
    if (terminals.size() <= 1) return none;
    // Shortest distances between all pairs (Floyd-Warshall).
    long[][] d = new long[n][n];
    for (int i = 0; i < n; i++)
      for (int j = 0; j < n; j++) d[i][j] = i == j ? 0 : w[i][j] > 0 ? w[i][j] : INF;
    for (int k = 0; k < n; k++)
      for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++) d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j]);
    List<int[]> closure = prim(terminals, (a, b) -> (int) d[a][b]);
    TreeSet<Integer> h = new TreeSet<>(); // edge u-v (u < v) as u * n + v, sorted
    for (int[] e : closure) {
      int s = e[0];
      // Trace back from e[1] through the earliest neighbour on a shortest path.
      for (int v = e[1]; v != s; ) {
        int u = 0;
        while (w[u][v] == 0 || d[s][u] + w[u][v] != d[s][v]) u++;
        h.add(Math.min(u, v) * n + Math.max(u, v));
        v = u;
      }
    }
    TreeSet<Integer> nodeSet = new TreeSet<>(terminals);
    for (int e : h) {
      nodeSet.add(e / n);
      nodeSet.add(e % n);
    }
    TreeSet<Integer> tree = new TreeSet<>();
    for (int[] e : prim(new ArrayList<>(nodeSet), (u, v) -> h.contains(Math.min(u, v) * n + Math.max(u, v)) ? w[u][v] : NONE))
      tree.add(Math.min(e[0], e[1]) * n + Math.max(e[0], e[1]));
    for (boolean cut = true; cut; ) { // cut off leaves that are not terminals
      cut = false;
      int[] degree = new int[n];
      for (int e : tree) {
        degree[e / n]++;
        degree[e % n]++;
      }
      for (int v = 0; v < n && !cut; v++) {
        if (degree[v] != 1 || terminals.contains(v)) continue;
        for (int e : tree) {
          if (e / n == v || e % n == v) {
            tree.remove(e);
            cut = true;
            break;
          }
        }
      }
    }
    List<int[]> out = new ArrayList<>();
    for (int e : tree) out.add(new int[] {e / n, e % n});
    return out;
  }

  /** Brute force over every set S of other vertices: the lightest MST of the terminals and S. */
  static long exactWeight(int[][] w, List<Integer> terminals) {
    if (terminals.size() <= 1) return 0;
    List<Integer> others = new ArrayList<>();
    for (int v = 0; v < w.length; v++) if (!terminals.contains(v)) others.add(v);
    long best = INF;
    for (int mask = 0; mask < (1 << others.size()); mask++) {
      TreeSet<Integer> nodes = new TreeSet<>(terminals);
      for (int i = 0; i < others.size(); i++) if ((mask >> i & 1) == 1) nodes.add(others.get(i));
      List<int[]> edges = prim(new ArrayList<>(nodes), (u, v) -> w[u][v] > 0 ? w[u][v] : NONE);
      if (edges.size() != nodes.size() - 1) continue;
      long total = 0;
      for (int[] e : edges) total += w[e[0]][e[1]];
      best = Math.min(best, total);
    }
    return best;
  }
}
