import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;

/** Shortest paths from s in a DAG: relax each vertex's edges in topological order. */
class DagShortestPaths {
  static final long INF = Long.MAX_VALUE;
  static final int NIL = -1;
  static final int WHITE = 0, GRAY = 1, BLACK = 2;

  final List<List<int[]>> adj; // adj.get(u) lists edges {v, w}
  final int[] color;
  final LinkedList<Integer> order = new LinkedList<>(); // finished vertices, front first
  final List<Integer> path = new ArrayList<>(); // the vertices the search is inside of
  List<Integer> cycle; // set when an edge leads back to a gray vertex: then no d or pi
  long[] d; // INF when unreachable
  int[] pi; // NIL when there is no parent

  DagShortestPaths(List<List<int[]>> adj, int s) {
    this.adj = adj;
    int n = adj.size();
    color = new int[n];
    for (int u = 0; u < n && cycle == null; u++) if (color[u] == WHITE) visit(u);
    if (cycle != null) return; // no topological order, so no shortest paths this way
    d = new long[n];
    pi = new int[n];
    Arrays.fill(d, INF);
    Arrays.fill(pi, NIL);
    d[s] = 0;
    for (int u : order) {
      if (d[u] == INF) continue;
      for (int[] e : adj.get(u)) {
        if (d[u] + e[1] < d[e[0]]) {
          d[e[0]] = d[u] + e[1];
          pi[e[0]] = u;
        }
      }
    }
  }

  /** Depth-first search from u; stops at the first edge back to a gray vertex. */
  private void visit(int u) {
    color[u] = GRAY;
    path.add(u);
    for (int[] e : adj.get(u)) {
      int v = e[0];
      if (color[v] == GRAY) {
        cycle = new ArrayList<>(path.subList(path.indexOf(v), path.size()));
        return;
      }
      if (color[v] == WHITE) {
        visit(v);
        if (cycle != null) return;
      }
    }
    color[u] = BLACK;
    path.remove(path.size() - 1);
    order.addFirst(u); // put u at the front of the list
  }
}
