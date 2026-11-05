import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Shortest paths between every pair, as in CLRS, updating one matrix in place. */
class FloydWarshall {
  static final long INF = Long.MAX_VALUE;
  static final int NIL = -1;

  final long[][] d; // INF when there is no path; d[v][v] < 0 means a negative cycle
  final int[][] pi; // pi[i][j]: the vertex just before j on a shortest path from i

  /** Each edge is {u, v, w}. */
  FloydWarshall(int n, List<int[]> edges) {
    d = new long[n][n];
    pi = new int[n][n];
    for (int i = 0; i < n; i++) {
      Arrays.fill(d[i], INF);
      Arrays.fill(pi[i], NIL);
      d[i][i] = 0;
    }
    for (int[] e : edges) {
      d[e[0]][e[1]] = e[2];
      pi[e[0]][e[1]] = e[0];
    }
    for (int k = 0; k < n; k++)
      for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++) {
          if (d[i][k] == INF || d[k][j] == INF) continue;
          if (d[i][k] + d[k][j] < d[i][j]) {
            d[i][j] = d[i][k] + d[k][j];
            pi[i][j] = pi[k][j];
          }
        }
  }

  /** The vertices of a shortest path from i to j, read backwards from j. */
  List<Integer> path(int i, int j) {
    List<Integer> p = new ArrayList<>(List.of(j));
    while (p.get(0) != i) p.add(0, pi[i][p.get(0)]);
    return p;
  }
}
