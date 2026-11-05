import java.util.LinkedList;
import java.util.List;

/**
 * Topological sort by DFS, as in CLRS. adj.get(u) lists the vertices u points to, in increasing
 * order. Each vertex goes on the front of the list as it finishes, so the list ends up in
 * decreasing finish time. The first back edge u -> v throws a CycleException.
 */
class Topo {
  static class CycleException extends RuntimeException {
    final int u, v;

    CycleException(int u, int v) {
      super("cycle through " + u + " -> " + v);
      this.u = u;
      this.v = v;
    }
  }

  private static final int WHITE = 0, GRAY = 1, BLACK = 2;

  private final List<List<Integer>> adj;
  private final int[] color;
  private final LinkedList<Integer> order = new LinkedList<>();

  private Topo(List<List<Integer>> adj) {
    this.adj = adj;
    color = new int[adj.size()];
  }

  static List<Integer> sort(List<List<Integer>> adj) {
    Topo t = new Topo(adj);
    for (int u = 0; u < adj.size(); u++) {
      if (t.color[u] == WHITE) t.visit(u);
    }
    return t.order;
  }

  private void visit(int u) {
    color[u] = GRAY;
    for (int v : adj.get(u)) {
      if (color[v] == WHITE) visit(v);
      else if (color[v] == GRAY) throw new CycleException(u, v); // v is an ancestor of u
    }
    color[u] = BLACK;
    order.addFirst(u);
  }
}
