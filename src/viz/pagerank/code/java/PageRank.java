import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** PageRank by power iteration. */
public class PageRank {
  public double[] rank;
  public int iterations;

  /**
   * links.get(u) lists the vertices u links to (0..n-1). Rank on dangling vertices (no links out)
   * is spread evenly, or dropped when spread is false.
   */
  public PageRank(int n, List<List<Integer>> links, double d, boolean spread) {
    double tol = 0.001;
    int maxIter = 100;
    List<List<Integer>> into = new ArrayList<>();
    for (int v = 0; v < n; v++) into.add(new ArrayList<>());
    for (int u = 0; u < n; u++) for (int v : links.get(u)) into.get(v).add(u);
    for (List<Integer> l : into) Collections.sort(l);
    rank = new double[n];
    java.util.Arrays.fill(rank, 1.0 / n);
    for (iterations = 1; iterations <= maxIter; iterations++) {
      double dangling = 0;
      for (int u = 0; u < n; u++) if (links.get(u).isEmpty()) dangling += rank[u];
      double[] next = new double[n];
      for (int v = 0; v < n; v++) {
        double s = 0;
        for (int u : into.get(v)) s += rank[u] / links.get(u).size();
        next[v] = (1 - d) / n + d * (spread ? s + dangling / n : s);
      }
      double change = 0;
      for (int v = 0; v < n; v++) change += Math.abs(next[v] - rank[v]);
      rank = next;
      if (change < tol) break;
    }
    if (iterations > maxIter) iterations = maxIter;
  }
}
