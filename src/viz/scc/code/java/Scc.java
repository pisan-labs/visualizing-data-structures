import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Kosaraju's algorithm, as in CLRS. adj.get(u) lists the vertices u points to, in increasing
 * order. components() returns the components in the order the second pass finds them (a
 * topological order of the component graph), each sorted.
 */
class Scc {
  private final int n;
  private boolean[] seen;

  private Scc(int n) {
    this.n = n;
  }

  static List<List<Integer>> components(List<List<Integer>> adj) {
    Scc s = new Scc(adj.size());
    List<Integer> finished = new ArrayList<>(); // in the order they finish
    s.seen = new boolean[s.n];
    for (int u = 0; u < s.n; u++) { // pass 1: DFS(G)
      if (!s.seen[u]) s.visit(u, adj, finished);
    }
    List<List<Integer>> transpose = new ArrayList<>();
    for (int u = 0; u < s.n; u++) transpose.add(new ArrayList<>());
    for (int u = 0; u < s.n; u++) {
      for (int v : adj.get(u)) transpose.get(v).add(u); // stays sorted: u goes up
    }
    s.seen = new boolean[s.n];
    List<List<Integer>> result = new ArrayList<>();
    for (int i = s.n - 1; i >= 0; i--) { // pass 2: DFS(G^T), latest finish first
      int u = finished.get(i);
      if (s.seen[u]) continue;
      List<Integer> component = new ArrayList<>();
      s.visit(u, transpose, component);
      Collections.sort(component);
      result.add(component);
    }
    return result;
  }

  private void visit(int u, List<List<Integer>> graph, List<Integer> out) {
    seen[u] = true;
    for (int v : graph.get(u)) {
      if (!seen[v]) visit(v, graph, out);
    }
    out.add(u);
  }
}
