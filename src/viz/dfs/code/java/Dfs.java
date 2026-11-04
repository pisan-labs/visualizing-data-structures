import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Depth-first search as in CLRS, with discovery and finish times. adj.get(u) lists u's
 * neighbours in increasing order. The search starts at s, then goes on from every vertex that is
 * still white, in order. kind maps "u v" to TREE, BACK, FORWARD or CROSS.
 */
class Dfs {
  enum Kind { TREE, BACK, FORWARD, CROSS }

  private static final int WHITE = 0, GRAY = 1, BLACK = 2;
  static final int NIL = -1;

  private final List<List<Integer>> adj;
  private final boolean directed;
  private final int[] color;
  final int[] d, f, pi;
  final Map<String, Kind> kind = new HashMap<>();
  private int time = 0;

  Dfs(List<List<Integer>> adj, int s, boolean directed) {
    int n = adj.size();
    this.adj = adj;
    this.directed = directed;
    color = new int[n];
    d = new int[n];
    f = new int[n];
    pi = new int[n];
    Arrays.fill(pi, NIL);
    visitIfWhite(s);
    for (int u = 0; u < n; u++) visitIfWhite(u);
  }

  private void visitIfWhite(int u) {
    if (color[u] == WHITE) visit(u);
  }

  private void visit(int u) {
    d[u] = ++time;
    color[u] = GRAY;
    for (int v : adj.get(u)) {
      if (color[v] == WHITE) {
        kind.put(u + " " + v, Kind.TREE);
        pi[v] = u;
        visit(v);
      } else if (color[v] == GRAY) {
        if (directed || v != pi[u]) kind.put(u + " " + v, Kind.BACK); // not u's parent edge
      } else if (directed) { // undirected: already seen from v's end
        kind.put(u + " " + v, d[u] < d[v] ? Kind.FORWARD : Kind.CROSS);
      }
    }
    f[u] = ++time;
    color[u] = BLACK;
  }
}
