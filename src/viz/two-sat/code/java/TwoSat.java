import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * 2-SAT with Kosaraju's strongly connected components. Variables are 0..n-1; literal 2i means
 * x_i and 2i + 1 means not x_i. Each clause {a, b} means (a or b).
 */
public final class TwoSat {
  private final List<List<Integer>> adj = new ArrayList<>(), transpose = new ArrayList<>();
  private boolean[] seen;

  private TwoSat(int m, List<int[]> clauses) {
    List<TreeSet<Integer>> arcs = new ArrayList<>();
    for (int u = 0; u < m; u++) arcs.add(new TreeSet<>());
    for (int[] c : clauses) {
      arcs.get(c[0] ^ 1).add(c[1]); // not a implies b
      arcs.get(c[1] ^ 1).add(c[0]); // not b implies a
    }
    for (int u = 0; u < m; u++) {
      adj.add(new ArrayList<>(arcs.get(u)));
      transpose.add(new ArrayList<>());
    }
    for (int u = 0; u < m; u++) for (int v : adj.get(u)) transpose.get(v).add(u);
  }

  private void visit(int u, List<List<Integer>> graph, List<Integer> out) {
    seen[u] = true;
    for (int v : graph.get(u)) if (!seen[v]) visit(v, graph, out);
    out.add(u);
  }

  /** Each variable's value, or null when the formula is unsatisfiable. */
  public static boolean[] solve(int n, List<int[]> clauses) {
    int m = 2 * n;
    TwoSat g = new TwoSat(m, clauses);
    g.seen = new boolean[m];
    List<Integer> finished = new ArrayList<>();
    for (int u = 0; u < m; u++) if (!g.seen[u]) g.visit(u, g.adj, finished); // pass 1

    g.seen = new boolean[m];
    int[] comp = new int[m]; // components numbered in topological order
    int count = 0;
    for (int i = m - 1; i >= 0; i--) { // pass 2: latest finish first
      int u = finished.get(i);
      if (g.seen[u]) continue;
      List<Integer> members = new ArrayList<>();
      g.visit(u, g.transpose, members);
      for (int v : members) comp[v] = count;
      count++;
    }

    boolean[] value = new boolean[n];
    for (int i = 0; i < n; i++) {
      if (comp[2 * i] == comp[2 * i + 1]) return null;
      value[i] = comp[2 * i] > comp[2 * i + 1];
    }
    return value;
  }
}
