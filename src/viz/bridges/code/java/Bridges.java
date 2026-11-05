import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.TreeSet;

/**
 * Cut vertices and bridges of an undirected graph, by Tarjan's low-link DFS. adj.get(u) lists
 * u's neighbours in increasing order. cuts holds the cut vertices in increasing order; bridges
 * holds each bridge as {parent, child}, in the order DFS finds them.
 */
class Bridges {
  private static final int NIL = -1;

  private final List<List<Integer>> adj;
  private final int[] d, low;
  private int time = 0;
  final TreeSet<Integer> cuts = new TreeSet<>();
  final List<int[]> bridges = new ArrayList<>();

  Bridges(List<List<Integer>> adj) {
    this.adj = adj;
    d = new int[adj.size()];
    low = new int[adj.size()];
    Arrays.fill(d, NIL);
    for (int u = 0; u < adj.size(); u++) {
      if (d[u] == NIL && visit(u, NIL) >= 2) cuts.add(u); // the root rule
    }
  }

  /** Returns the number of DFS children of u. */
  private int visit(int u, int p) {
    d[u] = low[u] = ++time;
    int children = 0;
    for (int v : adj.get(u)) {
      if (d[v] == NIL) {
        children++;
        visit(v, u);
        low[u] = Math.min(low[u], low[v]);
        if (low[v] > d[u]) bridges.add(new int[] {u, v});
        if (p != NIL && low[v] >= d[u]) cuts.add(u);
      } else if (v != p) { // a back edge (the parent edge does not count)
        low[u] = Math.min(low[u], d[v]);
      }
    }
    return children;
  }
}
